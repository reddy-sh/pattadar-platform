import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import type { User } from 'oidc-client-ts';

const authority = import.meta.env.VITE_COGNITO_AUTHORITY as string | undefined;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
export const isAuthPreview = !authority || !clientId;

export interface UniversityUser {
  id: string;
  email: string;
  name: string;
}

interface AuthContextValue {
  user: UniversityUser | null;
  isLoading: boolean;
  isPreview: boolean;
  signIn: (returnTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const PREVIEW_USER: UniversityUser = {
  id: 'preview-learner',
  email: 'learner@pattadar.local',
  name: 'Preview learner',
};

function buildUserManager(): UserManager {
  return new UserManager({
    authority: authority as string,
    client_id: clientId as string,
    redirect_uri:
      (import.meta.env.VITE_COGNITO_REDIRECT_URI as string | undefined)
      || `${window.location.origin}/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  });
}

const userManager = isAuthPreview ? null : buildUserManager();

/** The Pattadar app links here with `session=app` for a signed-in owner. The
 *  hosted login already holds their session, so this redirect comes straight
 *  back signed in; with no session it shows the usual sign-in page. The flag
 *  is dropped first, so a refresh or shared link never redirects again. */
function takeAppSessionFlag(): string | null {
  const url = new URL(window.location.href);
  if (url.searchParams.get('session') !== 'app') return null;
  url.searchParams.delete('session');
  const returnTo = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, '', returnTo);
  return returnTo;
}

function fromOidc(user: User): UniversityUser {
  const email = user.profile.email ?? '';
  return {
    id: user.profile.sub,
    email,
    name: user.profile.name ?? email.split('@')[0] ?? 'Pattadar learner',
  };
}

function logoutUrl(): string {
  const domain = import.meta.env.VITE_COGNITO_DOMAIN as string | undefined;
  if (!domain) return '/';
  const base = domain.startsWith('http') ? domain : `https://${domain}`;
  const url = new URL('/logout', base);
  url.searchParams.set('client_id', clientId as string);
  url.searchParams.set('logout_uri', `${window.location.origin}/`);
  return url.toString();
}

export async function completeSignIn(): Promise<string> {
  if (!userManager) return '/';
  const user = await userManager.signinRedirectCallback();
  const state = user.state as { returnTo?: string } | undefined;
  const returnTo = state?.returnTo;
  return returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/learn';
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UniversityUser | null>(isAuthPreview ? PREVIEW_USER : null);
  const [isLoading, setIsLoading] = useState(!isAuthPreview);

  useEffect(() => {
    if (!userManager) return;
    let cancelled = false;
    const fromApp = takeAppSessionFlag();
    userManager.getUser()
      .then(async (session) => {
        const live = session && !session.expired;
        if (!live && fromApp) {
          await userManager.signinRedirect({ state: { returnTo: fromApp } });
          return;
        }
        if (!cancelled) setUser(live ? fromOidc(session) : null);
        if (!cancelled) setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    const onLoaded = (session: User) => setUser(fromOidc(session));
    const onUnloaded = () => setUser(null);
    userManager.events.addUserLoaded(onLoaded);
    userManager.events.addUserUnloaded(onUnloaded);
    return () => {
      cancelled = true;
      userManager.events.removeUserLoaded(onLoaded);
      userManager.events.removeUserUnloaded(onUnloaded);
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    isPreview: isAuthPreview,
    signIn: async (returnTo = '/learn') => {
      if (!userManager) return;
      await userManager.signinRedirect({ state: { returnTo } });
    },
    signOut: async () => {
      if (!userManager) return;
      await userManager.removeUser();
      window.location.assign(logoutUrl());
    },
  }), [isLoading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
