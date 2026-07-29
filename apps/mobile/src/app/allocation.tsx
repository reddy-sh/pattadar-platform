import { formatExtent } from '@pattadar/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Divider,
  HelperText,
  IconButton,
  Text,
  TextInput,
} from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PersonAvatar } from '@/components/PersonAvatar';
import { SheetDialog } from '@/components/SheetDialog';
import { RequireSignIn } from '@/components/RequireSignIn';
import { useGroups, useIdentity, useMemberActions } from '@/data/hooks';
import {
  allocationWarnings,
  clampPct,
  splitEqually,
  splitStatutory,
  stepPct,
  totalPct,
  type AllocRow,
} from '@/lib/allocation';
import { displayName } from '@/lib/family';
import { useUnitPref } from '@/lib/units';
import { useAppTheme } from '@/theme/paper';

/**
 * Estate allocation (CL-457).
 *
 * Shares live here rather than on the member form because a percentage is a
 * statement about everyone else: editing one in isolation is how a group ends
 * up at 25% or with a lone survivor silently holding everything. Every member
 * is on screen, the total is always visible, and the set is written at once.
 *
 * The owner is NOT an heir (CL-UX2). This screen used to render the signed-in
 * member as an editable row, so "Split equally" handed the owner a share of
 * their own estate — two heirs plus the owner meant 33% each and a total that
 * read a satisfied 100%, while "Statutory split" gave the owner 0. The two
 * buttons on one screen disagreed about whether you inherit from yourself.
 * The owner now appears once, above the heirs, as context rather than a row.
 *
 * Percentages are held as text while being typed. Storing them as numbers and
 * re-rendering `String(pct)` swallowed the decimal point on every keystroke, so
 * "12.5" collapsed to "12" and a three-way 33.3% split was unreachable by hand
 * even though `splitEqually` produces exactly that.
 */
/** Relations arrive as raw keys ("spouse", "son"); show them as words. */
const sentenceCase = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);

