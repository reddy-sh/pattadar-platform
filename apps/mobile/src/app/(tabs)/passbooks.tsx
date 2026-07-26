import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Banner,
  Button,
  Card,
  Dialog,
  Divider,
  FAB,
  IconButton,
  Menu,
  Portal,
  Searchbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHoldingActions, usePassbooks } from '@/data/hooks';
import { formatArea } from '@pattadar/core';
import type { Passbook } from '@pattadar/core';
import { AppHeader } from '@/components/AppHeader';
import { tokens } from '@pattadar/tokens';

/** Web PassbooksPage, native dress: stat tiles, search, khata cards. */

function money(v: number): string {
  return v > 0 ? `₹${Math.round(v).toLocaleString('en-IN')}` : '—';
}

function PassbookCard({
  pb,
  parcelCount,
  cost,
  groupName,
  onDelete,
}: {
  pb: Passbook;
  parcelCount: number;
  cost: number;
  groupName: string;
  onDelete: (pb: Passbook, parcelCount: number) => void;
}) {
  const theme = useTheme();
  const [menu, setMenu] = useState(false);
  return (
    <Card
      mode="outlined"
      style={styles.card}
      onPress={() => router.push({ pathname: '/holdings', params: { pb: pb.id } })}
    >
      <Card.Content style={styles.cardContent}>
        <View style={styles.titleRow}>
          <Text variant="titleMedium" style={styles.title} numberOfLines={1}>
            📒 Khata {pb.pattadarNo || '—'}
          </Text>
          <Menu
            visible={menu}
            onDismiss={() => setMenu(false)}
            anchor={<IconButton icon="dots-vertical" size={18} onPress={() => setMenu(true)} />}
          >
            <Menu.Item
              leadingIcon="map-marker-plus-outline"
              title="Add parcel"
              onPress={() => {
                setMenu(false);
                router.push({ pathname: '/add-parcel', params: { passbookId: pb.id } });
              }}
            />
            <Divider />
            <Menu.Item
              leadingIcon="delete-outline"
              title="Delete passbook…"
              onPress={() => {
                setMenu(false);
                onDelete(pb, parcelCount);
              }}
            />
          </Menu>
        </View>
        <Text variant="bodyMedium" numberOfLines={1}>
          {pb.ownerName || '—'}
          {pb.fatherHusbandName ? ` · ${pb.fatherHusbandName}` : ''}
        </Text>
        <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
          {[pb.village, pb.mandal, pb.district].filter(Boolean).join(', ') || '—'}
          {groupName ? ` · 👪 ${groupName}` : ''}
        </Text>
        <View style={styles.footer}>
          <Text variant="titleSmall">
            {parcelCount} parcel{parcelCount === 1 ? '' : 's'} ·{' '}
            {Number(pb.totalExtent) > 0 ? formatArea(Number(pb.totalExtent)) : '—'}
          </Text>
          <Text variant="titleSmall">{money(cost)}</Text>
        </View>
      </Card.Content>
    </Card>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <Card mode="outlined" style={styles.tile}>
      <Card.Content style={styles.tileContent}>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {label}
        </Text>
        <Text variant="titleSmall" numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </Card.Content>
    </Card>
  );
}

