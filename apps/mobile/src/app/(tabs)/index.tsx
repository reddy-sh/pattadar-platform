import {
  LOW_SIGNAL_ACTIONS,
  canonicalizeVillages,
  collapseAuditBursts,
  countedActionLabel,
  nameVariantPair,
  formatExtent,
  formatINR,
  formatNumberIN,
  eventEntity,
  parseAuditTime,
  parseISOToDisplay,
  relativeTime,
} from '@pattadar/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import MapView, { Marker } from 'react-native-maps';
import {
  ActivityIndicator,
  Banner,
  Button,
  Card,
  Divider,
  FAB,
  Icon,
  List,
  Portal,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useListBottomInset } from '@/components/ListScaffold';
import { AppHeader } from '@/components/AppHeader';
import { StickyTitleBar } from '@/components/StickyTitleBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ErrorRetry } from '@/components/ErrorRetry';
import { useDashboard, useIdentity, type DashboardData } from '@/data/hooks';
import { heroMoney, tintAlphas, upcomingFromRecords } from '@/lib/homeInsights';
import { useUnitPref } from '@/lib/units';
import { tokens } from '@pattadar/tokens';

/**
 * CL-545: the name to greet someone by, never a raw id.
 *
 * This used to take the first token, which produced "Namaste, Chintalapudi" —
 * the family name. Andhra names are commonly written surname-first
 * ("Chintalapudi Swetha") and just as commonly given-name-first ("Sankara
 * Reddy Telukutla"), so there is no rule that picks the given name correctly
 * from the string alone. Guessing gets it wrong half the time and addresses
 * people by their family name; the full name is always right.
 *
 * A login handle (`sankara.telukutla`) has no such ambiguity, so it is still
 * split and capitalised.
 */
function greetingName(name: string | undefined): string {
  const s = (name || '').trim();
  if (!s) return '';
  if (s.includes('@')) return greetingName(s.split('@')[0]);
  if (/^[a-z0-9]+([._][a-z0-9]+)+$/.test(s)) {
    return s.split(/[._]/).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
  }
  return s;
}

function parseGeo(geoPoint: string | undefined): { latitude: number; longitude: number } | null {
  const raw = (geoPoint ?? '').replace(/[\[\]\s]/g, '');
  const [lat, lng] = raw.split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
    ? { latitude: lat, longitude: lng }
    : null;
}

/** CL-120/126: plain pressable cell — equal height, one-line labels, neutral
 * values (accent is reserved for the hero numbers). No Card = no ghost layer. */
function StatChip({ label, value, href }: { label: string; value: string; href: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={() => router.push(href as never)}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: theme.colors.outlineVariant },
        pressed && { backgroundColor: theme.colors.surfaceVariant },
      ]}
    >
      <View style={styles.chipText}>
        <Text variant="labelMedium" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
          {label}
        </Text>
        <Text variant="titleMedium" numberOfLines={1} style={[styles.bold, { color: theme.colors.onSurface }]}>
          {value}
        </Text>
      </View>
      <List.Icon icon="chevron-right" color={theme.colors.onSurfaceVariant} />
    </Pressable>
  );
}

