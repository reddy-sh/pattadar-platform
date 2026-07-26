import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Banner,
  Card,
  Chip,
  Searchbar,
  SegmentedButtons,
  Text,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHoldings } from '@/data/hooks';
import { holdingStatusLabel, normalizeHoldings, type Holding } from '@/data/holdings';
import { tokens } from '@pattadar/tokens';

function money(v: number): string {
  return v > 0 ? `₹${Math.round(v).toLocaleString('en-IN')}` : '—';
}

function HoldingCard({ h }: { h: Holding }) {
  const theme = useTheme();
  // Web-parity semantics: litigation and 'disputed' are danger, 'sold' is
  // muted, 'for-sale' is an active-listing accent, owned/unknown is calm.
  const statusColor =
    h.litigation || h.status === 'disputed'
      ? theme.colors.error
      : h.status === 'sold'
        ? theme.colors.onSurfaceVariant
        : h.status === 'for-sale'
          ? theme.colors.tertiary
          : theme.colors.primary;
  return (
    <Card mode="outlined" style={styles.card}>
      <Card.Content style={styles.cardContent}>
        <View style={styles.titleRow}>
          <Text variant="titleMedium" style={styles.title} numberOfLines={1}>
            {h.isAgri ? '🌾 ' : '🏢 '}
            {h.title}
          </Text>
          <Chip compact mode="flat" textStyle={styles.chipText}>
            {h.typeLabel}
          </Chip>
        </View>
        <Text variant="bodyMedium" numberOfLines={1}>
          {h.owner}
        </Text>
        <Text
          variant="bodySmall"
          numberOfLines={1}
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {h.location}
          {h.khata && h.khata !== '—' ? ` · Khata ${h.khata}` : ''}
          {h.groupName ? ` · 👪 ${h.groupName}` : ''}
        </Text>
        <View style={styles.footer}>
          <Text variant="titleSmall">{h.extentLabel}</Text>
          <Text variant="titleSmall">{money(h.value)}</Text>
        </View>
        <View style={styles.pillRow}>
          <Chip compact mode="outlined" textStyle={[styles.chipText, { color: statusColor }]}>
            {holdingStatusLabel(h)}
          </Chip>
          {h.stake !== 'owned' && (
            <Chip compact mode="outlined" textStyle={styles.chipText}>
              {h.stake === 'managed' ? 'Managed' : 'Watch'}
            </Chip>
          )}
        </View>
      </Card.Content>
    </Card>
  );
}

export default function HoldingsScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const { data: result, isLoading, isRefetching } = useHoldings();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');

  const allRows = useMemo(() => (result ? normalizeHoldings(result.data) : []), [result]);
  const holdings = useMemo(() => {
    let rows = allRows;
    if (kind !== 'all') rows = rows.filter((h) => h.kind === kind);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((h) =>
        [h.title, h.owner, h.location, h.groupName, h.typeLabel, h.khata, h.status]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    }
    return rows;
  }, [allRows, kind, search]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.heading}>
          Holdings
        </Text>
        <Searchbar
          placeholder="Search survey no, owner, village…"
          value={search}
          onChangeText={setSearch}
          style={styles.search}
        />
        <SegmentedButtons
          value={kind}
          onValueChange={setKind}
          density="small"
          buttons={[
            { value: 'all', label: 'All' },
            { value: 'parcel', label: 'Land' },
            { value: 'property', label: 'Properties' },
          ]}
        />
      </View>
      {result?.isSample && (
        <Banner visible icon="database-outline">
          Showing sample data — the API is unreachable.
        </Banner>
      )}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={holdings}
          keyExtractor={(h) => `${h.kind}:${h.id}`}
          renderItem={({ item }) => <HoldingCard h={item} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => qc.invalidateQueries({ queryKey: ['pattadar', 'holdings'] })}
            />
          }
          ListEmptyComponent={
            allRows.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text variant="titleMedium" style={styles.emptyTitle}>
                  🌾 No holdings yet
                </Text>
                <Text variant="bodyMedium" style={styles.emptyBody}>
                  Upload your pattadar passbook or a registered deed at
                  pattadar.com — AI extraction creates your parcels and khata
                  automatically, and they appear here. Scanning with your phone
                  camera is coming to this app soon.
                </Text>
              </View>
            ) : (
              <Text variant="bodyMedium" style={styles.empty}>
                No holdings match your search or filter.
              </Text>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { padding: tokens.spacing.lg, gap: tokens.spacing.sm },
  heading: { fontWeight: '700' },
  search: { borderRadius: tokens.radii.md },
  list: { paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.xl, gap: tokens.spacing.sm },
  card: { borderRadius: tokens.radii.lg },
  cardContent: { gap: tokens.spacing.xxs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  title: { flex: 1, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: tokens.spacing.xs,
  },
  pillRow: { flexDirection: 'row', gap: tokens.spacing.xs, marginTop: tokens.spacing.xs },
  chipText: { fontSize: 11, textTransform: 'capitalize' },
  empty: { textAlign: 'center', marginTop: tokens.spacing.xxl },
  emptyBox: {
    marginTop: tokens.spacing.xxl,
    paddingHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.sm,
    alignItems: 'center',
  },
  emptyTitle: { fontWeight: '700' },
  emptyBody: { textAlign: 'center' },
});
