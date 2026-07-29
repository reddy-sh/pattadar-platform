import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';

import { AVATAR_KEY, adoptProviderPhoto } from '@/lib/avatar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { setIdentity } from '@/api/client';
import { COGNITO_CLIENT_ID, COGNITO_DOMAIN, TOKENS_KEY } from '@/auth/cognitoConfig';

WebBrowser.maybeCompleteAuthSession();

// Config lives in cognitoConfig so the storage client can refresh with the
// exact same app client — two copies would drift and only fail after an hour.
const CLIENT_ID = COGNITO_CLIENT_ID;

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: `${COGNITO_DOMAIN}/oauth2/authorize`,
  tokenEndpoint: `${COGNITO_DOMAIN}/oauth2/token`,
  revocationEndpoint: `${COGNITO_DOMAIN}/oauth2/revoke`,
};

/**
 * Always the app's own scheme — never Expo's development URL.
 *
 * `makeRedirectUri` is environment-aware: in a build attached to Metro it can
 * return `exp://127.0.0.1:8081/--/auth` instead of `pattadar://auth`. Cognito
 * allows exactly ONE callback (`pattadar://auth`), so the hosted UI answered an
 * unregistered redirect_uri with "Something went wrong — an error was
 * encountered with the requested page", before any login form appeared. It
 * worked on a device only because release builds do not talk to Metro.
 *
 * `native` pins the value for every build that has the scheme registered in
 * Info.plist, which is every build of this app. Expo Go — the one environment
 * that cannot honour a custom scheme — cannot run this app anyway; it needs
 * react-native-maps and the native upload task.
 */
const redirectUri = AuthSession.makeRedirectUri({
  scheme: 'pattadar',
  path: 'auth',
  native: 'pattadar://auth',
});

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  try {
    const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(globalThis.atob(b64));
  } catch {
    return {};
  }
}

/** Cognito hosted-UI sign-in — identical accounts/passwords as the web app. */
export function useCognitoAuth() {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const baseConfig = {
    clientId: CLIENT_ID,
    redirectUri,
    scopes: ['openid', 'email', 'profile'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  };
  const [request, response, promptAsync] = AuthSession.useAuthRequest(baseConfig, discovery);
  // Second request pre-routed to Google (Cognito honors identity_provider).
  const [gRequest, gResponse, gPromptAsync] = AuthSession.useAuthRequest(
    { ...baseConfig, extraParams: { identity_provider: 'Google' } },
    discovery,
  );

  useEffect(() => {
    const active =
      response?.type === 'success'
        ? { res: response, req: request }
        : gResponse?.type === 'success'
          ? { res: gResponse, req: gRequest }
          : null;
    const finish = async () => {
      if (!active?.req) return;
      const { res, req } = active;
      setBusy(true);
      setError('');
      try {
        const t = await AuthSession.exchangeCodeAsync(
          {
            clientId: CLIENT_ID,
            code: res.params.code,
            redirectUri,
            extraParams: { code_verifier: req.codeVerifier ?? '' },
          },
          discovery,
        );
        const claims = decodeJwtPayload(t.idToken ?? '');
        const email = String(claims.email ?? '');
        if (!email) throw new Error('Cognito did not return an email for this account.');
        // Platform invariant: identity = email local-part, lowercased.
        await setIdentity(email.split('@')[0]);
        // Google (and other IdPs) return a profile photo — use it as the avatar
        // on first sign-in so a new account is not a blank initial.
        const picture = String(claims.picture ?? '');
        if (picture) {
          await adoptProviderPhoto(picture).catch(() => false);
          qc.invalidateQueries({ queryKey: AVATAR_KEY });
        }
        await SecureStore.setItemAsync(
          TOKENS_KEY,
          JSON.stringify({
            accessToken: t.accessToken,
            idToken: t.idToken,
            refreshToken: t.refreshToken,
            issuedAt: t.issuedAt,
            expiresIn: t.expiresIn,
          }),
        ).catch(() => undefined);
        qc.invalidateQueries({ queryKey: ['pattadar'] });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Sign-in failed');
      } finally {
        setBusy(false);
      }
    };
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run per auth response
  }, [response, gResponse]);

  return {
    ready: !!request,
    googleReady: !!gRequest,
    busy,
    error,
    signIn: () => { setError(''); promptAsync(); },
    signInWithGoogle: () => { setError(''); gPromptAsync(); },
  };
}
