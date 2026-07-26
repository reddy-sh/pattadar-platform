import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Card, Chip, Divider, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDashboard } from '@/data/hooks';
import { assetGainPct, formatArea, formatINR, parseISOToDisplay } from '@pattadar/core';
import { tokens } from '@pattadar/tokens';

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  if (!value || value === '—') return null;
  return (
    <View style={styles.row}>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card mode="outlined" style={styles.section}>
      <Card.Content style={styles.sectionContent}>
        <Text variant="titleSmall">{title}</Text>
        {children}
      </Card.Content>
    </Card>
  );
}

const money = (v?: number | null) => (v && v > 0 ? formatINR(v) : '');
const date = (v?: string | null) => (v ? parseISOToDisplay(v) : '');

/** Detail view for a parcel or property — data comes from the dashboard cache. */
export default function HoldingDetailScreen() {
  const theme = useTheme();
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const { data: result, isLoading } = useDashboard();

  const parcel =
    kind !== 'property' ? result?.data.parcels.find((p) => p.id === id) : undefined;
  const property =
    kind === 'property' ? result?.data.properties.find((p) => p.id === id) : undefined;
  const passbook = parcel
    ? result?.data.passbooks.find((pb) => pb.id === parcel.passbookId)
    : undefined;

  const title = parcel
    ? `Sy ${parcel.surveyNo}${parcel.subdivision ? `/${parcel.subdivision}` : ''}`
    : property?.label || 'Holding';

  const value = parcel
    ? Number(parcel.marketValue) || Number(parcel.guidelineValue) || 0
    : Number(property?.currentValue) || 0;
  const purchase = Number(parcel?.purchasePrice ?? property?.purchasePrice) || 0;
  const gain = assetGainPct(value, purchase);

  const hasValueData = value > 0 || purchase > 0 || Number(parcel?.loanAmount) > 0;
  const hasRegData = Boolean(
    parcel?.regDocNo ||
      parcel?.sro ||
      parcel?.regDate ||
      (parcel?.ecStatus ?? property?.ecStatus) ||
      (parcel?.taxPaidUpto ?? property?.taxPaidUpto),
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={title} />
      </Appbar.Header>
      {isLoading || (!parcel && !property) ? (
        <View style={styles.center}>
          {isLoading ? (
            <ActivityIndicator />
          ) : (
            <Text variant="bodyMedium">This holding is no longer available.</Text>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.chips}>
            <Chip compact mode="flat" textStyle={styles.chipText}>
              {parcel ? (parcel.classification === 'agri' ? 'Agricultural' : 'Non-agricultural') : property?.type ?? ''}
            </Chip>
            <Chip compact mode="outlined" textStyle={styles.chipText}>
              {(parcel?.status || property?.holdingStatus || 'owned').replace(/-/g, ' ')}
            </Chip>
            {(parcel?.litigation || property?.litigation) && (
              <Chip compact mode="outlined" textStyle={[styles.chipText, { color: theme.colors.error }]}>
                Litigation
              </Chip>
            )}
          </View>

          <Section title="Holding">
            <Row label="Owner" value={parcel?.currentOwner || property?.currentOwner || ''} />
            <Row
              label="Location"
              value={
                parcel
                  ? [passbook?.village, passbook?.mandal, passbook?.district].filter(Boolean).join(', ')
                  : [property?.city, property?.district].filter(Boolean).join(', ')
              }
            />
            <Row label="Khata" value={passbook?.pattadarNo || ''} />
            <Row
              label="Extent"
              value={
                parcel
                  ? formatArea(Number(parcel.extent) || 0)
                  : property?.landArea
                    ? `${property.landArea} ${property.landUnit}`
                    : property?.builtupArea
                      ? `${property.builtupArea} ${property.builtupUnit}`
                      : ''
              }
            />
            <Row label="Reference" value={parcel?.ref || ''} />
          </Section>

          {hasValueData && (
          <Section title="Value">
            <Row label="Market value" value={money(parcel?.marketValue ?? property?.marketValue)} />
            <Row label="Guideline value" value={money(parcel?.guidelineValue ?? property?.guidelineValue)} />
            <Row label="Current value" value={money(property?.currentValue)} />
            <Row label="Purchase price" value={money(purchase)} />
            <Row label="Purchased on" value={date(parcel?.purchaseDate)} />
            {gain !== null && <Row label="Gain since purchase" value={`${gain > 0 ? '+' : ''}${gain}%`} />}
            <Row label="Loan outstanding" value={money(parcel?.loanAmount)} />
          </Section>
          )}

          {hasRegData && (
          <Section title="Registration & compliance">
            <Row label="Reg. doc no" value={parcel?.regDocNo || ''} />
            <Row label="SRO" value={parcel?.sro || ''} />
            <Row label="Reg. date" value={date(parcel?.regDate)} />
            <Row label="EC status" value={parcel?.ecStatus ?? property?.ecStatus ?? ''} />
            <Row label="EC date" value={date(parcel?.ecDate ?? property?.ecDate)} />
            <Row label="Tax paid up to" value={date(parcel?.taxPaidUpto ?? property?.taxPaidUpto)} />
          </Section>
          )}

          <Divider />
          <Text variant="bodySmall" style={[styles.footer, { color: theme.colors.onSurfaceVariant }]}>
            Added {date(parcel?.createdAt ?? property?.createdAt)} · manage documents and
            more details on pattadar.com
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: tokens.spacing.lg, gap: tokens.spacing.md, paddingBottom: tokens.spacing.xxl },
  chips: { flexDirection: 'row', gap: tokens.spacing.xs, flexWrap: 'wrap' },
  chipText: { fontSize: 11, textTransform: 'capitalize' },
  section: { borderRadius: tokens.radii.lg },
  sectionContent: { gap: tokens.spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: tokens.spacing.md },
  rowValue: { fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  footer: { textAlign: 'center' },
});
