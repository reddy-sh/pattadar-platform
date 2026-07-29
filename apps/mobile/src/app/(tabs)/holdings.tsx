import { canonicalizeVillages, formatExtent, formatNumberIN, naturalCompare } from '@pattadar/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, LayoutAnimation, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import {
  Banner,
  Button,
  Chip,
  Dialog,
  Divider,
  Icon,
  IconButton,
  List,
  Menu,
  Portal,
  Searchbar,
  SegmentedButtons,
  Text,
  useTheme,
} from 'react-native-paper';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddRow } from '@/components/AddRow';
import { EmptyState } from '@/components/EmptyState';
import { ErrorRetry } from '@/components/ErrorRetry';
import { usePhotoFile } from '@/lib/photoFile';
import { useListBottomInset } from '@/components/ListScaffold';
import { AppHeader } from '@/components/AppHeader';
import { StickyTitleBar } from '@/components/StickyTitleBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { holdingStatusLabel, normalizeHoldings, type Holding } from '@/data/holdings';
import { headerSubtitle, villageLabel } from '@/lib/groupHeader';
import { useHoldingActions, useHoldings, useIdentity, usePhotos } from '@/data/hooks';
import { useUnitPref } from '@/lib/units';
import { tokens } from '@pattadar/tokens';

type GroupKey = 'khata' | 'village' | 'owner' | 'none';
/** CL-381: the entity is a passbook; "khata" is the number printed on it. */
const GROUP_LABEL: Record<GroupKey, string> = {
  khata: 'Passbook',
  village: 'Village',
  owner: 'Owner',
  none: 'None',
};
type SortKey = 'survey' | 'extent' | 'recent' | 'village';

export interface DeleteTarget {
  kind: 'parcel' | 'property' | 'passbook';
  id: string;
  label: string;
  detail: string;
}

interface Section {
  key: string;
  title: string;
  villageTag: string;
  subtitle: string;
  rows: Holding[];
  extent: number;
}

