import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Banner,
  Button,
  Card,
  HelperText,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { importPassbookImage, type ImportedParcel } from '@/api/client';
import { useCreateFlows } from '@/data/hooks';
import { formatArea } from '@pattadar/core';
import { tokens } from '@pattadar/tokens';

/**
 * New khata (passbook) — mirrors the web PassbookCreateDialog: photograph or
 * pick a passbook (AI extraction prefills the form and holds the parcel rows,
 * created verbatim after the passbook) or fill everything by hand.
 * Validation parity: khata number + all four location fields are required.
 */
export default function AddKhataScreen() {
  const theme = useTheme();
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
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const runImport = async (pick: () => Promise<ImagePicker.ImagePickerResult>) => {
    setImportError('');
    const res = await pick();
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setReading(true);
    try {
      const r = await importPassbookImage(
        a.uri,
        a.fileName ?? 'passbook.jpg',
        a.mimeType ?? 'image/jpeg',
      );
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
      setImportError(e instanceof Error ? e.message : 'Could not read the document');
    } finally {
      setReading(false);
    }
  };

  const missingRequired =
    !form.pattadarNo.trim() ||
    !form.state.trim() ||
    !form.district.trim() ||
    !form.mandal.trim() ||
    !form.village.trim();

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
      if (!id) throw new Error('Could not create the khata');
      // Web parity: extracted parcels are created verbatim, source passbook:<id>.
      for (const p of parcels) {
        await createParcel.mutateAsync({
          passbookId: id,
          surveyNo: p.surveyNo,
          subdivision: p.subdivision,
          extent: p.extent,
          unit: p.unit,
          classification: p.classification,
          acquisitionSource: p.acquisitionSource,
          parentParcelId: '',
          source: `passbook:${id}`,
        });
      }
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const err = (v: string) => tried && !v.trim();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="New khata" />
      </Appbar.Header>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Card mode="contained">
          <Card.Content style={styles.importBox}>
            <Text variant="titleSmall">📸 Read it from the passbook</Text>
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
                  runImport(() =>
                    ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8 }),
                  )
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
            </View>
            {reading && (
              <View style={styles.reading}>
                <ActivityIndicator size="small" />
                <Text variant="bodyMedium">Reading the document…</Text>
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
          label="Pattadar / khata number *"
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
        <Button mode="contained" onPress={save} loading={saving} disabled={saving || reading}>
          Save khata{parcels.length > 0 ? ` + ${parcels.length} parcels` : ''}
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: tokens.spacing.lg, gap: tokens.spacing.md, paddingBottom: tokens.spacing.xxl },
  importBox: { gap: tokens.spacing.sm },
  importButtons: { flexDirection: 'row', gap: tokens.spacing.sm },
  reading: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
});
