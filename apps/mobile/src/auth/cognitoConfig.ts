/**
 * One definition of the Cognito app client, shared by the sign-in flow and the
 * storage client that has to refresh its token.
 *
 * Same user pool as pattadar.com; this is its NATIVE app client (PKCE, no
 * secret — public by design, like any installed OAuth app).
 */
export const COGNITO_DOMAIN =
  process.env.EXPO_PUBLIC_COGNITO_DOMAIN ?? 'https://auth.pattadar.com';

export const COGNITO_CLIENT_ID =
  process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID ?? '44gv48ihjlgub7h0lnvjbdmj89';

export const TOKENS_KEY = 'pattadar_tokens';

export interface StoredTokens {
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  /** ms since epoch, as expo-auth-session reports it. */
  issuedAt?: number;
  /** seconds */
  expiresIn?: number;
}
