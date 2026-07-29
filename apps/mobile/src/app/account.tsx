import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Avatar, Button, Chip, Dialog, Divider, List, Portal, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useQueryClient } from '@tanstack/react-query';

import { apiBase, getIdentity, setApiBase, setIdentity } from '@/api/client';
import { setStorageBase, storageBase } from '@/api/storage';
import { useAvatar, useSetAvatar } from '@/lib/avatar';
import { choosePhotoSource, pickImage } from '@/lib/photoPicker';
import { PhotoField } from '@/components/PhotoField';
import { extractAadhaar } from '@/api/client';
import { useDocumentActions, useGroups, useMyAadhaar } from '@/data/hooks';
import { uploadToDrive } from '@/api/storage';
import { saveLocalCopy } from '@/lib/localFiles';
import { documentFileName } from '@pattadar/core';
import { aadhaarPrefill } from '@/lib/aadhaar';
import { authenticateForReveal, copySensitive } from '@/lib/secureReveal';
import { formatAadhaarMask, isoToDmy } from '@pattadar/core';

/** Local mirror of the server's mask, for the confirmation message only. */
const maskFromDigits = (d: string) => `XXXX-XXXX-${d.replace(/\D/g, '').slice(-4)}`;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : '');

/** Do two names share any meaningful token? Families share surnames, so a
 * complete absence of overlap is the signal that this is someone else. */
function sharesAnyName(a: string, b: string): boolean {
  const toks = (s: string) =>
    new Set(
      displayName(s)
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((t) => t.length > 2),
    );
  const A = toks(a);
  for (const t of toks(b)) if (A.has(t)) return true;
  return false;
}
import { useDashboard } from '@/data/hooks';
import { UNIT_LABELS, UNIT_OPTIONS, useSetUnitPref, useUnitPref } from '@/lib/units';
import { displayName } from '@/lib/family';
import { Linking } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0';
const BUILD_NO = String(Constants.expoConfig?.ios?.buildNumber ?? '1');
const DEV_USER = process.env.EXPO_PUBLIC_DEV_USER ?? '';

/** Account hub — the web app's full navigation, phone-shaped (Zoom pattern:
 * avatar opens everything). Working areas live in the tab bar; the rest are
 * listed here and light up as they ship. */
