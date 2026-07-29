import { router } from 'expo-router';
import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Appbar, Button, HelperText, Menu, TextInput, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { uploadToDrive } from '@/api/storage';
import { useCreateFlows, useDocumentActions } from '@/data/hooks';
import { InlinePicker } from '@/components/InlinePicker';
import { ScanFirstCard, type ScannedFile } from '@/components/ScanFirstCard';
import { parseAreaSqYd } from '@pattadar/core';
import { RequireSignIn } from '@/components/RequireSignIn';
import { saveLocalCopy } from '@/lib/localFiles';
import { useIdentity } from '@/data/hooks';

const TYPES = [
  ['open_plot', 'Open Plot / Site'],
  ['flat', 'Flat / Apartment'],
  ['independent_house', 'Independent House'],
  ['villa', 'Villa'],
  ['commercial', 'Commercial Building'],
  ['rental', 'Rental Building'],
  ['other', 'Other'],
] as const;

/** Minimal add-property (site/plot) — web parity fields land later. */
export default function AddPropertyScreen() {
  const theme = useTheme();
  const identity = useIdentity();
  const { createProperty } = useCreateFlows();
  const { fileDocument, linkRegisteredToProperty } = useDocumentActions();
  // The hand-entry form starts folded; the scan card opens it on demand
  // and opens it automatically when a read succeeds or fails.
  const [manualOpen, setManualOpen] = useState(false);
  /**
   * The deed this property was read from, kept so it can be FILED with the
   * property. Without this the scan produced a record and threw the evidence
   * away — the holding then said "No documents attached yet" about the very
   * document that created it, and its AI summary was unreachable.
   */
  const [scanned, setScanned] = useState<{ file: ScannedFile; fields: Record<string, unknown> } | null>(null);
  const [filing, setFiling] = useState('');
  const [type, setType] = useState('open_plot');
  const [label, setLabel] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [landArea, setLandArea] = useState('');
  const [price, setPrice] = useState('');
  const [menu, setMenu] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  /** Set once the property exists, so Save cannot run twice. */
  const [savedId, setSavedId] = useState('');

  const save = async () => {
    if (savedId) {
      router.back();
      return;
    }
    setTried(true);
    setError('');
    if (!label.trim()) return;
    setSaving(true);
    try {
      const r = await createProperty.mutateAsync({
        type,
        label: label.trim(),
        city: city.trim(),
        district: district.trim(),
        landArea: Number(landArea) || 0,
        purchasePrice: Number(price) || 0,
      });
      const propertyId = r.createProperty?.id;
      if (!propertyId) throw new Error('Could not create the property');
      // File the deed WITH the property, so the paper, what was read from it,
      // and the record all stay together. Best-effort on purpose: the property
      // is already saved, and losing the attachment must not undo that or turn
      // a successful save into an error. Say what happened instead.
      if (scanned) {
        setFiling('Filing the deed…');
        try {
          let fileRef = '';
          try {
            const node = await uploadToDrive(scanned.file.uri, scanned.file.name, scanned.file.mime);
            fileRef = node.id;
          } catch {
            // A record without its bytes still carries the summary and fields.
          }
          const filed = await fileDocument.mutateAsync({ ...scanned.fields, _fileRef: fileRef });
          const docId = filed.createRegisteredDocument?.id;
          if (docId) {
            await linkRegisteredToProperty.mutateAsync({ id: docId, propertyId });
            await saveLocalCopy(docId, scanned.file.uri, scanned.file.name).catch(() => undefined);
          }
        } catch (e) {
          // Navigating away here would carry the message off the screen with
          // it. The property IS saved, so the screen becomes a report of what
          // happened rather than a form — `savedId` stops a second Save
          // creating a duplicate.
          setSavedId(propertyId);
          setFiling('');
          setSaving(false);
          setError(
            e instanceof Error
              ? `The property was saved, but its deed could not be filed: ${e.message} You can attach it from the property’s Documents section.`
              : 'The property was saved, but its deed could not be filed. You can attach it from the property’s Documents section.',
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
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="New property" />
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
          title="Read it from the sale deed"
          body="Photograph or upload the deed — the type, locality, area and price are read from it and filled in below for you to check."
          onFields={(f, file) => {
            setScanned({ file, fields: f });
            const num = (v: unknown) => String(v ?? '').replace(/[^\d.]/g, '');
            const cl = String(f.classification ?? '').toLowerCase();
            setType(
              cl.includes('flat') || cl.includes('apartment')
                ? 'flat'
                : cl.includes('house') || cl.includes('residen')
                  ? 'house'
                  : cl.includes('commerc') || cl.includes('shop')
                    ? 'commercial'
                    : 'open_plot',
            );
            const plot = String(f.plot_no ?? '').trim();
            const village = String(f.village ?? '').trim();
            setLabel([plot ? `Plot ${plot}` : '', village].filter(Boolean).join(' · ') || village);
            setCity(String(f.mandal ?? '') || village);
            setDistrict(String(f.district ?? ''));
            // Deed extents are written in square yards, which is the unit this
            // form already uses — no conversion, unlike the parcel path.
            // "418-1/2 sq. yards" is 418.5, not 41812 — see parseAreaSqYd.
            const area = parseAreaSqYd(f.extent);
            setLandArea(area ? String(area) : '');
            setPrice(num(f.consideration));
          }}
        />
        {/* The form is the fallback, so it stays folded away until it is
            either asked for or needed — the scan opens on an uncluttered
            screen, and a failed read opens this automatically. */}
        {manualOpen && (
        <>
        <InlinePicker
          label="Type"
          value={type}
          open={menu}
          onToggle={() => setMenu((o) => !o)}
          onPick={(v) => {
            setType(v);
            setMenu(false);
          }}
          options={TYPES.map(([k, l]) => ({ value: k, label: l }))}
        />
        <TextInput label="Name / label *" value={label} onChangeText={setLabel} error={tried && !label.trim()} mode="outlined" />
        <TextInput label="City" value={city} onChangeText={setCity} mode="outlined" />
        <TextInput label="District" value={district} onChangeText={setDistrict} mode="outlined" />
        <TextInput label="Land area (Sq.yd)" value={landArea} onChangeText={setLandArea} keyboardType="decimal-pad" mode="outlined" />
        <TextInput label="Purchase price ₹" value={price} onChangeText={setPrice} keyboardType="number-pad" mode="outlined" />
        {!!error && <HelperText type="error" visible>{error}</HelperText>}
        <Button mode="contained" onPress={save} loading={saving} disabled={saving}>
          {savedId ? 'Done' : filing || 'Save property'}
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
  grow: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: 16, gap: 12, paddingBottom: 32 },
});
