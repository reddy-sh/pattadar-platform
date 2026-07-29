import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Divider, Icon, Text, useTheme } from 'react-native-paper';

import { importRegisteredDocument } from '@/api/client';
import { ensureNotificationPermission, notifyIfAway } from '@/lib/notify';

/** What the reader produced, for the caller to show above the form. */
export interface ReadResult {
  summary: string;
  caveats: string[];
}

/**
 * The file that was read, handed back to the caller.
 *
 * The card used to keep this to itself, so a property created from a scanned
 * deed had no way to KEEP the deed: the record was saved, the file was
 * discarded, and the holding then reported "No documents attached yet" about
 * the document it was made from. The caller needs the file to file it.
 */
export interface ScannedFile {
  uri: string;
  name: string;
  mime: string;
}

/**
 * Reading the paper is the point; typing is the fallback — and a fallback is
 * only a fallback if it stays out of the way until it is needed.
 *
 * The form used to sit permanently below this card, which quietly made
 * hand-entry an equal option and pushed the scan buttons into a crowded
 * screen. Now the screen has three states, which is what every scan-first flow
 * (bank cheque deposit, Stripe Identity, passport readers) converges on:
 *
 *   idle    — the scan is the screen. Manual entry is one quiet text link.
 *   reading — progress, and permission to walk away.
 *   failed  — the scan collapses to a single retry button, the reason is
 *             stated in plain words, and the form opens automatically. When
 *             the automatic path breaks, the manual path must already be
 *             in front of you, not behind another tap.
 *
 * On success the summary of what was read is shown before the fields, so the
 * check is "is this the right document?" rather than "are these 26 fields
 * right?".
 */
