import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import { ActivityIndicator, Appbar, Button, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StorageAuthError, fetchDriveFile } from '@/api/storage';

/** In-app document viewer — PDFs render in a WebView, images inline; the file
 * comes from My Drive so it opens on any device, not just the one that uploaded. */
export default function ViewerScreen() {
  const theme = useTheme();
  const { nodeId, name, local } = useLocalSearchParams<{ nodeId?: string; name?: string; local?: string }>();
  const [uri, setUri] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      // A local copy is only usable if it is still there. iOS rotates the app's
      // container path on every reinstall, so an absolute file:// URI saved
      // yesterday points at nothing today — and rendering a WebView on nothing
      // is a black screen with no explanation, which is what this screen did.
      if (local) {
        const info = await FileSystem.getInfoAsync(local).catch(() => null);
        if (info?.exists && (info.size ?? 0) > 0) {
          if (alive) {
            setUri(local);
            setLoading(false);
          }
          return;
        }
      }
      if (!nodeId) {
        if (alive) {
          setError(
            local
              ? 'That copy is no longer on this device, and no file was stored for this document. Upload it again to keep it.'
              : 'No file was stored for this document. Upload it again to keep it.',
          );
          setLoading(false);
        }
        return;
      }
      try {
        const u = await fetchDriveFile(nodeId, name ?? 'file');
        if (alive) setUri(u);
      } catch (e) {
        if (alive) {
          setError(
            e instanceof StorageAuthError
              ? `${e.message} (Account → Sign in)`
              : e instanceof Error
                ? e.message
                : 'Could not open the file',
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [nodeId, name, local]);

  const isPdf = /\.pdf$/i.test(name ?? '') || /\.pdf$/i.test(uri);
  const isImage = /\.(jpe?g|png|gif|webp|heic)$/i.test(name ?? '') || /\.(jpe?g|png|gif|webp)$/i.test(uri);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header mode="small" statusBarHeight={0}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={name || 'Document'} />
        {!!uri && (
          <Appbar.Action
            icon="export-variant"
            accessibilityLabel="Share this file"
            onPress={() => Sharing.shareAsync(uri).catch(() => undefined)}
          />
        )}
      </Appbar.Header>
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text variant="bodyMedium">Fetching from My Drive…</Text>
        </View>
      )}
      {!loading && !!error && (
        <View style={styles.center}>
          <Text variant="bodyMedium" style={{ color: theme.colors.error, textAlign: 'center' }}>
            {error}
          </Text>
          <Button mode="outlined" onPress={() => router.back()}>
            Go back
          </Button>
        </View>
      )}
      {!loading && !error && !!uri && (
        isImage ? (
          <ScrollView contentContainerStyle={styles.imageWrap} maximumZoomScale={4} minimumZoomScale={1}>
            <Image source={{ uri }} style={styles.image} resizeMode="contain" />
          </ScrollView>
        ) : (
          // PDFs and anything else the platform can render.
          <WebView
            source={{ uri }}
            style={styles.web}
            javaScriptEnabled={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            originWhitelist={['file://*']}
            allowFileAccess
            startInLoadingState
          />
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  web: { flex: 1 },
  imageWrap: { flexGrow: 1, justifyContent: 'center' },
  image: { width: '100%', height: 500 },
});
