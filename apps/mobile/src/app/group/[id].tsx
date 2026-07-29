import { formatExtent, type Member } from '@pattadar/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Dialog,
  Divider,
  Icon,
  IconButton,
  List,
  Portal,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PersonAvatar } from '@/components/PersonAvatar';
import { useGroups, useMemberActions } from '@/data/hooks';
import { useAvatar } from '@/lib/avatar';
import { displayName, memberCountLabel, pluralize, relationLine, shareState } from '@/lib/family';
import { ageFromDob, memberState } from '@/lib/memberStatus';
import { useUnitPref } from '@/lib/units';

/**
 * One group, on its own screen.
 *
 * The list used to expand each group inline, which meant the card had to carry
 * the name, type, member count, property count AND extent on two lines — the
 * acreage was cut mid-word at "27 Acr…". A group has more to say than a row can
 * hold, so the row says what fits and this screen says the rest.
 */
export default function GroupDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: result, isLoading } = useGroups();
  const unitPref = useUnitPref();
  const selfPhoto = useAvatar();

  const group = result?.data.groups.find((g) => g.id === id);
  const members = (result?.data.members ?? []).filter((m) => m.groupId === id);
  const heirs = members.filter((m) => m.isBeneficiary);
  const totalShare = heirs.reduce((s, m) => s + (Number(m.sharePct) || 0), 0);
  const share = shareState(totalShare);
  const selfIn = members.some((m) => m.isSelf);
  const { removeMember } = useMemberActions();
  const [confirm, setConfirm] = useState<Member | null>(null);
  const [note, setNote] = useState('');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={group?.name || 'Group'} />
      </Appbar.Header>
      {isLoading && !group ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : !group ? (
        <View style={styles.center}>
          <Text variant="bodyMedium">This group is no longer available.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Card mode="outlined" style={styles.card}>
            <Card.Content style={styles.gap}>
              {/* Each figure on its own line, so none of them competes for
                  width with the others. */}
              <View style={styles.statRow}>
                <Icon source="account-multiple-outline" size={16} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodyMedium" style={styles.grow}>
                  {memberCountLabel(members.length, selfIn)}
                </Text>
              </View>
              <View style={styles.statRow}>
                <Icon source="map-marker-outline" size={16} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodyMedium" style={styles.grow}>
                  {group.landCount > 0 ? pluralize(group.landCount, 'property') : 'No land yet'}
                </Text>
                {group.landCount > 0 && (
                  <Text variant="bodyMedium" style={[styles.bold, styles.noShrink]}>
                    {formatExtent(group.totalExtent, unitPref)}
                  </Text>
                )}
              </View>
              {/* Home calls this the single most urgent thing in the app. It
                  used to appear on the Groups list as grey body text reading
                  "Succession: not set" with no chevron and no control — the one
                  thing said to be most urgent, with nothing to press. */}
              {group.landCount > 0 && heirs.length === 0 && (
                <View style={[styles.warnBox, { backgroundColor: theme.colors.errorContainer }]}>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onErrorContainer }}>
                    This group holds land but no heirs are recorded. If nothing is set, the land has no
                    stated succession.
                  </Text>
                  <Button
                    mode="contained"
                    icon="scale-balance"
                    onPress={() => router.push({ pathname: '/allocation', params: { groupId: group.id } })}
                  >
                    Set succession
                  </Button>
                </View>
              )}
              {heirs.length > 0 && (
                <View style={styles.statRow}>
                  <Icon source="scale-balance" size={16} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodyMedium" style={styles.grow}>
                    {pluralize(heirs.length, 'heir')}
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={[
                      styles.bold,
                      styles.noShrink,
                      { color: share.tone === 'ok' ? '#2e7d32' : share.tone === 'warn' ? '#b45309' : theme.colors.error },
                    ]}
                  >
                    {totalShare}% allocated
                  </Text>
                </View>
              )}
            </Card.Content>
          </Card>

          {group.landCount > 0 && (
            <Button
              mode="contained-tonal"
              icon="map-marker-outline"
              onPress={() => router.push(`/holdings?q=${encodeURIComponent(group.name)}` as never)}
            >
              View this group’s land
            </Button>
          )}
          <Button
            mode="contained-tonal"
            icon="scale-balance"
            onPress={() => router.push({ pathname: '/allocation', params: { groupId: group.id } })}
          >
            Estate allocation
          </Button>

          <Text variant="titleSmall" style={styles.sectionTitle}>
            Members
          </Text>
          <Card mode="outlined" style={styles.card}>
            {members.map((m, i) => {
              const state = memberState({
                isSelf: m.isSelf,
                status: m.status,
                inviteStatus: m.inviteStatus,
                inviteToken: m.inviteToken,
                dob: m.dob,
                phone: m.phone,
                phoneVerified: m.phoneVerified,
              });
              const age = ageFromDob(m.dob);
              return (
                <View key={m.id}>
                  {i > 0 && <Divider />}
                  <List.Item
                    title={`${displayName(m.name)}${m.isSelf ? ' (you)' : ''}`}
                    description={[
                      m.isSelf ? 'You' : relationLine(m.relation, m.role === 'Member' ? '' : m.role),
                      age !== null ? `${age} yrs` : '',
                      m.isSelf ? 'Owner' : state.label,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    left={() => (
                      <PersonAvatar
                        name={m.name}
                        photo={m.isSelf ? selfPhoto || m.photo : m.photo}
                        size={36}
                      />
                    )}
                    right={() => (
                      <View style={styles.rightRow}>
                        {/* The share was a label; tapping it now goes where the
                            share is actually changed. */}
                        {m.isBeneficiary && (
                          <Button
                            mode="text"
                            compact
                            onPress={() =>
                              router.push({ pathname: '/allocation', params: { groupId: group.id } })
                            }
                          >
                            {`${Number(m.sharePct) || 0}%`}
                          </Button>
                        )}
                        {/* Removing a member had no control anywhere on this
                            screen — the handler existed and was never reachable. */}
                        {!m.isSelf && (
                          <IconButton
                            icon="account-remove-outline"
                            size={18}
                            accessibilityLabel={`Remove ${displayName(m.name)}`}
                            onPress={() => setConfirm(m)}
                          />
                        )}
                      </View>
                    )}
                    onPress={() =>
                      m.isSelf
                        ? router.push('/account' as never)
                        : router.push({ pathname: '/add-member', params: { id: m.id, groupId: group.id } })
                    }
                  />
                </View>
              );
            })}
          </Card>
          <Button
            mode="text"
            icon="account-plus-outline"
            onPress={() => router.push({ pathname: '/add-member', params: { groupId: group.id } })}
          >
            Add member
          </Button>
        </ScrollView>
      )}
      <Portal>
        <Dialog visible={confirm !== null} onDismiss={() => setConfirm(null)}>
          <Dialog.Title>Remove {displayName(confirm?.name ?? '')}?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {confirm?.isBeneficiary
                ? `Their ${Number(confirm?.sharePct) || 0}% share and any pending invite are lost. The change is recorded in the audit log.`
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
                const target = confirm;
                setConfirm(null);
                if (!target) return;
                try {
                  await removeMember.mutateAsync(target.id);
                  setNote(`${displayName(target.name)} removed`);
                } catch (e) {
                  setNote(e instanceof Error ? e.message : "Couldn't remove them");
                }
              }}
            >
              Remove
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Snackbar visible={!!note} onDismiss={() => setNote('')} duration={3500}>
          {note}
        </Snackbar>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { borderRadius: 12 },
  gap: { gap: 10 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1, flexShrink: 1 },
  noShrink: { flexShrink: 0 },
  bold: { fontWeight: '700' },
  sectionTitle: { marginTop: 4 },
  sharePct: { alignSelf: 'center', fontWeight: '700' },
  rightRow: { flexDirection: 'row', alignItems: 'center' },
  warnBox: { borderRadius: 10, padding: 12, gap: 10, alignItems: 'flex-start' },
});