/** CL-127: one "see more" pattern — section title + trailing neutral link. */
function SectionHeader({ title, linkLabel, href }: { title: string; linkLabel?: string; href?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text variant="titleSmall" style={styles.grow}>
        {title}
      </Text>
      {!!linkLabel && !!href && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(href as never)}
          style={styles.sectionLink}
        >
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {linkLabel} ›
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** CL-7/121/122/123/131: composition by CANONICAL village — single-hue tint
 * ramp (magnitude, not categories), legend dots match segments, tap filters. */
function CompositionBar({ d }: { d: DashboardData }) {
  const theme = useTheme();
  const segments = useMemo(() => {
    const canon = canonicalizeVillages(d.passbooks.map((pb) => pb.village || ''));
    const villageOf = new Map(d.passbooks.map((pb) => [pb.id, canon.get(pb.village || '') || '—']));
    const byVillage = new Map<string, number>();
    for (const p of d.parcels) {
      const v = villageOf.get(p.passbookId) || '—';
      byVillage.set(v, (byVillage.get(v) || 0) + (Number(p.extent) || 0));
    }
    const sorted = [...byVillage.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4);
    const other = sorted.slice(4).reduce((s, [, v]) => s + v, 0);
    if (other > 0) top.push(['Other', other]);
    const total = top.reduce((s, [, v]) => s + v, 0);
    return total > 0 ? top.map(([name, v]) => ({ name, pct: (v / total) * 100 })) : [];
  }, [d]);
  if (segments.length < 2) return null;
  const p = theme.colors.primary;
  // CL-250: alpha steps spread across the actual segment count, so two
  // segments get maximum separation instead of two near-identical blues.
  const alphas = tintAlphas(segments.length);
  const tints = segments.map((_, i) =>
    `${p}${Math.round(alphas[i] * 255).toString(16).padStart(2, '0').toUpperCase()}`,
  );
  const go = (name: string) =>
    name !== 'Other' && name !== '—'
      ? () => router.push(`/holdings?q=${encodeURIComponent(name)}` as never)
      : undefined;
  return (
    <View style={styles.composition}>
      <View style={styles.compBar}>
        {segments.map((s, i) => (
          <Pressable
            key={s.name}
            onPress={go(s.name)}
            accessibilityRole={go(s.name) ? 'button' : undefined}
            accessibilityLabel={`${s.name}, ${Math.round(s.pct)} percent of farmland`}
            style={[styles.compSeg, { flex: Math.max(s.pct, 3), backgroundColor: tints[i % tints.length] }]}
          />
        ))}
      </View>
      <View style={styles.compLegend}>
        {segments.map((s, i) => (
          <Pressable key={s.name} onPress={go(s.name)} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: tints[i % tints.length] }]} />
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {s.name} {Math.round(s.pct)}%
            </Text>
          </Pressable>
        ))}
      </View>
      {/* CL-249: the plot's city counts as a Location but can't join an
          acres-only bar — say so instead of looking inconsistent. */}
      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
        Farmland by village — plots (Sq.yd) are counted in Locations, not here.
      </Text>
    </View>
  );
}

interface AttentionItem {
  key: string;
  label: string;
  severity: 'error' | 'warning';
  href: string;
}

