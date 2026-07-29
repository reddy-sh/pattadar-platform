import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Chip,
  Dialog,
  HelperText,
  List,
  Menu,
  Portal,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { extractAadhaar } from '@/api/client';
import { PhotoField } from '@/components/PhotoField';
import { InlinePicker } from '@/components/InlinePicker';
import { SheetDialog } from '@/components/SheetDialog';
import { displayName } from '@/lib/family';
import { authenticateForReveal, copySensitive } from '@/lib/secureReveal';
import { choosePhotoSource, pickImage } from '@/lib/photoPicker';
import { uploadToDrive } from '@/api/storage';
import { saveLocalCopy } from '@/lib/localFiles';
import { documentFileName } from '@pattadar/core';
import { RequireSignIn } from '@/components/RequireSignIn';
import { useDocumentActions, useGroups, useIdentity, useMemberActions } from '@/data/hooks';
import { aadhaarPrefill, formatAadhaar, isValidAadhaar } from '@/lib/aadhaar';
import { dmyToIso, formatAadhaarMask, isValidDmy, isoToDmy, maskDmyInput } from '@pattadar/core';

const RELATIONS = ['spouse', 'son', 'daughter', 'father', 'mother', 'brother', 'sister', 'other'];
const GENDERS = ['male', 'female', 'other'];
const cap = (s: string) => s.replace(/^\w/, (c) => c.toUpperCase());
const KEYBOARD_BAR = 'pattadar-kb-bar';
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
/** "1983-06-09" → "9 June 1983" — no way to misread which part is the month. */
function longDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])} ${MONTHS_LONG[Number(m[2]) - 1]} ${m[1]}` : iso;
}

/** Add a family member — Aadhaar scan prefills KYC; heirs get an invite link. */
export default function AddMemberScreen() {
  const theme = useTheme();
  const identity = useIdentity();
  const { groupId, groupName, memberId } = useLocalSearchParams<{
    groupId: string;
    groupName?: string;
    memberId?: string;
  }>();
  const { addMember, updateMember, removeMember, revealAadhaar } = useMemberActions();
  const { fileDocument } = useDocumentActions();
  const { data: groupsResult } = useGroups();
  const existing = memberId
    ? (groupsResult?.data.members ?? []).find((m) => m.id === memberId)
    : undefined;
  const isEdit = !!existing;

  const [name, setName] = useState(existing?.name ?? '');
  // CL-356: unset must be visibly unset, not silently 'other'.
  const [relation, setRelation] = useState(existing?.relation ?? '');
  const [gender, setGender] = useState(existing?.gender ?? '');
  // Shown and typed as DD/MM/YYYY (what the ID card says); stored as ISO.
  const [dob, setDob] = useState(isoToDmy(existing?.dob ?? ''));
  // Editing shows the masked number: the raw value never leaves the server, and
  // sending it back empty tells the API to keep what it already has.
  const [aadhaar, setAadhaar] = useState('');
  const [address, setAddress] = useState(existing?.presentAddress ?? '');
  const [notes, setNotes] = useState(existing?.bio ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [relMenu, setRelMenu] = useState(false);
  const [genMenu, setGenMenu] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState('');
  const [scanWarn, setScanWarn] = useState(false);
  const [note, setNote] = useState('');
  // Photo is only persisted when the owner ticks consent (it is personal data
  // about another person, so storing it is an explicit choice, not a default).
  const [photo, setPhoto] = useState(existing?.photo ?? '');

  // CL-359: Aadhaar retention is opt-in and separate from scanning to prefill.
  const storedAadhaar = existing?.aadhaarMasked ?? '';
  const [replacingAadhaar, setReplacingAadhaar] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [confirmRescan, setConfirmRescan] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // CL-449: back-navigation must not silently throw away edits.
  const initial = useRef('');
  const snapshot = JSON.stringify({ name, relation, gender, dob, address, notes, phone, email, photo, aadhaar });
  useEffect(() => {
    if (!initial.current) initial.current = snapshot;
  }, [snapshot]);
  const dirty = !!initial.current && initial.current !== snapshot;
  const leave = () => (dirty ? setConfirmDiscard(true) : router.back());

  /** Read an Aadhaar card and fill what it could see. Never overwrites a field
   * the user already typed, and never invents digits the model couldn't read. */
  const scan = async (uri: string, fileName: string, mimeType: string) => {
    // Captured from the extraction so the filed document can be named after
    // the person on the card, not the empty form field.
    let scannedName = '';
    setError('');
    setScanNote('');
    setScanWarn(false);
    setScanning(true);
    try {
      const fields = await extractAadhaar(uri, fileName, mimeType);
      const p = aadhaarPrefill(fields as Record<string, string>);
      scannedName = p.name;
      if (!p.readAnything) {
        setScanWarn(true);
        setScanNote("That doesn't look like an Aadhaar card — nothing was filled in.");
        return;
      }
      if (p.name) setName((v) => v || p.name);
      if (p.dob) setDob((v) => v || p.dob);
      if (p.gender) setGender((v) => v || p.gender);
      if (p.aadhaar) setAadhaar((v) => v || p.aadhaar);
      if (p.address) setAddress((v) => v || p.address);
      const filled = [
        p.name && 'name',
        p.dob && 'date of birth',
        p.gender && 'gender',
        p.aadhaar && 'Aadhaar number',
        p.address && 'address',
      ].filter(Boolean);
      setScanWarn(p.lowConfidence || !p.aadhaar);
      setScanNote(
        p.lowConfidence
          ? `Read with low confidence — please check every field. Filled: ${filled.join(', ')}.`
          : !p.aadhaar
            ? `Filled ${filled.join(', ')}. The number wasn't clearly readable — type it in or rescan.`
            : `Filled ${filled.join(', ')}.`,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setScanWarn(true);
      setScanNote(e instanceof Error ? e.message : 'Could not read the Aadhaar');
    } finally {
      // Keep the card as a document — it is a record of identity, not a
      // throwaway. Uploaded first, then the cache copy is cleared.
      try {
        const person = scannedName || name || existing?.name || 'Member';
        const node = await uploadToDrive(uri, fileName, mimeType).catch(() => null);
        const filed = await fileDocument.mutateAsync({
          doc_type: 'Aadhaar',
          owner_name: person,
          _fileRef: node?.id ?? '',
        });
        const docId = filed.createRegisteredDocument?.id;
        if (docId) {
          await saveLocalCopy(
            docId,
            uri,
            documentFileName({ docType: 'Aadhaar', ownerName: person }, fileName),
          ).catch(() => undefined);
        }
      } catch {
        // Reading the card already succeeded; failing to file it must not undo that.
      }
      if (uri.startsWith(FileSystem.cacheDirectory ?? '###')) {
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      }
      setScanning(false);
    }
  };

  const scanFrom = async (source: 'camera' | 'library' | 'files') => {
    const picked = await pickImage(source);
    if (!picked) return;
    if ('error' in picked) {
      setScanWarn(true);
      setScanNote(picked.error);
      return;
    }
    await scan(picked.uri, picked.name, picked.mimeType);
  };

  const scanCamera = () => scanFrom('camera');
  const scanPhotos = () => scanFrom('library');
  const scanFile = () => scanFrom('files');

  /** Native chooser — presented by the system, so it cannot collide with our
   * own modal the way the old custom sheet did. */
  const choosePhoto = async () => {
    const source = await choosePhotoSource({ allowRemove: !!photo, title: 'Profile photo' });
    if (!source) return;
    if (source === 'remove') {
      setPhoto('');
      return;
    }
    const picked = await pickImage(source, { square: true, base64: true });
    if (!picked) return;
    if ('error' in picked) {
      setNote(picked.error);
      return;
    }
    if (!picked.base64) {
      setNote("Couldn't read that image — try another.");
      return;
    }
    setPhoto(`data:${picked.mimeType};base64,${picked.base64}`);
  };

  const aadhaarBad = !isValidAadhaar(aadhaar);

  const save = async () => {
    setTried(true);
    setError('');
    if (!name.trim() || !groupId) return;
    if (!relation) {
      setError('Choose how this person is related — it drives succession records.');
      return;
    }
    if (!isValidDmy(dob)) {
      setError('Check the date of birth — it should be DD/MM/YYYY.');
      return;
    }
    if (aadhaarBad) {
      setError('Aadhaar must be 12 digits — or leave it empty.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && existing) {
        await updateMember.mutateAsync({
          id: existing.id,
          name: name.trim(),
          relation,
          role: existing.role || 'Member',
          gender,
          dob: dmyToIso(dob),
          phone: phone.trim(),
          email: email.trim(),
          bio: notes.trim(),
          isBeneficiary: existing?.isBeneficiary ?? false,
          sharePct: Number(existing?.sharePct) || 0,
          presentAddress: address.trim(),
          aadhaar,
          photo,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        router.back();
        return;
      }
      const r = await addMember.mutateAsync({
        groupId,
        name: name.trim(),
        relation,
        phone: phone.trim(),
        email: email.trim(),
        isBeneficiary: false,
        sharePct: 0,
        gender,
        dob: dmyToIso(dob),
        bio: notes.trim(),
        presentAddress: address.trim(),
        aadhaar,
        photo,
      });
      const saved = r.addMember;
      if (!saved) throw new Error('Could not add the member');
      if (saved.inviteToken) {
        // Same share message the web builds for heir verification.
        await Share.share({
          message: `Hi ${name.trim()}, please verify your co-ownership on Pattadar: https://pattadar.com/verify/${saved.inviteToken}`,
        }).catch(() => undefined);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!identity) {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <RequireSignIn />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={leave} />
        {/* Title no longer truncates — the group is the subtitle */}
        <Appbar.Content
          title={
            <View>
              <Text variant="titleLarge" style={styles.bold} numberOfLines={1}>
                {isEdit ? 'Edit member' : 'Add member'}
              </Text>
              {!!(isEdit ? existing?.name : groupName) && (
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                  {isEdit ? existing?.name : groupName}
                </Text>
              )}
            </View>
          }
        />
      </Appbar.Header>
      <KeyboardAvoidingView
        style={styles.grow}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        /* CL-395: drag the keyboard away as well as tapping outside */
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
      <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
      <View>
        {/* CL-441: creation affordance — on an edit it becomes an explicit
            action further down, so it does not dominate the form. */}
        {(!isEdit || rescanning) && (
        <Card mode="contained">
          <Card.Content style={styles.gap}>
            <View style={styles.rowLine}>
              <List.Icon icon="card-account-details-outline" color={theme.colors.primary} />
              <Text variant="titleSmall">Scan Aadhaar</Text>
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Reads name, date of birth, gender, number and address.
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              The card is saved to your documents so you can open it later. The
              number is stored encrypted — only you can reveal or copy it, and
              every time you do is recorded.
            </Text>
            <View style={styles.buttons}>
              <Button mode="outlined" icon="camera" disabled={scanning} onPress={scanCamera}>
                Camera
              </Button>
              <Button mode="outlined" icon="image" disabled={scanning} onPress={scanPhotos}>
                Photos
              </Button>
              <Button mode="outlined" icon="file-pdf-box" disabled={scanning} onPress={scanFile}>
                Files
              </Button>
            </View>
            {scanning && (
              <View style={styles.rowLine}>
                <ActivityIndicator size="small" />
                <Text variant="bodyMedium">Reading the card…</Text>
              </View>
            )}
            {!!scanNote && (
              <Text
                variant="bodySmall"
                style={{ color: scanWarn ? '#b45309' : theme.colors.primary }}
              >
                {scanNote}
              </Text>
            )}
          </Card.Content>
        </Card>
        )}

        <PhotoField
          name={name || '?'}
          photo={photo}
          onEdit={choosePhoto}
          hint="Used across groups and records"
        />
        <TextInput
          label="Name *"
          value={name}
          onChangeText={setName}
          error={tried && !name.trim()}
          mode="outlined"
        />
        <InlinePicker
          label="Relation *"
          value={relation}
          options={RELATIONS.map((r) => ({ value: r, label: cap(r) }))}
          open={relMenu}
          error={tried && !relation}
          errorText="Required — it drives succession records" 
          onToggle={() => setRelMenu((o) => !o)}
          onPick={(v) => {
            setRelation(v);
            setRelMenu(false);
          }}
        />
        <InlinePicker
          label="Gender"
          value={gender}
          options={GENDERS.map((g) => ({ value: g, label: cap(g) }))}
          open={genMenu}
          onToggle={() => setGenMenu((o) => !o)}
          onPick={(v) => {
            setGender(v);
            setGenMenu(false);
          }}
        />
        <TextInput
          label="Date of birth"
          placeholder="DD/MM/YYYY"
          value={dob}
          onChangeText={(t) => setDob(maskDmyInput(t))}
          keyboardType="number-pad"
          inputAccessoryViewID={KEYBOARD_BAR}
          returnKeyType="next"
          maxLength={10}
          error={!isValidDmy(dob)}
          mode="outlined"
        />
        {!isValidDmy(dob) ? (
          <HelperText type="error" visible>
            Enter the date as DD/MM/YYYY.
          </HelperText>
        ) : dmyToIso(dob) ? (
          /* 06/09/1983 reads as either 6 Sep or 9 Jun — say which it is. */
          <HelperText type="info" visible>
            = {longDate(dmyToIso(dob))}
          </HelperText>
        ) : null}
        {storedAadhaar && !replacingAadhaar ? (
          <View style={[styles.storedRow, { borderColor: theme.colors.outlineVariant }]}>
            <Pressable
              style={styles.growShrink}
              accessibilityRole="button"
              accessibilityLabel="Reveal and edit the Aadhaar number"
              onPress={async () => {
                if (!existing) return;
                if (!(await authenticateForReveal('Show this Aadhaar number'))) return;
                try {
                  const full = await revealAadhaar.mutateAsync(existing.id);
                  setAadhaar(formatAadhaar(full.revealMemberAadhaar));
                  setReplacingAadhaar(true);
                } catch (e) {
                  setNote(e instanceof Error ? e.message : "Couldn't read the number");
                }
              }}
            >
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Aadhaar on record · tap to reveal or edit
              </Text>
              <Text variant="bodyMedium" style={styles.mono}>
                {formatAadhaarMask(storedAadhaar)}
              </Text>
            </Pressable>
            <Button
              mode="text"
              compact
              icon="content-copy"
              loading={revealAadhaar.isPending}
              onPress={async () => {
                if (!existing) return;
                if (!(await authenticateForReveal('Copy this Aadhaar number'))) return;
                try {
                  const full = await revealAadhaar.mutateAsync(existing.id);
                  await copySensitive(full.revealMemberAadhaar);
                  setNote('Aadhaar number copied — the clipboard clears in a minute.');
                } catch (e) {
                  setNote(e instanceof Error ? e.message : "Couldn't copy the number");
                }
              }}
            >
              Copy
            </Button>
          </View>
        ) : (
          <TextInput
            label="Aadhaar number"
            value={aadhaar}
            onChangeText={(t) => setAadhaar(formatAadhaar(t))}
            keyboardType="number-pad"
            inputAccessoryViewID={KEYBOARD_BAR}
            maxLength={14}
            error={tried && aadhaarBad}
            mode="outlined"
            right={
              storedAadhaar ? (
                <TextInput.Icon
                  icon="close"
                  onPress={() => {
                    setReplacingAadhaar(false);
                    setAadhaar('');
                  }}
                />
              ) : undefined
            }
          />
        )}
        {aadhaarBad && (
          <HelperText type="error" visible>
            Aadhaar must be 12 digits.
          </HelperText>
        )}
        {isEdit && !rescanning && (
          <Button mode="text" compact icon="card-account-details-outline" style={styles.leftBtn} onPress={() => setConfirmRescan(true)}>
            Re-scan Aadhaar to fill empty fields
          </Button>
        )}
        <TextInput
          label="Present address"
          value={address}
          onChangeText={setAddress}
          multiline
          mode="outlined"
        />
        <TextInput
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          inputAccessoryViewID={KEYBOARD_BAR}
          mode="outlined"
        />
        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          mode="outlined"
        />
        {isEdit && (
          <Button
            mode="text"
            compact
            icon="scale-balance"
            style={styles.leftBtn}
            onPress={() =>
              dirty
                ? setNote('Save your changes first — estate shares open on their own screen.')
                : router.push({ pathname: '/allocation', params: { groupId } })
            }
          >
            Estate shares are set for the whole group →
          </Button>
        )}
        {isEdit && !existing?.isSelf && (
          <View style={styles.memberActions}>
            {!!existing?.inviteToken && (
              <Button
                mode="outlined"
                compact
                icon="email-fast-outline"
                onPress={() =>
                  Share.share({
                    message: `Hi ${name}, please verify your co-ownership on Pattadar: https://pattadar.com/verify/${existing.inviteToken}`,
                  }).catch(() => undefined)
                }
              >
                Send invite
              </Button>
            )}
            <Button
              mode="text"
              compact
              textColor={theme.colors.error}
              icon="account-remove-outline"
              onPress={() => setConfirmRemove(true)}
            >
              Remove from group
            </Button>
          </View>
        )}
        <TextInput
          label="Notes"
          placeholder="Anything worth remembering about this person"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          mode="outlined"
        />
        {!!note && (
          <HelperText type="info" visible>
            {note}
          </HelperText>
        )}
        {!!error && (
          <HelperText type="error" visible>
            {error}
          </HelperText>
        )}

        <Chip compact mode="outlined" icon="shield-check-outline" textStyle={styles.chipText} style={styles.privacy}>
          KYC details stay in your account — never shared with other members
        </Chip>
      </View>
      </TouchableWithoutFeedback>
      </ScrollView>
      {/* CL-447: Save stays reachable regardless of scroll or keyboard. */}
      <View style={[styles.saveBar, { backgroundColor: theme.colors.elevation.level2, borderTopColor: theme.colors.outlineVariant }]}>
        <Button mode="text" onPress={leave} disabled={saving}>
          Cancel
        </Button>
        <Button mode="contained" style={styles.grow} onPress={save} loading={saving} disabled={saving}>
          {isEdit ? 'Save changes' : 'Add member'}
        </Button>
      </View>
      {/* CL-397: number pads have no return key — this is the only way out. */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={KEYBOARD_BAR}>
          <View style={[styles.kbBar, { backgroundColor: theme.colors.elevation.level2 }]}>
            <Button mode="text" compact onPress={Keyboard.dismiss}>
              Done
            </Button>
          </View>
        </InputAccessoryView>
      )}
      </KeyboardAvoidingView>
        {/* CL-442: re-scanning replaces typed values — say so first */}
        <SheetDialog
          visible={confirmRescan}
          title={`Re-scan Aadhaar?`}
          onDismiss={() => setConfirmRescan(false)}
          actions={
            <>
              <Button onPress={() => setConfirmRescan(false)}>Cancel</Button>
              <Button
                mode="contained"
                onPress={() => {
                  setConfirmRescan(false);
                  setRescanning(true);
                }}
              >
                Re-scan
              </Button>
            </>
          }
        >
          
            <Text variant="bodyMedium">
              Reading a card again fills any field it can read that you have left
              empty. Anything you have typed is kept.
            </Text>
        </SheetDialog>
        <SheetDialog
          visible={confirmRemove}
          title={`Remove ${displayName(name) || 'this member'}?`}
          onDismiss={() => setConfirmRemove(false)}
          actions={
            <>
            <Button onPress={() => setConfirmRemove(false)}>Keep</Button>
            <Button
              textColor={theme.colors.error}
              loading={removeMember.isPending}
              disabled={removeMember.isPending}
              onPress={async () => {
                if (existing) await removeMember.mutateAsync(existing.id).catch(() => undefined);
                setConfirmRemove(false);
                router.back();
              }}
            >
              Remove
            </Button>
            </>
          }
        >
          
            <Text variant="bodyMedium">
              Their record and any pending invite are removed from this group.
              Their estate share is freed up for the others.
            </Text>
        </SheetDialog>
        {/* CL-449 */}
        <SheetDialog
          visible={confirmDiscard}
          title={`Discard changes?`}
          onDismiss={() => setConfirmDiscard(false)}
          actions={
            <>
            <Button onPress={() => setConfirmDiscard(false)}>Keep editing</Button>
            <Button textColor={theme.colors.error} onPress={() => router.back()}>
              Discard
            </Button>
            </>
          }
        >
          
            <Text variant="bodyMedium">Your edits to this record have not been saved.</Text>
        </SheetDialog>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, gap: 12, paddingBottom: 48 },
  heirRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  gap: { gap: 8 },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  bold: { fontWeight: '700' },
  chipText: { fontSize: 11 },
  privacy: { alignSelf: 'center' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  leftBtn: { alignSelf: 'flex-start' },
  memberActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  saveBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderTopWidth: 1 },
  growShrink: { flex: 1 },
  storedRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 4, paddingRight: 8, minHeight: 56 },
  mono: { fontFamily: 'Menlo', fontSize: 13 },
  kbBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 8 },
  pickerList: { borderWidth: 1, borderRadius: 8, marginTop: 4, overflow: 'hidden' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 16 },
  pickerCheck: { margin: 0, width: 22, height: 22 },
  consent: { paddingHorizontal: 0, marginTop: 4 },
  consentLabel: { fontSize: 12, textAlign: 'left' },
});
