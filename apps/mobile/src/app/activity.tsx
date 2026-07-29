import {
  collapseAuditBursts,
  countedActionLabel,
  dayHeading,
  eventEntity,
  formatDateTime,
  isDestructiveAction,
  isSecurityAction,
  parseAuditTime,
  relativeTime,
} from '@pattadar/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { Appbar, Chip, Divider, Searchbar, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { useDashboard, useIdentity } from '@/data/hooks';
import { displayName } from '@/lib/family';

/** CL-552: the four questions people actually bring to an audit log. */
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'added', label: 'Added', test: (a: string) => /^(create|add|upload|assign|invite|send)_/.test(a) },
  { key: 'changed', label: 'Changed', test: (a: string) => /^(update|set|record|reclassify|verify)_/.test(a) },
  { key: 'deleted', label: 'Deleted', test: isDestructiveAction },
  { key: 'security', label: 'Security', test: isSecurityAction },
] as const;

/**
 * CL-11: the chronological feed. Now grouped by day, collapsed, named, and
 * filterable — a flat wall of `Delete registered document · Deleted registered
 * document` answered none of the questions people bring to an audit log.
 */
export default function ActivityScreen() {
  const theme = useTheme();
  const { data } = useDashboard();
  const identity = useIdentity();
  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const events = data?.data.recent ?? [];
  const me = data?.data.me?.name ?? '';
  /**
   * The actor is a full line on every row and, for a single-user account, it is
   * the same name every time — the timestamp is what actually distinguishes
   * entries. Shown only when more than one person has touched these records.
   */
  const actorVaries = new Set(events.map((e) => e.actor)).size > 1;

  /** CL-550: an audit trail names people, not login handles. */
  const actorName = (actor: string) => {
    const a = (actor || '').split('@')[0];
    if (!a) return 'Someone';
    if (identity && (a === identity.split('@')[0] || actor === identity)) return me ? displayName(me) : 'You';
    return displayName(a.replace(/[._]+/g, ' '));
  };

  const sections = useMemo(() => {
    const active = FILTERS.find((f) => f.key === filter);
    const q = query.trim().toLowerCase();
    const matching = events.filter((e) => {
      if (active && 'test' in active && !active.test(e.action)) return false;
      if (!q) return true;
      const hay = `${countedActionLabel(e.action, 1)} ${eventEntity(e.action, e.target, e.details)} ${actorName(e.actor)}`;
      return hay.toLowerCase().includes(q);
    });
    // CL-548: the same collapsing Home already applies — three identical
    // deletes in one minute are one decision, not three events.
    const collapsed = collapseAuditBursts(matching);
    const out: { title: string; data: typeof collapsed }[] = [];
    for (const e of collapsed) {
      const title = dayHeading(e.timestamp);
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(e);
      else out.push({ title, data: [e] });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, filter, query, identity, me]);

  const hasAny = events.length > 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Activity log" />
      </Appbar.Header>
      {/* CL-538: controls that organise nothing are not shown. */}
      {hasAny && (
        <View style={styles.controls}>
          <Searchbar
            value={query}
            onChangeText={setQuery}
            placeholder="Search activity"
            mode="bar"
            style={styles.search}
            inputStyle={styles.searchInput}
          />
          <View style={styles.chips}>
            {FILTERS.map((f) => (
              <Chip key={f.key} compact selected={filter === f.key} showSelectedCheck={false} onPress={() => setFilter(f.key)}>
                {f.label}
              </Chip>
            ))}
          </View>
        </View>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(e) => e.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => (
          <Text variant="labelLarge" style={[styles.dayHeader, { color: theme.colors.onSurfaceVariant }]}>
            {section.title}
          </Text>
        )}
        ListEmptyComponent={
          hasAny ? (
            <Text variant="bodyMedium" style={[styles.noMatch, { color: theme.colors.onSurfaceVariant }]}>
              Nothing matches that filter.
            </Text>
          ) : (
            <EmptyState
              icon="history"
              title="No activity yet"
              body="Every change to your records — who made it and when — is recorded here and cannot be edited."
            />
          )
        }
        renderItem={({ item: e, index, section }) => {
          const label = countedActionLabel(e.action, e.count);
          // CL-547: name the object; CL-546: never restate the action.
          const entity = e.count > 1 ? '' : eventEntity(e.action, e.target, e.details);
          const destructive = isDestructiveAction(e.action);
          const open = expanded === e.id;
          return (
            <View>
              {index > 0 && <Divider />}
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Shows the exact time"
                onPress={() => setExpanded(open ? null : e.id)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
              >
                {/* CL-551: destructive actions are marked here too, not only on Home. */}
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: destructive ? theme.colors.error : theme.colors.primary },
                  ]}
                />
                <View style={styles.grow}>
                  <Text variant="bodyMedium" style={styles.bold}>
                    {label}
                    {entity ? ` · ${entity}` : ''}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {actorVaries ? `${actorName(e.actor)} · ` : ''}
                    {/* CL-549: relative by default, absolute on tap. */}
                    {open ? formatDateTime(parseAuditTime(e.timestamp)) : relativeTime(e.timestamp)}
                  </Text>
                </View>
              </Pressable>
              {index === section.data.length - 1 && <View style={styles.sectionGap} />}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  controls: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  search: { height: 44 },
  searchInput: { minHeight: 0, paddingBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 48 },
  dayHeader: { fontWeight: '700', paddingTop: 16, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  grow: { flex: 1, gap: 2 },
  bold: { fontWeight: '600' },
  sectionGap: { height: 4 },
  noMatch: { textAlign: 'center', marginTop: 48 },
});
