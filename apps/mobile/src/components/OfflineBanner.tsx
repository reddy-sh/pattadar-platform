import { useEffect, useState } from 'react';
import { Banner, Text } from 'react-native-paper';

import { router } from 'expo-router';

import { activeApiBase, healApiBase, setApiBase } from '@/api/client';

/**
 * "Can't reach the server" — now naming the server it could not reach.
 *
 * The old banner said only that something was unreachable, which is the least
 * useful half of the message: the app can be pointed at a saved address that no
 * longer exists, and nothing on screen said so. Showing the address turns an
 * unexplained outage into an obvious one, and the reset button gives a way back
 * without hunting for a settings panel that is behind a seven-tap gate.
 */
export function OfflineBanner({ visible, onRetry }: { visible: boolean; onRetry: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (visible) activeApiBase().then(setUrl).catch(() => undefined);
  }, [visible]);
  const host = url.replace(/^https?:\/\//, '');
  return (
    <Banner
      visible={visible}
      icon="database-outline"
      actions={
        host
          ? [
              { label: 'Retry', onPress: onRetry },
              {
                label: 'Reset server',
                onPress: async () => {
                  await setApiBase('');
                  await healApiBase().catch(() => undefined);
                  onRetry();
                },
              },
            ]
          : [{ label: 'Set server address', onPress: () => router.push('/account' as never) }]
      }
    >
      <Text variant="bodyMedium">
        {/* An empty address is a DIFFERENT fault from an unreachable one, and
            the fix is different too: one needs a network, the other needs
            somewhere to point at. Saying "can't reach the server" for a build
            that was never given a server sends people to check their wifi. */}
        {host
          ? `Can’t reach ${host} — check the connection, then pull to refresh.`
          : 'No server address is set for this build — add one to load your records.'}
      </Text>
    </Banner>
  );
}
