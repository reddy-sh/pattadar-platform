import { barFraction, canonicalizeVillages, formatExtent } from '@pattadar/core';

import { summarizePassbooks } from '@/lib/passbooks';
import type { ExtentPref, Passbook } from '@pattadar/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutAnimation, Linking, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import {
  Banner,
  Button,
  Card,
  Chip,
  Dialog,
  Divider,
  FAB,
  Icon,
  IconButton,
  Menu,
  Portal,
  Searchbar,
  Text,
  useTheme,
} from 'react-native-paper';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddRow } from '@/components/AddRow';
import { EmptyState } from '@/components/EmptyState';
import { ErrorRetry } from '@/components/ErrorRetry';
import { useListBottomInset } from '@/components/ListScaffold';
import { AppHeader } from '@/components/AppHeader';
import { StickyTitleBar } from '@/components/StickyTitleBar';

/** Animated.SectionList drops its generics; keep them. */
const AnimatedSectionList = Animated.createAnimatedComponent(SectionList) as unknown as typeof SectionList;
import { OfflineBanner } from '@/components/OfflineBanner';
import { useHoldingActions, useIdentity, usePassbooks } from '@/data/hooks';
import { useUnitPref } from '@/lib/units';
import { tokens } from '@pattadar/tokens';

type SortKey = 'khata' | 'extent' | 'village' | 'parcels' | 'owner';
/** CL-178: chip shows key AND direction; menu shows the long form. */
const SORTS: { key: SortKey; label: string; short: string }[] = [
  { key: 'khata', label: 'Khata no. (ascending)', short: 'Khata ↑' },
  { key: 'extent', label: 'Extent (largest first)', short: 'Extent ↓' },
  { key: 'village', label: 'Village (A–Z)', short: 'Village ↑' },
  { key: 'parcels', label: 'Parcel count (most first)', short: 'Parcels ↓' },
  { key: 'owner', label: 'Owner (A–Z)', short: 'Owner ↑' },
];

/** CL-38: lightweight skeletons while the list loads. */
function SkeletonCard() {
  const theme = useTheme();
  return (
    <Card mode="outlined" style={styles.card}>
      <Card.Content style={styles.cardContent}>
        <View style={[styles.skelLine, { backgroundColor: theme.colors.surfaceVariant, width: '45%' }]} />
        <View style={[styles.skelLine, { backgroundColor: theme.colors.surfaceVariant, width: '70%' }]} />
        <View style={[styles.skelLine, { backgroundColor: theme.colors.surfaceVariant, width: '55%' }]} />
      </Card.Content>
    </Card>
  );
}