/** CL-11: actionable items only; each row navigates to the fix. */
function buildAttention(d: DashboardData): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const p of d.parcels) {
    if (p.litigation) {
      items.push({
        key: `lit-${p.id}`,
        label: `Litigation flagged on Sy ${p.surveyNo || '—'}`,
        severity: 'error',
        href: `/holding/${p.id}?kind=parcel`,
      });
    } else if (!p.surveyNo || !(Number(p.extent) > 0)) {
      items.push({
        key: `inc-${p.id}`,
        label: `Parcel ${p.surveyNo ? `Sy ${p.surveyNo}` : '(no survey no)'} is missing details`,
        severity: 'warning',
        href: `/holding/${p.id}?kind=parcel`,
      });
    }
  }
  for (const pb of d.passbooks) {
    if (!d.documents.some((doc) => doc.passbookId === pb.id || d.parcels.some((p) => p.passbookId === pb.id && doc.parcelId === p.id))) {
      items.push({
        key: `nodoc-${pb.id}`,
        label: `Khata ${pb.pattadarNo || '—'} has no documents`,
        severity: 'warning',
        href: '/documents',
      });
    }
  }
  // CL-410: land with no heirs at all is silent otherwise — there are no
  // shares to fail to add up.
  for (const g of d.groups) {
    if (g.landCount > 0 && !(Number(g.totalShare) > 0) && g.type !== 'partnership') {
      items.push({
        key: `no-heirs-${g.id}`,
        label: `${g.name} holds land but has no heirs recorded`,
        severity: 'error',
        href: '/family',
      });
    }
  }
  // CL-130/152: heir shares that don't reach 100% — the highest-stakes gap.
  for (const g of d.groups) {
    const share = Number(g.totalShare) || 0;
    if (share > 0 && share !== 100) {
      items.push({
        key: `share-${g.id}`,
        label: `Heir shares total ${share}% in ${g.name} — ${Math.max(0, 100 - share)}% unallocated`,
        severity: 'error',
        href: '/family',
      });
    }
  }
  // CL-130/136: near-duplicate village spellings are a data-quality defect.
  const canon = canonicalizeVillages(d.passbooks.map((pb) => pb.village || ''));
  // Sorted so the SAME problem always reads the same way. Map order follows
  // whatever order the rows arrived in, which made the warning swap its two
  // spellings between renders.
  const variants = [...canon.entries()]
    .filter(([raw, c]) => raw.trim() && raw.trim() !== c)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (variants.length > 0) {
    items.push({
      key: 'village-quality',
      label: `Village spellings look inconsistent (${variants[0][0]} vs ${variants[0][1]})`,
      severity: 'warning',
      href: '/passbooks',
    });
  }
  // CL-173: near-duplicate OWNER spellings — flagged, never auto-merged
  // (merging legal names is a backend decision, not a display trick).
  const namePair = nameVariantPair(d.passbooks.map((pb) => pb.ownerName || ''));
  if (namePair) {
    items.push({
      key: 'owner-quality',
      label: `Owner names look inconsistent (${namePair[0]} vs ${namePair[1]})`,
      severity: 'warning',
      href: '/passbooks',
    });
  }
  // CL-174: the record can't say S/o vs D/o vs W/o — surface it, don't guess.
  const noRelation = d.passbooks.filter((pb) => pb.fatherHusbandName).length;
  if (noRelation > 0) {
    items.push({
      key: 'relation-missing',
      // CL-252: no off-platform hand-off in the attention module.
      label: `Relation type (S/o · D/o · W/o) missing on ${noRelation} passbook${noRelation === 1 ? '' : 's'}`,
      severity: 'warning',
      href: '/passbooks',
    });
  }
  // CL-246: document coverage — the most actionable gap in the dataset.
  const coveredParcels = new Set(d.documents.map((doc) => doc.parcelId).filter(Boolean)).size;
  if (d.parcels.length > 0 && coveredParcels < d.parcels.length) {
    items.push({
      key: 'doc-coverage',
      label: `Documents cover ${coveredParcels} of ${d.parcels.length} parcels`,
      severity: 'warning',
      href: '/documents',
    });
  }
  // CL-214: documents that never reached a khata or parcel.
  const unlinkedDocs = d.documents.filter((doc) => !doc.parcelId && !doc.passbookId).length;
  if (unlinkedDocs > 0) {
    items.push({
      key: 'unlinked-docs',
      label: `${unlinkedDocs} document${unlinkedDocs === 1 ? '' : 's'} not filed to any passbook`,
      severity: 'warning',
      href: '/documents',
    });
  }
  // CL-130: parcels with no pinned location, as one aggregate row.
  const unpinned = d.parcels.filter((p) => !parseGeo(p.geoPoint)).length;
  if (unpinned > 0 && d.parcels.length > 0) {
    items.push({
      key: 'no-geo',
      label: `${unpinned} parcel${unpinned === 1 ? ' has' : 's have'} no location set`,
      severity: 'warning',
      href: '/holdings',
    });
  }
  const order = { error: 0, warning: 1 };
  return items.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 4);
}

