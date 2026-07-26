import {
  actionLabel,
  formatArea,
  formatDateTime,
  formatINR,
  humanEntity,
  propertyValue,
  splitShares,
  totalLoans,
} from '@pattadar/core';

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : formatDateTime(d);
}

/** Web parity: greet with a first name, never a raw email-local-part id. */
function firstName(name: string | undefined): string {
  return (name || '').split(/[@\s.]/)[0];
}
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Banner,
  Button,
  Card,
  Divider,
  Text,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDashboard } from '@/data/hooks';
import { tokens } from '@pattadar/tokens';

function StatTile({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <Card mode="outlined" style={styles.tile}>
      <Card.Content style={styles.tileContent}>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {label}
        </Text>
        <Text variant="titleMedium" numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </Card.Content>
    </Card>
  );
}

export default function DashboardScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const { data: result, isLoading, isRefetching } = useDashboard();

  if (isLoading || !result) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  const d = result.data;
  const statusGood = (theme.dark ? tokens.status.dark : tokens.status.light).good;
  // Hero value model (web parity): farm side is the SERVER's AP-IGRS guideline
  // estimate, property side is client-side propertyValue().
  const farmTotal = d.stats.estimatedValue ?? 0;
  const propTotal = d.properties.reduce((s, p) => s + propertyValue(p), 0);
  const total = farmTotal + propTotal;
  const loans = totalLoans(d.parcels);
  const { farmPct, propPct } = splitShares(farmTotal, propTotal);
  const isEmpty =
    !result.isSample &&
    d.stats.totalParcels === 0 &&
    d.stats.totalPassbooks === 0 &&
    d.stats.totalDocuments === 0 &&
    d.properties.length === 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => qc.invalidateQueries({ queryKey: ['pattadar', 'dashboard'] })}
          />
        }
      >
        {result.isSample && (
          <Banner visible icon="database-outline" style={styles.banner}>
            Showing sample data — the API is unreachable.
          </Banner>
        )}

        <Text variant="headlineSmall" style={styles.greeting}>
          Namaste{firstName(d.me?.name) ? `, ${firstName(d.me?.name)}` : ''}
        </Text>

        {isEmpty && (
          <Card mode="contained" style={styles.hero}>
            <Card.Content style={styles.getStarted}>
              <Text variant="titleMedium" style={styles.getStartedTitle}>
                🌾 Start your land record
              </Text>
              <Text variant="bodyMedium">
                Photograph your pattadar passbook — AI extraction reads it and
                creates your khata and parcels automatically. Or enter them by
                hand.
              </Text>
              <View style={styles.getStartedButtons}>
                <Button
                  mode="contained"
                  icon="camera-plus-outline"
                  onPress={() => router.push('/add-khata')}
                >
                  Scan passbook
                </Button>
                <Button mode="outlined" onPress={() => router.push('/add-khata')}>
                  Enter manually
                </Button>
              </View>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                You can also upload documents at pattadar.com — everything shows
                up here.
              </Text>
            </Card.Content>
          </Card>
        )}

        {!isEmpty && (
        <Card mode="contained" style={styles.hero}>
          <Card.Content>
            <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
              Portfolio value · guideline basis
            </Text>
            <Text variant="displaySmall" style={styles.heroValue}>
              {formatINR(total)}
            </Text>
            {total > 0 && (
              <View style={styles.splitBar}>
                <View
                  style={[
                    styles.splitSeg,
                    { flexGrow: Math.max(farmPct, 2), backgroundColor: theme.colors.primary },
                  ]}
                />
                <View
                  style={[
                    styles.splitSeg,
                    { flexGrow: Math.max(propPct, 2), backgroundColor: theme.colors.secondary },
                  ]}
                />
              </View>
            )}
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Farmland {farmPct}% · Properties {propPct}%
            </Text>
            {loans > 0 && total > 0 && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Net of {formatINR(loans)} loans: {formatINR(total - loans)}
              </Text>
            )}
          </Card.Content>
        </Card>
        )}

        {!isEmpty && (
        <View style={styles.grid}>
          <StatTile label="Total extent" value={formatArea(d.stats.totalExtent)} />
          <StatTile label="Passbooks" value={String(d.stats.totalPassbooks)} />
          <StatTile label="Parcels" value={String(d.stats.totalParcels)} />
          <StatTile label="Documents" value={String(d.stats.totalDocuments)} />
          <StatTile label="Family groups" value={String(d.stats.totalGroups)} />
          <StatTile label="Beneficiaries" value={String(d.stats.totalBeneficiaries)} />
        </View>
        )}

        <Card mode="outlined" style={styles.activity}>
          <Card.Content>
            <Text variant="titleSmall">Recent activity</Text>
            {d.recent.length === 0 && (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Nothing yet.
              </Text>
            )}
            {d.recent.slice(0, 6).map((e, i) => {
              const label = actionLabel(e.action);
              const rawEntity = humanEntity(e.target, e.details);
              // Some audit rows repeat the action as their detail
              // ("Uploaded a document · Uploaded a document") — drop the echo.
              const entity =
                rawEntity.toLowerCase() === label.toLowerCase() ? '' : rawEntity;
              const dotColor = /delete|remove/.test(e.action)
                ? theme.colors.error
                : /create|add|upload/.test(e.action)
                  ? statusGood
                  : theme.colors.primary;
              return (
                <View key={e.id}>
                  {i > 0 && <Divider />}
                  <View style={styles.activityRow}>
                    <View style={[styles.activityDot, { backgroundColor: dotColor }]} />
                    <View style={styles.activityBody}>
                      <Text variant="bodyMedium">
                        <Text variant="bodyMedium" style={styles.activityAction}>
                          {label}
                        </Text>
                        {entity ? ` · ${entity}` : ''}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {(e.actor || '').split('@')[0] || '—'} · {formatTimestamp(e.timestamp)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: tokens.spacing.lg, gap: tokens.spacing.md },
  banner: { borderRadius: tokens.radii.md },
  greeting: { fontWeight: '700' },
  hero: { borderRadius: tokens.radii.lg },
  heroValue: { fontWeight: '700', marginVertical: tokens.spacing.xs },
  splitBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: tokens.radii.pill,
    overflow: 'hidden',
    marginVertical: tokens.spacing.sm,
    gap: 2,
  },
  splitSeg: { flexBasis: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  tile: { flexBasis: '48%', flexGrow: 1 },
  tileContent: { gap: tokens.spacing.xxs },
  activity: { marginBottom: tokens.spacing.xl },
  activityRow: {
    paddingVertical: tokens.spacing.sm,
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  activityDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  activityBody: { flex: 1, gap: 2 },
  activityAction: { fontWeight: '600' },
  getStarted: { gap: tokens.spacing.sm },
  getStartedTitle: { fontWeight: '700' },
  getStartedButtons: { flexDirection: 'row', gap: tokens.spacing.sm, flexWrap: 'wrap' },
});
