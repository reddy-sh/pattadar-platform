import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Appbar,
  Button,
  HelperText,
  Menu,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { uploadToDrive } from '@/api/storage';
import { useCreateFlows, useDocumentActions, useHoldings } from '@/data/hooks';
import { toAcres, unitKey } from '@pattadar/core';
import { InlinePicker } from '@/components/InlinePicker';
import { ScanFirstCard, type ScannedFile } from '@/components/ScanFirstCard';
import { parseAreaSqYd } from '@pattadar/core';
import { RequireSignIn } from '@/components/RequireSignIn';
import { saveLocalCopy } from '@/lib/localFiles';
import { useIdentity } from '@/data/hooks';

/**
 * New parcel — mirrors the web AddParcelDialog: extent is canonicalized to
 * decimal acres via toAcres() while the chosen unit key is stored as
 * provenance; cost-per-acre is saved only as the derived total price.
 */
const UNITS = [
  { key: 'acre', label: 'Acres' },
  { key: 'cent', label: 'Cents' },
  { key: 'gunta', label: 'Guntas' },
  { key: 'sqyd', label: 'Sq. yards' },
  { key: 'sqft', label: 'Sq. feet' },
  { key: 'hectare', label: 'Hectares' },
  { key: 'ankanam', label: 'Ankanam' },
];

const SOURCES = ['sale', 'gift', 'inheritance', 'partition', 'will', 'grant'];

