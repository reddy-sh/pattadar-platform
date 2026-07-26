import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Banner,
  Button,
  Card,
  Chip,
  Dialog,
  Portal,
  Text,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useInvitationActions, useInvitations } from '@/data/hooks';
import { parseISOToDisplay } from '@pattadar/core';
import type { Invitation } from '@pattadar/core';
import { tokens } from '@pattadar/tokens';

/** Web parity chips: pending=warning, accepted=success, revoked=error, expired=muted. */
function statusColor(
  status: string,
  dark: boolean,
  colors: { error: string; onSurfaceVariant: string },
): string {
  const s = dark ? tokens.status.dark : tokens.status.light;
  if (status === 'accepted') return s.good;
  if (status === 'revoked') return colors.error;
  if (status === 'expired') return colors.onSurfaceVariant;
  return s.warning; // pending + unknown fall back to pending
}

export default function InvitationsScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const { data: result, isLoading, isRefetching } = useInvitations();
  const { setStatus, remove } = useInvitationActions();
  const [confirmDelete, setConfirmDelete] = useState<Invitation | null>(null);

  const invitations = result?.data ?? [];
  const pendingCount = invitations.filter((i) => i.status === 'pending').length;
  const busy = setStatus.isPending || remove.isPending;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.heading}>
          Invitations
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {pendingCount} pending
        </Text>
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
          data={invitations}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => qc.invalidateQueries({ queryKey: ['pattadar', 'invitations'] })}
            />
          }
          ListEmptyComponent={
            <Text variant="bodyMedium" style={styles.empty}>
              No invitations.
            </Text>
          }
          renderItem={({ item: inv }) => (
            <Card mode="outlined" style={styles.card}>
              <Card.Content style={styles.cardContent}>
                <View style={styles.row}>
                  <Text variant="titleSmall" style={styles.grow} numberOfLines={1}>
                    {inv.inviteeContact || '—'}
                  </Text>
                  <Chip
                    compact
                    mode="outlined"
                    textStyle={[
                      styles.chipText,
                      { color: statusColor(inv.status, theme.dark, theme.colors) },
                    ]}
                  >
                    {inv.status}
                  </Chip>
                </View>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {inv.scopeType} · {inv.role} · expires {inv.expiry ? parseISOToDisplay(inv.expiry) : '—'}
                </Text>
              </Card.Content>
              {!result?.isSample && (
                <Card.Actions>
                  {inv.status === 'pending' && (
                    <Button
                      compact
                      mode="text"
                      disabled={busy}
                      onPress={() => setStatus.mutate({ id: inv.id, status: 'accepted' })}
                    >
                      Accept
                    </Button>
                  )}
                  {(inv.status === 'pending' || inv.status === 'accepted') && (
                    <Button
                      compact
                      mode="text"
                      disabled={busy}
                      onPress={() => setStatus.mutate({ id: inv.id, status: 'revoked' })}
                    >
                      Revoke
                    </Button>
                  )}
                  <Button
                    compact
                    mode="text"
                    disabled={busy}
                    textColor={theme.colors.error}
                    onPress={() => setConfirmDelete(inv)}
                  >
                    Delete
                  </Button>
                </Card.Actions>
              )}
            </Card>
          )}
        />
      )}
      <Portal>
        <Dialog visible={confirmDelete !== null} onDismiss={() => setConfirmDelete(null)}>
          <Dialog.Title>Delete invitation?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              This removes the invitation for {confirmDelete?.inviteeContact || 'this contact'}.
              The link stops working.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              textColor={theme.colors.error}
              onPress={() => {
                if (confirmDelete) remove.mutate(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
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
  header: {
    padding: tokens.spacing.lg,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  heading: { fontWeight: '700' },
  list: { paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.xl, gap: tokens.spacing.sm },
  card: { borderRadius: tokens.radii.lg },
  cardContent: { gap: tokens.spacing.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  grow: { flex: 1 },
  chipText: { fontSize: 11, textTransform: 'capitalize' },
  empty: { textAlign: 'center', marginTop: tokens.spacing.xxl },
});
