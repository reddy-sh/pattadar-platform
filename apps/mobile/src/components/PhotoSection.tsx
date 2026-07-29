import {
  PHOTO_CATEGORIES,
  checkLocation,
  SCREENING_OK,
  screenClassification,
  screenPhoto,
  suggestedCategory,
  type Classification,
  headingLabel,
  photoCategory,
  type LatLng,
  type ParcelPhoto,
} from '@pattadar/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Button, Chip, Icon, IconButton, Text, TextInput, useTheme } from 'react-native-paper';

import { classifyParcelPhoto } from '@/api/client';
import { StorageAuthError, storageBase, storageReady, uploadToDrive } from '@/api/storage';
import { useCognitoAuth } from '@/auth/useCognitoAuth';
import { usePhotoActions } from '@/data/hooks';
import { capturePhoto, type CapturedPhoto } from '@/lib/photoCapture';
import { choosePhotoSource } from '@/lib/photoPicker';
import { usePhotoFile } from '@/lib/photoFile';

/**
 * A photo IS its file, so unlike a document row there is no useful record to
 * keep when the upload cannot happen — better to say so than to store a row
 * pointing at nothing.
 *
 * Uploading needs a Cognito access token, which the dev `x-user-id` identity
 * does not provide. Telling the user to "sign in again" was a dead end: with an
 * identity already set, Account offers only Sign out — so the fix is offered
 * right here instead, and signing in with the same Google account keeps the
 * identity (and therefore the data) exactly as it was.
 */
const NO_STORAGE = 'Uploading needs a Google sign-in — the dev identity has no file-storage access.';
const NO_STORAGE_URL = 'This build has no file-storage address. Set it in Account → Server, then add the photo.';

/** Which of the two prerequisites is missing, so the message names the fix. */
async function storageProblem(): Promise<string> {
  if (!(await storageBase())) return NO_STORAGE_URL;
  return (await storageReady()) ? '' : NO_STORAGE;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/** One line of provenance: where, which way, and when. */
function provenance(p: ParcelPhoto): string {
  const coords =
    p.latitude !== null && p.longitude !== null ? `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}` : '';
  return [coords, headingLabel(p.heading), shortDate(p.capturedAt)].filter(Boolean).join(' · ');
}

function Thumb({ photo, size, onPress }: { photo: ParcelPhoto; size: number; onPress: () => void }) {
  const theme = useTheme();
  const uri = usePhotoFile(photo.fileRef);
  // Same reason as the Properties row: an unreadable file makes <Image> render
  // an empty tile, so fall back to the category icon rather than a blank box.
  const [broken, setBroken] = useState(false);
  const cat = photoCategory(photo.category);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={`${cat.label}${photo.caption ? `, ${photo.caption}` : ''}`}
      style={styles.thumbBox}
    >
      <View style={[styles.thumb, { width: size, height: size, backgroundColor: theme.colors.surfaceVariant }]}>
        {uri && !broken ? (
          <Image source={{ uri }} style={styles.fill} resizeMode="cover" onError={() => setBroken(true)} />
        ) : (
          <View style={styles.fillCenter}>
            <Icon source={cat.icon} size={22} color={theme.colors.onSurfaceVariant} />
          </View>
        )}
        {photo.isCover && (
          <View style={[styles.coverBadge, { backgroundColor: theme.colors.primary }]}>
            <Text variant="labelSmall" style={{ color: theme.colors.onPrimary }}>
              Cover
            </Text>
          </View>
        )}
      </View>
      <Text variant="labelSmall" numberOfLines={1} style={{ width: size, color: theme.colors.onSurfaceVariant }}>
        {photo.caption || cat.label}
      </Text>
    </Pressable>
  );
}

/**
 * Photographs of one parcel (CL-561..563, 568).
 *
 * Lives on the parcel rather than the passbook because a khata can span parcels
 * kilometres apart — a khata-level photo would be filed against land it does
 * not show.
 */
