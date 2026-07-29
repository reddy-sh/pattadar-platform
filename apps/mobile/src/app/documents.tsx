import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Appbar,
  Banner,
  Button,
  Card,
  Chip,
  Divider,
  HelperText,
  IconButton,
  List,
  Dialog,
  Menu,
  Portal,
  Snackbar,
  Text,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { importRegisteredDocument } from '@/api/client';
import { evictDriveCache, StorageAuthError, uploadToDrive } from '@/api/storage';
import { EmptyState } from '@/components/EmptyState';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useDocumentActions, useDocuments, useInvalidateAll } from '@/data/hooks';
import { getLocalFiles, localFileUri, removeLocalCopy, saveLocalCopy, type LocalFile } from '@/lib/localFiles';
import { useAppTheme } from '@/theme/paper';
import { documentDisplayName, documentFileName, stripTypePrefix } from '@pattadar/core';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** CL-228: "26 Jul 2026", matching the parcel screen — never dd/mm/yyyy. */
const fmtDate = (v?: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/**
 * Scanned filenames already read "Katraguntla · 28-07-2026", so repeating the
 * village and the date in the caption underneath spent the row on the same two
 * facts twice. Show each only when the name does not already carry it.
 */
const nameCarries = (name: string, v?: string | null) =>
  !!v && name.toLowerCase().includes(String(v).toLowerCase());

const nameCarriesDate = (name: string, iso?: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear());
  return [
    dd + "-" + mm + "-" + yy,
    dd + "/" + mm + "/" + yy,
    yy + "-" + mm + "-" + dd,
    dd + "." + mm + "." + yy,
  ].some((form) => name.includes(form));
};

/** Web matchPassbook (propertyImport.ts): buyer-party name shares a whole
 * token with exactly one passbook owner → confident match. */
