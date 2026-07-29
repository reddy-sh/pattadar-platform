import { formatExtent } from '@pattadar/core';
import type { Member } from '@pattadar/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import {
  Avatar,
  Banner,
  Button,
  Chip,
  Dialog,
  Divider,
  Icon,
  IconButton,
  Menu,
  Portal,
  Searchbar,
  Snackbar,
  Text,
  TextInput,
} from 'react-native-paper';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddRow } from '@/components/AddRow';
import { EmptyState } from '@/components/EmptyState';
import { ErrorRetry } from '@/components/ErrorRetry';
import { PersonAvatar } from '@/components/PersonAvatar';
import { useAvatar } from '@/lib/avatar';
import { useListBottomInset } from '@/components/ListScaffold';
import { AppHeader } from '@/components/AppHeader';
import { StickyTitleBar } from '@/components/StickyTitleBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useGroups, useIdentity, useMemberActions } from '@/data/hooks';
import {
  avatarColor,
  displayName,
  initialsFor,
  memberCountLabel,
  pluralize,
  shareState,
  showShareWarning,
  heirCoverageNote,
  noHeirsWarning,
} from '@/lib/family';
import { useUnitPref } from '@/lib/units';
import { useAppTheme } from '@/theme/paper';
import { tokens } from '@pattadar/tokens';

const GROUP_META: Record<string, { icon: string; label: string }> = {
  family: { icon: 'account-group-outline', label: 'Family' },
  partnership: { icon: 'handshake-outline', label: 'Partnership' },
  company: { icon: 'domain', label: 'Company' },
  huf: { icon: 'home-group', label: 'HUF' },
  trust: { icon: 'shield-account-outline', label: 'Trust' },
};

