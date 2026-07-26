import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
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

import { useCreateFlows, useHoldings } from '@/data/hooks';
import { toAcres, unitKey } from '@pattadar/core';
import { tokens } from '@pattadar/tokens';

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
  const params = useLocalSearchParams<{ passbookId?: string }>();
  const { data: holdings } = useHoldings();
  const { createParcel, setParcelPrice } = useCreateFlows();

  const passbooks = holdings?.data.passbooks ?? [];
  const [passbookId, setPassbookId] = useState(params.passbookId ?? '');
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
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="New parcel" />
      </Appbar.Header>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Menu
          visible={pbMenu}
          onDismiss={() => setPbMenu(false)}
          anchor={
            <TextInput
              label="Khata (passbook) *"
              value={selectedPb ? `${selectedPb.pattadarNo} (${selectedPb.village})` : ''}
              mode="outlined"
              editable={false}
              error={tried && !passbookId}
              right={<TextInput.Icon icon="menu-down" onPress={() => setPbMenu(true)} />}
              onPressIn={() => setPbMenu(true)}
            />
          }
        >
          {passbooks.map((p) => (
            <Menu.Item
              key={p.id}
              title={`${p.pattadarNo} (${p.village})`}
              onPress={() => {
                setPassbookId(p.id);
                setPbMenu(false);
              }}
            />
          ))}
          {passbooks.length === 0 && <Menu.Item title="No khata yet — add one first" disabled />}
        </Menu>

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
          <Menu
            visible={unitMenu}
            onDismiss={() => setUnitMenu(false)}
            anchor={
              <TextInput
                label="Unit"
                value={UNITS.find((u) => u.key === unit)?.label ?? unit}
                mode="outlined"
                editable={false}
                style={styles.unit}
                right={<TextInput.Icon icon="menu-down" onPress={() => setUnitMenu(true)} />}
                onPressIn={() => setUnitMenu(true)}
              />
            }
          >
            {UNITS.map((u) => (
              <Menu.Item
                key={u.key}
                title={u.label}
                onPress={() => {
                  setUnit(u.key);
                  setUnitMenu(false);
                }}
              />
            ))}
          </Menu>
        </View>

        <SegmentedButtons
          value={classification}
          onValueChange={setClassification}
          buttons={[
            { value: 'agri', label: 'Agricultural' },
            { value: 'non-agri', label: 'Non-agricultural' },
          ]}
        />

        <Menu
          visible={srcMenu}
          onDismiss={() => setSrcMenu(false)}
          anchor={
            <TextInput
              label="Acquisition source"
              value={acquisitionSource.replace(/^\w/, (c) => c.toUpperCase())}
              mode="outlined"
              editable={false}
              right={<TextInput.Icon icon="menu-down" onPress={() => setSrcMenu(true)} />}
              onPressIn={() => setSrcMenu(true)}
            />
          }
        >
          {SOURCES.map((s) => (
            <Menu.Item
              key={s}
              title={s.replace(/^\w/, (c) => c.toUpperCase())}
              onPress={() => {
                setAcquisitionSource(s);
                setSrcMenu(false);
              }}
            />
          ))}
        </Menu>

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
            Khata, survey number and a positive extent are required.
          </HelperText>
        )}
        {!!saveError && (
          <HelperText type="error" visible>
            {saveError}
          </HelperText>
        )}
        <Button mode="contained" onPress={save} loading={saving} disabled={saving}>
          Save parcel
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: tokens.spacing.lg, gap: tokens.spacing.md, paddingBottom: tokens.spacing.xxl },
  row: { flexDirection: 'row', gap: tokens.spacing.sm },
  grow: { flex: 1 },
  unit: { width: 150 },
});
