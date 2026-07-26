import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Banner,
  Button,
  Chip,
  Dialog,
  IconButton,
  List,
  Portal,
  Text,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGroups, useMemberActions } from '@/data/hooks';
import { formatArea } from '@pattadar/core';
import type { Member } from '@pattadar/core';
import { AppHeader } from '@/components/AppHeader';
import { tokens } from '@pattadar/tokens';

const GROUP_ICONS: Record<string, string> = {
  family: 'account-group',
  partnership: 'handshake',
  company: 'domain',
  huf: 'home-group',
  trust: 'shield-account',
};

/**
 * Web parity (familiesData.ts memberStatusChip, all five arms): verified→
 * Active, revoked→Revoked, invited-or-(pending+token)→Invited, pending→
 * Pending, else '—'. 'verified' is only ever set by the verify-token landing.
 */
function statusChip(m: Member): { label: string; tone: 'ok' | 'bad' | 'warn' | 'muted' } {
  if (m.status === 'verified') return { label: 'Active', tone: 'ok' };
  if (m.status === 'revoked') return { label: 'Revoked', tone: 'bad' };
  if (m.inviteStatus === 'invited' || (m.status === 'pending' && m.inviteToken))
    return { label: 'Invited', tone: 'warn' };
  if (m.status === 'pending') return { label: 'Pending', tone: 'muted' };
  return { label: '—', tone: 'muted' };
}

export default function FamilyScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const { data: result, isLoading, isRefetching } = useGroups();
  const [open, setOpen] = useState<string | null>(null);
  const { removeMember } = useMemberActions();
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);

  if (isLoading || !result) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  const { groups, members } = result.data;
  const statusColors = theme.dark ? tokens.status.dark : tokens.status.light;
  const toneColor = {
    ok: statusColors.good,
    bad: theme.colors.error,
    warn: statusColors.warning,
    muted: theme.colors.onSurfaceVariant,
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => qc.invalidateQueries({ queryKey: ['pattadar', 'groups'] })}
          />
        }
      >
        <AppHeader title="Family & groups" />
        {result.isSample && (
          <Banner visible icon="database-outline" style={styles.banner}>
            Showing sample data — the API is unreachable.
          </Banner>
        )}
        {groups.length === 0 && (
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            No groups yet — create one on the web app.
          </Text>
        )}
        {groups.map((g) => {
          const gm = members.filter((m) => m.groupId === g.id);
          const beneficiaries = gm.filter((m) => m.isBeneficiary);
          const totalShare = beneficiaries.reduce((s, m) => s + (Number(m.sharePct) || 0), 0);
          return (
            <List.Accordion
              key={g.id}
              expanded={open === g.id}
              onPress={() => setOpen(open === g.id ? null : g.id)}
              title={g.name}
              description={`${g.memberCount} members · ${g.landCount} holdings · ${formatArea(g.totalExtent)}`}
              left={(props) => (
                <List.Icon {...props} icon={GROUP_ICONS[g.type] ?? 'account-group'} />
              )}
              style={[styles.accordion, { backgroundColor: theme.colors.surface }]}
            >
              {gm.map((m) => {
                const chip = statusChip(m);
                return (
                  <List.Item
                    key={m.id}
                    title={`${m.name}${m.isSelf ? ' (you)' : ''}`}
                    description={[
                      m.relation,
                      m.role,
                      m.isBeneficiary ? `heir · ${m.sharePct}%` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    right={() => (
                      <View style={styles.memberRight}>
                        {chip.label !== '—' && (
                          <Chip
                            compact
                            mode="outlined"
                            textStyle={[styles.chipText, { color: toneColor[chip.tone] }]}
                          >
                            {chip.label}
                          </Chip>
                        )}
                        {!m.isSelf && (
                          <IconButton
                            icon="delete-outline"
                            size={18}
                            onPress={() => setConfirm({ id: m.id, name: m.name })}
                          />
                        )}
                      </View>
                    )}
                  />
                );
              })}
              {beneficiaries.length > 0 && (
                <Text
                  variant="bodySmall"
                  style={[
                    styles.shareLine,
                    { color: totalShare > 100 ? theme.colors.error : theme.colors.onSurfaceVariant },
                  ]}
                >
                  Heir shares total {totalShare}%{totalShare > 100 ? ' — over 100%' : ''}
                </Text>
              )}
              <Button
                mode="text"
                icon="account-plus-outline"
                style={styles.addMember}
                onPress={() =>
                  router.push({ pathname: '/add-member', params: { groupId: g.id, groupName: g.name } })
                }
              >
                Add member
              </Button>
            </List.Accordion>
          );
        })}
      </ScrollView>
      <Portal>
        <Dialog visible={confirm !== null} onDismiss={() => setConfirm(null)}>
          <Dialog.Title>Remove {confirm?.name}?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Removes this member from the group. Any pending invite link stops
              working.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirm(null)}>Cancel</Button>
            <Button
              textColor={theme.colors.error}
              loading={removeMember.isPending}
              disabled={removeMember.isPending}
              onPress={async () => {
                if (confirm) await removeMember.mutateAsync(confirm.id).catch(() => undefined);
                setConfirm(null);
              }}
            >
              Remove
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: tokens.spacing.lg, gap: tokens.spacing.sm, paddingBottom: tokens.spacing.xxl },
  heading: { fontWeight: '700' },
  banner: { borderRadius: tokens.radii.md },
  accordion: { borderRadius: tokens.radii.md },
  chipText: { fontSize: 11 },
  shareLine: { paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.sm },
  memberRight: { flexDirection: 'row', alignItems: 'center' },
  addMember: { alignSelf: 'flex-start', marginLeft: tokens.spacing.sm },
});