export default function HomeScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const { data: result, isLoading, isRefetching } = useDashboard();
  const identity = useIdentity();
  const unitPref = useUnitPref();
  const bottomInset = useListBottomInset();
  const [requestNote, setRequestNote] = useState(false);
  const [coach, setCoach] = useState(false);
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  // CL-15: one-time coach mark for the sparkle.
  useEffect(() => {
    SecureStore.getItemAsync('pattadar_coach_sparkle').then((seen) => {
      if (!seen) {
        setCoach(true);
        SecureStore.setItemAsync('pattadar_coach_sparkle', '1').catch(() => undefined);
      }
    });
  }, []);


  // The pinned bar needs the offset; nothing else does, so it stays on the UI
  // thread and never re-renders the list.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

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
  const isGuest = !identity;
  const isEmpty =
    d.stats.totalParcels === 0 &&
    d.stats.totalPassbooks === 0 &&
    d.stats.totalDocuments === 0 &&
    d.properties.length === 0;

  // H-6: cold start (nothing ever cached) with a fetch failure resolves to
  // the empty scaffold flagged isSample — without this gate the "Start your
  // land record" hero below would tell a landowner they own nothing when the
  // server was simply unreachable. A later failure that kept real cached
  // data (isEmpty false) skips this and renders normally under the
  // OfflineBanner already wired in below.
  if (result.isSample && isEmpty) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
        <OfflineBanner visible onRetry={() => qc.invalidateQueries({ queryKey: ['pattadar'] })} />
        <ErrorRetry onRetry={() => qc.invalidateQueries({ queryKey: ['pattadar'] })} />
      </SafeAreaView>
    );
  }

  const lastVisit = d.me?.lastActiveAt ? new Date(d.me.lastActiveAt) : null;
  const awayHours = lastVisit ? (Date.now() - lastVisit.getTime()) / 36e5 : 0;
  const sinceCount = lastVisit
    ? d.recent.filter((e) => parseAuditTime(e.timestamp) > lastVisit).length
    : 0;
  const showWelcomeBack = !isGuest && !isEmpty && lastVisit !== null && awayHours >= 12;

  const attention = !isGuest && !isEmpty ? buildAttention(d) : [];
  // CL-8/9/125: suppress low-signal + test fixtures, collapse same-action bursts.
  const feed = collapseAuditBursts(
    d.recent.filter(
      (e) =>
        !LOW_SIGNAL_ACTIONS.includes(e.action) &&
        !/\be2e\b|\btest\b|fixture/i.test(`${e.target} ${e.details ?? ''}`),
    ),
  ).slice(0, 3);
  const villageCanon = canonicalizeVillages(d.passbooks.map((pb) => pb.village || ''));
  const geoParcels = d.parcels
    .map((p) => ({ id: p.id, geo: parseGeo(p.geoPoint) }))
    .filter((p) => p.geo !== null) as { id: string; geo: { latitude: number; longitude: number } }[];
  const plotsSqyd = d.properties.reduce((s, p) => s + (Number(p.landArea) || 0), 0);
  // CL-237: money from fields already recorded; CTA when nothing entered yet.
  const money = heroMoney({
    estimatedValue: Number(d.stats.estimatedValue) || 0,
    totalPurchase: d.parcels.reduce((s, p) => s + (Number(p.purchasePrice) || 0), 0),
    totalLoans: d.parcels.reduce((s, p) => s + (Number(p.loanAmount) || 0), 0),
  });
  // CL-243: forward-looking items from recorded dates.
  const upcoming = !isGuest && !isEmpty ? upcomingFromRecords(d.parcels, new Date()) : [];
  // CL-254: what OTHERS changed vs what you did.
  const updates = feed.filter((e) => e.actor && identity && e.actor !== identity);
  const yours = feed.filter((e) => !(e.actor && identity && e.actor !== identity));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <StickyTitleBar
        title="Home"
        scrollY={scrollY}
        menuItems={[
          { icon: 'book-plus-outline', label: 'Add passbook', onPress: () => router.push('/add-khata') },
          { icon: 'map-marker-plus-outline', label: 'Add parcel', onPress: () => router.push('/add-parcel') },
          { icon: 'home-plus-outline', label: 'Add plot / flat / house', onPress: () => router.push('/add-property') },
          { icon: 'file-document-outline', label: 'Documents', onPress: () => router.push('/documents') },
        ]}
      />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => qc.invalidateQueries({ queryKey: ['pattadar', 'dashboard'] })}
          />
        }
      >
        {result.isSample && (
          <OfflineBanner visible onRetry={() => qc.invalidateQueries({ queryKey: ['pattadar'] })} />
        )}

        <AppHeader
            menuItems={[
              { icon: 'book-plus-outline', label: 'Add passbook', onPress: () => router.push('/add-khata') },
              { icon: 'map-marker-plus-outline', label: 'Add parcel', onPress: () => router.push('/add-parcel') },
              { icon: 'home-plus-outline', label: 'Add plot / flat / house', onPress: () => router.push('/add-property') },
              { icon: 'file-document-outline', label: 'Documents', onPress: () => router.push('/documents') },
            ]}
          />

        {/* CL-1: greeting first */}
        <View>
          <Text variant="headlineSmall" style={styles.greeting}>
            🙏 Namaste{!isGuest && greetingName(d.me?.name) ? `, ${greetingName(d.me?.name)}` : ''}
          </Text>
        </View>

        {showWelcomeBack && (
          <View>
            <Card mode="contained" style={[styles.hero, { backgroundColor: theme.colors.primaryContainer }]}>
              <Card.Content style={styles.gap}>
                <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onPrimaryContainer }]}>
                  🪔 Welcome back
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onPrimaryContainer }}>
                  {sinceCount > 0
                    ? `${sinceCount} update${sinceCount === 1 ? '' : 's'} since your last visit (${parseISOToDisplay(d.me!.lastActiveAt)}).`
                    : `Nothing changed since your last visit (${parseISOToDisplay(d.me!.lastActiveAt)}).`}{' '}
                  Your records are safe.
                </Text>
              </Card.Content>
            </Card>
          </View>
        )}

        {isGuest && (
          <Card mode="contained" style={[styles.hero, { backgroundColor: theme.colors.primaryContainer }]}>
            <Card.Content style={styles.gap}>
              <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onPrimaryContainer }]}>
                🙏 Welcome to Pattadar
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onPrimaryContainer }}>
                Your family's land records — safe in one place. Sign in to see yours.
              </Text>
              <Button mode="contained" icon="login" onPress={() => router.push('/sign-in' as never)}>
                Sign in
              </Button>
            </Card.Content>
          </Card>
        )}

        {!isGuest && isEmpty && (
          <Card mode="contained" style={styles.hero}>
            <Card.Content style={styles.gap}>
              <Text variant="titleMedium" style={styles.bold}>
                🌾 Start your land record
              </Text>
              <Text variant="bodyMedium">
                Photograph your pattadar passbook — AI extraction creates your
                passbook and parcels automatically. Or enter them by hand.
              </Text>
              <View style={styles.rowButtons}>
                <Button mode="contained" icon="camera-plus-outline" onPress={() => router.push('/add-khata')}>
                  Scan passbook
                </Button>
                <Button mode="outlined" onPress={() => router.push('/add-khata')}>
                  Enter manually
                </Button>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* CL-1/17/18: hero card with accented values + composition bar */}
        {!isGuest && !isEmpty && (
          <View>
            <Card mode="contained" style={styles.hero}>
              <Card.Content>
                <Text variant="labelLarge" style={[styles.heroLabel, { color: theme.colors.onSurface }]}>
                  Farmland
                </Text>
                <Text
                  variant="headlineMedium"
                  style={[styles.bold, { color: theme.colors.primary }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatExtent(d.stats.totalExtent, unitPref)}
                </Text>
                {plotsSqyd > 0 && (
                  <>
                    <Text
                      variant="labelLarge"
                      style={[styles.heroSecond, styles.heroLabel, { color: theme.colors.onSurface }]}
                    >
                      Plots & sites
                    </Text>
                    <Text
                      variant="headlineMedium"
                      style={[styles.bold, { color: theme.colors.primary }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formatNumberIN(Math.round(plotsSqyd))} Sq.yd
                    </Text>
                  </>
                )}
                {/* CL-237: value belongs beside extent, not buried */}
                {money.kind === 'value' ? (
                  <View style={styles.moneyLine}>
                    <Text variant="labelLarge" style={[styles.heroLabel, { color: theme.colors.onSurface }]}>
                      Value
                    </Text>
                    <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.primary }]}>
                      {formatINR(money.value ?? 0)}
                      {money.gainPct !== null && money.gainPct !== undefined
                        ? `  (${money.gainPct >= 0 ? '+' : ''}${money.gainPct}%)`
                        : ''}
                    </Text>
                    {!!money.loans && money.loans > 0 && (
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Loans outstanding {formatINR(money.loans)}
                      </Text>
                    )}
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/holdings' as never)}
                    style={styles.moneyLine}
                  >
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      No purchase prices recorded yet — add them to see your portfolio's value here.
                    </Text>
                  </Pressable>
                )}
                <CompositionBar d={d} />
              </Card.Content>
            </Card>
          </View>
        )}

        {/* CL-243: forward-looking, from dates the records already hold */}
        {upcoming.length > 0 && (
          <View>
            <Card mode="outlined" style={styles.section}>
              <Card.Content style={styles.gap}>
                <Text variant="titleSmall">Upcoming</Text>
                {upcoming.map((u) => (
                  <List.Item
                    key={u.label}
                    title={u.label}
                    titleNumberOfLines={2}
                    style={styles.attnRow}
                    left={() => <List.Icon icon="calendar-clock-outline" color={theme.colors.onSurfaceVariant} />}
                    right={() => <List.Icon icon="chevron-right" />}
                    onPress={() => router.push(u.href as never)}
                  />
                ))}
              </Card.Content>
            </Card>
          </View>
        )}

        {/* CL-11: needs attention */}
        {!isGuest && !isEmpty && (
          <View>
            <Card mode="outlined" style={styles.section}>
              <Card.Content style={styles.gap}>
                <Text variant="titleSmall">Needs attention</Text>
                {attention.length === 0 && (
                  <View style={styles.allClear}>
                    <List.Icon icon="check-circle-outline" color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                      Everything's up to date
                    </Text>
                  </View>
                )}
                {attention.map((a) => (
                  <List.Item
                    key={a.key}
                    title={a.label}
                    titleNumberOfLines={2}
                    style={styles.attnRow}
                    left={() => (
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: a.severity === 'error' ? theme.colors.error : '#e8a13d' },
                        ]}
                      />
                    )}
                    right={() => <List.Icon icon="chevron-right" />}
                    onPress={() => router.push(a.href as never)}
                  />
                ))}
                {/* CL-253 */}
                {attention.length > 0 && (
                  <View style={styles.legendRow}>
                    <View style={[styles.dot, { backgroundColor: theme.colors.error }]} />
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      act now
                    </Text>
                    <View style={[styles.dot, { backgroundColor: '#e8a13d' }]} />
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      worth fixing
                    </Text>
                  </View>
                )}
              </Card.Content>
            </Card>
          </View>
        )}

        {/* CL-4/5/120/127/128: 2×2 grid in a card, View all in the header */}
        {!isGuest && !isEmpty && (
          <View>
            <Card mode="outlined" style={styles.section}>
              <Card.Content style={styles.gap}>
                <SectionHeader title="Portfolio" linkLabel="View all" href="/portfolio" />
                <View style={styles.chipGrid}>
                  <StatChip label="Parcels" value={String(d.stats.totalParcels)} href="/holdings" />
                  <StatChip label="Passbooks" value={String(d.stats.totalPassbooks)} href="/passbooks" />
                  <StatChip
                    label="Locations"
                    value={String(
                      new Set(
                        [
                          ...d.passbooks.map((pb) => villageCanon.get(pb.village || '') ?? pb.village),
                          ...d.properties.map((p) => p.city),
                        ].filter(Boolean),
                      ).size,
                    )}
                    href="/holdings"
                  />
                  <StatChip label="Beneficiaries" value={String(d.stats.totalBeneficiaries)} href="/family" />
                  {/* CL-248 */}
                  <StatChip label="Documents" value={String(d.stats.totalDocuments)} href="/documents" />
                  <StatChip label="Groups" value={String(d.stats.totalGroups)} href="/family" />
                </View>
              </Card.Content>
            </Card>
          </View>
        )}

        {/* CL-245: no pins yet → say how to get the map, don't just omit it */}
        {!isGuest && !isEmpty && geoParcels.length === 0 && (
          <Card mode="outlined" style={styles.section} onPress={() => router.push('/holdings')}>
            <Card.Content style={styles.mapPrompt}>
              <List.Icon icon="map-marker-plus-outline" color={theme.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={[styles.grow, { color: theme.colors.onSurfaceVariant }]}>
                Pin a parcel's location to see your land on a map here.
              </Text>
            </Card.Content>
          </Card>
        )}
        {/* CL-12: map thumbnail */}
        {!isGuest && geoParcels.length > 0 && (
          <View>
            <Card mode="outlined" style={styles.section} onPress={() => router.push('/holdings')}>
              <MapView
                style={styles.mapThumb}
                pointerEvents="none"
                initialRegion={{
                  latitude: geoParcels.reduce((s, p) => s + p.geo.latitude, 0) / geoParcels.length,
                  longitude: geoParcels.reduce((s, p) => s + p.geo.longitude, 0) / geoParcels.length,
                  latitudeDelta: 1.5,
                  longitudeDelta: 1.5,
                }}
              >
                {geoParcels.map((p) => (
                  <Marker key={p.id} coordinate={p.geo} />
                ))}
              </MapView>
            </Card>
          </View>
        )}

        {/* CL-8/9/10: compact deduped summary; full log lives in /activity */}
        {!isGuest && (
          <View>
            <Card mode="outlined" style={styles.activity}>
              <Card.Content style={styles.gap}>
                <SectionHeader title="Recent activity" linkLabel="Activity log" href="/activity" />
                {feed.length === 0 && (
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    Nothing yet.
                  </Text>
                )}
                {/* CL-254: others' changes lead — that's the news */}
                {updates.length > 0 && (
                  <Text variant="labelSmall" style={[styles.bold, { color: theme.colors.onSurfaceVariant }]}>
                    Updates from others
                  </Text>
                )}
                {[...updates, ...yours].map((e, i) => {
                  // CL-125/132: "Deleted 2 documents", target named, row navigates.
                  const label = countedActionLabel(e.action, e.count);
                  // CL-546: one shared rule for "does this detail add anything",
                  // so Home and the full log can never disagree again.
                  const entity = e.count > 1 ? '' : eventEntity(e.action, e.target, e.details);
                  return (
                    <View key={e.id}>
                      {i > 0 && <Divider />}
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => router.push('/activity' as never)}
                        style={({ pressed }) => [styles.feedRow, pressed && { opacity: 0.6 }]}
                      >
                        <View
                          style={[
                            styles.dot,
                            {
                              backgroundColor: /delete|remove/.test(e.action)
                                ? theme.colors.error
                                : /create|add|upload/.test(e.action)
                                  ? '#2e7d32'
                                  : theme.colors.primary,
                            },
                          ]}
                        />
                        <View style={styles.feedBody}>
                          <Text variant="bodyMedium">
                            <Text variant="bodyMedium" style={styles.bold}>
                              {label}
                            </Text>
                            {entity ? ` · ${entity}` : ''}
                          </Text>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {relativeTime(e.timestamp)}
                          </Text>
                        </View>
                        <List.Icon icon="chevron-right" color={theme.colors.onSurfaceVariant} />
                      </Pressable>
                    </View>
                  );
                })}
              </Card.Content>
            </Card>
          </View>
        )}
      </Animated.ScrollView>

      {/* CL-2: FAB replaces the tile row */}
      {focused && (
        <Portal>
          <Snackbar visible={requestNote} onDismiss={() => setRequestNote(false)} duration={3500}>
            Service requests are coming soon — they'll file against your linked passbook.
          </Snackbar>
        </Portal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: tokens.spacing.lg, gap: tokens.spacing.sm },
  banner: { borderRadius: tokens.radii.md },
  greeting: { fontWeight: '700' },
  hero: { borderRadius: tokens.radii.lg },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroSecond: { marginTop: tokens.spacing.sm },
  bold: { fontWeight: '700' },
  gap: { gap: tokens.spacing.sm },
  rowButtons: { flexDirection: 'row', gap: tokens.spacing.sm, flexWrap: 'wrap' },
  composition: { marginTop: tokens.spacing.md, gap: tokens.spacing.xs },
  compBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  compSeg: {},
  compLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs, justifyContent: 'flex-end' },
  moneyLine: { marginTop: tokens.spacing.sm, gap: 2 },
  mapPrompt: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  section: { borderRadius: tokens.radii.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center' },
  sectionLink: { paddingVertical: 4, paddingLeft: tokens.spacing.sm },
  grow: { flex: 1 },
  heroLabel: { fontWeight: '600' },
  allClear: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.xs },
  attnRow: { paddingVertical: 0 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, marginRight: 4, alignSelf: 'center' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  chip: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 64,
    borderWidth: 1,
    borderRadius: tokens.radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: tokens.spacing.md,
  },
  chipText: { flex: 1, gap: 2 },
  mapThumb: { height: 150, borderRadius: tokens.radii.lg },
  activity: { borderRadius: tokens.radii.lg },
  feedRow: { flexDirection: 'row', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.xs },
  feedBody: { flex: 1, gap: 2 },
  fab: { paddingBottom: 80 },
});
