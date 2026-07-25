/**
 * Cognito authentication (OIDC authorization-code + PKCE) via oidc-client-ts.
 *
 * Real mode: configured entirely from VITE_COGNITO_* env vars (see
 * .env.example). Tokens live in localStorage; silent renew uses the refresh
 * token Cognito issues to public clients. The ACCESS token is injected into
 * the API client seam so every gateway call carries a Bearer header.
 *
 * MOCK MODE: when VITE_COGNITO_AUTHORITY is unset (or empty), auth becomes a
 * local stub — a dev user is "signed in" automatically so `bun run dev`
 * works before the user pool exists. The AppShell shows a visible
 * "Auth mocked — dev only" chip in this mode.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import type { User } from 'oidc-client-ts';
import { setAccessTokenProvider } from '../api/client';

const authority = import.meta.env.VITE_COGNITO_AUTHORITY as string | undefined;

/** True when no Cognito pool is configured — local stub auth is active. */
export const isAuthMocked = !authority;

/** Minimal user shape the UI needs (works in both real and mock mode). */
export interface AuthUser {
  email: string;
}

const MOCK_USER: AuthUser = { email: 'dev@pattadar.local' };

function buildUserManager(): UserManager {
  return new UserManager({
    authority: authority as string,
    client_id: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
    redirect_uri:
      (import.meta.env.VITE_COGNITO_REDIRECT_URI as string | undefined) ||
      `${window.location.origin}/auth/callback`,
    response_type: 'code', // PKCE — oidc-client-ts generates the code challenge
    scope: 'openid email profile',
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  });
}

/** Singleton shared by the provider, the callback page, and the API seam. */
const userManager: UserManager | null = isAuthMocked ? null : buildUserManager();

// Wire the ACCESS token into the API client. In mock mode the provider stays
// the default (null) — local dev talks to the gateway unauthenticated.
if (userManager) {
  setAccessTokenProvider(async () => {
    const u = await userManager.getUser();
    return u && !u.expired ? u.access_token : null;
  });
}

function toAuthUser(user: User): AuthUser {
  return { email: user.profile.email ?? '' };
}

/**
 * Cognito hosted-UI logout URL. Clearing the local session is not enough:
 * the hosted UI keeps its own cookie, so /logout must be visited or the next
 * signIn() silently signs the same user back in.
 */
function hostedUiLogoutUrl(): string {
  const domain = import.meta.env.VITE_COGNITO_DOMAIN as string | undefined;
  if (!domain) return '/';
  const base = domain.startsWith('http') ? domain : `https://${domain}`;
  const url = new URL('/logout', base);
  url.searchParams.set('client_id', import.meta.env.VITE_COGNITO_CLIENT_ID as string);
  url.searchParams.set('logout_uri', `${window.location.origin}/`);
  return url.toString();
}

/**
 * Complete the redirect from the Cognito hosted UI (called by the
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
  /** Redirect to the hosted UI; `returnTo` is the in-app path to resume at. */
  signIn: (returnTo?: string) => Promise<void>;
  /** Clear the local session, then sign out of the hosted UI back to "/". */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(isAuthMocked ? MOCK_USER : null);
  const [isLoading, setIsLoading] = useState(!isAuthMocked);

  useEffect(() => {
    if (!userManager) return;
    let cancelled = false;
    userManager
      .getUser()
      .then((u) => {
        if (!cancelled) setUser(u && !u.expired ? toAuthUser(u) : null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    const onLoaded = (u: User) => setUser(toAuthUser(u));
    const onUnloaded = () => setUser(null);
    userManager.events.addUserLoaded(onLoaded);
    userManager.events.addUserUnloaded(onUnloaded);
    return () => {
      cancelled = true;
      userManager.events.removeUserLoaded(onLoaded);
      userManager.events.removeUserUnloaded(onUnloaded);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      signIn: async (returnTo?: string) => {
        if (!userManager) {
          // Mock mode: no hosted UI — go straight into the app.
          window.location.assign(returnTo ?? '/app');
          return;
        }
        await userManager.signinRedirect({ state: { returnTo: returnTo ?? '/app' } });
      },
      signOut: async () => {
        if (!userManager) {
          window.location.assign('/');
          return;
        }
        await userManager.removeUser();
        window.location.assign(hostedUiLogoutUrl());
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