export default function AllocationScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const identity = useIdentity();
  const unitPref = useUnitPref();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { data: result, isLoading } = useGroups();
  const { setShare } = useMemberActions();

  const group = (result?.data.groups ?? []).find((g) => g.id === groupId);
  const members = useMemo(
    () => (result?.data.members ?? []).filter((m) => m.groupId === groupId),
    [result, groupId],
  );

  const [rows, setRows] = useState<AllocRow[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const current: AllocRow[] =
    rows ??
    members.map((m) => ({
      id: m.id,
      name: displayName(m.name),
      relation: m.relation,
      photo: m.photo,
      isSelf: m.isSelf,
      pct: Number(m.sharePct) || 0,
    }));

  // The owner is shown for context; only the heirs carry percentages.
  const self = current.find((r) => r.isSelf);
  const heirs = current.filter((r) => !r.isSelf);

  const total = totalPct(heirs);
  // Nothing entered yet is a starting point, not a mistake — see `untouched`.
  const warnings = allocationWarnings(heirs);
  const extentOf = (pct: number) =>
    group && group.totalExtent > 0 ? formatExtent((group.totalExtent * pct) / 100, unitPref) : '';

  const dirty =
    rows !== null &&
    members.some((m) => (Number(m.sharePct) || 0) !== (current.find((r) => r.id === m.id)?.pct ?? 0));

  /** First visit to a group that has never had shares set. */
  const untouched = !dirty && total === 0;

  const setPct = (id: string, pct: number) => {
    const next = clampPct(pct);
    setRows(current.map((r) => (r.id === id ? { ...r, pct: next } : r)));
    setDraft((d) => ({ ...d, [id]: String(next) }));
  };

  /** Keep the raw keystrokes so "12." survives long enough to become "12.5". */
  const typePct = (id: string, text: string) => {
    const cleaned = text.replace(/[^\d.]/g, '');
    setDraft((d) => ({ ...d, [id]: cleaned }));
    setRows(current.map((r) => (r.id === id ? { ...r, pct: clampPct(Number(cleaned) || 0) } : r)));
  };

  /** Apply a split to the heirs only, leaving the owner's row untouched. */
  const applySplit = (fn: (rows: AllocRow[]) => AllocRow[]) => {
    const split = fn(heirs);
    const byId = new Map(split.map((r) => [r.id, r]));
    setRows(current.map((r) => byId.get(r.id) ?? r));
    setDraft(Object.fromEntries(split.map((r) => [r.id, String(r.pct)])));
  };

  const resetAll = () => {
    setRows(null);
    setDraft({});
  };

  const commit = async () => {
    setSaving(true);
    setError('');
    try {
      // Written as a set: every changed share, or none. A half-applied
      // allocation is worse than the one it replaced.
      const changed = current.filter(
        (r) => (Number(members.find((m) => m.id === r.id)?.sharePct) || 0) !== r.pct,
      );
      for (const r of changed) {
        await setShare.mutateAsync({ id: r.id, pct: r.pct });
      }
      router.back();
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message} — some shares may not have saved. Re-open and check the total.`
          : 'Could not save the allocation',
      );
    } finally {
      setSaving(false);
      setConfirm(false);
    }
  };

  if (!identity) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <RequireSignIn />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title={
            <View>
              <Text variant="titleLarge" style={styles.bold} numberOfLines={1}>
                Estate allocation
              </Text>
              {!!group && (
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                  {group.name} ·{' '}
                  {group.landCount > 0
                    ? `${group.landCount} holding${group.landCount === 1 ? '' : 's'} · ${formatExtent(group.totalExtent, unitPref)}`
                    : 'No land yet'}
                </Text>
              )}
            </View>
          }
        />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {heirs.length === 0 && (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {current.length === 0
                  ? 'No members in this group yet — add someone before allocating shares.'
                  : 'No one else is in this group yet. Add the people who should inherit, then set their shares here.'}
              </Text>
            )}

            {/* The owner is the estate, not a claim on it. */}
            {!!self && heirs.length > 0 && (
              <View style={[styles.ownerNote, { backgroundColor: theme.colors.surfaceVariant }]}>
                <PersonAvatar name={self.name} photo={self.photo} size={32} />
                <Text variant="labelMedium" style={styles.grow}>
                  {self.name} (you) — the estate being divided. The owner is not an heir.
                </Text>
              </View>
            )}

            {/* Say what to do before anything has been entered, in place of an error. */}
            {untouched && heirs.length > 0 && (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Nothing allocated yet. Set each heir&apos;s share below, or use Split equally.
              </Text>
            )}

            {heirs.map((r) => (
              <View key={r.id} style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
                {/* CL-UX2: the name gets the full width. It used to share a row
                    with the steppers and the % field, so on the screen that
                    decides who inherits the land you could not read who the
                    heirs were — "Chintalapudi…", "Sankara Redd…". */}
                <View style={styles.nameRow}>
                  <PersonAvatar name={r.name} photo={r.photo} size={40} />
                  <View style={styles.grow}>
                    <Text variant="bodyMedium" style={styles.bold} numberOfLines={2}>
                      {r.name}
                    </Text>
                    {!!r.relation && (
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {sentenceCase(r.relation)}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.stepRow}>
                  <IconButton
                    icon="minus"
                    size={20}
                    mode="outlined"
                    style={styles.stepBtn}
                    accessibilityLabel={`Decrease ${r.name}'s share`}
                    onPress={() => setPct(r.id, stepPct(r.pct, -5))}
                  />
                  <TextInput
                    value={draft[r.id] ?? String(r.pct)}
                    onChangeText={(t) => typePct(r.id, t)}
                    keyboardType="decimal-pad"
                    mode="outlined"
                    dense
                    accessibilityLabel={`${r.name}'s share, percent`}
                    right={<TextInput.Affix text="%" />}
                    style={styles.pctInput}
                  />
                  <IconButton
                    icon="plus"
                    size={20}
                    mode="outlined"
                    style={styles.stepBtn}
                    accessibilityLabel={`Increase ${r.name}'s share`}
                    onPress={() => setPct(r.id, stepPct(r.pct, 5))}
                  />
                  {/* A percentage is abstract; the acres are not. The percent is
                      already in the field to the left, so repeating it here only
                      pushed the land — the part you cannot get from the field —
                      out to "27 Acres 65 C…". */}
                  <Text
                    variant="labelMedium"
                    style={[styles.grow, styles.landRight, { color: theme.colors.onSurfaceVariant }]}
                    numberOfLines={2}
                  >
                    {extentOf(r.pct) || '—'}
                  </Text>
                </View>
              </View>
            ))}

            {heirs.length > 0 && (
              <>
                <Divider />
                <View style={styles.totalRow}>
                  <Text variant="titleSmall" style={styles.grow}>
                    Total
                  </Text>
                  <Text
                    variant="titleMedium"
                    style={[
                      styles.bold,
                      { color: untouched ? theme.colors.onSurfaceVariant : total === 100 ? theme.colors.success : theme.colors.warning },
                    ]}
                  >
                    {total}% {total === 100 ? '✓' : ''}
                  </Text>
                </View>

                {/* Before the first edit there is nothing to warn about. */}
                {!untouched &&
                  warnings.map((w) => (
                    <HelperText key={w.kind} type={w.kind === 'total' ? 'error' : 'info'} visible>
                      {w.message}
                    </HelperText>
                  ))}

                <View style={styles.actions}>
                  <Button mode="outlined" compact onPress={() => applySplit(splitEqually)}>
                    Split equally
                  </Button>
                  <Button mode="outlined" compact onPress={() => applySplit(splitStatutory)}>
                    Statutory split
                  </Button>
                  <Button mode="text" compact disabled={!dirty} onPress={resetAll}>
                    Reset
                  </Button>
                </View>
                {/* Attached to the button it qualifies, not floating under all three. */}
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Statutory split follows the Hindu Succession Act default — spouse
                  and children share equally. Confirm with an advocate before relying
                  on it.
                </Text>
              </>
            )}

            {!!error && (
              <HelperText type="error" visible>
                {error}
              </HelperText>
            )}
          </ScrollView>

          <View style={[styles.saveBar, { backgroundColor: theme.colors.elevation.level2, borderTopColor: theme.colors.outlineVariant, paddingBottom: 12 + insets.bottom }]}>
            <Button mode="text" onPress={() => router.back()} disabled={saving}>
              Cancel
            </Button>
            <Button
              mode="contained"
              style={styles.grow}
              loading={saving}
              disabled={saving || !dirty}
              onPress={() => (warnings.length > 0 ? setConfirm(true) : commit())}
            >
              Save allocation
            </Button>
          </View>
        </>
      )}

      <SheetDialog
        visible={confirm}
        title="Save this allocation?"
        onDismiss={() => setConfirm(false)}
        actions={
          <>
            <Button onPress={() => setConfirm(false)}>Keep editing</Button>
            <Button mode="contained" loading={saving} disabled={saving} onPress={commit}>
              Save anyway
            </Button>
          </>
        }
      >
        <View style={styles.gap}>
            {warnings.map((w) => (
              <Text key={w.kind} variant="bodyMedium">
                • {w.message}
              </Text>
            ))}
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              This is recorded in the audit log and can be changed again at any time.
            </Text>
        </View>
      </SheetDialog>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 10, paddingBottom: 24 },
  grow: { flex: 1 },
  bold: { fontWeight: '700' },
  gap: { gap: 8 },
  ownerNote: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  /* 44pt targets: these change an heir's share of the whole estate. */
  stepBtn: { margin: 0, width: 44, height: 44 },
  landRight: { textAlign: 'right' },
  pctInput: { width: 92 },
  totalRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 4 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  saveBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderTopWidth: 1 },
});
