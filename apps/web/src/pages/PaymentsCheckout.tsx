import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { apiFetch } from '../api/client';

type PaymentState = {
  status: string; title: string; amount: number; currency: string; mode: 'off' | 'test' | 'live';
  enabled: boolean; keyId?: string; orderId?: string; paymentId?: string; error?: string;
  captured?: boolean; operations: Array<{ kind: string; status: string; error: string }>;
};
type Receipt = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type CheckoutInstance = { open(): void; on(event: 'payment.failed', callback: () => void): void };
declare global {
  interface Window { Razorpay?: new (options: {
    key: string; amount: number; currency: string; name: string; description: string; order_id: string;
    handler: (receipt: Receipt) => void; modal: { ondismiss: () => void };
  }) => CheckoutInstance }
}

let script: Promise<void> | undefined;
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (script) return script;
  script = new Promise<void>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = 'https://checkout.razorpay.com/v1/checkout.js';
    tag.async = true;
    tag.onload = () => window.Razorpay ? resolve() : reject(new Error('The payment window did not load.'));
    tag.onerror = () => reject(new Error('The payment window could not be loaded. Try again.'));
    document.head.appendChild(tag);
  }).catch((error: unknown) => { script = undefined; throw error; });
  return script;
}

async function request(path: string, init?: RequestInit): Promise<PaymentState> {
  const response = await apiFetch(path, { ...init, timeoutMs: 60_000 });
  const data = await response.json() as PaymentState & { detail?: string };
  if (!response.ok) throw new Error(data.detail || 'The payment request could not be completed.');
  return data;
}

/** Ticket-specific checkout. No wallet deposit or withdrawal is implied. */
export function PaymentsCheckout() {
  const { id = '' } = useParams();
  const base = `/api/gateway/pattadar/payments/tickets/${encodeURIComponent(id)}`;
  const [state, setState] = useState<PaymentState>();
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const context = useRef({ base, generation: 0 });
  const controller = useRef<AbortController | undefined>(undefined);
  // Invalidate during render as well as effect cleanup: a late result cannot
  // land between rendering a different ticket and running its effects.
  if (context.current.base !== base) context.current = { base, generation: context.current.generation + 1 };
  const refresh = useCallback(async () => {
    const expected = context.current;
    if (expected.base !== base) return;
    const active = () => mounted.current && context.current === expected;
    try {
      const next = await request(base, { signal: controller.current?.signal });
      if (active()) { setState(next); setProblem(''); }
    } catch (error) {
      if (active()) setProblem(error instanceof Error ? error.message : 'Payment status unavailable.');
    }
  }, [base]);

  useEffect(() => {
    mounted.current = true;
    context.current = { base, generation: context.current.generation + 1 };
    const abort = new AbortController();
    controller.current = abort;
    setState(undefined);
    setBusy(false);
    setProblem('');
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 10_000);
    return () => {
      mounted.current = false;
      context.current = { base, generation: context.current.generation + 1 };
      abort.abort();
      window.clearInterval(timer);
    };
  }, [base, refresh]);

  async function pay() {
    const expected = context.current;
    const active = () => mounted.current && context.current === expected;
    const signal = controller.current?.signal;
    setBusy(true);
    setProblem('');
    try {
      const prepared = await request(`${base}/checkout`, { method: 'POST', signal });
      if (!active()) return;
      setState(prepared);
      if (prepared.captured) { setBusy(false); return; }
      if (!prepared.orderId || !prepared.keyId) {
        throw new Error(prepared.error || 'The payment order is being prepared. Check the status before trying again.');
      }
      await loadCheckout();
      if (!active() || !window.Razorpay) return;
      const checkout = new window.Razorpay({
        key: prepared.keyId, amount: prepared.amount, currency: prepared.currency,
        name: 'Pattadar', description: prepared.title, order_id: prepared.orderId,
        handler: (receipt) => {
          if (!active()) return;
          void request(`${base}/verify`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(receipt) }).then((verified) => {
            if (active()) setState(verified);
          }).catch((error: unknown) => {
            if (active()) setProblem(error instanceof Error ? error.message : 'Payment verification is pending.');
          }).finally(() => { if (active()) setBusy(false); });
        },
        modal: { ondismiss: () => { if (active()) { setBusy(false); void refresh(); } } },
      });
      checkout.on('payment.failed', () => {
        if (active()) { setBusy(false); setProblem('Payment was not confirmed. Check the status before retrying.'); }
      });
      checkout.open();
    } catch (error) {
      if (active()) { setProblem(error instanceof Error ? error.message : 'Checkout unavailable.'); setBusy(false); }
    }
  }
  const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format((state?.amount ?? 0) / 100);
  const settled = state?.status === 'settled';
  const captured = !!state?.captured;
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' }}>
      <Link to={`/app/services/${encodeURIComponent(id)}`}>← Back to the service</Link>
      <h1>{state?.title || 'Service payment'}</h1>
      {!state && !problem && <p role="status">Loading payment status…</p>}
      {state && <>
        <p style={{ fontSize: '1.5rem' }}>{amount}</p>
        {state.mode === 'test' && <p role="note"><strong>Test mode.</strong> Use test payment details. No real money moves.</p>}
        {state.mode === 'off' && <p>Online payments are not configured. No payment has been taken here.</p>}
        {captured && <p role="status">{settled ? 'The provider confirmed the settlement operations.'
          : 'The provider confirmed capture. The payment is reserved for this job until settlement.'}</p>}
        {!captured && state.mode !== 'off' && <p>Your payment is confirmed only after the server checks capture with Razorpay.</p>}
        {state.status === 'settlement_pending' && <p>Settlement is pending provider confirmation. Its progress appears below.</p>}
        {!!state.operations.length && <ul>
          {state.operations.map((operation) => <li key={operation.kind}>
            {({ order: 'Payment order', capture: 'Payment confirmation', transfer: 'Worker payment', refund: 'Refund', fee: 'Service fee' } as Record<string, string>)[operation.kind] || operation.kind}: {({ pending: 'Queued', retry: 'Retrying after a delay', processing: 'Confirming', submitted: 'Processing with provider', done: 'Confirmed', attention: 'Needs attention' } as Record<string, string>)[operation.status] || operation.status}
            {operation.error && <p>{operation.error}</p>}
          </li>)}
        </ul>}
        {!captured && <button className="btn" type="button" disabled={!state.enabled || busy || state.mode === 'off'} onClick={() => { void pay(); }}>
          {busy ? 'Waiting for checkout…' : state.mode === 'test' ? 'Open test checkout' : `Pay ${amount}`}
        </button>}
      </>}
      {problem && <p role="alert">{problem}</p>}
      <p><button type="button" className="btn soft" onClick={() => { void refresh(); }}>Check payment status</button></p>
      <p>Closing this page does not cancel a payment already accepted by the provider. You can return to check its status.</p>
    </main>
  );
}
