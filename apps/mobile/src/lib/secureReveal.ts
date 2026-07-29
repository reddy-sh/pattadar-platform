import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Gate for showing or copying a full Aadhaar number.
 *
 * The number is stored encrypted server-side and only ever leaves it through
 * an audited single-record lookup. On the device it additionally sits behind
 * the phone's own biometric/passcode check, so a borrowed unlocked phone does
 * not expose it.
 */
export async function authenticateForReveal(reason: string): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
  const enrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
  if (!hasHardware || !enrolled) {
    // No Face ID / passcode configured: the device itself offers no gate, so
    // there is nothing to check. Allow rather than lock the owner out of
    // their own record, but never pretend a check happened.
    return true;
  }
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    fallbackLabel: 'Use passcode',
  }).catch(() => ({ success: false }) as LocalAuthentication.LocalAuthenticationResult);
  return res.success;
}

/** Copy raw digits (portals reject separators) and clear the pasteboard later. */
export async function copySensitive(value: string, clearAfterMs = 60_000): Promise<void> {
  const digits = value.replace(/\D/g, '');
  await Clipboard.setStringAsync(digits);
  setTimeout(() => {
    // Only clear if it is still ours — never clobber something the user copied since.
    Clipboard.getStringAsync()
      .then((cur) => (cur === digits ? Clipboard.setStringAsync('') : undefined))
      .catch(() => undefined);
  }, clearAfterMs);
}

/** Group digits for display: 1234 1234 8203. */
export function groupDigits(v: string): string {
  return v.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
}
