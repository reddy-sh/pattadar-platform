'use client';

/**
 * Auth facade over TWO token sources:
 *
 * 1. NATIVE Cognito session (src/auth/cognitoNative.ts, SRP) — primary path
 *    for email/password. Sign-in/up/confirm/reset all happen on OUR pages
 *    (/login, /signup, /forgot-password) with zero redirects, so customers
 *    never see a non-pattadar.com URL (founder rule).
 * 2. oidc-client-ts redirect flow — kept ONLY for social logins
 *    (Google/Facebook/Apple), because OAuth requires leaving the page. The
 *    redirect goes to the custom domain in NEXT_PUBLIC_COGNITO_DOMAIN
 *    (auth.pattadar.com) and returns to /auth/callback. signInSocial passes
 *    identity_provider so Cognito skips its own chooser page.
 *
 * getAccessToken (the API-client seam) checks the native session first —
 * the library refreshes an expired access token automatically via the stored
 * refresh token — then falls back to the oidc user.
 *
 * MOCK MODE: when NEXT_PUBLIC_COGNITO_AUTHORITY is unset (or empty), auth
 * becomes a local stub — a dev user is "signed in" automatically so
 * `bun run dev` works before the user pool exists. The AppShell shows a
 * visible "Auth mocked — dev only" chip in this mode.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import type { User } from 'oidc-client-ts';
import { setAccessTokenProvider } from '../api/client';
import {
  getNativeSession,
  hasNativeUser,
  signIn as nativeSignIn,
  signOutNative,
} from './cognitoNative';

const authority = process.env.NEXT_PUBLIC_COGNITO_AUTHORITY;

/** True when no Cognito pool is configured — local stub auth is active. */
export const isAuthMocked = !authority;

/** Minimal user shape the UI needs (works in both real and mock mode). */
export interface AuthUser {
  email: string;
}

/** Cognito identity_provider values for the supported social logins. */
export type SocialProvider = 'Google' | 'Facebook' | 'SignInWithApple';

const MOCK_USER: AuthUser = { email: 'dev@pattadar.local' };

/**
 * Social providers enabled via NEXT_PUBLIC_SOCIAL_PROVIDERS (comma-separated,
 * e.g. "Google,Facebook,Apple"). Unset/empty = no social section on /login.
 */
export function enabledSocialProviders(): Array<{ provider: SocialProvider; label: string }> {
  const raw = process.env.NEXT_PUBLIC_SOCIAL_PROVIDERS;
  if (!raw) return [];
  const out: Array<{ provider: SocialProvider; label: string }> = [];
  for (const entry of raw.split(',')) {
    switch (entry.trim().toLowerCase()) {
      case 'google':
        out.push({ provider: 'Google', label: 'Google' });
        break;
      case 'facebook':
        out.push({ provider: 'Facebook', label: 'Facebook' });
        break;
      case 'apple':
      case 'signinwithapple':
        out.push({ provider: 'SignInWithApple', label: 'Apple' });
        break;
      default:
        break; // Ignore unknown entries.
    }
  }
  return out;
}

function buildUserManager(): UserManager {
  return new UserManager({
    authority: authority as string,
    client_id: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID as string,
    redirect_uri:
      process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI || `${window.location.origin}/auth/callback`,
    response_type: 'code', // PKCE — oidc-client-ts generates the code challenge
    scope: 'openid email profile',
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  });
}

// Singleton shared by the provider, the callback page, and the API seam.
// Deviation from apps/web (a pure SPA): Next renders this client component
// on the server too, so building the UserManager (touches window/
// localStorage) must be deferred until we're actually in the browser.
const userManager: UserManager | null =
  isAuthMocked || typeof window === 'undefined' ? null : buildUserManager();