export default function AccountScreen() {
  const theme = useTheme();
  const { data } = useDashboard();
  const { data: groups } = useGroups();
  const qc = useQueryClient();
  const [urlDialog, setUrlDialog] = useState(false);
  const [url, setUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentStorage, setCurrentStorage] = useState('');
  const [storageUrl, setStorageUrl] = useState('');
  const avatar = useAvatar();
  const setAvatarFile = useSetAvatar();
  const [identity, setIdentityState] = useState('');
  const unitPref = useUnitPref();
  const setUnitPref = useSetUnitPref();
  const [unitDialog, setUnitDialog] = useState(false);
  // CL-317: raw endpoints are a debug tool, not a user-facing setting.
  const [debugTaps, setDebugTaps] = useState(0);
  const [signOutDialog, setSignOutDialog] = useState(false);
  const [note, setNote] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [revealedOnce, setRevealedOnce] = useState(false);
  const [review, setReview] = useState<{
    name: string; dob: string; gender: string; address: string; aadhaar: string;
    accept: Record<'name' | 'dob' | 'gender' | 'address' | 'aadhaar', boolean>;
  } | null>(null);
  const myAadhaar = useMyAadhaar();
  const { fileDocument } = useDocumentActions();
  const myMask = data?.data.me?.kycRefMasked ?? '';
  // The self member row carries the KYC detail; the account row shows it.
  const selfKyc = (groups?.data.members ?? []).find((m) => m.isSelf);

  /** Native chooser for the owner's own card. */
  const scanMyCard = async () => {
    const source = await choosePhotoSource({ allowFiles: true, title: 'Aadhaar card' });
    if (!source || source === 'remove') return;
    const picked = await pickImage(source);
    if (!picked) return;
    if ('error' in picked) {
      setNote(picked.error);
      return;
    }
    await readMyCard({ uri: picked.uri, fileName: picked.name, mimeType: picked.mimeType });
  };

  /** Read a card from any source and apply it to the owner's own record. */
  const readMyCard = async (a: { uri: string; fileName?: string | null; mimeType?: string | null }) => {
    try {
      setScanning(true);
      const fields = await extractAadhaar(a.uri, a.fileName ?? 'aadhaar.jpg', a.mimeType ?? 'image/jpeg');
      const p = aadhaarPrefill(fields as Record<string, string>);
      if (!p.aadhaar) {
        setNote(
          p.readAnything
            ? "The number wasn't clearly readable — try a sharper photo."
            : "That doesn't look like an Aadhaar card.",
        );
        return;
      }
      // CL-509: never bulk-apply. Show what was read and let each field be
      // accepted or skipped, with the current value shown where one exists.
      setReview({
        name: p.name,
        dob: p.dob,
        gender: p.gender,
        address: p.address,
        aadhaar: p.aadhaar,
        accept: {
          name: !!p.name,
          dob: !!p.dob,
          gender: !!p.gender,
          address: !!p.address,
          aadhaar: !!p.aadhaar,
        },
      });
      // Keep the card in Documents, then clear the picker's cache copy.
      try {
        const node = await uploadToDrive(a.uri, a.fileName ?? 'aadhaar.jpg', a.mimeType ?? 'image/jpeg').catch(
          () => null,
        );
        const filed = await fileDocument.mutateAsync({
          doc_type: 'Aadhaar',
          owner_name: p.name || data?.data.me?.name || 'Me',
          _fileRef: node?.id ?? '',
        });
        const docId = filed.createRegisteredDocument?.id;
        if (docId) {
          await saveLocalCopy(
            docId,
            a.uri,
            documentFileName({ docType: 'Aadhaar', ownerName: p.name || 'Me' }, a.fileName ?? 'aadhaar.jpg'),
          ).catch(() => undefined);
        }
      } catch {
        // The number is already read; failing to file the image must not undo it.
      }
      if (a.uri.startsWith(FileSystem.cacheDirectory ?? '###')) {
        await FileSystem.deleteAsync(a.uri, { idempotent: true }).catch(() => undefined);
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't read the card");
    } finally {
      setScanning(false);
    }
  };
  const showDebug = __DEV__ || debugTaps >= 7;
  useEffect(() => {
    getIdentity().then(setIdentityState).catch(() => undefined);
  }, []);
  useEffect(() => {
    apiBase().then(setCurrentUrl).catch(() => undefined);
    storageBase().then(setCurrentStorage).catch(() => undefined);
  }, [urlDialog]);
  // CL-319: the same humanised name the Family screen shows.
  const name = displayName(data?.data.me?.name || identity || '—');
  const initial = name.trim()[0]?.toUpperCase() ?? 'P';

  const soon = (t: string, d: string, icon: string) => (
    <List.Item key={t} title={t} description={d} left={(p) => <List.Icon {...p} icon={icon} />} />
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Account" />
      </Appbar.Header>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profile}>
          <PhotoField
            name={name}
            photo={avatar}
            size={72}
            onEdit={async () => {
              const source = await choosePhotoSource({ allowRemove: !!avatar, title: 'Profile photo' });
              if (!source) return;
              if (source === 'remove') {
                await setAvatarFile.mutateAsync('').catch(() => undefined);
                return;
              }
              const picked = await pickImage(source, { square: true });
              if (!picked) return;
              if ('error' in picked) {
                setNote(picked.error);
                return;
              }
              await setAvatarFile.mutateAsync(picked.uri).catch(() => setNote("Couldn't save that photo"));
            }}
          />
          <View style={styles.grow}>
            <Text variant="titleLarge" style={styles.name}>
              {name}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {identity || 'Not signed in'}
            </Text>
          </View>
        </View>
        <Divider />
        <List.Section>
          {/* CL-508: Cognito gives an email and a display name — Aadhaar is the
              only source of a legal name, DOB, gender and address for AP land
              records, so it belongs on the account, not only on members. */}
          <List.Subheader style={styles.subheader}>Your identity</List.Subheader>
          <List.Item
            style={styles.row}
            title="Aadhaar"
            descriptionNumberOfLines={4}
            description={
              myMask
                ? [
                    formatAadhaarMask(myMask),
                    // CL-509: the point of scanning is these fields — show them.
                    [selfKyc?.dob ? isoToDmy(selfKyc.dob) : '', selfKyc?.gender ? cap(selfKyc.gender) : '']
                      .filter(Boolean)
                      .join(' · '),
                    selfKyc?.presentAddress || '',
                  ]
                    .filter(Boolean)
                    .join('\n')
                : 'Not added — scan your card to fill your name, date of birth, gender and address'
            }
            left={(p) => <List.Icon {...p} icon="shield-account-outline" />}
            right={() =>
              myMask ? (
                <Button
                  mode="text"
                  compact
                  icon="content-copy"
                  loading={myAadhaar.reveal.isPending}
                  onPress={async () => {
                    if (!revealedOnce && !(await authenticateForReveal('Copy your Aadhaar number'))) return;
                    try {
                      const r = await myAadhaar.reveal.mutateAsync();
                      await copySensitive(r.revealMyAadhaar);
                      setRevealedOnce(true);
                      setNote('Aadhaar copied — the clipboard clears in a minute.');
                    } catch (e) {
                      setNote(e instanceof Error ? e.message : "Couldn't copy the number");
                    }
                  }}
                >
                  Copy
                </Button>
              ) : (
                <Button mode="text" compact icon="camera" onPress={scanMyCard}>
                  Add
                </Button>
              )
            }
            onPress={myMask ? undefined : scanMyCard}
          />
          {/* CL-545: scanning a relative's card used to be one-way — applyMyKyc
              writes only non-empty values, so every later submit preserved the
              wrong name. This is the way back. */}
          {!!myMask && (
            <List.Item
              style={styles.row}
              title="This isn't me"
              description="Remove this name, date of birth, address and Aadhaar from your account"
              titleStyle={{ color: theme.colors.error }}
              left={(p) => <List.Icon {...p} icon="account-remove-outline" color={theme.colors.error} />}
              onPress={() => setConfirmClear(true)}
            />
          )}
        </List.Section>
        <Divider />
        <List.Section>
          <List.Subheader style={styles.subheader}>Land</List.Subheader>
          <List.Item
            style={styles.row}
            title="Pattadar Assistant"
            description="Ask about your land, duty, documents"
            left={(p) => <List.Icon {...p} icon="shimmer" />}
            onPress={() => router.push('/assistant' as never)}
          />
          <List.Item
            style={styles.row}
            title="Documents"
            description="Upload, classify & file deeds"
            left={(p) => <List.Icon {...p} icon="file-document-outline" />}
            onPress={() => router.push('/documents' as never)}
          />
          {/* CL-322: a row that does nothing is worse than no row. Invitations
              is genuinely web-only today, so it says so AND opens the web. */}
          <List.Item
            style={styles.row}
            title="Invitations"
            description="Shares & verification invites · Web only"
            left={(p) => <List.Icon {...p} icon="email-outline" />}
            right={(p) => <List.Icon {...p} icon="open-in-new" />}
            onPress={() => Linking.openURL('https://pattadar.com/invitations').catch(() => undefined)}
          />
          <List.Item
            style={styles.row}
            title="Activity log"
            description="Every change, most recent first"
            left={(p) => <List.Icon {...p} icon="history" />}
            onPress={() => router.push('/activity' as never)}
          />
          {/* CL-323/324: Wallet and Tools were listing features that do not
              exist in any head — no financial model, no calculators. Listing
              them promises what we cannot deliver, so they are hidden until
              they ship rather than shown as permanent "soon" rows. */}
          <Divider />
          <List.Subheader style={styles.subheader}>App</List.Subheader>
          <List.Item
            style={styles.row}
            title="Units"
            description={UNIT_LABELS[unitPref]}
            left={(p) => <List.Icon {...p} icon="ruler-square" />}
            onPress={() => setUnitDialog(true)}
          />
          {soon('Appearance', 'Follows your device light/dark setting', 'theme-light-dark')}
          {/* CL-317: only in a debug build, or after 7 taps on Version. A
              release build never renders a raw endpoint. */}
          {/* Always reachable when NO address is configured: hiding the only
              way to set one behind seven taps strands the whole app. */}
          {(showDebug || !(currentUrl || API_URL)) && (
            <List.Item
              style={styles.row}
              title="Server connection"
              description={`API ${currentUrl || API_URL || 'not set'}`}
              descriptionNumberOfLines={1}
              left={(p) => <List.Icon {...p} icon="server-network-outline" />}
              onPress={() => {
                setUrl(currentUrl);
                setStorageUrl(currentStorage);
                setUrlDialog(true);
              }}
            />
          )}

          <Divider />
          <List.Subheader style={styles.subheader}>Your data</List.Subheader>
          {/* CL-326 */}
          <List.Item
            style={styles.row}
            title="Export your records"
            description="Complete-record PDF per parcel or passbook"
            left={(p) => <List.Icon {...p} icon="download-outline" />}
            right={() => (
              <Chip compact mode="outlined" textStyle={styles.soonChip}>
                Soon
              </Chip>
            )}
            onPress={() => setNote('Export is being built — it will produce the full record, N/A entries included.')}
          />
          <List.Item
            style={styles.row}
            title="Delete account"
            description="Permanently removes your records"
            titleStyle={{ color: theme.colors.error }}
            left={(p) => <List.Icon {...p} icon="account-remove-outline" color={theme.colors.error} />}
            onPress={() =>
              Linking.openURL('mailto:support@pattadar.com?subject=Delete%20my%20Pattadar%20account').catch(
                () => undefined,
              )
            }
          />

          <Divider />
          <List.Subheader style={styles.subheader}>Help & legal</List.Subheader>
          {/* CL-325 */}
          <List.Item
            style={styles.row}
            title="Help & support"
            description="support@pattadar.com"
            left={(p) => <List.Icon {...p} icon="help-circle-outline" />}
            onPress={() =>
              Linking.openURL('mailto:support@pattadar.com?subject=Pattadar%20app%20help').catch(() => undefined)
            }
          />
          <List.Item
            style={styles.row}
            title="Privacy policy"
            left={(p) => <List.Icon {...p} icon="shield-lock-outline" />}
            right={(p) => <List.Icon {...p} icon="open-in-new" />}
            onPress={() => Linking.openURL('https://pattadar.com/privacy').catch(() => undefined)}
          />
          <List.Item
            style={styles.row}
            title="Terms of use"
            left={(p) => <List.Icon {...p} icon="file-document-outline" />}
            right={(p) => <List.Icon {...p} icon="open-in-new" />}
            onPress={() => Linking.openURL('https://pattadar.com/terms').catch(() => undefined)}
          />
          {/* CL-320: no internal phase numbering; 7 taps reveal debug tools. */}
          <List.Item
            style={styles.row}
            title="Version"
            description={`Pattadar ${APP_VERSION} (build ${BUILD_NO})`}
            left={(p) => <List.Icon {...p} icon="information-outline" />}
            onPress={() => setDebugTaps((t) => t + 1)}
          />

          {/* CL-315: Sign out lives here now — the drawer is gone. */}
          <Divider />
          <List.Item
            style={styles.row}
            title={identity ? 'Sign out' : 'Sign in'}
            titleStyle={identity ? { color: theme.colors.error } : undefined}
            left={(p) => (
              <List.Icon {...p} icon={identity ? 'logout' : 'login'} color={identity ? theme.colors.error : undefined} />
            )}
            onPress={() => (identity ? setSignOutDialog(true) : router.push('/sign-in' as never))}
          />
        </List.Section>
      </ScrollView>
      <Portal>
        <Dialog visible={signOutDialog} onDismiss={() => setSignOutDialog(false)}>
          <Dialog.Title>Sign out?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">Your records stay safe on your account — sign back in anytime.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSignOutDialog(false)}>Cancel</Button>
            <Button
              textColor={theme.colors.error}
              onPress={async () => {
                setSignOutDialog(false);
                await setIdentity('');
                setIdentityState('');
                qc.invalidateQueries({ queryKey: ['pattadar'] });
                router.replace('/' as never);
              }}
            >
              Sign out
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={confirmClear} onDismiss={() => setConfirmClear(false)}>
          <Dialog.Title>Remove this identity?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Clears the name, date of birth, gender, address and Aadhaar from
              your account and from your entry in every group.
            </Text>
            <Text variant="bodyMedium" style={styles.clearKeep}>
              Your land, groups and documents are not touched — including the
              scanned card itself, which stays in Documents.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmClear(false)}>Cancel</Button>
            <Button
              textColor={theme.colors.error}
              loading={myAadhaar.clear.isPending}
              disabled={myAadhaar.clear.isPending}
              onPress={async () => {
                try {
                  await myAadhaar.clear.mutateAsync();
                  setNote('Identity removed. Scan your own card to add yours.');
                } catch (e) {
                  setNote(e instanceof Error ? e.message : "Couldn't remove it");
                }
                setConfirmClear(false);
              }}
            >
              Remove
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={review !== null} onDismiss={() => setReview(null)}>
          <Dialog.Title>Read from your Aadhaar</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.reviewBody}>
              {!!review?.name && !!data?.data.me?.name && !sharesAnyName(review.name, data.data.me.name) && (
                <Text variant="bodySmall" style={{ color: '#b45309' }}>
                  This card reads {review.name}, but your account is{' '}
                  {displayName(data.data.me.name)}. If this is a relative's card, add
                  them as a member instead — applying it here changes who this
                  account belongs to.
                </Text>
              )}
              {([
                ['name', 'Name', review?.name ?? '', data?.data.me?.name ?? ''],
                ['dob', 'Date of birth', review?.dob ? isoToDmy(review.dob) : '', ''],
                ['gender', 'Gender', review?.gender ?? '', ''],
                ['aadhaar', 'Aadhaar number', review?.aadhaar ?? '', myMask ? formatAadhaarMask(myMask) : ''],
                ['address', 'Address', review?.address ?? '', ''],
              ] as [keyof NonNullable<typeof review>['accept'], string, string, string][])
                .filter(([, , value]) => !!value)
                .map(([key, label, value, current]) => (
                  <View key={key} style={styles.reviewRow}>
                    <View style={styles.grow}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {label}
                      </Text>
                      {/* CL-509: show what it replaces, never overwrite blind */}
                      {!!current && current !== value && (
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          Current: {current}
                        </Text>
                      )}
                      <Text variant="bodyMedium">{value}</Text>
                    </View>
                    <Button
                      mode={review?.accept[key] ? 'contained-tonal' : 'outlined'}
                      compact
                      onPress={() =>
                        setReview((r) =>
                          r ? { ...r, accept: { ...r.accept, [key]: !r.accept[key] } } : r,
                        )
                      }
                    >
                      {review?.accept[key] ? 'Use' : 'Skip'}
                    </Button>
                  </View>
                ))}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setReview(null)}>Cancel</Button>
            <Button
              mode="contained"
              loading={myAadhaar.apply.isPending}
              disabled={myAadhaar.apply.isPending}
              onPress={async () => {
                if (!review) return;
                const pick = (k: keyof typeof review.accept, v: string) => (review.accept[k] ? v : '');
                try {
                  await myAadhaar.apply.mutateAsync({
                    name: pick('name', review.name),
                    dob: pick('dob', review.dob),
                    gender: pick('gender', review.gender),
                    address: pick('address', review.address),
                    aadhaar: pick('aadhaar', review.aadhaar),
                  });
                  setNote('Applied to your profile and your entry in every group.');
                } catch (e) {
                  setNote(e instanceof Error ? e.message : "Couldn't apply the details");
                }
                setReview(null);
              }}
            >
              Apply to my profile
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Snackbar visible={scanning} onDismiss={() => {}}>
          Reading your Aadhaar card…
        </Snackbar>
        <Snackbar visible={!!note} onDismiss={() => setNote('')} duration={4000}>
          {note}
        </Snackbar>
        <Dialog visible={unitDialog} onDismiss={() => setUnitDialog(false)}>
          <Dialog.Title>Land units</Dialog.Title>
          <Dialog.Content>
            {UNIT_OPTIONS.map((opt) => (
              <List.Item
                key={opt}
                title={UNIT_LABELS[opt]}
                left={(p) => (
                  <List.Icon {...p} icon={unitPref === opt ? 'radiobox-marked' : 'radiobox-blank'} />
                )}
                onPress={async () => {
                  await setUnitPref(opt);
                  setUnitDialog(false);
                }}
              />
            ))}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setUnitDialog(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={urlDialog} onDismiss={() => setUrlDialog(false)}>
          <Dialog.Title>Server URL</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="API base URL"
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://<tunnel-host> or http://<mac-ip>:8080"
              mode="outlined"
            />
            <TextInput
              label="File storage (gateway) URL"
              value={storageUrl}
              onChangeText={setStorageUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="same host unless storage is split out"
              mode="outlined"
              style={{ marginTop: 8 }}
            />
            <Text variant="bodySmall" style={{ marginTop: 8 }}>
              Paste the tunnel or bridge URL. Applies immediately — pull to
              refresh after saving. Clear it to use the built-in address.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setUrlDialog(false)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={async () => {
                await setApiBase(url);
                await setStorageBase(storageUrl);
                setCurrentUrl(url);
                setCurrentStorage(storageUrl);
                qc.invalidateQueries({ queryKey: ['pattadar'] });
                setUrlDialog(false);
              }}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // CL-349: two-line rows do not need 145pt.
  row: { paddingVertical: 2, minHeight: 64 },
  subheader: { fontWeight: '700' },
  soonChip: { fontSize: 11 },
  reviewBody: { gap: 12, paddingVertical: 8 },
  clearKeep: { marginTop: 8 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  safe: { flex: 1 },
  scroll: { paddingBottom: 32 },
  profile: { gap: 4, padding: 16 },
  grow: { flex: 1 },
  name: { fontWeight: '700' },
});
