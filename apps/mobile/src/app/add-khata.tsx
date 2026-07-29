import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Appbar,
  Banner,
  Button,
  Card,
  HelperText,
  Icon,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { importPassbookImage, type ImportedParcel } from '@/api/client';
import { useCreateFlows, useDocumentActions, usePassbooks } from '@/data/hooks';
import { uploadToDrive } from '@/api/storage';
import { saveLocalCopy } from '@/lib/localFiles';
import { documentFileName } from '@pattadar/core';
import { formatArea, toAcres, unitKey } from '@pattadar/core';
import { RequireSignIn } from '@/components/RequireSignIn';
import { useIdentity } from '@/data/hooks';

/**
 * New khata (passbook) — mirrors the web PassbookCreateDialog: photograph or
 * pick a passbook (AI extraction prefills the form and holds the parcel rows,
 * created verbatim after the passbook) or fill everything by hand.
 * Validation parity: khata number + all four location fields are required.
 */
export default function AddKhataScreen() {
  const theme = useTheme();
  const identity = useIdentity();
  const { createPassbook, createParcel } = useCreateFlows();

  const [form, setForm] = useState({
    pattadarNo: '',
    ownerName: '',
    fatherHusbandName: '',
    state: 'Andhra Pradesh',
    district: '',
    mandal: '',
    village: '',
  });
  const [parcels, setParcels] = useState<ImportedParcel[]>([]);
  const [reading, setReading] = useState(false);
  const [importError, setImportError] = useState('');
  const [saveError, setSaveError] = useState('');
  const { data: result } = usePassbooks();
  const { fileDocument, linkRegistered } = useDocumentActions();
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  // CL-373: an indeterminate spinner for 20s reads as frozen — name the stage.
  const [stage, setStage] = useState('');
  const [scannedFile, setScannedFile] = useState<{ uri: string; name: string; mime: string } | null>(null);
  // CL-372: extraction must be abandonable; a hang used to lock the whole form.
  const cancelled = useRef(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const runFileImport = async (uri: string, name: string, mime: string) => {
    setImportError('');
    cancelled.current = false;
    // Keep the scan: a passbook photographed here IS a document of record and
    // used to be read and thrown away.
    setScannedFile({ uri, name, mime });
    try {
      setReading(true);
      // One request, so there are no real stages to report. Show elapsed time
      // instead — a counter that keeps moving proves the app is alive, whereas
      // invented stage labels implied progress even when nothing was happening.
      const started = Date.now();
      setStage('Reading the passbook…');
      const ticker = setInterval(() => {
        const secs = Math.round((Date.now() - started) / 1000);
        setStage(secs >= 5 ? `Reading the passbook… ${secs}s` : 'Reading the passbook…');
      }, 1000);
      const r = await importPassbookImage(uri, name, mime).finally(() => clearInterval(ticker));
      if (cancelled.current) return;
      setForm((f) => ({
        ...f,
        pattadarNo: r.pattadarNo || f.pattadarNo,
        ownerName: r.ownerName || f.ownerName,
        fatherHusbandName: r.fatherHusbandName || f.fatherHusbandName,
        state: r.state || f.state,
        district: r.district || f.district,
        mandal: r.mandal || f.mandal,
        village: r.village || f.village,
      }));
      setParcels(r.parcels);
    } catch (e) {
      if (!cancelled.current) {
        setImportError(e instanceof Error ? e.message : 'Could not read the document');
      }
    } finally {
      setReading(false);
      setStage('');
    }
  };

  const runImport = async (pick: () => Promise<ImagePicker.ImagePickerResult>) => {
    setImportError('');
    try {
      const res = await pick();
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      await runFileImport(a.uri, a.fileName ?? 'passbook.jpg', a.mimeType ?? 'image/jpeg');
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not open the picker');
    }
  };

  const missingRequired =
    !form.pattadarNo.trim() ||
    !form.state.trim() ||
    !form.district.trim() ||
    !form.mandal.trim() ||
    !form.village.trim();

  // CL-383: the same khata number in the same village is almost always a
  // re-scan of a passbook that already exists, not a new one.
  const duplicate = (result?.data.passbooks ?? []).find(
    (pb) =>
      pb.pattadarNo.trim() === form.pattadarNo.trim() &&
      (pb.village || '').trim().toLowerCase() === form.village.trim().toLowerCase() &&
      !!form.pattadarNo.trim(),
  );

  const save = async () => {
    setTried(true);
    setSaveError('');
    if (missingRequired) return;
    setSaving(true);
    try {
      const created = await createPassbook.mutateAsync({
        pattadarNo: form.pattadarNo.trim(),
        ownerName: form.ownerName.trim(),
        fatherHusbandName: form.fatherHusbandName.trim(),
        state: form.state.trim(),
        district: form.district.trim(),
        mandal: form.mandal.trim(),
        village: form.village.trim(),
      });
      const id = created.createPassbook?.id;
      if (!id) throw new Error('Could not create the passbook');

      // File the scanned page as a document against the new passbook, named
      // from what was read rather than a UUID.
      if (scannedFile) {
        try {
          const node = await uploadToDrive(scannedFile.uri, scannedFile.name, scannedFile.mime).catch(
            () => null,
          );
          const filed = await fileDocument.mutateAsync({
            doc_type: 'Pattadar Passbook',
            pattadar_no: form.pattadarNo.trim(),
            owner_name: form.ownerName.trim(),
            village: form.village.trim(),
            district: form.district.trim(),
            _fileRef: node?.id ?? '',
          });
          const docId = filed.createRegisteredDocument?.id;
          if (docId) {
            await linkRegistered.mutateAsync({ id: docId, passbookId: id }).catch(() => undefined);
            await saveLocalCopy(
              docId,
              scannedFile.uri,
              documentFileName(
                {
                  docType: 'Pattadar Passbook',
                  village: form.village.trim(),
                  ownerName: form.ownerName.trim(),
                },
                scannedFile.name,
              ),
            ).catch(() => undefined);
          }
        } catch {
          // The passbook itself is saved; losing the attachment must not fail it.
        }
      }
      /**
       * `extent` is canonical decimal ACRES; `unit` is only a provenance label.
       *
       * These were written verbatim, so a passbook line reading "40 Guntas"
       * was stored as 40 ACRES — a forty-fold overstatement of the holding,
       * silently, on the automated path people are told to prefer. The manual
       * form has always converted (add-parcel.tsx toAcres); this did not.
       */
      for (const p of parcels) {
        await createParcel.mutateAsync({
          passbookId: id,
          surveyNo: p.surveyNo,
          subdivision: p.subdivision,
          extent: toAcres(Number(p.extent) || 0, unitKey(p.unit)),
          unit: p.unit,
          classification: p.classification,
          acquisitionSource: p.acquisitionSource,
          parentParcelId: '',
          source: `passbook:${id}`,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const err = (v: string) => tried && !v.trim();

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
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="New passbook" />
      </Appbar.Header>
      <KeyboardAvoidingView
        style={styles.grow}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
      <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
      <View>
        <Card mode="contained">
          <Card.Content style={styles.importBox}>
            <View style={styles.titleRow}>
              <Icon source="camera" size={18} color={theme.colors.primary} />
              <Text variant="titleSmall">Read it from the passbook</Text>
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Photograph or upload the pattadar passbook — AI extraction fills
              the form and finds the parcels.
            </Text>
            <View style={styles.importButtons}>
              <Button
                mode="contained-tonal"
                icon="camera"
                disabled={reading}
                onPress={() =>
                  runImport(async () => {
                    const perm = await ImagePicker.requestCameraPermissionsAsync();
                    if (!perm.granted) throw new Error('Camera permission denied — enable it in Settings > Pattadar.');
                    return ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8 });
                  })
                }
              >
                Camera
              </Button>
              <Button
                mode="contained-tonal"
                icon="image"
                disabled={reading}
                onPress={() =>
                  runImport(() =>
                    ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 }),
                  )
                }
              >
                Photos
              </Button>
              <Button
                mode="contained-tonal"
                icon="file-pdf-box"
                disabled={reading}
                onPress={async () => {
                  try {
                  const res = await DocumentPicker.getDocumentAsync({
                    type: ['application/pdf', 'image/*'],
                    copyToCacheDirectory: true,
                  });
                  if (res.canceled || !res.assets?.[0]) return;
                  const a = res.assets[0];
                  await runFileImport(a.uri, a.name, a.mimeType ?? 'application/pdf');
                  } catch (e) {
                    setImportError(e instanceof Error ? e.message : 'Could not open the file picker');
                  }
                }}
              >
                Files
              </Button>
            </View>
            {reading && (
              <View style={styles.reading}>
                <ActivityIndicator size="small" />
                <Text variant="bodyMedium" style={styles.grow}>
                  {stage || 'Reading the document…'}
                </Text>
                <Button
                  mode="text"
                  compact
                  onPress={() => {
                    cancelled.current = true;
                    setReading(false);
                    setStage('');
                    setImportError('Reading cancelled — the form is yours to fill in.');
                  }}
                >
                  Cancel
                </Button>
              </View>
            )}
            {!!importError && (
              <HelperText type="error" visible>
                {importError}
              </HelperText>
            )}
          </Card.Content>
        </Card>

        {parcels.length > 0 && (
          <Banner visible icon="text-box-check-outline">
            What I read: {parcels.length} parcel{parcels.length === 1 ? '' : 's'} —{' '}
            {parcels
              .map((p) => `Sy ${p.surveyNo}${p.subdivision ? `/${p.subdivision}` : ''}`)
              .join(', ')}
            . They are created with the khata.
          </Banner>
        )}

        <TextInput
          label="Khata number *"
          value={form.pattadarNo}
          onChangeText={set('pattadarNo')}
          error={err(form.pattadarNo)}
          mode="outlined"
        />
        <TextInput
          label="Owner / pattadar name"
          value={form.ownerName}
          onChangeText={set('ownerName')}
          mode="outlined"
        />
        <TextInput
          label="Father / husband name"
          value={form.fatherHusbandName}
          onChangeText={set('fatherHusbandName')}
          mode="outlined"
        />
        <TextInput
          label="State *"
          value={form.state}
          onChangeText={set('state')}
          error={err(form.state)}
          mode="outlined"
        />
        <TextInput
          label="District *"
          value={form.district}
          onChangeText={set('district')}
          error={err(form.district)}
          mode="outlined"
        />
        <TextInput
          label="Mandal *"
          value={form.mandal}
          onChangeText={set('mandal')}
          error={err(form.mandal)}
          mode="outlined"
        />
        <TextInput
          label="Village *"
          value={form.village}
          onChangeText={set('village')}
          error={err(form.village)}
          mode="outlined"
        />
        {tried && missingRequired && (
          <HelperText type="error" visible>
            Needs khata number and location.
          </HelperText>
        )}
        {!!saveError && (
          <HelperText type="error" visible>
            {saveError}
          </HelperText>
        )}
        {parcels.length > 0 && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Total extent read: {formatArea(parcels.reduce((s, p) => s + (p.extent || 0), 0))}
          </Text>
        )}
        {!!duplicate && (
          <HelperText type="error" visible>
            Khata {duplicate.pattadarNo} already exists in {duplicate.village}. Saving
            creates a second copy — open the existing passbook instead if this is the same one.
          </HelperText>
        )}
        {missingRequired && tried && (
          <HelperText type="error" visible>
            Still needed: {[
              !form.pattadarNo.trim() && 'khata number',
              !form.state.trim() && 'state',
              !form.district.trim() && 'district',
              !form.mandal.trim() && 'mandal',
              !form.village.trim() && 'village',
            ]
              .filter(Boolean)
              .join(', ')}
          </HelperText>
        )}
        {/* CL-378: always enabled — pressing it explains what is missing. */}
        <Button mode="contained" onPress={save} loading={saving} disabled={saving || reading}>
          Save passbook{parcels.length > 0 ? ` + ${parcels.length} parcels` : ''}
        </Button>
      </View>
      </TouchableWithoutFeedback>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, gap: 12, paddingBottom: 32 },
  importBox: { gap: 8 },
  importButtons: { flexDirection: 'row', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grow: { flex: 1 },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