// Wire the ACCESS token into the API client: native session first (the lib
// auto-refreshes it), then the oidc (social) user. In mock mode the provider
// stays the default (null) — local dev talks to the gateway unauthenticated.
if (!isAuthMocked) {
  setAccessTokenProvider(async () => {
    const session = await getNativeSession();
    if (session) return session.getAccessToken().getJwtToken();
    if (userManager) {
      const u = await userManager.getUser();
      if (u && !u.expired) return u.access_token;
    }
    return null;
  });
}

function toAuthUser(user: User): AuthUser {
  return { email: user.profile.email ?? '' };
}

/**
 * Cognito hosted-UI logout URL — SOCIAL sessions only. The hosted UI keeps
 * its own cookie for OAuth sign-ins, so /logout must be visited or the next
 * social sign-in silently signs the same user back in. Native (email/
 * password) sessions never touch the hosted UI and need no redirect.
 */
function hostedUiLogoutUrl(): string {
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
  if (!domain) return '/';
  const base = domain.startsWith('http') ? domain : `https://${domain}`;
  const url = new URL('/logout', base);
  url.searchParams.set('client_id', process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID as string);
  url.searchParams.set('logout_uri', `${window.location.origin}/`);
  return url.toString();
}

/**
 * Complete the redirect back from a social login (called by the
 * /auth/callback route). Returns the in-app path to continue to.
 */
export async function completeSignIn(): Promise<string> {
  if (!userManager) return '/app';
  const user = await userManager.signinRedirectCallback();
  const state = user.state as { returnTo?: string } | undefined;
  return state?.returnTo ?? '/app';
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Email/password sign-in on OUR page via SRP — no redirect. Throws AuthError. */
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /** Social login — redirects to auth.pattadar.com straight to the provider. */
  signInSocial: (provider: SocialProvider, returnTo?: string) => Promise<void>;
  /** Clear whichever session is active (native: local only; social: hosted-UI /logout). */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(isAuthMocked ? MOCK_USER : null);
  const [isLoading, setIsLoading] = useState(!isAuthMocked);

  useEffect(() => {
    if (isAuthMocked) return;
    let cancelled = false;
    (async () => {
      // Native (email/password) session wins; fall back to the social user.
      const session = await getNativeSession();
      if (session) {
        const email = session.getIdToken().payload['email'] as string | undefined;
        if (!cancelled) setUser({ email: email ?? '' });
        return;
      }
      if (userManager) {
        const u = await userManager.getUser();
        if (!cancelled) setUser(u && !u.expired ? toAuthUser(u) : null);
      }
    })().finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    const onLoaded = (u: User) => setUser(toAuthUser(u));
    const onUnloaded = () => setUser(null);
    userManager?.events.addUserLoaded(onLoaded);
    userManager?.events.addUserUnloaded(onUnloaded);
    return () => {
      cancelled = true;
      userManager?.events.removeUserLoaded(onLoaded);
      userManager?.events.removeUserUnloaded(onUnloaded);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      signInWithPassword: async (email: string, password: string) => {
        if (isAuthMocked) return; // Mock mode: dev user is already signed in.
        const session = await nativeSignIn(email, password);
        const claim = session.getIdToken().payload['email'] as string | undefined;
        setUser({ email: claim ?? email });
      },
      signInSocial: async (provider: SocialProvider, returnTo?: string) => {
        if (!userManager) {
          // Mock mode: no provider — go straight into the app.
          window.location.assign(returnTo ?? '/app');
          return;
        }
        await userManager.signinRedirect({
          state: { returnTo: returnTo ?? '/app' },
          extraQueryParams: { identity_provider: provider },
        });
      },
      signOut: async () => {
        if (isAuthMocked) {
          window.location.assign('/');
          return;
        }
        if (hasNativeUser()) {
          // Native session: clearing local tokens is a full sign-out — the
          // hosted UI was never involved, so no redirect is needed.
          signOutNative();
          setUser(null);
          window.location.assign('/');
          return;
        }
        if (userManager) {
          await userManager.removeUser();
          window.location.assign(hostedUiLogoutUrl());
        }
      },
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