function matchPassbook(
  fields: Record<string, unknown>,
  passbooks: { id: string; ownerName: string }[],
): string {
  const parties = Array.isArray(fields.parties) ? (fields.parties as Record<string, unknown>[]) : [];
  const buyer = parties.find((p) => /buyer|vendee|purchaser/i.test(String(p.role ?? '')));
  const owner = String(buyer?.name ?? fields.owner_name ?? '').toLowerCase();
  const tokens_ = new Set(owner.split(/[^a-z]+/).filter((t) => t.length > 2));
  if (!tokens_.size) return '';
  const hits = passbooks.filter((pb) =>
    String(pb.ownerName ?? '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .some((t) => t.length > 2 && tokens_.has(t)),
  );
  return hits.length === 1 ? hits[0].id : '';
}

export default function DocumentsScreen() {
  const theme = useAppTheme();
  const { data: result, isLoading } = useDocuments();
  const invalidate = useInvalidateAll();
  const { fileDocument, parcelFromDocument, propertyFromDocument, linkRegistered, deleteRegistered } = useDocumentActions();
  const [rowMenu, setRowMenu] = useState('');
  const [linkFor, setLinkFor] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string; fileRef?: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [pendingFile, setPendingFile] = useState<{ uri: string; name: string } | null>(null);
  const [localFiles, setLocalFiles] = useState<Record<string, LocalFile>>({});
  // H-4: the index moved out of SecureStore into a JSON file behind
  // getLocalFiles() — a raw SecureStore read here would go blank once the
  // old Keychain key is migrated away on first read.
  useState(() => {
    getLocalFiles().then(setLocalFiles).catch(() => undefined);
  });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  // Row-level messages belong to the row, not the Upload & classify panel.
  const [toast, setToast] = useState('');

  const d = result?.data;
  /**
   * A chip that says the same word on every visible row tells the reader
   * nothing and costs half the width. "Pattadar Passbook" on twelve rows is
   * decoration; the name it was crowding out is the answer to "which document
   * is this?". Shown only when the rows actually differ.
   */
  const docTypes = new Set((d?.registered ?? []).map((r) => (r.docType || '').trim()).filter(Boolean));
  const typeVaries = docTypes.size > 1;

  const readFile = async (uri: string, name: string, mime: string) => {
    setError('');
    setStatus('');
    try {
      setReading(true);
      setPendingFile({ uri, name });
      setPending(await importRegisteredDocument(uri, name, mime));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the document');
    } finally {
      setReading(false);
    }
  };

  const fileIt = async () => {
    if (!pending) return;
    setError('');
    try {
      // Put the bytes in My Drive first so the record can point at them; the
      // filing still succeeds if Drive is unreachable (record without a file).
      let driveId = '';
      if (pendingFile) {
        try {
          const node = await uploadToDrive(
            pendingFile.uri,
            pendingFile.name,
            pendingFile.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
          );
          driveId = node.id;
        } catch (e) {
          setToast(
            e instanceof StorageAuthError
              ? 'Filed, but not uploaded — sign in again to store the file.'
              : 'Filed, but the file could not be uploaded to My Drive.',
          );
        }
      }
      const r = await fileDocument.mutateAsync({ ...pending, _fileRef: driveId });
      const docId = r.createRegisteredDocument?.id;
      if (!docId) throw new Error("Couldn't file this document.");
      // Keep a permanent local copy so the file can be opened later
      // (byte storage on the server arrives with the Cognito storage session).
      if (pendingFile) {
        try {
          // Named from what the AI read, so the file is findable later.
          await saveLocalCopy(
            docId,
            pendingFile.uri,
            documentFileName(
              {
                docType: String(pending.doc_type ?? ''),
                village: String(pending.village ?? ''),
                surveyNo: String(pending.survey_no ?? ''),
                ownerName: String(pending.owner_name ?? ''),
                documentNo: String(pending.document_no ?? ''),
                regYear: String(pending.reg_year ?? ''),
              },
              pendingFile.name,
            ),
          );
          setLocalFiles(await getLocalFiles());
        } catch {
          /* preview unavailable, record still filed */
        }
        setPendingFile(null);
      }
      // Agricultural → try to file it as a parcel under the matched khata.
      const isAgri = String(pending.classification ?? '') === 'agri' || !!pending.survey_no;
      const pb = isAgri ? matchPassbook(pending, d?.passbooks ?? []) : '';
      if (pb) {
        const p = await parcelFromDocument.mutateAsync({ documentId: docId, passbookId: pb }).catch(() => null);
        setStatus(
          p?.createParcelFromDocument
            ? 'Agricultural land — filed as a parcel under the matched passbook.'
            : 'Filed as a registered deed. Link it to a passbook on the web.',
        );
      } else if (!isAgri) {
        // A non-agricultural deed IS a plot, flat or house. It used to stop at
        // "filed as a deed", which left the Plots tab permanently empty unless
        // the whole thing was typed in again by hand.
        const prop = await propertyFromDocument.mutateAsync(docId).catch(() => null);
        setStatus(
          prop?.createPropertyFromDocument
            ? `Filed, and added ${prop.createPropertyFromDocument.label} to Plots.`
            : 'Filed as a deed — add it to Plots by hand if it is a plot or flat.',
        );
      } else {
        setStatus('Filed as a registered deed.');
      }
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Filing failed');
    }
  };

  const linkedLabel = (r: { passbookId: string; parcelId: string }) => {
    if (r.parcelId) {
      const p = d?.parcels.find((x) => x.id === r.parcelId);
      return p ? `Sy ${p.surveyNo}${p.subdivision ? `/${p.subdivision}` : ''}` : 'Parcel';
    }
    if (r.passbookId) {
      const pb = d?.passbooks.find((x) => x.id === r.passbookId);
      return pb ? `Khata ${pb.pattadarNo}` : 'Khata';
    }
    return 'Unlinked';
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Documents" />
      </Appbar.Header>
      <FlatList
        data={d?.registered ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            {result?.isSample && (
              <OfflineBanner visible onRetry={invalidate} />
            )}
            <Card mode="contained">
              <Card.Content style={styles.upload}>
                {/* CL-220: vector, not emoji */}
                <View style={styles.rowLine}>
                  <List.Icon icon="file-upload-outline" color={theme.colors.primary} />
                  <Text variant="titleSmall">Upload & classify</Text>
                </View>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Deed, allotment letter or land document — AI reads it,
                  classifies the type and files it in the right place.
                </Text>
                <View style={styles.buttons}>
                  <Button
                    mode="outlined"
                    icon="camera"
                    disabled={reading}
                    onPress={async () => {
                      const perm = await ImagePicker.requestCameraPermissionsAsync();
                      if (!perm.granted) return setError('Camera permission denied.');
                      const res = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8 });
                      if (!res.canceled && res.assets?.[0]) {
                        const a = res.assets[0];
                        await readFile(a.uri, a.fileName ?? 'document.jpg', a.mimeType ?? 'image/jpeg');
                      }
                    }}
                  >
                    Camera
                  </Button>
                  <Button
                    mode="outlined"
                    icon="image"
                    disabled={reading}
                    onPress={async () => {
                      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
                      if (!res.canceled && res.assets?.[0]) {
                        const a = res.assets[0];
                        await readFile(a.uri, a.fileName ?? 'document.jpg', a.mimeType ?? 'image/jpeg');
                      }
                    }}
                  >
                    Photos
                  </Button>
                  <Button
                    mode="outlined"
                    icon="file-pdf-box"
                    disabled={reading}
                    onPress={async () => {
                      try {
                      const res = await DocumentPicker.getDocumentAsync({
                        type: ['application/pdf', 'image/*'],
                        copyToCacheDirectory: true,
                      });
                      if (!res.canceled && res.assets?.[0]) {
                        const a = res.assets[0];
                        await readFile(a.uri, a.name, a.mimeType ?? 'application/pdf');
                      }
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Could not open the file picker');
                      }
                    }}
                  >
                    Files
                  </Button>
                </View>
                {reading && (
                  <View style={styles.reading}>
                    <ActivityIndicator size="small" />
                    <Text variant="bodyMedium">Reading the document…</Text>
                  </View>
                )}
                {!!error && <HelperText type="error" visible>{error}</HelperText>}
                {!!status && <Text variant="bodySmall" style={{ color: theme.colors.primary }}>{status}</Text>}
              </Card.Content>
            </Card>
            {pending && (
              <Card mode="outlined" style={styles.pendingCard}>
                <Card.Content style={styles.upload}>
                  <Text variant="titleSmall">What I read</Text>
                  <Text variant="bodyMedium">
                    {String(pending.doc_type || 'Document')}
                    {pending.document_no ? ` · ${pending.document_no}/${pending.reg_year || ''}` : ''}
                    {pending.sro ? ` · SRO ${pending.sro}` : ''}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {[pending.survey_no && `Sy ${pending.survey_no}`, pending.village, pending.district]
                      .filter(Boolean)
                      .join(', ') || 'No location read'}
                  </Text>
                </Card.Content>
                <Card.Actions>
                  <Button onPress={() => setPending(null)}>Discard</Button>
                  <Button
                    mode="contained"
                    loading={fileDocument.isPending || parcelFromDocument.isPending}
                    disabled={fileDocument.isPending || parcelFromDocument.isPending}
                    onPress={fileIt}
                  >
                    File it
                  </Button>
                </Card.Actions>
              </Card>
            )}
            {/* CL-225/557: ONE word for this concept. "Registered document" is a
                term of art at the sub-registrar's office and means something
                specific in AP; most of what lives here was never registered. */}
            <Text variant="titleSmall" style={styles.sectionTitle}>
              Your documents
            </Text>
            {(d?.registered?.length ?? 0) < 3 && (
              /* CL-226: guidance instead of a void */
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Common documents to keep here: ROR/Adangal, pattadar passbook, sale
                deed, FMB sketch, encumbrance certificate.
              </Text>
            )}
          </View>
        }
        renderItem={({ item: r }) => {
          const local = localFiles[r.id];
          const hasLocal = !!local?.file;
          // Display name is stored separately from the on-disk filename; older
          // entries fall back to a name built from what the record holds.
          const stored = local?.name ?? '';
          const rawTitle =
            stored && !/^doc-[0-9a-f]{8}-/i.test(stored)
              ? stored
              : documentDisplayName({
                  docType: r.docType,
                  village: r.village,
                  surveyNo: r.surveyNo,
                  documentNo: r.documentNo,
                  regYear: r.regYear,
                  date: r.createdAt,
                });
          // The type is shown as a chip on this row — do not say it twice.
          const fname = stripTypePrefix(rawTitle, r.docType);
          // CL-219: real file-type vectors, never emoji.
          const icon = fname.endsWith('.pdf')
            ? 'file-pdf-box'
            : /\.(jpe?g|png|heic)$/i.test(fname)
              ? 'file-image-outline'
              : 'file-outline';
          const linked = !!(r.parcelId || r.passbookId);
          // CL-213: "Other" is a classification failure, not a result.
          const needsReview = /^other$/i.test(r.docType || '') || !r.docType;
          const open = () => {
            if (r.fileRef) {
              router.push({
                pathname: '/viewer',
                params: { nodeId: r.fileRef, name: fname || `${r.docType || 'document'}.pdf` },
              });
            } else if (hasLocal) {
              router.push({
                pathname: '/viewer',
                params: { local: localFileUri(local?.file ?? ''), name: fname },
              });
            } else {
              setToast('This file was uploaded before file storage was switched on — re-upload it to view.');
            }
          };
          // CL-214: extracted village token-matches a khata's village → suggest it.
          const suggestion =
            !linked && r.village
              ? (d?.passbooks ?? []).find(
                  (pb) => pb.village && pb.village.toLowerCase().startsWith(r.village.toLowerCase().slice(0, 6)),
                )
              : undefined;
          return (
            // Tapping a document opens what it SAYS, not the raw scan. The
            // file is one tap further in, and still directly reachable from
            // the row's overflow menu for when the paper is the point.
            <Card
              mode="outlined"
              style={styles.card}
              onPress={() => router.push({ pathname: '/document/[id]', params: { id: r.id } })}
            >
              <Card.Content style={styles.cardContent}>
                <View style={styles.rowLine}>
                  <List.Icon icon={icon} color={theme.colors.primary} />
                  {/* The NAME owns the row now — it used to share the line with
                      two chips and collapse to "Mang…". Everything that varies
                      between rows sits under it; the chips moved out. */}
                  <View style={styles.grow}>
                    <Text variant="titleSmall" numberOfLines={2}>
                      {fname || r.docType || 'Document'}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>
                      {[
                        typeVaries ? r.docType : '',
                        linked ? linkedLabel(r) : '',
                        r.surveyNo && `Sy ${r.surveyNo}`,
                        nameCarries(fname, r.village) ? null : r.village,
                        nameCarriesDate(fname, r.createdAt) ? null : fmtDate(r.createdAt),
                        r.fileRef || hasLocal ? '' : 'no file stored',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  {/* Only the exception earns a chip. The type now rides in the
                      caption, and only when it differs between rows. */}
                  {needsReview && (
                    <Chip
                      compact
                      mode="outlined"
                      icon="alert-outline"
                      style={{ borderColor: theme.colors.warning }}
                      textStyle={[styles.chipText, { color: theme.colors.warning }]}
                    >
                      Needs review
                    </Chip>
                  )}
                  {/* CL-214/228: Unlinked is an ACTION */}
                  {!linked ? (
                    <Menu
                      visible={linkFor === r.id}
                      onDismiss={() => setLinkFor('')}
                      anchor={
                        <Chip
                          compact
                          mode="flat"
                          icon="link-plus"
                          style={{ backgroundColor: theme.colors.primaryContainer }}
                          textStyle={[styles.chipText, { color: theme.colors.onPrimaryContainer }]}
                          accessibilityLabel={`Link ${fname || r.docType || 'document'} to a passbook`}
                          onPress={() => setLinkFor(r.id)}
                        >
                          Link
                        </Chip>
                      }
                    >
                      {suggestion && (
                        <Menu.Item
                          leadingIcon="lightbulb-outline"
                          title={`Suggested: Khata ${suggestion.pattadarNo} (${suggestion.village})`}
                          onPress={async () => {
                            setLinkFor('');
                            await linkRegistered
                              .mutateAsync({ id: r.id, passbookId: suggestion.id })
                              .catch((e) => setToast(String(e?.message ?? e)));
                          }}
                        />
                      )}
                      {(d?.passbooks ?? [])
                        .filter((pb) => pb.id !== suggestion?.id)
                        .map((pb) => (
                          <Menu.Item
                            key={pb.id}
                            leadingIcon="notebook-outline"
                            title={`Khata ${pb.pattadarNo} · ${pb.ownerName}`}
                            onPress={async () => {
                              setLinkFor('');
                              await linkRegistered
                                .mutateAsync({ id: r.id, passbookId: pb.id })
                                .catch((e) => setToast(String(e?.message ?? e)));
                            }}
                          />
                        ))}
                    </Menu>
                  ) : null}
                  {/* CL-221 */}
                  <Menu
                    visible={rowMenu === r.id}
                    onDismiss={() => setRowMenu('')}
                    anchor={
                      <IconButton
                        icon="dots-vertical"
                        size={18}
                        style={styles.tight}
                        accessibilityLabel={`Actions for ${fname || r.docType || 'document'}`}
                        onPress={() => setRowMenu(r.id)}
                        hitSlop={8}
                      />
                    }
                  >
                    <Menu.Item leadingIcon="open-in-new" title="Open / share" onPress={() => { setRowMenu(''); open(); }} />
                    {!linked && (
                      <Menu.Item
                        leadingIcon="link-plus"
                        title="Link to passbook…"
                        onPress={() => {
                          setRowMenu('');
                          setLinkFor(r.id);
                        }}
                      />
                    )}
                    <Divider />
                    <Menu.Item
                      leadingIcon="delete-outline"
                      title="Delete…"
                      onPress={() => {
                        setRowMenu('');
                        setConfirmDelete({ id: r.id, name: fname || r.docType || 'this document', fileRef: r.fileRef });
                      }}
                    />
                  </Menu>
                </View>
              </Card.Content>
            </Card>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <Animated.View entering={FadeIn.duration(400)}>
              <ActivityIndicator style={styles.loader} />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.duration(400)}>
              {/* CL-541/542: the shared component, so this reads and sits like
                  the other three. No button of its own — the Upload & classify
                  card is permanently on screen directly above, and CL-539 is
                  about not offering the same action twice. */}
              <EmptyState
                icon="file-document-outline"
                title="No documents yet"
                body="Photograph or pick a deed, passbook page or certificate using the card above — the type is read from it and filed against the right land."
              />
            </Animated.View>
          )
        }
      />
      <Portal>
        <Dialog visible={confirmDelete !== null} onDismiss={() => setConfirmDelete(null)}>
          <Dialog.Title>Delete {confirmDelete?.name}?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              This removes the document record and its links to any passbook or
              parcel, and deletes any copy of the file kept on this device.
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.error, marginTop: 8, fontWeight: '700' }}>
              This cannot be undone — there is no way to restore it.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDelete(null)}>Keep it</Button>
            <Button
              textColor={theme.colors.error}
              loading={deleteRegistered.isPending}
              disabled={deleteRegistered.isPending}
              onPress={async () => {
                const target = confirmDelete;
                setConfirmDelete(null);
                if (!target) return;
                try {
                  await deleteRegistered.mutateAsync(target.id);
                } catch (e) {
                  setToast(String(e instanceof Error ? e.message : e));
                  return;
                }
                // H-3: the record is gone — the on-device copy and cached
                // bytes must not outlive it. Best-effort: the record delete
                // already succeeded and must not be undone by this failing.
                await removeLocalCopy(target.id).catch(() => undefined);
                if (target.fileRef) await evictDriveCache(target.fileRef, target.name).catch(() => undefined);
                setToast(`${target.name} deleted permanently — the copy on this device is gone too.`);
              }}
            >
              Delete permanently
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Snackbar visible={!!toast} onDismiss={() => setToast('')} duration={4000}>
          {toast}
        </Snackbar>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16, gap: 8, paddingBottom: 32 },
  header: { gap: 12, paddingBottom: 4 },
  upload: { gap: 8 },
  buttons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingCard: { borderRadius: 16 },
  sectionTitle: { marginTop: 4 },
  card: { borderRadius: 16 },
  cardContent: { gap: 2 },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  chipText: { fontSize: 11 },
  tight: { margin: 0 },
  loader: { marginTop: 32 },
  empty: { textAlign: 'center', marginTop: 16 },
});