export default function AddParcelScreen() {
  const theme = useTheme();
  const identity = useIdentity();
  const params = useLocalSearchParams<{ passbookId?: string }>();
  const { data: holdings } = useHoldings();
  const { createParcel, setParcelPrice } = useCreateFlows();
  const { fileDocument, linkRegistered } = useDocumentActions();

  const passbooks = holdings?.data.passbooks ?? [];
  const [passbookId, setPassbookId] = useState(params.passbookId ?? '');
  // Hand entry starts folded; the scan card opens it.
  const [manualOpen, setManualOpen] = useState(false);
  /** The deed this parcel was read from, so it can be filed WITH the parcel. */
  const [scanned, setScanned] = useState<{ file: ScannedFile; fields: Record<string, unknown> } | null>(null);
  const [savedId, setSavedId] = useState('');
  const [filing, setFiling] = useState('');
  const [surveyNo, setSurveyNo] = useState('');
  const [subdivision, setSubdivision] = useState('');
  const [extent, setExtent] = useState('');
  const [unit, setUnit] = useState('acre');
  const [classification, setClassification] = useState('agri');
  const [acquisitionSource, setAcquisitionSource] = useState('sale');
  const [costPerAcre, setCostPerAcre] = useState('');
  const [pbMenu, setPbMenu] = useState(false);
  const [unitMenu, setUnitMenu] = useState(false);
  const [srcMenu, setSrcMenu] = useState(false);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const selectedPb = passbooks.find((p) => p.id === passbookId);
  const extentNum = parseFloat(extent);
  const valid = passbookId && surveyNo.trim() && extentNum > 0;

  const save = async () => {
    if (savedId) {
      router.back();
      return;
    }
    setTried(true);
    setSaveError('');
    if (!valid) return;
    setSaving(true);
    try {
      const extentAcres = toAcres(extentNum, unitKey(unit));
      const created = await createParcel.mutateAsync({
        passbookId,
        surveyNo: surveyNo.trim(),
        subdivision: subdivision.trim(),
        extent: extentAcres,
        unit,
        classification,
        acquisitionSource,
        parentParcelId: '',
        source: 'manual',
      });
      const id = created.createParcel?.id;
      if (!id) throw new Error('Could not create the parcel');
      const cost = Number(costPerAcre);
      if (cost > 0) {
        await setParcelPrice.mutateAsync({
          id,
          purchasePrice: Math.round(cost * extentAcres),
        });
      }
      // The deed is filed WITH the parcel it produced — same reason as the
      // property flow: a record made from a document should keep the document.
      if (scanned) {
        setFiling('Filing the deed…');
        try {
          let fileRef = '';
          try {
            const node = await uploadToDrive(scanned.file.uri, scanned.file.name, scanned.file.mime);
            fileRef = node.id;
          } catch {
            // The summary and fields survive even when the bytes do not.
          }
          const filed = await fileDocument.mutateAsync({ ...scanned.fields, _fileRef: fileRef });
          const docId = filed.createRegisteredDocument?.id;
          if (docId) {
            await linkRegistered.mutateAsync({ id: docId, passbookId });
            await saveLocalCopy(docId, scanned.file.uri, scanned.file.name).catch(() => undefined);
          }
        } catch (e) {
          setSavedId(id);
          setFiling('');
          setSaving(false);
          setSaveError(
            e instanceof Error
              ? `The parcel was saved, but its deed could not be filed: ${e.message} You can attach it from Documents.`
              : 'The parcel was saved, but its deed could not be filed. You can attach it from Documents.',
          );
          return;
        } finally {
          setFiling('');
        }
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
        <Appbar.Content title="New parcel" />
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
        <ScanFirstCard
          manualOpen={manualOpen}
          onManualOpenChange={setManualOpen}
          title="Read it from the deed"
          body="Photograph or upload the sale deed — the survey number, extent and classification are read from it and filled in below for you to check."
          onFields={(f, file) => {
            setScanned({ file, fields: f });
            setSurveyNo(String(f.survey_no ?? ''));
            setSubdivision(String(f.plot_no ?? ''));
            // A deed states extent in square yards; this form's default unit is
            // acres, so the unit is set to match what was actually written
            // rather than silently reinterpreting the number.
            const area = parseAreaSqYd(f.extent);
            if (area) {
              setExtent(String(area));
              setUnit('sqyd');
            }
            const cl = String(f.classification ?? '').toLowerCase();
            if (cl) {
              setClassification(
                cl.includes('house') || cl.includes('commerc') || cl.includes('site') ? 'non-agri' : 'agri',
              );
            }
          }}
        />
        {/* Folded until asked for or needed — the scan owns the screen until
            it produces something to check, or fails. */}
        {manualOpen && (
        <>
        <InlinePicker
          label="Passbook *"
          value={passbookId}
          open={pbMenu}
          error={tried && !passbookId}
          emptyText="No passbook yet — add one first"
          onToggle={() => setPbMenu((o) => !o)}
          onPick={(v) => {
            setPassbookId(v);
            setPbMenu(false);
          }}
          options={passbooks.map((p) => ({ value: p.id, label: `${p.pattadarNo} (${p.village})` }))}
        />

        <TextInput
          label="Survey number *"
          value={surveyNo}
          onChangeText={setSurveyNo}
          error={tried && !surveyNo.trim()}
          mode="outlined"
        />
        <TextInput
          label="Sub-division"
          value={subdivision}
          onChangeText={setSubdivision}
          mode="outlined"
        />
        <View style={styles.row}>
          <TextInput
            label="Extent *"
            value={extent}
            onChangeText={setExtent}
            keyboardType="decimal-pad"
            error={tried && !(extentNum > 0)}
            mode="outlined"
            style={styles.grow}
          />
          <View style={styles.unit}>
            <InlinePicker
              label="Unit"
              value={unit}
              open={unitMenu}
              onToggle={() => setUnitMenu((o) => !o)}
              onPick={(v) => {
                setUnit(v);
                setUnitMenu(false);
              }}
              options={UNITS.map((u) => ({ value: u.key, label: u.label }))}
            />
          </View>
        </View>

        <SegmentedButtons
          value={classification}
          onValueChange={setClassification}
          buttons={[
            { value: 'agri', label: 'Agricultural' },
            { value: 'non-agri', label: 'Non-agricultural' },
          ]}
        />

        <InlinePicker
          label="Acquisition source"
          value={acquisitionSource}
          open={srcMenu}
          onToggle={() => setSrcMenu((o) => !o)}
          onPick={(v) => {
            setAcquisitionSource(v);
            setSrcMenu(false);
          }}
          options={SOURCES.map((s) => ({ value: s, label: s.replace(/^\w/, (c) => c.toUpperCase()) }))}
        />

        <TextInput
          label="Cost per acre ₹ (optional)"
          value={costPerAcre}
          onChangeText={setCostPerAcre}
          keyboardType="number-pad"
          mode="outlined"
        />
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Saved as acquisition cost (extent × cost/acre).
        </Text>

        {tried && !valid && (
          <HelperText type="error" visible>
            Enter a passbook, a survey number, and how much land this parcel is.
          </HelperText>
        )}
        {!!saveError && (
          <HelperText type="error" visible>
            {saveError}
          </HelperText>
        )}
        <Button mode="contained" onPress={save} loading={saving} disabled={saving}>
          {savedId ? 'Done' : filing || 'Save parcel'}
        </Button>
        </>
        )}
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
  // A flex row stretches its children to the tallest sibling by default. When
  // the unit picker opened its list, the Extent field stretched with it into a
  // ~700pt red box — the form looked broken at the exact moment the user was
  // correcting an error.
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  grow: { flex: 1 },
  unit: { width: 150 },
});