export function PhotoSection({
  parcelId,
  parcelLabel,
  photos,
  villageCentroid,
  placeName,
  onNotify,
}: {
  parcelId: string;
  /** Which land this photo is being filed against — the sheet covers the
   * screen, so without this the user cannot see what they are adding to. */
  parcelLabel: string;
  photos: ParcelPhoto[];
  villageCentroid: LatLng | null;
  placeName: string;
  onNotify: (msg: string) => void;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { addPhoto, updatePhoto, setCover, deletePhoto } = usePhotoActions();
  const { googleReady, busy: authBusy, signInWithGoogle } = useCognitoAuth();
  const [pending, setPending] = useState<CapturedPhoto | null>(null);
  const [category, setCategory] = useState('boundary');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * Errors are shown INSIDE the sheet.
   *
   * `onNotify` puts a Snackbar on the parent screen, and the parent's Snackbar
   * lives in a Paper Portal — which mounts below this react-native Modal. Every
   * failure message was therefore invisible: the upload failed, the sheet stayed
   * open, and the app looked like the Save button did nothing.
   */
  const [error, setError] = useState('');
  const [classification, setClassification] = useState<Classification | null>(null);
  const [checking, setChecking] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [editing, setEditing] = useState<ParcelPhoto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ParcelPhoto | null>(null);

  const add = async () => {
    // Camera or library only: a PDF is a document, and Documents is where the
    // app already files those.
    const source = await choosePhotoSource({ title: 'Add a photo' });
    if (source !== 'camera' && source !== 'library') return;
    const shot = await capturePhoto(source);
    if (!shot) return;
    if ('error' in shot) return onNotify(shot.error);
    setPending(shot);
    setCategory('boundary');
    setCaption('');
    setClassification(null);
    // Check the storage session up front. Discovering it is missing only after
    // the user has chosen a category and typed a caption wastes their work.
    setError(await storageProblem());
    // CL-600/604: classify BEFORE any upload, so an identity document can be
    // refused without ever reaching the photo store. A classifier that is slow
    // or unreachable returns null and the photo proceeds — this screens for
    // mistakes, it is not an authorisation gate.
    setChecking(true);
    const verdict = await classifyParcelPhoto(shot.uri, shot.name, shot.mimeType);
    setChecking(false);
    setClassification(verdict);
    // CL-603: pre-select what it saw, still changeable.
    setCategory(suggestedCategory(verdict));
  };

  const save = async () => {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      const node = await uploadToDrive(pending.uri, pending.name, pending.mimeType);
      await addPhoto.mutateAsync({
        parcelId,
        fileRef: node.id,
        category,
        caption: caption.trim(),
        latitude: pending.latitude,
        longitude: pending.longitude,
        heading: pending.heading,
        capturedAt: pending.capturedAt,
      });
      setPending(null);
      onNotify('Photo added');
    } catch (e) {
      // Never a success toast on a failed upload — the photo would exist only
      // in the user's belief. The sheet stays open with the reason on it.
      const msg =
        e instanceof StorageAuthError
          ? NO_STORAGE
          : e instanceof Error
            ? e.message
            : "Couldn't save the photo";
      setError(msg);
      onNotify(msg);
    } finally {
      setBusy(false);
    }
  };

  // CL-564: the same check the map pin uses. A photo whose coordinates sit in
  // another state is either the wrong parcel or a stripped-and-refilled EXIF.
  const pendingFix =
    pending?.latitude !== null && pending?.latitude !== undefined && pending?.longitude !== null
      ? { latitude: pending.latitude, longitude: pending.longitude! }
      : null;
  const pendingSanity = checkLocation(pendingFix, villageCentroid, placeName);
  /**
   * CL-601/602: EXIF provenance screening, on-device, before anything uploads.
   * A warning never blocks — a legitimate dusk shot of a bund must still be
   * savable, and a user rejected twice stops adding photos at all.
   */
  const exifScreening = pending ? screenPhoto(pending.exif) : null;
  const aiScreening = screenClassification(classification);
  // The stronger verdict wins: a block from either source blocks.
  const screening = !pending
    ? null
    : aiScreening.verdict !== 'ok'
      ? aiScreening
      : (exifScreening ?? SCREENING_OK);
  const blocked = screening?.verdict === 'block';

  const current = viewing !== null ? photos[viewing] : null;

  return (
    <>
      {photos.length === 0 ? (
        /* Nothing to show yet: the sentence gets the full width and the action
           is a full-width button under it. Sitting them side by side pushed the
           button off the edge of the card, because a Text with no flex takes
           every pixel of the row. */
        <>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Boundary stones, crops, water and access — dated and located, they are the evidence a dispute
            turns on.
          </Text>
          <Button mode="contained-tonal" icon="camera-plus-outline" onPress={add}>
            Add a photo
          </Button>
        </>
      ) : (
        <>
          <View style={styles.header}>
            <Text variant="labelSmall" style={[styles.grow, { color: theme.colors.onSurfaceVariant }]}>
              {photos.length} photo{photos.length === 1 ? '' : 's'}
            </Text>
            <Button mode="text" icon="camera-plus-outline" compact onPress={add}>
              Add
            </Button>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {photos.map((p, i) => (
              <Thumb key={p.id} photo={p} size={96} onPress={() => setViewing(i)} />
            ))}
          </ScrollView>
        </>
      )}

      {/* Review before saving: the metadata is the point, so it is shown and
          the category is chosen while the photo is still in hand. */}
      <Modal visible={!!pending} animationType="slide" transparent={false} onRequestClose={() => setPending(null)}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}>
          <View style={styles.sheetHead}>
            <View style={styles.grow}>
              <Text variant="titleMedium">Add photo</Text>
              {/* Say which land this is being filed against — the sheet hides
                  the parcel screen completely. */}
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {[parcelLabel, placeName].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <IconButton icon="close" accessibilityLabel="Cancel" onPress={() => setPending(null)} />
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            {!!pending && (
              <Image source={{ uri: pending.uri }} style={styles.preview} resizeMode="cover" />
            )}
            {!!error && (
              <View style={[styles.warn, { backgroundColor: theme.colors.errorContainer }]}>
                <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer }}>
                  {error}
                </Text>
                {error === NO_STORAGE && (
                  <Button
                    mode="contained-tonal"
                    icon="google"
                    loading={authBusy}
                    disabled={authBusy || !googleReady}
                    onPress={async () => {
                      await signInWithGoogle();
                      // The token lands asynchronously; re-check rather than
                      // assume success, so the message stays truthful.
                      setError(await storageProblem());
                    }}
                  >
                    Sign in with Google
                  </Button>
                )}
              </View>
            )}
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {pending?.latitude !== null && pending?.latitude !== undefined
                ? `${pending.latitude.toFixed(5)}, ${pending.longitude!.toFixed(5)}${
                    pending.heading !== null ? ` · ${headingLabel(pending.heading)}` : ''
                  }${pending.liveLocation ? ' · from this phone' : ' · from the photo'}`
                : 'This image carries no location — it will be saved without coordinates.'}
            </Text>
            {!!screening && screening.verdict !== 'ok' && (
              <View style={[styles.warn, { backgroundColor: theme.colors.errorContainer }]}>
                <Text variant="labelLarge" style={{ color: theme.colors.onErrorContainer }}>
                  {screening.title}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer }}>
                  {screening.body}
                </Text>
                {screening.offerAsDocument && (
                  <Button
                    mode="contained-tonal"
                    icon="file-document-outline"
                    onPress={() => {
                      // CL-608: one tap to the right home, not "start over
                      // somewhere else".
                      setPending(null);
                      onNotify('Opening Documents — upload it there and it will be classified.');
                      router.push('/documents');
                    }}
                  >
                    Add as a document instead
                  </Button>
                )}
              </View>
            )}
            {pendingSanity.suspect && (
              <View style={[styles.warn, { backgroundColor: theme.colors.errorContainer }]}>
                <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer }}>
                  {pendingSanity.message}
                </Text>
              </View>
            )}
            <Text variant="labelLarge">What does it show?</Text>
            <View style={styles.cats}>
              {PHOTO_CATEGORIES.map((c) => (
                <Chip
                  key={c.key}
                  compact
                  icon={c.icon}
                  selected={category === c.key}
                  showSelectedCheck={false}
                  onPress={() => setCategory(c.key)}
                >
                  {c.label}
                </Chip>
              ))}
            </View>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {photoCategory(category).why}
            </Text>
            <TextInput
              mode="outlined"
              label="Caption (optional)"
              value={caption}
              onChangeText={setCaption}
              placeholder="e.g. North-east corner stone"
            />
            <Button
              mode="contained"
              loading={busy || checking}
              disabled={busy || checking || blocked}
              onPress={save}
            >
              {checking ? 'Checking the photo…' : blocked ? 'Cannot be saved here' : 'Save photo'}
            </Button>
          </ScrollView>
        </View>
      </Modal>

      {/* Full-screen gallery, swipe between photos. */}
      <Modal visible={current !== null} animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.gallery}>
          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            initialScrollIndex={viewing ?? 0}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(p) => p.id}
            onMomentumScrollEnd={(e) => {
              // Closing the gallery sets `viewing` to null, but the FlatList
              // settles afterwards and fires this — which set an index again
              // and reopened the modal the moment it was dismissed. Only track
              // the page while the gallery is genuinely open.
              const next = Math.round(e.nativeEvent.contentOffset.x / width);
              setViewing((v) => (v === null ? null : next));
            }}
            renderItem={({ item }) => <GalleryPage photo={item} width={width} />}
          />
          <View style={styles.galleryTop}>
            <IconButton icon="close" iconColor="#fff" accessibilityLabel="Close" onPress={() => setViewing(null)} />
            <Text style={styles.galleryCount}>
              {(viewing ?? 0) + 1} / {photos.length}
            </Text>
          </View>
          {!!current && (
            <View style={styles.galleryBottom}>
              <Text style={styles.galleryTitle}>
                {current.caption || photoCategory(current.category).label}
              </Text>
              <Text style={styles.galleryMeta}>{provenance(current) || 'No location recorded'}</Text>
              <View style={styles.galleryActions}>
                {/* A disabled button labelled "Cover" with an empty-frame icon
                    read as a broken control rather than as a state. When this
                    photo already IS the cover, say so as a label. */}
                {current.isCover ? (
                  <View style={styles.coverState}>
                    <Icon source="image-check-outline" size={18} color="#fff" />
                    <Text style={styles.coverStateText}>Cover photo</Text>
                  </View>
                ) : (
                  <Button
                    mode="text"
                    textColor="#fff"
                    icon="image-frame"
                    disabled={setCover.isPending}
                    onPress={async () => {
                      await setCover.mutateAsync(current.id).catch(() => onNotify("Couldn't set the cover"));
                      onNotify('Cover updated');
                    }}
                  >
                    Set as cover
                  </Button>
                )}
                <Button
                  mode="text"
                  textColor="#fff"
                  icon="pencil-outline"
                  onPress={() => {
                    setEditing(current);
                    setCategory(current.category);
                    setCaption(current.caption);
                    setViewing(null);
                  }}
                >
                  Edit
                </Button>
                <Button
                  mode="text"
                  textColor={theme.colors.error}
                  icon="delete-outline"
                  onPress={() => {
                    setConfirmDelete(current);
                    setViewing(null);
                  }}
                >
                  Delete
                </Button>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Edit caption / category. */}
      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}>
          <View style={styles.sheetHead}>
            <Text variant="titleMedium">Edit photo</Text>
            <IconButton icon="close" accessibilityLabel="Cancel" onPress={() => setEditing(null)} />
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <View style={styles.cats}>
              {PHOTO_CATEGORIES.map((c) => (
                <Chip
                  key={c.key}
                  compact
                  icon={c.icon}
                  selected={category === c.key}
                  showSelectedCheck={false}
                  onPress={() => setCategory(c.key)}
                >
                  {c.label}
                </Chip>
              ))}
            </View>
            <TextInput mode="outlined" label="Caption" value={caption} onChangeText={setCaption} />
            <Button
              mode="contained"
              loading={updatePhoto.isPending}
              disabled={updatePhoto.isPending}
              onPress={async () => {
                if (!editing) return;
                try {
                  await updatePhoto.mutateAsync({ id: editing.id, category, caption: caption.trim() });
                  setEditing(null);
                  onNotify('Photo updated');
                } catch (e) {
                  onNotify(e instanceof Error ? e.message : "Couldn't update the photo");
                }
              }}
            >
              Save
            </Button>
          </ScrollView>
        </View>
      </Modal>

      {/* Deleting evidence deserves a question. */}
      <Modal visible={!!confirmDelete} animationType="fade" transparent onRequestClose={() => setConfirmDelete(null)}>
        <View style={styles.confirmBackdrop}>
          <View style={[styles.confirmBox, { backgroundColor: theme.colors.surface }]}>
            <Text variant="titleMedium">Delete this photo?</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {confirmDelete ? provenance(confirmDelete) || 'No location recorded' : ''}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.error }}>
              This cannot be undone.
            </Text>
            <View style={styles.confirmActions}>
              <Button onPress={() => setConfirmDelete(null)}>Cancel</Button>
              <Button
                textColor={theme.colors.error}
                loading={deletePhoto.isPending}
                disabled={deletePhoto.isPending}
                onPress={async () => {
                  const target = confirmDelete;
                  setConfirmDelete(null);
                  if (!target) return;
                  try {
                    await deletePhoto.mutateAsync(target.id);
                    onNotify('Photo deleted');
                  } catch (e) {
                    onNotify(e instanceof Error ? e.message : "Couldn't delete the photo");
                  }
                }}
              >
                Delete
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function GalleryPage({ photo, width }: { photo: ParcelPhoto; width: number }) {
  const uri = usePhotoFile(photo.fileRef);
  return (
    <View style={[styles.page, { width }]}>
      {uri ? (
        <Image source={{ uri }} style={styles.fill} resizeMode="contain" />
      ) : (
        <ActivityIndicator color="#fff" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  strip: { gap: 10, paddingVertical: 4 },
  thumbBox: { gap: 4 },
  thumb: { borderRadius: 10, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  fillCenter: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  coverBadge: { position: 'absolute', left: 4, bottom: 4, paddingHorizontal: 6, borderRadius: 6 },
  sheet: { flex: 1 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingTop: 48 },
  sheetBody: { padding: 16, gap: 12 },
  preview: { width: '100%', height: 220, borderRadius: 12 },
  warn: { borderRadius: 10, padding: 12 },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gallery: { flex: 1, backgroundColor: '#000' },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  galleryTop: { position: 'absolute', top: 44, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  galleryCount: { color: '#fff' },
  galleryBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 4, backgroundColor: '#000000AA' },
  galleryTitle: { color: '#fff', fontWeight: '700' },
  galleryMeta: { color: '#ccc', fontSize: 12 },
  galleryActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4 },
  coverState: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  coverStateText: { color: '#fff', fontSize: 13 },
  confirmBackdrop: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmBox: { borderRadius: 16, padding: 20, gap: 8, width: '100%' },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
});