function PassbookCard({
  pb,
  parcelCount,
  cost,
  groupName,
  showGroup,
  maxExtent,
  unitPref,
  locality,
  onDelete,
}: {
  pb: Passbook;
  parcelCount: number;
  cost: number;
  groupName: string;
  showGroup: boolean;
  maxExtent: number;
  unitPref: ExtentPref;
  locality: string;
  onDelete: (pb: Passbook, parcelCount: number) => void;
}) {
  const theme = useTheme();
  const [menu, setMenu] = useState(false);
  const extent = Number(pb.totalExtent) || 0;
  return (
    <Card
      mode="outlined"
      style={styles.card}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/holdings', params: { pb: pb.id } })}
    >
      <Card.Content style={styles.cardContent}>
        <View style={styles.titleRow}>
          {/* CL-29: vector icon, not emoji */}
          <IconButton icon="notebook-outline" size={18} style={styles.leadIcon} iconColor={theme.colors.primary} />
          {/* The village shared this line with the khata number and the extent,
              and lost — collapsing to "Katr…" and "Kat…" at two different
              widths. It has its own row now, with room for the whole address. */}
          <Text variant="titleSmall" style={[styles.title, styles.bold]} numberOfLines={1}>
            Khata {pb.pattadarNo || '—'}
          </Text>
          {/* CL-260: extent right of the title, fixed column */}
          <Text
            variant="titleSmall"
            numberOfLines={1}
            style={[styles.bold, styles.tabular, styles.extentCol, { color: theme.colors.onSurface }]}
          >
            {extent > 0 ? formatExtent(extent, unitPref) : '—'}
          </Text>
          <Menu
            visible={menu}
            onDismiss={() => setMenu(false)}
            anchor={
              <IconButton
                icon="dots-vertical"
                size={18}
                style={styles.tight}
                accessibilityLabel="Passbook actions"
                onPress={() => setMenu(true)}
              />
            }
          >
            <Menu.Item
              leadingIcon="map-marker-plus-outline"
              title="Add parcel"
              onPress={() => {
                setMenu(false);
                router.push({ pathname: '/add-parcel', params: { passbookId: pb.id } });
              }}
            />
            {/* CL-147: the ambiguous pin icon became a labeled action */}
            <Menu.Item
              leadingIcon="map-outline"
              title={`Open ${pb.village || 'village'} in Maps`}
              onPress={() => {
                setMenu(false);
                const q = [pb.village, pb.mandal, pb.district, pb.state].filter(Boolean).join(', ');
                if (q) Linking.openURL(`http://maps.apple.com/?q=${encodeURIComponent(q)}`).catch(() => undefined);
              }}
            />
            {/* CL-258: labeled, since the relation type isn't in the data yet */}
            {!!pb.fatherHusbandName && (
              <Menu.Item
                leadingIcon="account-child-outline"
                title={`Father/Guardian: ${pb.fatherHusbandName}`}
                disabled
              />
            )}
            {cost > 0 && (
              <Menu.Item
                leadingIcon="currency-inr"
                title={`Acquisition cost ₹${Math.round(cost).toLocaleString('en-IN')}`}
                disabled
              />
            )}
            {/* CL-146: group association lives here now, not as a chip */}
            {!!groupName && (
              <Menu.Item
                leadingIcon="account-group-outline"
                title={`Group: ${groupName}`}
                onPress={() => {
                  setMenu(false);
                  router.push('/family' as never);
                }}
              />
            )}
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
        {/* CL-260: the CL-230 two-line spec — count · owner, nothing else.
            Mandal/district dropped (constant across the dataset, CL-259);
            father/guardian and cost live in the ⋮ menu, labeled (CL-258). */}
        <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurface }}>
          {parcelCount} parcel{parcelCount === 1 ? '' : 's'}
          {pb.ownerName ? `  ·  ${pb.ownerName}` : ''}
          {showGroup && groupName ? `  ·  ${groupName}` : ''}
        </Text>
        {!!locality && (
          <View style={styles.addressRow}>
            <Icon source="map-marker-outline" size={13} color={theme.colors.onSurfaceVariant} />
            <Text
              variant="bodySmall"
              numberOfLines={2}
              style={[styles.grow, { color: theme.colors.onSurfaceVariant }]}
            >
              {locality}
            </Text>
          </View>
        )}
        {/* CL-139/140: magnitude bar — capped at 70% so nothing reads "full",
            floored so tiny holdings stay visible, inset from the card edge. */}
        {maxExtent > 0 && extent > 0 && (
          <View
            accessibilityLabel={`${formatExtent(extent, unitPref)} — ${Math.round((extent / maxExtent) * 100)} percent of the largest khata shown`}
            style={[styles.extentTrack, { backgroundColor: theme.colors.surfaceVariant }]}
          >
            <View
              style={[
                styles.extentFill,
                { backgroundColor: theme.colors.primary, width: `${barFraction(extent, maxExtent) * 100}%` },
              ]}
            />
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

export default function PassbooksScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const identity = useIdentity();
  const unitPref = useUnitPref();
  const bottomInset = useListBottomInset();
  const { data: result, isLoading, isRefetching, refetch } = usePassbooks();
  const { deletePassbook } = useHoldingActions();
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  // CL-141/142: multi-select village filter + owner/group dimensions.
  const [villageFilter, setVillageFilter] = useState<string[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<string[]>([]);
  const [grpFilter, setGrpFilter] = useState<string[]>([]);
  const [filterMenu, setFilterMenu] = useState(false);
  // CL-559: khata is the shared default across Passbooks and Properties — one
  // holding belongs to one khata, so that is the organising fact for both. Any
  // other arrangement on screen is a preference the user chose and we stored.
  const [sort, setSort] = useState<SortKey>('khata');
  const [sortMenu, setSortMenu] = useState(false);
  const [barsHintSeen, setBarsHintSeen] = useState(true);
  useEffect(() => {
    SecureStore.getItemAsync('pattadar_bars_hint_seen')
      .then((v) => setBarsHintSeen(!!v))
      .catch(() => undefined);
  }, []);
  const [confirm, setConfirm] = useState<{ pb: Passbook; parcels: number } | null>(null);
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  // CL-30: persist sort selection.
  useEffect(() => {
    SecureStore.getItemAsync('pattadar_pb_sort').then((v) => v && setSort(v as SortKey));
  }, []);
  const changeSort = (k: SortKey) => {
    setSort(k);
    setSortMenu(false);
    SecureStore.setItemAsync('pattadar_pb_sort', k).catch(() => undefined);
  };

  const d = result?.data;
  const groupName = useMemo(() => new Map((d?.groups ?? []).map((g) => [g.id, g.name])), [d]);
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

  // CL-136: filter on CANONICAL villages so "Katraguntla" never becomes a
  // second filterable locality that silently hides khatas.
  const canon = useMemo(
    () =>
      canonicalizeVillages([
        ...(d?.passbooks ?? []).map((pb) => pb.village || ''),
        ...(d?.passbooks ?? []).map((pb) => pb.mandal || ''),
        ...(d?.passbooks ?? []).map((pb) => pb.district || ''),
      ]),
    [d],
  );
  const cv = useCallback((s: string | undefined) => (s ? (canon.get(s) ?? s) : ''), [canon]);
  const villages = useMemo(
    () => [...new Set((d?.passbooks ?? []).map((pb) => cv(pb.village)).filter(Boolean))],
    [d, cv],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = (d?.passbooks ?? []).filter(
      (pb) =>
        (villageFilter.length === 0 || villageFilter.includes(cv(pb.village))) &&
        (ownerFilter.length === 0 || ownerFilter.includes(pb.ownerName || '')) &&
        (grpFilter.length === 0 || grpFilter.includes(pb.groupId || '')) &&
        (!q ||
          [pb.ownerName, pb.fatherHusbandName, pb.pattadarNo, pb.village, pb.mandal, pb.district, pb.state,
            (pb.groupId && groupName.get(pb.groupId)) || '']
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
    const count = (pb: Passbook) => agg.get(pb.id)?.count ?? 0;
    switch (sort) {
      case 'extent':
        list = [...list].sort((a, b) => (Number(b.totalExtent) || 0) - (Number(a.totalExtent) || 0));
        break;
      case 'village':
        list = [...list].sort((a, b) => (a.village || '').localeCompare(b.village || ''));
        break;
      case 'parcels':
        list = [...list].sort((a, b) => count(b) - count(a));
        break;
      case 'owner':
        list = [...list].sort((a, b) => (a.ownerName || '').localeCompare(b.ownerName || ''));
        break;
      default:
        list = [...list].sort((a, b) => (a.pattadarNo || '').localeCompare(b.pattadarNo || '', undefined, { numeric: true }));
    }
    return list;
  }, [d, search, villageFilter, ownerFilter, grpFilter, sort, agg, groupName, cv]);
  const filterCount = villageFilter.length + ownerFilter.length + grpFilter.length;
  // CL-261: village sort gets sticky village group headers.
  const sections = useMemo(() => {
    if (sort !== 'village') return [{ title: '', data: rows }];
    const by = new Map<string, typeof rows>();
    for (const pb of rows) {
      const v = cv(pb.village) || '—';
      by.set(v, [...(by.get(v) ?? []), pb]);
    }
    return [...by.entries()].map(([title, data]) => ({ title, data }));
  }, [rows, sort, cv]);

  // CL-27: hide the group chip when it's identical across all visible rows.
  const distinctGroups = new Set(rows.map((pb) => (pb.groupId && groupName.get(pb.groupId)) || ''));
  const showGroup = distinctGroups.size > 1;
  const maxExtent = Math.max(0, ...rows.map((pb) => Number(pb.totalExtent) || 0));
  // CL-176: tested summary arithmetic.
  const summary = summarizePassbooks(rows, agg);
  const hiddenCount = (d?.passbooks?.length ?? 0) - rows.length;
  // CL-538/539: the collection is empty — not merely filtered to nothing.
  const noData = !isLoading && (d?.passbooks?.length ?? 0) === 0;


  // A row created on the next screen should slide in when we come back, not
  // blink into existence. Length-keyed so it fires on insert, not on filtering.
  const prevCount = useRef(rows.length);
  useEffect(() => {
    if (rows.length > prevCount.current) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    prevCount.current = rows.length;
  }, [rows.length]);

  // The pinned bar needs the offset; nothing else does, so it stays on the UI
  // thread and never re-renders the list.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <StickyTitleBar
        title="Passbooks"
        subtitle={`${summary.passbooks} passbook${summary.passbooks === 1 ? '' : 's'} · ${summary.parcels} parcel${summary.parcels === 1 ? '' : 's'}`}
        scrollY={scrollY}
        onSearch={() => setShowSearch((v) => !v)}
        menuItems={[
          { icon: 'book-plus-outline', label: 'Add passbook', onPress: () => router.push('/add-khata') },
          { icon: 'map-marker-plus-outline', label: 'Add parcel', onPress: () => router.push('/add-parcel') },
        ]}
      />
      <AnimatedSectionList
        onScroll={onScroll}
        scrollEventThrottle={16}
        sections={isLoading ? [] : sections}
        keyExtractor={(pb) => pb.id}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text
              variant="labelMedium"
              style={[styles.sectionHead, { backgroundColor: theme.colors.background, color: theme.colors.onSurface }]}
            >
              {section.title}
            </Text>
          ) : null
        }
        contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => qc.invalidateQueries({ queryKey: ['pattadar', 'passbooks'] })}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <AppHeader
              title="Passbooks"
              onSearch={() => setShowSearch((s) => !s)}
              menuItems={[
                { icon: 'book-plus-outline', label: 'Add passbook', onPress: () => router.push('/add-khata') },
                { icon: 'map-marker-plus-outline', label: 'Add parcel', onPress: () => router.push('/add-parcel') },
              ]}
            />
            {result?.isSample && (
              <OfflineBanner visible onRetry={() => qc.invalidateQueries({ queryKey: ['pattadar', 'passbooks'] })} />
            )}
            {showSearch && (
              <Searchbar
                placeholder="Search khata no, owner, village…"
                value={search}
                onChangeText={setSearch}
                autoFocus
                style={styles.search}
              />
            )}
            {/* CL-538: filters, sort and the count organise nothing when there is
                nothing to organise. Keyed on the collection being empty, NOT on
                the filtered result — filtering to zero must keep the controls
                that got you there, or the state is unescapable. */}
            {!noData && (
              <>
            {/* CL-169/170: village chips scroll; Filters + Sort are FIXED and never
                clip. "All villages" is the only reset (Clear was redundant). */}
            <View style={styles.filterRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScrollBox}
                contentContainerStyle={styles.chipScroll}
              >
                <Chip
                  compact
                  selected={villageFilter.length === 0}
                  mode={villageFilter.length === 0 ? 'flat' : 'outlined'}
                  style={villageFilter.length === 0 ? { backgroundColor: theme.colors.primaryContainer } : undefined}
                  textStyle={[
                    styles.chipText,
                    villageFilter.length === 0 && { color: theme.colors.onPrimaryContainer },
                  ]}
                  onPress={() => setVillageFilter([])}
                >
                  All villages
                </Chip>
                {villages.map((v) => {
                  const on = villageFilter.includes(v);
                  return (
                    <Chip
                      key={v}
                      compact
                      selected={on}
                      mode={on ? 'flat' : 'outlined'}
                      /* CL-171: selected = the app accent, not stock-MD3 purple */
                      style={on ? { backgroundColor: theme.colors.primaryContainer } : undefined}
                      textStyle={[styles.chipText, on && { color: theme.colors.onPrimaryContainer }]}
                      onPress={() => setVillageFilter((f) => (on ? f.filter((x) => x !== v) : [...f, v]))}
                    >
                      {v}
                    </Chip>
                  );
                })}
              </ScrollView>
              {/* CL-142: owner + group dimensions */}
              <Menu
                visible={filterMenu}
                onDismiss={() => setFilterMenu(false)}
                anchor={
                  <View>
                    <IconButton
                      icon="filter-variant"
                      size={20}
                      style={styles.tight}
                      containerColor={filterCount > 0 ? theme.colors.primaryContainer : undefined}
                      iconColor={filterCount > 0 ? theme.colors.onPrimaryContainer : undefined}
                      accessibilityLabel={`Filters${filterCount > 0 ? ` — ${filterCount} active` : ''}`}
                      onPress={() => setFilterMenu(true)}
                    />
                    {filterCount > 0 && (
                      <View style={[styles.filterBadge, { backgroundColor: theme.colors.primary }]}>
                        <Text style={[styles.filterBadgeText, { color: theme.colors.onPrimary }]}>{filterCount}</Text>
                      </View>
                    )}
                  </View>
                }
              >
                {[...new Set((d?.groups ?? []).map((g) => g.id))].map((gid) => {
                  const nm = groupName.get(gid) ?? gid;
                  const on = grpFilter.includes(gid);
                  return (
                    <Menu.Item
                      key={gid}
                      leadingIcon="account-group-outline"
                      title={`Group: ${nm}`}
                      trailingIcon={on ? 'check' : undefined}
                      onPress={() => setGrpFilter((f) => (on ? f.filter((x) => x !== gid) : [...f, gid]))}
                    />
                  );
                })}
                <Divider />
                {[...new Set((d?.passbooks ?? []).map((pb) => pb.ownerName).filter(Boolean))].map((o) => {
                  const on = ownerFilter.includes(o);
                  return (
                    <Menu.Item
                      key={o}
                      leadingIcon="account-outline"
                      title={o}
                      trailingIcon={on ? 'check' : undefined}
                      onPress={() => setOwnerFilter((f) => (on ? f.filter((x) => x !== o) : [...f, o]))}
                    />
                  );
                })}
                {filterCount > 0 && (
                  <>
                    <Divider />
                    <Menu.Item
                      leadingIcon="filter-remove-outline"
                      title="Reset all filters"
                      onPress={() => {
                        setVillageFilter([]);
                        setOwnerFilter([]);
                        setGrpFilter([]);
                        setFilterMenu(false);
                      }}
                    />
                  </>
                )}
              </Menu>
              <Menu
                visible={sortMenu}
                onDismiss={() => setSortMenu(false)}
                anchor={
                  <Chip
                    compact
                    mode="outlined"
                    textStyle={styles.chipText}
                    accessibilityLabel={`Sort passbooks — currently ${SORTS.find((s) => s.key === sort)?.label}`}
                    onPress={() => setSortMenu(true)}
                  >
                    {SORTS.find((s) => s.key === sort)?.short ?? 'Sort'}
                  </Chip>
                }
              >
                {SORTS.map((s) => (
                  <Menu.Item
                    key={s.key}
                    title={s.label}
                    trailingIcon={sort === s.key ? 'check' : undefined}
                    onPress={() => changeSort(s.key)}
                  />
                ))}
              </Menu>
            </View>
            {/* CL-144/176: summary from the tested helper, filter state explicit */}
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {filterCount > 0
                ? `Filtered: ${summary.passbooks} of ${d?.passbooks?.length ?? 0} passbooks`
                : `${summary.passbooks} passbook${summary.passbooks === 1 ? '' : 's'}`}
              {` · ${summary.parcels} parcel${summary.parcels === 1 ? '' : 's'} · ${formatExtent(summary.extent, unitPref)}`}
            </Text>
              </>
            )}
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
              showGroup={showGroup}
              maxExtent={maxExtent}
              unitPref={unitPref}
              locality={[cv(pb.village), cv(pb.mandal), cv(pb.district)].filter(Boolean).join(', ')}
              onDelete={(target, parcels) => setConfirm({ pb: target, parcels })}
            />
          );
        }}
        ListFooterComponent={
          <>
          {/* Creation lives where the content ends — never on an empty list,
              which has its own call to action. */}
          {!noData && <AddRow label="Add passbook" onPress={() => router.push('/add-khata')} />}
          {/* CL-177: the void under a filter says why, and undoes itself */}
          {filterCount > 0 && hiddenCount > 0 ? (
            <View style={styles.footerHint}>
              <Chip
                compact
                mode="outlined"
                icon="filter-remove-outline"
                textStyle={styles.chipText}
                onPress={() => {
                  setVillageFilter([]);
                  setOwnerFilter([]);
                  setGrpFilter([]);
                }}
              >
                {hiddenCount} passbook{hiddenCount === 1 ? '' : 's'} hidden by filter — show all
              </Chip>
            </View>
          ) : null}
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.gap}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : result?.isSample ? (
            <ErrorRetry onRetry={() => refetch()} />
          ) : (
            <EmptyState
              icon="book-outline"
              title="No passbooks yet"
              body="Photograph your pattadar passbook and the khata number, village and parcels are read from it. You can also type them in."
              primary={{ label: 'Scan passbook', icon: 'camera-plus-outline', onPress: () => router.push('/add-khata') }}
              secondary={{ label: 'Enter manually', icon: 'pencil-outline', onPress: () => router.push('/add-khata') }}
            />
          )
        }
      />
      {focused && !!identity && (
        <Portal>
          <Dialog visible={confirm !== null} onDismiss={() => setConfirm(null)}>
            <Dialog.Title>Delete Khata {confirm?.pb.pattadarNo || '—'}?</Dialog.Title>
            <Dialog.Content>
              <Text variant="bodyMedium">
                Deletes the passbook AND its {confirm?.parcels ?? 0} parcel
                {confirm?.parcels === 1 ? '' : 's'}, plus their document records.
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
                    // The mutation invalidates every cache itself — this screen
                    // used to refresh only its own, leaving Home and Properties
                    // showing land that had just been deleted.
                    await deletePassbook.mutateAsync(confirm.pb.id).catch(() => undefined);
                  }
                  setConfirm(null);
                }}
              >
                Delete
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { gap: tokens.spacing.sm, paddingBottom: tokens.spacing.xs },
  search: { borderRadius: tokens.radii.md },
  // CL-169: chips scroll inside a flexed box; trailing controls never clip.
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs },
  chipScrollBox: { flex: 1 },
  filterBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: { fontSize: 9, fontWeight: '700' },
  grow: { flex: 1 },
  // CL-23: clear the FAB (56) + margin + tab bar.
  list: { padding: tokens.spacing.lg, gap: tokens.spacing.sm },
  card: { borderRadius: tokens.radii.lg },
  // CL-26: tight density
  cardContent: { gap: 2, paddingVertical: tokens.spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  leadIcon: { margin: 0, marginLeft: -8 },
  tight: { margin: 0 },
  title: { flex: 1, flexShrink: 1 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  bold: { fontWeight: '700' },
  chipText: { fontSize: 11 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 },
  tabular: { fontVariant: ['tabular-nums'] },
  chipScroll: { flexDirection: 'row', gap: tokens.spacing.xs, alignItems: 'center', paddingRight: tokens.spacing.sm },
  sectionHead: { paddingVertical: tokens.spacing.xs, fontWeight: '700' },
  // CL-234/260: fixed so every extent right-edge aligns.
  // The number is the point of the row. A fixed width made it BOTH too narrow
  // for "3 Acres 20 Cents" and unable to borrow the whitespace sitting to its
  // left, so it ellipsised while the row was half empty. It now sizes to its
  // content and never gives ground; the label shrinks instead.
  extentCol: { minWidth: 96, textAlign: 'right', flexShrink: 0, flexGrow: 0 },
  // CL-265: clearly inset from the card edge — data, not a border.
  extentTrack: {
    height: 3,
    borderRadius: 2,
    marginTop: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
    marginHorizontal: tokens.spacing.xs,
    overflow: 'hidden',
  },
  extentFill: { height: 3, borderRadius: 2 },
  skelLine: { height: 12, borderRadius: 6, marginVertical: 4 },
  gap: { gap: tokens.spacing.sm },
  emptyBox: { marginTop: tokens.spacing.xxl, alignItems: 'center', gap: tokens.spacing.md },
  footerHint: { alignItems: 'center', paddingTop: tokens.spacing.md },
  fab: { paddingBottom: 80 },
});
