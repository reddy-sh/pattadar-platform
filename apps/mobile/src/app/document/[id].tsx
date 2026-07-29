import { formatDateTime, parseAuditTime } from '@pattadar/core';
import * as FileSystem from 'expo-file-system/legacy';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Divider,
  Icon,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDocumentActions, useDocuments } from '@/data/hooks';
import { getLocalFiles, type LocalFile } from '@/lib/localFiles';

/** ₹1,91,000 — Indian grouping, which is how the deed itself writes it. */
function rupees(n: number): string {
  if (!n) return '';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/**
 * One document, and what we understood it to say.
 *
 * Tapping a document used to open the raw PDF immediately — which answers
 * "what does this file look like?" but not "what is this document?". A
 * fourteen-page bilingual deed is not something anyone reads on a phone to
 * find out whose land it is.
 *
 * So the summary comes first, at a size meant for reading rather than
 * skimming, the extracted facts sit under it for checking, and the file itself
 * is one tap away for when the paper is what you actually need. The summary is
 * a column on this document's own row, so it cannot outlive the document — and
 * deleting the property takes the document, and with it this page.
 */
export default function DocumentDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useDocuments();
  const { deleteRegistered } = useDocumentActions();
  const [localFiles, setLocalFiles] = useState<Record<string, LocalFile>>({});
  const [toast, setToast] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    getLocalFiles().then(setLocalFiles).catch(() => undefined);
  }, []);

  const doc = (data?.data.registered ?? []).find((r) => r.id === id);
  const local = localFiles[String(id)];
  const caveats = doc?.caveatList ?? [];
  const keyPoints = doc?.keyPointList ?? [];
  /**
   * The model is asked for blank-line separated paragraphs. Older documents and
   * the occasional stubborn reply come back as one block; splitting on blank
   * lines and falling back to the whole string keeps both readable.
   */
  const paragraphs = (doc?.summary ?? '')
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean);

  const title = [doc?.docType, doc?.documentNo && `No. ${doc.documentNo}`, doc?.regYear]
    .filter(Boolean)
    .join(' · ');

  const openFile = () => {
    if (doc?.fileRef) {
      router.push({
        pathname: '/viewer',
        params: { nodeId: doc.fileRef, name: `${doc.docType || 'document'}.pdf` },
      });
    } else if (local) {
      router.push({
        pathname: '/viewer',
        params: {
          local: `${FileSystem.documentDirectory}${local.file}`,
          name: local.file,
        },
      });
    } else {
      setToast('No file is stored for this document — only what was read from it.');
    }
  };

  /** The facts, each on its own line so none competes for width. */
  const facts: [string, string][] = doc
    ? ([
        ['Registered', doc.registrationDate || ''],
        ['Sub-registrar', doc.sro || ''],
        ['Village', doc.village || ''],
        ['District', doc.district || ''],
        ['Survey number', doc.surveyNo || ''],
        ['Plot number', doc.plotNo || ''],
        ['Extent', doc.extent || ''],
        ['Consideration', rupees(Number(doc.consideration) || 0)],
      ].filter(([, v]) => !!v) as [string, string][])
    : [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={doc?.docType || 'Document'} subtitle={doc?.ref} />
        {!!doc && (
          <Appbar.Action
            icon="share-variant-outline"
            accessibilityLabel="Share what this document says"
            onPress={() =>
              Share.share({
                message: [
                  doc.headline || title,
                  '',
                  ...(doc.keyPointList ?? []).map((k) => `• ${k}`),
                  (doc.keyPointList ?? []).length ? '' : undefined,
                  doc.summary || '',
                  '',
                  `Read by AI from the filed document — check against the paper.`,
                  `Pattadar · ${doc.ref}`,
                ]
                  .filter((l) => l !== undefined)
                  .join('\n'),
              }).catch(() => undefined)
            }
          />
        )}
      </Appbar.Header>

      {isLoading && !doc ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : !doc ? (
        <View style={styles.center}>
          <Text variant="bodyMedium">This document is no longer available.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {!!title && (
            <Text variant="labelSmall" style={[styles.kicker, { color: theme.colors.onSurfaceVariant }]}>
              {title.toUpperCase()}
            </Text>
          )}

          {/*
            Written and laid out like a news story, because that is how it is
            actually read: nobody studies this page, they scan it. Headline
            first, then the facts as bullets, then the prose — inverted pyramid,
            most important thing first, short paragraphs throughout. A single
            seven-line block of legal narrative is the thing this replaces.
          */}
          {doc.summary || doc.headline ? (
            <>
              {!!doc.headline && (
                <Text variant="headlineSmall" style={styles.headline}>
                  {doc.headline}
                </Text>
              )}

              {keyPoints.length > 0 && (
                <View style={[styles.keyPoints, { borderLeftColor: theme.colors.primary }]}>
                  {keyPoints.map((k) => (
                    <View key={k} style={styles.bulletRow}>
                      <Text variant="bodyMedium" style={{ color: theme.colors.primary }}>
                        •
                      </Text>
                      <Text variant="bodyMedium" style={styles.grow}>
                        {k}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Paragraphs stay paragraphs — the model is asked for blank-line
                  breaks, and a wall of text is what happens if they are lost. */}
              {paragraphs.map((para) => (
                <Text key={para.slice(0, 40)} variant="bodyLarge" style={styles.summary}>
                  {para}
                </Text>
              ))}

              <View style={styles.aiNote}>
                <Icon source="creation-outline" size={14} color={theme.colors.onSurfaceVariant} />
                <Text variant="labelSmall" style={[styles.grow, { color: theme.colors.onSurfaceVariant }]}>
                  Read by AI from this file. It can be wrong — check it against the paper before
                  relying on it.
                </Text>
              </View>
            </>
          ) : (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              This document was filed before summaries were kept, so there is nothing written about
              it. Open the file to read it.
            </Text>
          )}

          {caveats.length > 0 && (
            <Card mode="contained" style={{ backgroundColor: theme.colors.errorContainer }}>
              <Card.Content style={styles.gap}>
                <View style={styles.aiNote}>
                  <Icon source="alert-outline" size={16} color={theme.colors.onErrorContainer} />
                  <Text variant="titleSmall" style={{ color: theme.colors.onErrorContainer }}>
                    Worth checking yourself
                  </Text>
                </View>
                {caveats.map((c) => (
                  <Text key={c} variant="bodyMedium" style={{ color: theme.colors.onErrorContainer }}>
                    •  {c}
                  </Text>
                ))}
              </Card.Content>
            </Card>
          )}

          <Button
            mode="contained"
            icon={doc.fileRef || local ? 'file-document-outline' : 'file-remove-outline'}
            onPress={openFile}
          >
            {doc.fileRef || local ? 'Open the file' : 'No file stored'}
          </Button>

          {facts.length > 0 && (
            <Card mode="outlined" style={styles.card}>
              <Card.Content style={styles.gap}>
                <Text variant="titleSmall">What was read from it</Text>
                {facts.map(([k, v], i) => (
                  <View key={k}>
                    {i > 0 && <Divider style={styles.factRule} />}
                    <View style={styles.factRow}>
                      <Text variant="bodyMedium" style={[styles.grow, { color: theme.colors.onSurfaceVariant }]}>
                        {k}
                      </Text>
                      <Text variant="bodyMedium" style={styles.factValue}>
                        {v}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card.Content>
            </Card>
          )}

          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Filed {formatDateTime(parseAuditTime(doc.createdAt))}
          </Text>

          {/* Deleting says what else goes — the summary and the parties are
              part of this document, not separate things that survive it. */}
          {confirmDelete ? (
            <Card mode="contained" style={{ backgroundColor: theme.colors.errorContainer }}>
              <Card.Content style={styles.gap}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onErrorContainer }}>
                  Delete this document? What was read from it — this summary, the parties and the
                  extracted details — goes with it. The stored file stays in My Drive.
                </Text>
                <View style={styles.actions}>
                  <Button onPress={() => setConfirmDelete(false)}>Keep it</Button>
                  <Button
                    textColor={theme.colors.error}
                    loading={deleteRegistered.isPending}
                    disabled={deleteRegistered.isPending}
                    onPress={async () => {
                      try {
                        await deleteRegistered.mutateAsync(doc.id);
                        router.back();
                      } catch (e) {
                        setConfirmDelete(false);
                        setToast(e instanceof Error ? `Couldn’t delete: ${e.message}` : 'Couldn’t delete it');
                      }
                    }}
                  >
                    Delete
                  </Button>
                </View>
              </Card.Content>
            </Card>
          ) : (
            <Button mode="text" textColor={theme.colors.error} icon="trash-can-outline" onPress={() => setConfirmDelete(true)}>
              Delete this document
            </Button>
          )}
        </ScrollView>
      )}

      <Snackbar visible={!!toast} onDismiss={() => setToast('')} duration={4000}>
        {toast}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { padding: 16, gap: 14, paddingBottom: 48 },
  // Reading, not skimming: the line-height is what makes three sentences of
  // legal summary survivable on a phone.
  summary: { lineHeight: 27 },
  // A kicker, the way a story labels its section above the headline.
  kicker: { letterSpacing: 1.1, fontWeight: '700' },
  headline: { fontWeight: '700', lineHeight: 32 },
  // The scannable facts, set off by a rule the way a standfirst is.
  keyPoints: { borderLeftWidth: 3, paddingLeft: 12, gap: 6, marginVertical: 2 },
  bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  aiNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grow: { flex: 1 },
  gap: { gap: 8 },
  card: { borderRadius: 12 },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 7 },
  factValue: { fontWeight: '600', flexShrink: 0, textAlign: 'right' },
  factRule: { opacity: 0.5 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
