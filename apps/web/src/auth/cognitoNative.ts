/**
 * Native Cognito auth (SRP) via amazon-cognito-identity-js.
 *
 * FOUNDER RULE: customers must never see a non-pattadar.com URL. Everything
 * here — sign-in, sign-up, email confirmation, password reset — talks to the
 * Cognito API directly from OUR pages with zero redirects. Only social logins
 * (OAuth requires a redirect) leave the page, and those go through the oidc
 * flow in AuthProvider, not through this module.
 *
 * Tokens: the library stores id/access/refresh tokens in localStorage under
 * `CognitoIdentityServiceProvider.<clientId>.<username>.*`. getNativeSession()
 * transparently refreshes an expired access token using the refresh token.
 *
 * Pool config comes from VITE_COGNITO_AUTHORITY (the pool id is the tail of
 * the issuer URL) + VITE_COGNITO_CLIENT_ID. In mock mode (authority unset)
 * every call rejects with NOT_CONFIGURED — AuthProvider never calls in here
 * when mocked.
 */
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
} from 'amazon-cognito-identity-js';
import type { CognitoUserSession } from 'amazon-cognito-identity-js';

export type AuthErrorCode =
  | 'USER_NOT_CONFIRMED'
  | 'WRONG_CREDENTIALS'
  | 'USER_NOT_FOUND'
  | 'USER_EXISTS'
  | 'CODE_MISMATCH'
  | 'CODE_EXPIRED'
  | 'LIMIT_EXCEEDED'
  | 'WEAK_PASSWORD'
  | 'NOT_CONFIGURED'
  | 'UNKNOWN';

/** Cognito failure with a stable code and a user-friendly message. */
export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

/** Map a raw Cognito error to an AuthError with plain-language copy. */
function toAuthError(e: unknown): AuthError {
  if (e instanceof AuthError) return e;
  const err = e as { code?: string; name?: string; message?: string } | null;
  const kind = err?.code ?? err?.name ?? '';
  const raw = err?.message ?? '';
  switch (kind) {
    case 'UserNotConfirmedException':
      return new AuthError(
        'USER_NOT_CONFIRMED',
        'Your email address has not been confirmed yet. Enter the code we emailed you.',
      );
    case 'NotAuthorizedException':
      return new AuthError('WRONG_CREDENTIALS', 'Incorrect email or password.');
    case 'UserNotFoundException':
      return new AuthError('USER_NOT_FOUND', 'We could not find an account with that email.');
    case 'UsernameExistsException':
      return new AuthError(
        'USER_EXISTS',
        'An account with this email already exists. Try signing in instead.',
      );
    case 'CodeMismatchException':
      return new AuthError(
        'CODE_MISMATCH',
        'That code is not correct. Check the email we sent you and try again.',
      );
    case 'ExpiredCodeException':
      return new AuthError('CODE_EXPIRED', 'That code has expired. Request a new one.');
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return new AuthError(
        'LIMIT_EXCEEDED',
        'Too many attempts. Please wait a few minutes and try again.',
      );
    case 'InvalidPasswordException':
      return new AuthError(
        'WEAK_PASSWORD',
        raw.replace(/^Password did not conform with policy: /, '') ||
          'That password does not meet the requirements.',
      );
    default:
      return new AuthError('UNKNOWN', raw || 'Something went wrong. Please try again.');
  }
}

let pool: CognitoUserPool | null = null;

function getPool(): CognitoUserPool {
  if (pool) return pool;
  const authority = import.meta.env.VITE_COGNITO_AUTHORITY as string | undefined;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
  if (!authority || !clientId) {
    throw new AuthError('NOT_CONFIGURED', 'Sign-in is not configured in this environment.');
  }
  // Issuer looks like https://cognito-idp.<region>.amazonaws.com/<poolId>.
  const poolId = new URL(authority).pathname.split('/').filter(Boolean).pop();
  if (!poolId) {
    throw new AuthError('NOT_CONFIGURED', 'Sign-in is not configured in this environment.');
  }
  pool = new CognitoUserPool({ UserPoolId: poolId, ClientId: clientId });
  return pool;
}

function cognitoUser(email: string): CognitoUser {
  return new CognitoUser({ Username: email, Pool: getPool() });
}

/** Email/password sign-in over SRP — the password never leaves the browser. */
export async function signIn(email: string, password: string): Promise<CognitoUserSession> {
  const user = cognitoUser(email);
  return new Promise((resolve, reject) => {
    user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess: resolve,
      onFailure: (e) => reject(toAuthError(e)),
      // Only admin-created users hit this; self-service reset covers them.
      newPasswordRequired: () =>
        reject(
          new AuthError(
            'UNKNOWN',
            'This account needs a new password. Use "Forgot password?" to set one.',
          ),
        ),
    });
  });
}

/** Create an account; Cognito emails a confirmation code. */
export async function signUp(email: string, password: string): Promise<void> {
  const userPool = getPool();
  return new Promise((resolve, reject) => {
    userPool.signUp(
      email,
      password,
      [new CognitoUserAttribute({ Name: 'email', Value: email })],
      [],
      (err) => (err ? reject(toAuthError(err)) : resolve()),
    );
  });
}

/** Confirm a new account with the emailed code. */
export async function confirmSignUp(email: string, code: string): Promise<void> {
  const user = cognitoUser(email);
  return new Promise((resolve, reject) => {
    user.confirmRegistration(code, true, (err) => (err ? reject(toAuthError(err)) : resolve()));
  });
}

/** Re-send the confirmation code email. */
export async function resendCode(email: string): Promise<void> {
  const user = cognitoUser(email);
  return new Promise((resolve, reject) => {
    user.resendConfirmationCode((err) => (err ? reject(toAuthError(err)) : resolve()));
  });
}

/** Start password reset; Cognito emails a code. */
export async function forgotPassword(email: string): Promise<void> {
  const user = cognitoUser(email);
  return new Promise((resolve, reject) => {
    user.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (e) => reject(toAuthError(e)),
      // Called (instead of onSuccess) once the code has been sent.
      inputVerificationCode: () => resolve(),
    });
  });
}

/** Complete password reset with the emailed code + new password. */
export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const user = cognitoUser(email);
  return new Promise((resolve, reject) => {
    user.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (e) => reject(toAuthError(e)),
    });
  });
}

/** True when a native (email/password) user is signed in on this device. */
export function hasNativeUser(): boolean {
  try {
    return getPool().getCurrentUser() !== null;
  } catch {
    return false;
  }
}

/**
 * Current native session, or null. The library refreshes an expired access
 * token automatically using the stored refresh token; if the refresh token
 * itself has expired this resolves null and the user must sign in again.
 */
export async function getNativeSession(): Promise<CognitoUserSession | null> {
  let current: CognitoUser | null;
  try {
    current = getPool().getCurrentUser();
  } catch {
    return null;
  }
  if (!current) return null;
  const user = current;
  return new Promise((resolve) => {
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      resolve(!err && session?.isValid() ? session : null);
    });
  });
}

/** Sign the native user out locally (clears the stored tokens). No redirect. */
export function signOutNative(): void {
  try {
    getPool().getCurrentUser()?.signOut();
  } catch {
    // Not configured — nothing to clear.
  }
}
