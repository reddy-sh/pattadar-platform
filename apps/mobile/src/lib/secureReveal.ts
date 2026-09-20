import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppState, type NativeEventSubscription } from 'react-native';

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
    // No Face ID and no device passcode configured: the device offers no
    // gate at all, so there is nothing to check against. This used to allow
    // the reveal outright — but that means an Aadhaar number sits behind NO
    // check on such a device. Deny instead: the record stays hidden until
    // the owner sets a passcode, which is the only thing that could secure it.
    return false;
  }
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    fallbackLabel: 'Use passcode',
  }).catch(() => ({ success: false }) as LocalAuthentication.LocalAuthenticationResult);
  return res.success;
}

let pendingClear: { timer: ReturnType<typeof setTimeout>; watch: NativeEventSubscription } | null = null;

function cancelPendingClear(): void {
  if (!pendingClear) return;
  clearTimeout(pendingClear.timer);
  pendingClear.watch.remove();
  pendingClear = null;
}

/**
 * Copy raw digits (portals reject separators) and clear the pasteboard again.
 *
 * The timer alone cannot keep that promise. React Native freezes JS timers
 * while the app is backgrounded and drops them entirely when the process is
 * killed — and backgrounding is the whole point of the copy: the number is
 * going into a government portal in another app. So the clear also runs the
 * moment this app is resumed, whichever comes first.
 *
 * Only a real background counts. The biometric prompt that precedes every
 * reveal puts iOS into 'inactive' and back, which would otherwise wipe the
 * number before the user ever left to paste it.
 */
export async function copySensitive(value: string, clearAfterMs = 60_000): Promise<void> {
  const digits = value.replace(/\D/g, '');
  cancelPendingClear();
  await Clipboard.setStringAsync(digits);
  const clear = () => {
    cancelPendingClear();
    // Only clear if it is still ours — never clobber something the user copied since.
    Clipboard.getStringAsync()
      .then((cur) => (cur === digits ? Clipboard.setStringAsync('') : undefined))
      .catch(() => undefined);
  };
  let left = false;
  pendingClear = {
    timer: setTimeout(clear, clearAfterMs),
    watch: AppState.addEventListener('change', (state) => {
      if (state === 'background') left = true;
      else if (state === 'active' && left) clear();
    }),
  };
}

/** Group digits for display: 1234 1234 8203. */
export function groupDigits(v: string): string {
  return v.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
}
