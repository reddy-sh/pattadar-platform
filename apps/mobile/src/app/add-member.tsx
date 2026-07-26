import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  HelperText,
  Menu,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMemberActions } from '@/data/hooks';
import { tokens } from '@pattadar/tokens';

const RELATIONS = ['spouse', 'son', 'daughter', 'father', 'mother', 'brother', 'sister', 'other'];

/** Add a family member — heirs get an invite link to share (web parity). */
export default function AddMemberScreen() {
  const theme = useTheme();
  const { groupId, groupName } = useLocalSearchParams<{ groupId: string; groupName?: string }>();
  const { addMember } = useMemberActions();

  const [name, setName] = useState('');
  const [relation, setRelation] = useState('other');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isHeir, setIsHeir] = useState(false);
  const [sharePct, setSharePct] = useState('');
  const [relMenu, setRelMenu] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setTried(true);
    setError('');
    if (!name.trim() || !groupId) return;
    if (isHeir && !phone.trim() && !email.trim()) {
      setError('An heir needs a phone or email for the verification invite.');
      return;
    }
    setSaving(true);
    try {
      const r = await addMember.mutateAsync({
        groupId,
        name: name.trim(),
        relation,
        phone: phone.trim(),
        email: email.trim(),
        isBeneficiary: isHeir,
        sharePct: isHeir ? Number(sharePct) || 0 : 0,
      });
      const saved = r.addMember;
      if (!saved) throw new Error('Could not add the member');
      if (isHeir && saved.inviteToken) {
        // Same share message the web builds for heir verification.
        await Share.share({
          message: `Hi ${name.trim()}, please verify your co-ownership on Pattadar: https://pattadar.com/verify/${saved.inviteToken}`,
        }).catch(() => undefined);
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={`Add member${groupName ? ` · ${groupName}` : ''}`} />
      </Appbar.Header>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TextInput
          label="Name *"
          value={name}
          onChangeText={setName}
          error={tried && !name.trim()}
          mode="outlined"
        />
        <Menu
          visible={relMenu}
          onDismiss={() => setRelMenu(false)}
          anchor={
            <TextInput
              label="Relation"
              value={relation.replace(/^\w/, (c) => c.toUpperCase())}
              mode="outlined"
              editable={false}
              right={<TextInput.Icon icon="menu-down" onPress={() => setRelMenu(true)} />}
              onPressIn={() => setRelMenu(true)}
            />
          }
        >
          {RELATIONS.map((r) => (
            <Menu.Item
              key={r}
              title={r.replace(/^\w/, (c) => c.toUpperCase())}
              onPress={() => {
                setRelation(r);
                setRelMenu(false);
              }}
            />
          ))}
        </Menu>
        <TextInput label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" mode="outlined" />
        <TextInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" mode="outlined" />
        <View style={styles.heirRow}>
          <View style={styles.grow}>
            <Text variant="bodyLarge">Legal heir (beneficiary)</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Heirs get a verification invite link to confirm co-ownership.
            </Text>
          </View>
          <Switch value={isHeir} onValueChange={setIsHeir} />
        </View>
        {isHeir && (
          <TextInput
            label="Share % of the estate"
            value={sharePct}
            onChangeText={setSharePct}
            keyboardType="decimal-pad"
            mode="outlined"
          />
        )}
        {!!error && (
          <HelperText type="error" visible>
            {error}
          </HelperText>
        )}
        <Button mode="contained" onPress={save} loading={saving} disabled={saving}>
          {isHeir ? 'Add heir & share invite' : 'Add member'}
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: tokens.spacing.lg, gap: tokens.spacing.md, paddingBottom: tokens.spacing.xxl },
  heirRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  grow: { flex: 1 },
});
