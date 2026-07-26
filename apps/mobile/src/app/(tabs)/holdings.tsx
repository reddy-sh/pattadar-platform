import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Banner,
  Button,
  Card,
  Chip,
  Dialog,
  Divider,
  FAB,
  IconButton,
  Menu,
  Portal,
  Searchbar,
  SegmentedButtons,
  Text,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHoldingActions, useHoldings, type HoldingsData } from '@/data/hooks';
import { holdingStatusLabel, normalizeHoldings, type Holding } from '@/data/holdings';
import { formatArea } from '@pattadar/core';
import { tokens } from '@pattadar/tokens';

function money(v: number): string {
  return v > 0 ? `₹${Math.round(v).toLocaleString('en-IN')}` : '—';
}

/** What the confirm dialog must delete, with honest consequence copy. */
export interface DeleteTarget {
  kind: 'parcel' | 'property' | 'passbook';
  id: string;
  label: string;
  detail: string;
}

function HoldingCard({
  h,
  onDelete,
  onStake,
}: {
  h: Holding;
  onDelete: (t: DeleteTarget) => void;
  onStake: (kind: 'parcel' | 'property', id: string, stake: string) => void;
}) {
  const theme = useTheme();
  const [menu, setMenu] = useState(false);
  const openDetail = () =>
    router.push({ pathname: '/holding/[id]', params: { id: h.id, kind: h.kind } });
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
    <Card mode="outlined" style={styles.card} onPress={openDetail}>
      <Card.Content style={styles.cardContent}>
        <View style={styles.titleRow}>
          <Text variant="titleMedium" style={styles.title} numberOfLines={1}>
            {h.isAgri ? '🌾 ' : '🏢 '}
            {h.title}
          </Text>
          <Chip compact mode="flat" textStyle={styles.chipText}>
            {h.typeLabel}
          </Chip>
          <Menu
            visible={menu}
            onDismiss={() => setMenu(false)}
            anchor={<IconButton icon="dots-vertical" size={18} onPress={() => setMenu(true)} />}
          >
            {(['owned', 'managed', 'watch'] as const)
              .filter((s) => s !== h.stake)
              .map((s) => (
                <Menu.Item
                  key={s}
                  leadingIcon={s === 'owned' ? 'check-circle-outline' : s === 'managed' ? 'briefcase-outline' : 'eye-outline'}
                  title={`Mark as ${s}`}
                  onPress={() => {
                    setMenu(false);
                    onStake(h.kind, h.id, s);
                  }}
                />
              ))}
            <Divider />
            <Menu.Item
              leadingIcon="delete-outline"
              title={h.kind === 'parcel' ? 'Delete parcel…' : 'Delete property…'}
              onPress={() => {
                setMenu(false);
                onDelete({
                  kind: h.kind,
                  id: h.id,
                  label: h.title,
                  detail:
                    h.kind === 'parcel'
                      ? 'Removes the parcel and its document records. Files already uploaded stay in My Drive on the web until deleted there.'
                      : 'Removes the property and its document records. Files already uploaded stay in My Drive on the web until deleted there.',
                });
              }}
            />
          </Menu>
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
  const { deleteParcel, deletePassbook, deleteProperty, setStake } = useHoldingActions();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [fabOpen, setFabOpen] = useState(false);
  const [confirm, setConfirm] = useState<DeleteTarget | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const deleting = deleteParcel.isPending || deletePassbook.isPending || deleteProperty.isPending;

  const runDelete = async () => {
    if (!confirm) return;
    setDeleteError('');
    try {
      if (confirm.kind === 'parcel') await deleteParcel.mutateAsync(confirm.id);
      else if (confirm.kind === 'property') await deleteProperty.mutateAsync(confirm.id);
      else await deletePassbook.mutateAsync(confirm.id);
      setConfirm(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed');
    }
  };
  // Portal renders at the app root, so the FAB must hide when this tab loses
  // focus — otherwise it floats over every other screen.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

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
          Land & Properties
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
          renderItem={({ item }) => (
            <HoldingCard
              h={item}
              onDelete={setConfirm}
              onStake={(k, id, stake) => setStake.mutate({ kind: k, id, stake })}
            />
          )}
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
                  Tap + below to scan your pattadar passbook or add a khata and
                  parcels by hand — AI extraction reads the photo and fills
                  everything in.
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
      {focused && (
      <Portal>
        <Dialog visible={confirm !== null} onDismiss={() => !deleting && setConfirm(null)}>
          <Dialog.Title>Delete {confirm?.label}?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{confirm?.detail}</Text>
            {!!deleteError && (
              <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                {deleteError}
              </Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button disabled={deleting} onPress={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              textColor={theme.colors.error}
              loading={deleting}
              disabled={deleting}
              onPress={runDelete}
            >
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
        <FAB.Group
          open={fabOpen}
          visible
          icon={fabOpen ? 'close' : 'plus'}
          style={[styles.fab, { pointerEvents: 'box-none' }]}
          onStateChange={({ open }) => setFabOpen(open)}
          actions={[
            {
              icon: 'map-marker-plus-outline',
              label: 'New parcel',
              onPress: () => router.push('/add-parcel'),
            },
          ]}
        />
      </Portal>
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
  fab: { paddingBottom: 80 },
});