export default function FamilyScreen() {
  const theme = useAppTheme();
  const qc = useQueryClient();
  const identity = useIdentity();
  const unitPref = useUnitPref();
  const bottomInset = useListBottomInset();
  // CL-407: the account photo, so the self row matches the app bar.
  const selfPhoto = useAvatar();
  const { data: result, isLoading, isRefetching, refetch } = useGroups();
  const { removeMember, createGroup, updateGroup, deleteGroup } = useMemberActions();
  const [explainerSeen, setExplainerSeen] = useState(true);
  useEffect(() => {
    SecureStore.getItemAsync('pattadar_family_explainer_seen')
      .then((v) => setExplainerSeen(!!v))
      .catch(() => undefined);
  }, []);
  const [groupMenu, setGroupMenu] = useState('');
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [confirmGroup, setConfirmGroup] = useState<{ id: string; name: string; members: number } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [confirm, setConfirm] = useState<Member | null>(null);
  const [note, setNote] = useState('');
  const [newGroup, setNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState('family');
  const [typeMenu, setTypeMenu] = useState(false);
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  // CL-80: expanded state persists across navigation.
  useEffect(() => {
    SecureStore.getItemAsync('pattadar_family_open')
      .then((v) => v && setOpen(JSON.parse(v)))
      .catch(() => undefined);
  }, []);
  const toggle = (id: string, currentOpen: boolean) => {
    const next = { ...open, [id]: !currentOpen };
    setOpen(next);
    SecureStore.setItemAsync('pattadar_family_open', JSON.stringify(next)).catch(() => undefined);
  };

  const allGroups = result?.data.groups ?? [];
  const members = result?.data.members ?? [];
  const q = search.trim().toLowerCase();
  const groups = q
    ? allGroups.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          members.some((m) => m.groupId === g.id && m.name.toLowerCase().includes(q)),
      )
    : allGroups;
  // CL-538/539: no groups at all — not "no groups matching the search".
  const noData = !isLoading && allGroups.length === 0;


  // The pinned bar needs the offset; nothing else does, so it stays on the UI
  // thread and never re-renders the list.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <StickyTitleBar
        title="Groups"
        scrollY={scrollY}
        menuItems={[
          { icon: 'account-multiple-plus-outline', label: 'Create group', onPress: () => setNewGroup(true) },
          { icon: 'account-plus-outline', label: 'Add member', onPress: () => router.push('/add-member') },
        ]}
      />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => qc.invalidateQueries({ queryKey: ['pattadar', 'groups'] })}
          />
        }
      >
        {/* CL-160: search earns its place only past a handful of groups */}
        <AppHeader
          title="Groups"
          onSearch={allGroups.length >= 5 ? () => setShowSearch((s) => !s) : undefined}
          menuItems={[
            { icon: 'account-multiple-plus-outline', label: 'Create group', onPress: () => setNewGroup(true) },
            { icon: 'account-plus-outline', label: 'Add member', onPress: () => router.push('/add-member') },
          ]}
        />
        {result?.isSample && (
          <OfflineBanner visible onRetry={() => qc.invalidateQueries({ queryKey: ['pattadar', 'groups'] })} />
        )}
        {showSearch && (
          <Searchbar
            placeholder="Search groups or members…"
            value={search}
            onChangeText={setSearch}
            autoFocus
            style={styles.search}
          />
        )}
        {/* CL-423/424: once, at screen level — not repeated in every card. */}
        {!explainerSeen && groups.length > 0 && (
          <View style={[styles.explainerCard, { borderColor: theme.colors.outlineVariant }]}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Members are recorded for succession or partnership. Each confirms via
              their invite link; editing stays with you as the group owner.
            </Text>
            <Button
              mode="text"
              compact
              style={styles.gotIt}
              onPress={() => {
                setExplainerSeen(true);
                SecureStore.setItemAsync('pattadar_family_explainer_seen', '1').catch(() => undefined);
              }}
            >
              Got it
            </Button>
          </View>
        )}
        {noData && (
          result?.isSample ? (
            <ErrorRetry onRetry={() => refetch()} />
          ) : (
            <EmptyState
              icon="account-multiple-outline"
              title="No groups yet"
              body="A group holds the people who share land with you — family or partners — and the shares each of them holds."
              primary={{ label: 'Create a group', icon: 'account-multiple-plus-outline', onPress: () => setNewGroup(true) }}
            />
          )
        )}
        {isLoading &&
          [0, 1].map((i) => (
            <View key={i} style={[styles.groupCard, { borderColor: theme.colors.outlineVariant }]}>
              <View style={styles.groupHeader}>
                <View style={[styles.skelLine, { backgroundColor: theme.colors.surfaceVariant, width: '55%' }]} />
              </View>
            </View>
          ))}
        {groups.map((g) => {
          const gm = members.filter((m) => m.groupId === g.id);
          const heirs = gm.filter((m) => m.isBeneficiary);
          const totalShare = heirs.reduce((s, m) => s + (Number(m.sharePct) || 0), 0);
          const share = shareState(totalShare);
          const meta = GROUP_META[g.type] ?? GROUP_META.family;
          const selfIn = gm.some((m) => m.isSelf);
          // CL-151: ≤3 groups auto-expand until the user chooses otherwise.
          const shareColor =
            share.tone === 'ok' ? theme.colors.success : share.tone === 'warn' ? theme.colors.warning : theme.colors.error;
          // CL-269: an unallocated warning on a group with no holdings is noise.
          const shareWarn = showShareWarning(heirs.length, share.tone, g.landCount);
          const isPartnershipGroup = g.type !== 'family' && g.type !== 'huf';
          const noHeirs = isPartnershipGroup ? null : noHeirsWarning(gm.length, heirs.length, g.landCount);
          return (
            /* CL-67: everything nests inside the group container */
            <View key={g.id} style={[styles.groupCard, { borderColor: theme.colors.outlineVariant }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${g.name}`}
                onPress={() => router.push({ pathname: '/group/[id]', params: { id: g.id } })}
                style={({ pressed }) => [styles.groupHeader, pressed && { opacity: 0.7 }]}
              >
                {/* Decorative — the row itself is the tap target; an IconButton
                    here had no onPress and announced as a dead VoiceOver button. */}
                <View style={styles.groupIcon}>
                  <Icon source={meta.icon} size={22} color={theme.colors.primary} />
                </View>
                <View style={styles.grow}>
                  {/* CL-153/154: single-line title; type moved to the metadata line */}
                  <Text variant="titleSmall" style={styles.bold} numberOfLines={1}>
                    {g.name}
                  </Text>
                  {/* CL-270: type renders for every group, consistently.
                      No onPress here — it used to navigate to /holdings on its
                      own, layered under the row's own tap target on the same
                      pixels. "View properties" in the overflow menu covers it. */}
                  <Text
                    variant="labelSmall"
                    style={{ color: theme.colors.onSurface }}
                    numberOfLines={1}
                  >
                    {[meta.label, memberCountLabel(gm.length, selfIn)].filter(Boolean).join(' · ')}
                  </Text>
                  {/* The extent used to ride on the end of that line and was cut
                      mid-word ("27 Acr…"). Its own row, and it cannot shrink. */}
                  <View style={styles.groupStats}>
                    <Icon source="map-marker-outline" size={12} color={theme.colors.onSurfaceVariant} />
                    <Text variant="labelSmall" numberOfLines={1} style={[styles.grow, { color: theme.colors.onSurfaceVariant }]}>
                      {g.landCount > 0 ? pluralize(g.landCount, 'property') : 'No land yet'}
                    </Text>
                    {g.landCount > 0 && (
                      <Text variant="labelSmall" style={[styles.bold, styles.noShrink, { color: theme.colors.onSurface }]}>
                        {formatExtent(g.totalExtent, unitPref)}
                      </Text>
                    )}
                  </View>
                </View>

                {/* CL-158: who's inside, at a glance */}
                {gm.length > 0 && (
                  <View style={styles.avatarStack}>
                    {gm.slice(0, 3).map((m, i) => (
                      <View key={m.id} style={i > 0 ? styles.avatarOverlap : undefined}>
                        <PersonAvatar name={m.name} photo={m.isSelf ? selfPhoto || m.photo : m.photo} size={24} border />
                      </View>
                    ))}
                    {gm.length > 3 && (
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {' '}+{gm.length - 3}
                      </Text>
                    )}
                  </View>
                )}
                {/* CL-159: group-level actions */}
                <Menu
                  visible={groupMenu === g.id}
                  onDismiss={() => setGroupMenu('')}
                  anchor={
                    <IconButton
                      icon="dots-vertical"
                      size={18}
                      style={styles.tight}
                      accessibilityLabel={`Actions for ${g.name}`}
                      onPress={() => setGroupMenu(g.id)}
                      hitSlop={8}
                    />
                  }
                >
                  <Menu.Item
                    leadingIcon="pencil-outline"
                    title="Rename…"
                    onPress={() => {
                      setGroupMenu('');
                      setRename({ id: g.id, name: g.name });
                    }}
                  />
                  {g.landCount > 0 && (
                    <Menu.Item
                      leadingIcon="map-marker-outline"
                      title="View properties"
                      onPress={() => {
                        setGroupMenu('');
                        router.push(`/holdings?q=${encodeURIComponent(g.name)}` as never);
                      }}
                    />
                  )}
                  <Menu.Item
                    leadingIcon="account-plus-outline"
                    title="Add member"
                    onPress={() => {
                      setGroupMenu('');
                      router.push({ pathname: '/add-member', params: { groupId: g.id, groupName: g.name } });
                    }}
                  />
                  <Menu.Item
                    leadingIcon="scale-balance"
                    title="Manage shares…"
                    onPress={() => {
                      setGroupMenu('');
                      router.push({ pathname: '/allocation', params: { groupId: g.id } });
                    }}
                  />
                  <Divider />
                  <Menu.Item
                    leadingIcon="delete-outline"
                    title="Delete group…"
                    onPress={() => {
                      setGroupMenu('');
                      setConfirmGroup({ id: g.id, name: g.name, members: gm.length });
                    }}
                  />
                </Menu>
                {/* Decorative — no onPress; same phantom-button issue as the group icon above. */}
                <Icon source="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
              </Pressable>
            </View>
          );
        })}
        {!noData && <AddRow label="Create group" onPress={() => setNewGroup(true)} />}
      </Animated.ScrollView>
      {focused && !!identity && (
        <Portal>
          <Dialog visible={confirm !== null} onDismiss={() => setConfirm(null)}>
            <Dialog.Title>Remove {displayName(confirm?.name ?? '')}?</Dialog.Title>
            <Dialog.Content>
              <Text variant="bodyMedium">
                {confirm?.isBeneficiary
                  ? `Their ${Number(confirm?.sharePct) || 0}% heir share and any pending invite are lost. The change is recorded in the audit log.`
                  : 'Any pending invite stops working. The change is recorded in the audit log.'}
              </Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setConfirm(null)}>Cancel</Button>
              <Button
                textColor={theme.colors.error}
                loading={removeMember.isPending}
                disabled={removeMember.isPending}
                onPress={async () => {
                  if (confirm) {
                    const nm = displayName(confirm.name);
                    await removeMember.mutateAsync(confirm.id).catch(() => undefined);
                    setNote(`${nm} removed. Re-add them from “Add member” if this was a mistake.`);
                  }
                  setConfirm(null);
                }}
              >
                Remove
              </Button>
            </Dialog.Actions>
          </Dialog>
          <Dialog visible={rename !== null} onDismiss={() => setRename(null)}>
            <Dialog.Title>Rename group</Dialog.Title>
            <Dialog.Content>
              <TextInput
                label="Group name"
                value={rename?.name ?? ''}
                onChangeText={(t) => setRename((r) => (r ? { ...r, name: t } : r))}
                mode="outlined"
              />
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setRename(null)}>Cancel</Button>
              <Button
                mode="contained"
                loading={updateGroup.isPending}
                disabled={updateGroup.isPending || !rename?.name.trim()}
                onPress={async () => {
                  if (rename) {
                    await updateGroup
                      .mutateAsync({ id: rename.id, name: rename.name.trim(), description: '' })
                      .catch(() => undefined);
                  }
                  setRename(null);
                }}
              >
                Save
              </Button>
            </Dialog.Actions>
          </Dialog>
          <Dialog visible={confirmGroup !== null} onDismiss={() => setConfirmGroup(null)}>
            <Dialog.Title>Delete {confirmGroup?.name}?</Dialog.Title>
            <Dialog.Content>
              <Text variant="bodyMedium">
                Removes the group and its {pluralize(confirmGroup?.members ?? 0, 'member record')}. Properties and
                passbooks are NOT deleted. This is recorded in the audit log.
              </Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setConfirmGroup(null)}>Cancel</Button>
              <Button
                textColor={theme.colors.error}
                loading={deleteGroup.isPending}
                disabled={deleteGroup.isPending}
                onPress={async () => {
                  if (confirmGroup) await deleteGroup.mutateAsync(confirmGroup.id).catch(() => undefined);
                  setConfirmGroup(null);
                }}
              >
                Delete
              </Button>
            </Dialog.Actions>
          </Dialog>
          <Dialog visible={newGroup} onDismiss={() => setNewGroup(false)}>
            <Dialog.Title>New group</Dialog.Title>
            <Dialog.Content style={styles.gap}>
              <TextInput label="Group name" value={groupName} onChangeText={setGroupName} mode="outlined" />
              <Menu
                visible={typeMenu}
                onDismiss={() => setTypeMenu(false)}
                anchor={
                  <TextInput
                    label="Type"
                    value={GROUP_META[groupType].label}
                    mode="outlined"
                    editable={false}
                    right={<TextInput.Icon icon="menu-down" onPress={() => setTypeMenu(true)} />}
                    onPressIn={() => setTypeMenu(true)}
                  />
                }
              >
                {Object.entries(GROUP_META).map(([k, v]) => (
                  <Menu.Item
                    key={k}
                    title={v.label}
                    onPress={() => {
                      setGroupType(k);
                      setTypeMenu(false);
                    }}
                  />
                ))}
              </Menu>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setNewGroup(false)}>Cancel</Button>
              <Button
                mode="contained"
                loading={createGroup.isPending}
                disabled={createGroup.isPending || !groupName.trim()}
                onPress={async () => {
                  await createGroup.mutateAsync({ type: groupType, name: groupName.trim() }).catch(() => undefined);
                  setGroupName('');
                  setNewGroup(false);
                }}
              >
                Create
              </Button>
            </Dialog.Actions>
          </Dialog>
          <Snackbar visible={!!note} onDismiss={() => setNote('')} duration={5000}>
            {note}
          </Snackbar>
        </Portal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: tokens.spacing.lg, gap: tokens.spacing.sm },
  search: { borderRadius: tokens.radii.md },
  groupCard: { borderRadius: tokens.radii.lg, borderWidth: 1, overflow: 'hidden' },
  // CL-156: uniform header height regardless of chips/avatars present.
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.xs,
  },
  avatarStack: { flexDirection: 'row', alignItems: 'center', marginRight: 2 },
  // Matches the fixed 40x40 leading slot used for holdings rows (CL-575) — the
  // IconButton it replaces had that same footprint by default.
  groupIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  explainerCard: { borderWidth: 1, borderRadius: tokens.radii.md, padding: tokens.spacing.md, gap: 4 },
  gotIt: { alignSelf: 'flex-end' },
  idIcon: { margin: 0, width: 16, height: 16 },
  avatarOverlap: { marginLeft: -8 },
  skelLine: { height: 14, borderRadius: 7, marginVertical: 12, marginLeft: 12 },
  groupBody: { paddingHorizontal: tokens.spacing.md, paddingBottom: tokens.spacing.sm, gap: tokens.spacing.xs },
  bold: { fontWeight: '700' },
  chipText: { fontSize: 11 },
  tight: { margin: 0 },
  grow: { flex: 1 },
  groupStats: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  noShrink: { flexShrink: 0 },
  gap: { gap: tokens.spacing.md },
  shareBox: { borderRadius: tokens.radii.md, paddingVertical: tokens.spacing.xs, paddingHorizontal: tokens.spacing.md },
  shareText: { textAlign: 'right' },
  addMember: { alignSelf: 'flex-start' },
  emptyBox: { marginTop: tokens.spacing.xxl, alignItems: 'center', gap: tokens.spacing.md },
});