export function ScanFirstCard({
  title,
  body,
  onFields,
  manualOpen,
  onManualOpenChange,
}: {
  title: string;
  body: string;
  /**
   * Called with the extracted deed fields (snake_case, as the API returns) and
   * the file they were read from, so the caller can file the document itself.
   */
  onFields: (fields: Record<string, unknown>, file: ScannedFile) => void;
  /** Whether the caller is currently showing the hand-entry form. */
  manualOpen: boolean;
  onManualOpenChange: (open: boolean) => void;
}) {
  const theme = useTheme();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [sentPct, setSentPct] = useState(-1);
  const [result, setResult] = useState<ReadResult | null>(null);

  const run = async (uri: string, name: string, mime: string) => {
    setError('');
    setResult(null);
    setReading(true);
    setSentPct(-1);
    // Asked here, as the wait begins — the one moment it is obviously useful.
    ensureNotificationPermission().catch(() => undefined);
    // An honest counter, not a fake progress narrative on a timer.
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    try {
      const fields = await importRegisteredDocument(uri, name, mime, ({ sent, total }) =>
        setSentPct(total > 0 ? Math.round((sent / total) * 100) : -1),
      );
      const summary = String(fields.summary ?? '').trim();
      const caveats = Array.isArray(fields.caveats)
        ? (fields.caveats as unknown[]).map((c) => String(c)).filter(Boolean)
        : [];
      setResult({ summary, caveats });
      onFields(fields, { uri, name, mime });
      onManualOpenChange(true); // the filled form is the next thing to check
      await notifyIfAway(
        'Deed read',
        summary ? summary.split('. ')[0] : `${name} was read — check the details.`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not read that document';
      setError(msg);
      // The automatic path failed, so the manual one stops being optional.
      onManualOpenChange(true);
      await notifyIfAway('Couldn’t read the deed', msg);
    } finally {
      clearInterval(tick);
      setElapsed(0);
      setSentPct(-1);
      setReading(false);
    }
  };

  const fromPicker = async (pick: () => Promise<ImagePicker.ImagePickerResult>) => {
    try {
      const res = await pick();
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      await run(a.uri, a.fileName ?? 'deed.jpg', a.mimeType ?? 'image/jpeg');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the picker');
      onManualOpenChange(true);
    }
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      await run(a.uri, a.name, a.mimeType ?? 'application/pdf');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the file picker');
      onManualOpenChange(true);
    }
  };

  // After a failure the scan shrinks to one retry control. It has just proved
  // it does not work for this document; giving it three big buttons again
  // would be arguing with the person.
  const collapsed = !!error && !reading;

  return (
    <>
      <Card mode="contained">
        <Card.Content style={styles.box}>
          {collapsed ? (
            <>
              <View style={styles.errorHead}>
                <Icon source="alert-circle-outline" size={18} color={theme.colors.error} />
                <Text variant="titleSmall" style={[styles.grow, { color: theme.colors.error }]}>
                  The deed couldn’t be read
                </Text>
              </View>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {error}
              </Text>
              <Button
                mode="text"
                icon="refresh"
                compact
                onPress={() => {
                  setError('');
                  setResult(null);
                }}
              >
                Try scanning again
              </Button>
            </>
          ) : (
            <>
              <Text variant="titleSmall">📄 {title}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {body}
              </Text>
              <View style={styles.buttons}>
                <Button
                  mode="contained-tonal"
                  icon="camera"
                  disabled={reading}
                  onPress={() =>
                    fromPicker(async () => {
                      const perm = await ImagePicker.requestCameraPermissionsAsync();
                      if (!perm.granted)
                        throw new Error('Camera permission denied — enable it in Settings.');
                      return ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8 });
                    })
                  }
                >
                  Camera
                </Button>
                <Button
                  mode="contained-tonal"
                  icon="image"
                  disabled={reading}
                  onPress={() =>
                    fromPicker(() =>
                      ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 }),
                    )
                  }
                >
                  Photos
                </Button>
                <Button mode="contained-tonal" icon="file-pdf-box" disabled={reading} onPress={pickFile}>
                  Files
                </Button>
              </View>
              {reading && (
                <View style={styles.reading}>
                  <ActivityIndicator size="small" />
                  <View style={styles.grow}>
                    {/* Two genuinely different waits that fail differently:
                        sending is the phone's network, reading is the model. */}
                    <Text variant="bodyMedium">
                      {sentPct >= 0 && sentPct < 100
                        ? `Sending the deed… ${sentPct}%`
                        : `Reading the deed… ${elapsed}s`}
                    </Text>
                    {elapsed > 8 && (
                      // Permission to leave, which is the useful thing to say
                      // at 30 seconds — and now true, because we notify.
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        This usually takes under a minute. You can leave the app — we’ll tell you
                        when it’s done.
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </>
          )}
        </Card.Content>
      </Card>

      {/* What was read, in words, before any field is checked. */}
      {!!result?.summary && (
        <Card mode="outlined" style={styles.summaryCard}>
          <Card.Content style={styles.box}>
            <View style={styles.errorHead}>
              <Icon source="text-search" size={18} color={theme.colors.primary} />
              <Text variant="titleSmall" style={styles.grow}>
                What this document says
              </Text>
            </View>
            <Text variant="bodyMedium">{result.summary}</Text>
            {result.caveats.length > 0 && (
              <View style={[styles.caveats, { backgroundColor: theme.colors.surfaceVariant }]}>
                <Text variant="labelLarge">Worth checking yourself</Text>
                {result.caveats.map((c) => (
                  <Text key={c} variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    •  {c}
                  </Text>
                ))}
              </View>
            )}
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Read by AI from the file you gave — check it against the paper before saving.
            </Text>
          </Card.Content>
        </Card>
      )}

      {manualOpen ? (
        <View style={styles.orRow}>
          <Divider style={styles.rule} />
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {result ? 'check and correct' : 'enter by hand'}
          </Text>
          <Divider style={styles.rule} />
        </View>
      ) : (
        // One quiet link, not a second primary action competing with the scan.
        <Button mode="text" onPress={() => onManualOpenChange(true)}>
          Enter the details by hand instead
        </Button>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  grow: { flex: 1 },
  errorHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryCard: { borderRadius: 12, marginTop: 8 },
  caveats: { borderRadius: 10, padding: 10, gap: 4 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  rule: { flex: 1 },
});