/** CL-40/52: compact parcel row — survey + badges + tabular extent only. */
function HoldingRow({
  h,
  unitPref,
  onDelete,
  onStake,
  coverRef,
}: {
  h: Holding;
  unitPref: ReturnType<typeof useUnitPref>;
  onDelete: (t: DeleteTarget) => void;
  onStake: (kind: 'parcel' | 'property', id: string, stake: string) => void;
  coverRef?: string;
}) {
  const theme = useTheme();
  const coverUri = usePhotoFile(coverRef);
  // A cached file can be missing or unreadable (the app container path rotates
  // on reinstall). <Image> renders an EMPTY BOX in that case, which silently
  // replaces the land icon with nothing — so fall back to the icon instead.
  const [coverBroken, setCoverBroken] = useState(false);
  const showCover = !!coverUri && !coverBroken;
  const [menu, setMenu] = useState(false);
  const status = holdingStatusLabel(h);
  // CL-181: "Owned" is the default on every row — say nothing; badge only for
  // the exceptional states, which also removes the CL-180 ragged column.
  const showStatus = status.toLowerCase() !== 'owned';
  const statusColor =
    h.litigation || h.status === 'disputed' ? theme.colors.error : theme.colors.onSurfaceVariant;
  const extentText = h.kind === 'parcel' ? formatExtent(h.extentAcres, unitPref) : h.extentLabel;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${h.title}, ${extentText}${showStatus ? `, ${status}` : ''}`}
      onPress={() => router.push({ pathname: '/holding/[id]', params: { id: h.id, kind: h.kind } })}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.colors.surfaceVariant }]}
    >
      {/* CL-575: ONE leading slot, same size and same x for every row. A cover
          image and a Paper List.Icon have different footprints and different
          margins, so letting each row pick its own made neighbouring rows
          disagree on where the title starts and how tall the row is. */}
      {/* The slot is ALWAYS a filled 40pt tile. A photo fills it edge to edge
          while a bare glyph floated in the middle of an invisible box, so the
          left edge of the list zigzagged between rows that had a picture and
          rows that did not — the same complaint as CL-575, one layer down. */}
      {/* The slot always occupies its 40pt so every title starts at the same x,
          but it DRAWS nothing when there is no photo. Twenty-one identical grey
          placeholders down a list of twenty-two is a column of noise carrying no
          information; absence says "no photo" just as well. */}
      <View
        style={[
          styles.leading,
          showCover && {
            borderColor: theme.colors.outlineVariant,
            borderWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        {showCover && (
          <Image
            source={{ uri: coverUri }}
            style={styles.leadingFill}
            resizeMode="cover"
            onError={() => setCoverBroken(true)}
          />
        )}
      </View>
      <Text variant="bodyMedium" style={[styles.bold, styles.rowTitle]} numberOfLines={1}>
        {h.title}
      </Text>
      {/* CL-182: rare states render as low-emphasis text, not a filled chip */}
      {showStatus && (
        <Text variant="labelSmall" style={{ color: statusColor }}>
          {status}
        </Text>
      )}
      {/* CL-180/196: fixed-width right-aligned neutral extent column */}
      <Text
        variant="bodyMedium"
        numberOfLines={1}
        style={[styles.bold, styles.tabular, styles.extentCol, { color: theme.colors.onSurface }]}
      >
        {extentText}
      </Text>
      <Menu
        visible={menu}
        onDismiss={() => setMenu(false)}
        anchor={
          <IconButton
            icon="dots-vertical"
            size={20}
            style={styles.tight}
            accessibilityLabel={`Actions for ${h.title}`}
            onPress={() => setMenu(true)}
          />
        }
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
              detail: 'Removes it and its document records. Files stay in My Drive on the web until deleted there.',
            });
          }}
        />
      </Menu>
    </Pressable>
  );
}

export default function HoldingsScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const identity = useIdentity();
  const unitPref = useUnitPref();
  const bottomInset = useListBottomInset();
  const { data: result, isLoading, isRefetching, refetch } = useHoldings();
  // CL-569: one lookup for every row's cover — fetched once for the whole list
  // rather than a request per visible row.
  const { data: photosResult } = usePhotos();
  /**
   * The thumbnail for each parcel: its chosen cover when there is one, and
   * otherwise its most recent photo — the row's job here is to show that this
   * parcel HAS pictures, which an icon cannot convey. Photos arrive newest
   * first, so the first sighting of a parcel is already its latest.
   */
  const coverByParcel = useMemo(() => {
    const m = new Map<string, string>();
    for (const ph of photosResult?.data ?? []) {
      if (ph.isCover) m.set(ph.parcelId, ph.fileRef);
      else if (!m.has(ph.parcelId)) m.set(ph.parcelId, ph.fileRef);
    }
    return m;
  }, [photosResult]);
  const { deleteParcel, deletePassbook, deleteProperty, setStake } = useHoldingActions();
  const { pb, q } = useLocalSearchParams<{ pb?: string; q?: string }>();

  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [kind, setKind] = useState('all');
  // CL-559: khata, matching the Passbooks default. See the note there.
  const [groupBy, setGroupBy] = useState<GroupKey>('khata');
  const [sortBy, setSortBy] = useState<SortKey>('survey');
  const [optMenu, setOptMenu] = useState(false);
  const [sortMenu, setSortMenu] = useState(false);
  const [mapMode, setMapMode] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [pbFilter, setPbFilter] = useState('');
  const [confirm, setConfirm] = useState<DeleteTarget | null>(null);
  const deleting = deleteParcel.isPending || deletePassbook.isPending || deleteProperty.isPending;
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    if (pb) {
      setPbFilter(pb);
      setKind('parcel');
    }
  }, [pb]);
  useEffect(() => {
    if (q) {
      setSearch(q);
      setShowSearch(true);
    }
  }, [q]);
  // CL-40: persist grouping + collapse state.
  useEffect(() => {
    SecureStore.getItemAsync('pattadar_lp_prefs')
      .then((v) => {
        if (!v) return;
        const p = JSON.parse(v);
        if (p.groupBy) setGroupBy(p.groupBy);
        if (p.sortBy) setSortBy(p.sortBy);
        if (p.collapsed) setCollapsed(p.collapsed);
      })
      .catch(() => undefined);
  }, []);
  const persist = (next: { groupBy?: GroupKey; sortBy?: SortKey; collapsed?: Record<string, boolean> }) => {
    SecureStore.setItemAsync(
      'pattadar_lp_prefs',
      JSON.stringify({ groupBy, sortBy, collapsed, ...next }),
    ).catch(() => undefined);
  };

  const allRows = useMemo(() => (result ? normalizeHoldings(result.data) : []), [result]);
  /**
   * CL-583: the segment counts must respect the OTHER active filters.
   *
   * They were computed from every row the account owns, so with a khata filter
   * on, "All (2) / Farmland (2)" described a set the user was not looking at.
   * The `kind` filter is deliberately excluded — each segment reports its own
   * share, which is the question the control answers.
   */
  const countable = useMemo(() => {
    let rows = allRows;
    if (pbFilter) rows = rows.filter((h) => h.passbookId === pbFilter);
    const s = search.trim().toLowerCase();
    if (s) {
      rows = rows.filter((h) =>
        [h.title, h.owner, h.location, h.groupName, h.typeLabel, h.khata, h.status].join(' ').toLowerCase().includes(s),
      );
    }
    return rows;
  }, [allRows, pbFilter, search]);
  const counts = useMemo(
    () => ({
      all: countable.length,
      parcel: countable.filter((h) => h.kind === 'parcel').length,
      property: countable.filter((h) => h.kind === 'property').length,
    }),
    [countable],
  );

  const filtered = useMemo(() => {
    // Same set the counts describe, plus the segment the user has chosen.
    const rows = kind === 'all' ? countable : countable.filter((h) => h.kind === kind);
    switch (sortBy) {
      case 'extent':
        return [...rows].sort((a, b) => b.extentAcres - a.extentAcres);
      case 'recent':
        return [...rows].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      case 'village':
        // CL-232: village promoted to the title deserves its own sort.
        return [...rows].sort((a, b) => (a.location || '').localeCompare(b.location || ''));
      default:
        return [...rows].sort((a, b) => naturalCompare(a.title.replace(/^Sy /, ''), b.title.replace(/^Sy /, '')));
    }
  }, [countable, kind, sortBy]);

  // CL-186: canonical village spellings for headers and grouping keys.
  const villageCanon = useMemo(
    () => canonicalizeVillages(allRows.map((h) => h.location.split(',')[0]?.trim() || '')),
    [allRows],
  );
  const sections: Section[] = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', title: '', villageTag: '', subtitle: '', rows: filtered, extent: 0 }];
    }
    const villageOf = (h: Holding) => {
      const v = h.location.split(',')[0]?.trim() || '';
      return (v && villageCanon.get(v)) || v || '—';
    };
    const keyOf = (h: Holding) =>
      groupBy === 'khata'
        ? h.khata && h.khata !== '—'
          ? `Khata ${h.khata}`
          : h.kind === 'property'
            ? 'Plots & sites'
            : 'No passbook'
        : groupBy === 'village'
          ? villageOf(h)
          : h.owner || '—';
    const map = new Map<string, Holding[]>();
    for (const h of filtered) {
      const k = keyOf(h);
      map.set(k, [...(map.get(k) ?? []), h]);
    }
    return [...map.entries()].map(([key, rows]) => {
      const extent = rows.reduce((s, h) => s + h.extentAcres, 0);
      const first = rows[0];
      // CL-230/233: title = Khata · dominant-village (+N); subtitle = count · owner.
      const villageTag =
        groupBy === 'khata' ? villageLabel(rows.map((h) => ({ village: villageOf(h), owner: h.owner }))) : '';
      const subtitle = headerSubtitle(rows.length, groupBy === 'khata' ? first.owner : '');
      return { key, title: key, villageTag, subtitle, rows, extent };
    });
  }, [filtered, groupBy, villageCanon]);

  const sumExtent = filtered.reduce((s, h) => s + h.extentAcres, 0);
  // CL-183/184: precise vocabulary — parcels vs properties — and the plot's
  // sq.yd is stated, never silently folded into acres.
  // CL-538/539: nothing to organise, and nothing for the FAB to add to.
  const noData = !isLoading && allRows.length === 0;
  /**
   * CL-613/616: the SEGMENT can be empty while the account is not — "Plots (0)"
   * beside "Farmland (12)". The controls and the FAB were keyed on the account
   * being empty, so grouping, sort, a map toggle and a floating + all rendered
   * over "No plots yet". Keyed on what is actually on screen instead.
   *
   * The segmented control itself deliberately stays: it is the way back.
   */
  const segmentEmpty = !isLoading && filtered.length === 0;
  const nParcels = filtered.filter((h) => h.kind === 'parcel').length;
  const nProps = filtered.filter((h) => h.kind === 'property').length;
  const sumSqyd = filtered
    .filter((h) => h.kind === 'property')
    .reduce((s, h) => s + (Number(h.extentLabel.replace(/[^\d.]/g, '')) || 0), 0);
  const allCollapsed = sections.length > 0 && sections.every((s) => collapsed[s.key]);
  const setAll = (value: boolean) => {
    const next: Record<string, boolean> = { ...collapsed };
    for (const s of sections) next[s.key] = value;
    setCollapsed(next);
    persist({ collapsed: next });
  };
  const geoRows = useMemo(
    () =>
      filtered
        .map((h) => {
          const raw = (h.geoPoint ?? '').replace(/[\[\]\s]/g, '');
          const [lat, lng] = raw.split(',').map(Number);
          return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
            ? { h, latitude: lat, longitude: lng }
            : null;
        })
        .filter((x): x is { h: Holding; latitude: number; longitude: number } => x !== null),
    [filtered],
  );

  const toggleSection = (key: string) => {
    const next = { ...collapsed, [key]: !collapsed[key] };
    setCollapsed(next);
    persist({ collapsed: next });
  };


  // A row created on the next screen should slide in when we come back, not
  // blink into existence. Length-keyed so it fires on insert, not on filtering.
  const prevCount = useRef(filtered.length);
  useEffect(() => {
    if (filtered.length > prevCount.current) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    prevCount.current = filtered.length;
  }, [filtered.length]);

  // The pinned bar needs the offset; nothing else does, so it stays on the UI
  // thread and never re-renders the list.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <StickyTitleBar
        title="Land & Properties"
        subtitle={`${counts.all} ${counts.all === 1 ? 'property' : 'properties'}`}
        scrollY={scrollY}
        onSearch={() => setShowSearch((v) => !v)}
        menuItems={[
          { icon: 'map-marker-plus-outline', label: 'Add parcel (farmland)', onPress: () => router.push('/add-parcel') },
          { icon: 'home-plus-outline', label: 'Add plot / flat / house', onPress: () => router.push('/add-property') },
        ]}
      />
      <Animated.FlatList
        onScroll={onScroll}
        scrollEventThrottle={16}
        data={mapMode ? [] : sections}
        keyExtractor={(s) => s.key}
        contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => qc.invalidateQueries({ queryKey: ['pattadar', 'holdings'] })}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <AppHeader
              title="Land & Properties"
              onSearch={() => setShowSearch((s) => !s)}
              menuItems={[
                { icon: 'map-marker-plus-outline', label: 'Add parcel (farmland)', onPress: () => router.push('/add-parcel') },
                { icon: 'home-plus-outline', label: 'Add plot / flat / house', onPress: () => router.push('/add-property') },
              ]}
            />
            {result?.isSample && (
              <OfflineBanner visible onRetry={() => qc.invalidateQueries({ queryKey: ['pattadar', 'holdings'] })} />
            )}
            {showSearch && (
              <Searchbar
                placeholder="Search survey no, owner, village…"
                value={search}
                onChangeText={setSearch}
                autoFocus
                style={styles.search}
              />
            )}
            {/* The segmented control ALWAYS renders. It was inside the
                empty-segment gate, so choosing "Plots" with no plots hid the
                very control needed to get back to Farmland — a dead end. */}
            <View style={styles.controlRow}>
              {/* CL-47/48: unified accent, counts, Home-matching labels */}
              <SegmentedButtons
                value={kind}
                onValueChange={setKind}
                density="small"
                style={styles.grow}
                theme={{ colors: { secondaryContainer: theme.colors.primaryContainer, onSecondaryContainer: theme.colors.onPrimaryContainer } }}
                buttons={[
                  { value: 'all', label: `All (${counts.all})`, style: styles.seg, labelStyle: styles.segLabel },
                  { value: 'parcel', label: `Farmland (${counts.parcel})`, style: styles.seg, labelStyle: styles.segLabel },
                  { value: 'property', label: `Plots (${counts.property})`, style: styles.seg, labelStyle: styles.segLabel },
                ]}
              />
            </View>
            {/* CL-538/616: grouping, sort and the map toggle have nothing to
                act on when this segment is empty — but the segment picker above
                stays, because it is the way out. */}
            {!segmentEmpty && (
              <>
            {/* CL-189/190/192: every control labeled and stateful */}
            <View style={styles.controlRow}>
              <Menu
                visible={optMenu}
                onDismiss={() => setOptMenu(false)}
                anchor={
                  <Chip
                    compact
                    mode="outlined"
                    textStyle={styles.chipText}
                    accessibilityLabel={`Group by ${groupBy}`}
                    onPress={() => setOptMenu(true)}
                  >
                    Group: {GROUP_LABEL[groupBy]}
                  </Chip>
                }
              >
                {((kind === 'property' ? ['village', 'owner', 'none'] : ['khata', 'village', 'owner', 'none']) as GroupKey[]).map((g) => (
                  <Menu.Item
                    key={g}
                    title={`Group by ${GROUP_LABEL[g].toLowerCase()}`}
                    trailingIcon={groupBy === g ? 'check' : undefined}
                    onPress={() => {
                      setGroupBy(g);
                      persist({ groupBy: g });
                      setOptMenu(false);
                    }}
                  />
                ))}
              </Menu>
              <Menu
                visible={sortMenu}
                onDismiss={() => setSortMenu(false)}
                anchor={
                  <Chip
                    compact
                    mode="outlined"
                    textStyle={styles.chipText}
                    accessibilityLabel={`Sort by ${sortBy}`}
                    onPress={() => setSortMenu(true)}
                  >
                    Sort:{' '}
                    {sortBy === 'survey'
                      ? kind === 'property'
                        ? 'Plot no. ↑'
                        : 'Survey ↑'
                      : sortBy === 'extent'
                        ? kind === 'property'
                          ? 'Area ↓'
                          : 'Extent ↓'
                        : sortBy === 'village'
                          ? kind === 'property'
                            ? 'Locality ↑'
                            : 'Village ↑'
                          : 'Recent ↓'}
                  </Chip>
                }
              >
                {(
                  /* CL-617: plots have no survey number and no village-mandal
                     grouping in the revenue sense — offering those sorts here
                     produced an arbitrary order under a confident label. */
                  (kind === 'property'
                    ? [
                        ['survey', 'Sort by plot no.'],
                        ['extent', 'Sort by area'],
                        ['village', 'Sort by locality'],
                        ['recent', 'Recently added'],
                      ]
                    : [
                        ['survey', 'Sort by survey no.'],
                        ['extent', 'Sort by extent'],
                        ['village', 'Sort by village'],
                        ['recent', 'Recently added'],
                      ]) as [SortKey, string][]
                ).map(([k, label]) => (
                  <Menu.Item
                    key={k}
                    title={label}
                    trailingIcon={sortBy === k ? 'check' : undefined}
                    onPress={() => {
                      setSortBy(k);
                      persist({ sortBy: k });
                      setSortMenu(false);
                    }}
                  />
                ))}
              </Menu>
              <View style={styles.grow} />
              {/* CL-187 */}
              {groupBy !== 'none' && sections.length > 1 && !mapMode && (
                <IconButton
                  icon={allCollapsed ? 'unfold-more-horizontal' : 'unfold-less-horizontal'}
                  size={20}
                  style={styles.tight}
                  accessibilityLabel={allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
                  onPress={() => setAll(!allCollapsed)}
                />
              )}
              <Chip
                compact
                mode="outlined"
                icon={mapMode ? 'view-list-outline' : 'map-outline'}
                textStyle={styles.chipText}
                accessibilityLabel={mapMode ? 'Switch to list view' : 'Show these properties on a map'}
                onPress={() => setMapMode((m) => !m)}
              >
                {mapMode ? 'List' : 'Map'}
              </Chip>
            </View>
            {/* CL-579: same outlined chip as Group/Sort/Map beside it. The
                default flat Chip picks up Paper's secondaryContainer, which is
                the purple that keeps reappearing off-palette. */}
            {!!pbFilter && (
              <Chip
                compact
                mode="outlined"
                icon="filter-variant"
                closeIcon="close"
                textStyle={styles.chipText}
                onClose={() => setPbFilter('')}
                style={styles.filterChip}
              >
                {(() => {
                  const match = result?.data.passbooks.find((x) => x.id === pbFilter);
                  return match ? `Khata ${match.pattadarNo || '—'}` : 'Khata filter';
                })()}
              </Chip>
            )}
            {/* CL-612: each count sits beside ITS OWN extent. Acres and square
                yards are never added together, and the two kinds are never
                merged into one number — a parcel and a plot are different
                things measured in different units. */}
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {[
                nParcels > 0
                  ? [`${nParcels} parcel${nParcels === 1 ? '' : 's'}`, sumExtent > 0 ? formatExtent(sumExtent, unitPref) : '']
                      .filter(Boolean)
                      .join(' · ')
                  : '',
                nProps > 0
                  ? [`${nProps} plot${nProps === 1 ? '' : 's'}`, sumSqyd > 0 ? `${formatNumberIN(Math.round(sumSqyd))} Sq.yd` : '']
                      .filter(Boolean)
                      .join(' · ')
                  : '',
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </Text>
            {mapMode && (
              geoRows.length > 0 ? (
                <MapView
                  style={styles.mapFull}
                  initialRegion={{
                    latitude: geoRows.reduce((s2, g) => s2 + g.latitude, 0) / geoRows.length,
                    longitude: geoRows.reduce((s2, g) => s2 + g.longitude, 0) / geoRows.length,
                    latitudeDelta: 1.5,
                    longitudeDelta: 1.5,
                  }}
                >
                  {geoRows.map((g) => (
                    <Marker
                      key={`${g.h.kind}:${g.h.id}`}
                      coordinate={{ latitude: g.latitude, longitude: g.longitude }}
                      title={g.h.title}
                      description={g.h.extentLabel}
                      onCalloutPress={() =>
                        router.push({ pathname: '/holding/[id]', params: { id: g.h.id, kind: g.h.kind } })
                      }
                    />
                  ))}
                </MapView>
              ) : (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Nothing here has a location pin yet — set one from a parcel's detail page.
                </Text>
              )
            )}
              </>
            )}
          </View>
        }
        renderItem={({ item: s }) => (
          <View style={styles.sectionCard}>
            {/* CL-580/581: a header that names the only group divides nothing,
                and its totals repeat the summary a hundred points above it. */}
            {groupBy !== 'none' && sections.length > 1 && (
              <Pressable
                accessibilityRole="button"
                onPress={() => toggleSection(s.key)}
                style={({ pressed }) => [styles.sectionHeader, pressed && { opacity: 0.7 }]}
              >
                <IconButton
                  icon={collapsed[s.key] ? 'chevron-right' : 'chevron-down'}
                  size={18}
                  style={styles.tight}
                />
                <View style={styles.grow}>
                  {/* CL-230: khata leads, village joins at reduced emphasis */}
                  <Text variant="titleSmall" numberOfLines={1}>
                    <Text variant="titleSmall" style={styles.bold}>
                      {s.title}
                    </Text>
                    {s.villageTag ? (
                      <Text variant="titleSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {'  ·  '}{s.villageTag}
                      </Text>
                    ) : null}
                  </Text>
                  {!!s.subtitle && (
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                      {s.subtitle}
                    </Text>
                  )}
                </View>
                {/* CL-230/234: extent only, fixed column, aligned with rows */}
                <Text
                  variant="labelMedium"
                  numberOfLines={1}
                  style={[styles.tabular, styles.extentCol, { color: theme.colors.onSurface }]}
                >
                  {s.extent > 0 ? formatExtent(s.extent, unitPref) : ''}
                </Text>
              </Pressable>
            )}
            {!collapsed[s.key] &&
              s.rows.map((h) => (
                <HoldingRow
                  key={`${h.kind}:${h.id}`}
                  h={h}
                  unitPref={unitPref}
                  onDelete={setConfirm}
                  onStake={(k, id, stake) => setStake.mutate({ kind: k, id, stake })}
                  coverRef={coverByParcel.get(h.id)}
                />
              ))}
          </View>
        )}
        ListFooterComponent={
          segmentEmpty ? null : kind === 'property' ? (
            <AddRow label="Add plot" onPress={() => router.push('/add-property')} />
          ) : (
            <AddRow label="Add parcel" onPress={() => router.push('/add-parcel')} />
          )
        }
        ListEmptyComponent={
          isLoading || mapMode ? null : result?.isSample ? (
            <ErrorRetry onRetry={() => refetch()} />
          ) : (
            /* A plot is bought by DEED — it has no passbook and no survey
               number — so telling this tab to scan a passbook offered the one
               route that cannot work here. Each segment gets the way in that
               actually applies to it. */
            kind === 'property' ? (
              <EmptyState
                icon="home-city-outline"
                title="No plots yet"
                body="A plot, flat or house comes from its sale deed. The next screen reads the deed for you, or takes the details by hand."
                primary={{ label: 'Add a plot', icon: 'home-plus-outline', onPress: () => router.push('/add-property') }}
              />
            ) : (
              <EmptyState
                icon="map-marker-outline"
                title={kind === 'parcel' ? 'No farmland yet' : 'No properties yet'}
                body="Farmland arrives with the passbook you scan. Plots and houses come from their sale deed."
                primary={{ label: 'Scan passbook', icon: 'camera-plus-outline', onPress: () => router.push('/add-khata') }}
                secondary={{ label: 'Enter by hand', icon: 'pencil-outline', onPress: () => router.push('/add-parcel') }}
              />
            )
          )
        }
      />
      {focused && !!identity && (
        <Portal>
          <Dialog visible={confirm !== null} onDismiss={() => !deleting && setConfirm(null)}>
            <Dialog.Title>Delete {confirm?.label}?</Dialog.Title>
            <Dialog.Content>
              <Text variant="bodyMedium">{confirm?.detail}</Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button disabled={deleting} onPress={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                textColor={theme.colors.error}
                loading={deleting}
                disabled={deleting}
                onPress={async () => {
                  if (!confirm) return;
                  if (confirm.kind === 'parcel') await deleteParcel.mutateAsync(confirm.id).catch(() => undefined);
                  else if (confirm.kind === 'property') await deleteProperty.mutateAsync(confirm.id).catch(() => undefined);
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
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs },
  grow: { flex: 1 },
  seg: { flex: 1 },
  segLabel: { fontSize: 12 },
  filterChip: { alignSelf: 'flex-start' },
  list: { padding: tokens.spacing.lg, gap: tokens.spacing.sm },
  sectionCard: { borderRadius: tokens.radii.lg, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: tokens.spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    // CL-575/578: a FIXED height, not a minimum. With a minimum, a row holding
    // a 40pt thumbnail grew taller than its neighbours and its overflow button
    // drifted out of line with theirs.
    height: 56,
    paddingLeft: tokens.spacing.lg,
    borderRadius: tokens.radii.md,
  },
  // CL-234: sized for "999 Acres 99 Cents" so the column never shifts.
  // The number is the point of the row. A fixed width made it BOTH too narrow
  // for "3 Acres 20 Cents" and unable to borrow the whitespace sitting to its
  // left, so it ellipsised while the row was half empty. It now sizes to its
  // content and never gives ground; the label shrinks instead.
  extentCol: { minWidth: 96, textAlign: 'right', flexShrink: 0, flexGrow: 0 },
  rowTitle: { flex: 1, flexShrink: 1 },
  bold: { fontWeight: '700' },
  chipText: { fontSize: 11, textTransform: 'capitalize' },
  tabular: { fontVariant: ['tabular-nums'] },
  tight: { margin: 0 },
  emptyBox: { marginTop: tokens.spacing.xxl, alignItems: 'center', gap: tokens.spacing.md },
  // CL-575: identical footprint whether the slot holds a photo or an icon.
  leading: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  leadingFill: { width: '100%', height: '100%' },
  mapFull: { height: 420, borderRadius: tokens.radii.lg },
});