export default function PassbooksScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const { data: result, isLoading, isRefetching } = usePassbooks();
  const { deletePassbook } = useHoldingActions();
  const [search, setSearch] = useState('');
  const [fabOpen, setFabOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ pb: Passbook; parcels: number } | null>(null);
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const d = result?.data;
  const groupName = useMemo(() => new Map((d?.groups ?? []).map((g) => [g.id, g.name])), [d]);
  // Web parity: per-khata count + acquisition cost from the parcels list.
  const agg = useMemo(() => {
    const m = new Map<string, { count: number; cost: number }>();
    for (const p of d?.parcels ?? []) {
      const a = m.get(p.passbookId) ?? { count: 0, cost: 0 };
      a.count += 1;
      a.cost += Number(p.purchasePrice) || 0;
      m.set(p.passbookId, a);
    }
    return m;
  }, [d]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (d?.passbooks ?? []).filter(
      (pb) =>
        !q ||
        [
          pb.ownerName,
          pb.fatherHusbandName,
          pb.pattadarNo,
          pb.village,
          pb.mandal,
          pb.district,
          pb.state,
          (pb.groupId && groupName.get(pb.groupId)) || '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(q),
    );
  }, [d, search, groupName]);

  const totalExtent = (d?.passbooks ?? []).reduce((s, pb) => s + (Number(pb.totalExtent) || 0), 0);
  const villages = new Set((d?.passbooks ?? []).map((pb) => pb.village).filter(Boolean)).size;
  const totalCost = [...agg.values()].reduce((s, a) => s + a.cost, 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={rows}
        keyExtractor={(pb) => pb.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => qc.invalidateQueries({ queryKey: ['pattadar', 'passbooks'] })}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <AppHeader title="Passbooks" />
            {result?.isSample && (
              <Banner visible icon="database-outline">
                Showing sample data — the API is unreachable.
              </Banner>
            )}
            <View style={styles.tiles}>
              <StatTile label="Passbooks" value={String(d?.passbooks.length ?? 0)} />
              <StatTile label="Total extent" value={totalExtent > 0 ? formatArea(totalExtent) : '—'} />
              <StatTile label="Villages" value={String(villages)} />
              <StatTile label="Acquisition cost" value={money(totalCost)} />
            </View>
            <Searchbar
              placeholder="Search khata no, owner, village…"
              value={search}
              onChangeText={setSearch}
              style={styles.search}
            />
          </View>
        }
        renderItem={({ item: pb }) => {
          const a = agg.get(pb.id) ?? { count: 0, cost: 0 };
          return (
            <PassbookCard
              pb={pb}
              parcelCount={a.count}
              cost={a.cost}
              groupName={(pb.groupId && groupName.get(pb.groupId)) || ''}
              onDelete={(target, parcels) => setConfirm({ pb: target, parcels })}
            />
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text variant="titleMedium" style={styles.heading}>
                📒 No passbooks yet
              </Text>
              <Text variant="bodyMedium" style={styles.emptyBody}>
                Tap + to scan your pattadar passbook or add one by hand.
              </Text>
            </View>
          )
        }
      />
      {focused && (
        <Portal>
          <Dialog visible={confirm !== null} onDismiss={() => setConfirm(null)}>
            <Dialog.Title>Delete Khata {confirm?.pb.pattadarNo || '—'}?</Dialog.Title>
            <Dialog.Content>
              <Text variant="bodyMedium">
                Deletes the passbook AND its {confirm?.parcels ?? 0} parcel
                {confirm?.parcels === 1 ? '' : 's'}, plus their document records.
                Files already uploaded stay in My Drive on the web until deleted
                there.
              </Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setConfirm(null)}>Cancel</Button>
              <Button
                textColor={theme.colors.error}
                loading={deletePassbook.isPending}
                disabled={deletePassbook.isPending}
                onPress={async () => {
                  if (confirm) {
                    await deletePassbook.mutateAsync(confirm.pb.id).catch(() => undefined);
                    qc.invalidateQueries({ queryKey: ['pattadar', 'passbooks'] });
                  }
                  setConfirm(null);
                }}
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
                icon: 'camera-plus-outline',
                label: 'Scan passbook',
                onPress: () => router.push('/add-khata'),
              },
              {
                icon: 'book-plus-outline',
                label: 'New passbook',
                onPress: () => router.push('/add-khata'),
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
  center: { paddingTop: tokens.spacing.xxl, alignItems: 'center' },
  header: { paddingBottom: tokens.spacing.sm, gap: tokens.spacing.sm },
  heading: { fontWeight: '700' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.xs },
  tile: { flexBasis: '48%', flexGrow: 1 },
  tileContent: { gap: 2, paddingVertical: tokens.spacing.sm },
  search: { borderRadius: tokens.radii.md },
  list: { padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xxl, gap: tokens.spacing.sm },
  card: { borderRadius: tokens.radii.lg },
  cardContent: { gap: tokens.spacing.xxs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  title: { flex: 1, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: tokens.spacing.xs },
  emptyBox: { marginTop: tokens.spacing.xxl, alignItems: 'center', gap: tokens.spacing.sm },
  emptyBody: { textAlign: 'center' },
  fab: { paddingBottom: 80 },
});
