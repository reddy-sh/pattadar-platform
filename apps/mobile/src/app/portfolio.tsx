import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Appbar, List, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDashboard } from '@/data/hooks';

/** CL-4: the long tail of stats lives here, one tap from Home's "View all". */
export default function PortfolioScreen() {
  const theme = useTheme();
  const { data } = useDashboard();
  const d = data?.data;
  const rows: { label: string; value: string; icon: string; href?: string }[] = [
    { label: 'Parcels', value: String(d?.stats.totalParcels ?? 0), icon: 'map-outline', href: '/holdings' },
    { label: 'Passbooks', value: String(d?.stats.totalPassbooks ?? 0), icon: 'notebook-outline', href: '/passbooks' },
    { label: 'Properties', value: String(d?.properties.length ?? 0), icon: 'home-city-outline', href: '/holdings' },
    { label: 'Documents', value: String(d?.stats.totalDocuments ?? 0), icon: 'file-document-outline', href: '/documents' },
    { label: 'Groups', value: String(d?.stats.totalGroups ?? 0), icon: 'account-group-outline', href: '/family' },
    { label: 'Beneficiaries', value: String(d?.stats.totalBeneficiaries ?? 0), icon: 'account-heart-outline', href: '/family' },
    { label: 'Pending invitations', value: String(d?.stats.pendingInvitations ?? 0), icon: 'email-outline' },
  ];
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Portfolio details" />
      </Appbar.Header>
      <List.Section>
        {rows.map((r) => (
          <List.Item
            key={r.label}
            title={r.label}
            description={r.value}
            left={(p) => <List.Icon {...p} icon={r.icon} />}
            right={(p) => (r.href ? <List.Icon {...p} icon="chevron-right" /> : null)}
            onPress={r.href ? () => router.push(r.href as never) : undefined}
          />
        ))}
      </List.Section>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1 } });
