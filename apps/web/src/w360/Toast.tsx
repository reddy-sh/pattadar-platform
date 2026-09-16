/**
 * What the app says back.
 *
 * Forty-six mutations in `api.ts` went through one helper that had an
 * `onSuccess` and no `onError`. A refused write — a revoked session, a
 * validation the server rejected, a dropped connection — resolved into
 * nothing at all: the drawer closed, the row returned to rest, and the change
 * was gone. The person who typed it had no way to know. That is the single
 * most common defect in this module, and it is one missing callback.
 *
 * So: a toast, w360-native rather than MUI, because these screens are plain
 * elements over `w360.css` and a Material snackbar arrives with its own type
 * scale, its own easing and its own dark palette.
 *
 * Two rules that matter more than the styling:
 *
 *  · A failure does NOT auto-dismiss. A success that slides away after four
 *    seconds is fine — the thing it describes is on screen, and the user can
 *    see it happened. A failure that slides away has hidden the only notice
 *    that the work was lost, which is worse than never showing it, because now
 *    the user believes it saved.
 *  · Failures are `role="alert"` (interrupts a screen reader) and successes
 *    are `role="status"` (waits its turn). A confirmation is not worth cutting
 *    someone off mid-sentence; a lost edit is.
 *
 * The default context value is a working no-op, so a hook that calls
 * `useToast()` outside the provider — a test, the legacy shell — is inert
 * rather than a crash.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';

export type ToastTone = 'ok' | 'bad';

interface Toast {
  id: number;
  tone: ToastTone;
  text: string;
  /** The machine's own words, printed small under the sentence. */
  detail?: string;
}

interface ToastApi {
  /** Something worked. Auto-dismisses. */
  ok: (text: string) => void;
  /** Something did not. Stays until dismissed, and carries the reason. */
  bad: (text: string, error?: unknown) => void;
}

const NOOP: ToastApi = { ok: () => {}, bad: () => {} };
const Ctx = createContext<ToastApi>(NOOP);

export const useToast = () => useContext(Ctx);

/** The reason, as a person can repeat it down a phone. */
export function reasonOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

const OK_MS = 4500;

export function ToastHost({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  // Ids come from a ref rather than Date.now(): two toasts raised in the same
  // millisecond would collide on key and React would drop one.
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const drop = useCallback((id: number) => {
    setList((l) => l.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const push = useCallback((tone: ToastTone, text: string, detail?: string) => {
    seq.current += 1;
    const id = seq.current;
    // Four is the most anyone reads; older ones have had their moment.
    setList((l) => [...l.slice(-3), { id, tone, text, detail }]);
    if (tone === 'ok') {
      timers.current.set(id, setTimeout(() => drop(id), OK_MS));
    }
  }, [drop]);

  const api = useMemo<ToastApi>(() => ({
    ok: (text) => push('ok', text),
    bad: (text, error) => push('bad', text, reasonOf(error) || undefined),
  }), [push]);

  // Escape clears the stack — a column of unread failures should not need
  // four separate clicks to get out of the way of the screen behind it.
  useEffect(() => {
    if (!list.length) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setList([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list.length]);

  useEffect(() => {
    const t = timers.current;
    return () => { t.forEach(clearTimeout); t.clear(); };
  }, []);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {list.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.tone}`}
            role={t.tone === 'bad' ? 'alert' : 'status'}
          >
            <span className="toast-i" aria-hidden>
              {t.tone === 'bad'
                ? <ErrorOutlineOutlined sx={{ fontSize: 18 }} />
                : <CheckCircleOutlined sx={{ fontSize: 18 }} />}
            </span>
            <span className="grow">
              <span className="toast-t">{t.text}</span>
              {t.detail && <span className="toast-d">{t.detail}</span>}
            </span>
            <button type="button" className="iconbtn" aria-label="Dismiss" onClick={() => drop(t.id)}>
              <CloseOutlined sx={{ fontSize: 16 }} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
