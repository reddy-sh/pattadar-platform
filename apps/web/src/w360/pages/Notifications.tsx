/** Notifications — the inbox behind the bell.
 *
 *  What arrived while you were elsewhere: today, readings that finished after
 *  the Add property drawer was closed (services/api/src/inbox.py). Each row
 *  says what happened and has one thing to do about it; Review opens Add
 *  property filled from that reading. Reminders stay on Home ("For you"), and
 *  the bell counts both, so this page names how many are there too.
 *
 *  `?open=latest` is where a browser notification lands: it goes straight to
 *  the newest unread reading, because that is the one the push was about. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { fmtLocal } from '../../lib/format';
import { reviewPath, useInbox, useMarkRead } from '../inbox';
import type { InboxItem } from '../inbox';
import { usePortfolio } from '../api';
import { disablePush, enablePush, pushState } from '../push';
import type { PushState } from '../push';
import { useToast } from '../Toast';
import { Empty, Failed, Icon, Loading, PageHead, StatusChip, plural } from '../ui';

const PUSH_WORDS: Record<PushState, string> = {
  unsupported: 'This browser cannot show notifications.',
  unavailable: 'Browser notifications are not switched on for Pattadar yet.',
  blocked: 'Notifications are blocked for this site. Allow them in your browser settings.',
  on: 'On for this browser. You’ll get a notification when a document has been read.',
  off: 'Get a notification in this browser when a document has been read, even with Pattadar closed.',
};

function PushCard() {
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    pushState().then((s) => { if (live) setState(s); }).catch(() => { if (live) setState('unavailable'); });
    return () => { live = false; };
  }, []);
  if (!state) return null;
  const flip = async () => {
    setBusy(true);
    try {
      setState(state === 'on' ? await disablePush() : await enablePush());
    } catch (e) {
      toast.bad('Browser notifications could not be changed.', e);
    } finally {
      setBusy(false);
    }
  };
  const canFlip = state === 'on' || state === 'off';
  return (
    <section className="card pad-lg sec" aria-labelledby="push-h">
      <div className="row between" style={{ gap: 'var(--space-md)' }}>
        <div>
          <h2 id="push-h" className="home-h2" style={{ margin: 0 }}>Browser notifications</h2>
          <p className="note" style={{ margin: '0.25rem 0 0' }}>{PUSH_WORDS[state]}</p>
        </div>
        {canFlip && (
          <button type="button" className={state === 'on' ? 'btn' : 'btn primary'}
                  disabled={busy} onClick={() => { void flip(); }}>
            {busy ? 'Working…' : state === 'on' ? 'Turn off' : 'Turn on'}
          </button>
        )}
      </div>
    </section>
  );
}

function Row({ item }: { item: InboxItem }) {
  const navigate = useNavigate();
  const markRead = useMarkRead();
  const open = () => {
    if (item.ok) {
      navigate(reviewPath(item.jobId));   // the drawer marks it read
    } else {
      markRead.mutate({ ids: [item.id] });
      navigate('/app/properties?new=1');
    }
  };
  return (
    <div>
      <span className={item.ok ? 'up' : 'muted'} style={{ display: 'flex', paddingTop: '0.125rem' }}>
        <Icon name={item.ok ? 'ok' : 'warn'} size={19} />
      </span>
      <div className="grow">
        <h3 style={{ fontWeight: item.read ? 400 : 700 }}>
          {item.title}
          {!item.read && <span className="visually-hidden"> (unread)</span>}
        </h3>
        <p className="note" style={{ marginTop: '0.1875rem' }}>
          {[item.body, fmtLocal(item.createdAt)].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className="row tight" style={{ flexWrap: 'nowrap' }}>
        {!item.read && <StatusChip state="warn">New</StatusChip>}
        <button type="button" className="btn" onClick={open}>
          {item.ok ? 'Review' : 'Try again'}
        </button>
      </span>
    </div>
  );
}

export function Notifications() {
  const { data, isLoading, error } = useInbox();
  const portfolio = usePortfolio();
  const markRead = useMarkRead();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const waiting = portfolio.data?.waiting.length ?? 0;

  // Landing from a browser notification: straight to the reading it was about.
  useEffect(() => {
    if (params.get('open') !== 'latest' || !data) return;
    const next = new URLSearchParams(params);
    next.delete('open');
    setParams(next, { replace: true });
    const latest = data.items.find((i) => i.kind === 'reading' && i.ok && !i.read);
    if (latest) navigate(reviewPath(latest.jobId));
  }, [params, setParams, data, navigate]);

  const items = data?.items ?? [];
  return (
    <main>
      <PageHead
        title="Notifications"
        actions={data && data.unread > 0 ? (
          <button type="button" className="btn" disabled={markRead.isPending}
                  onClick={() => markRead.mutate({ all: true })}>
            Mark all as read
          </button>
        ) : undefined}
      />

      <PushCard />

      {waiting > 0 && (
        <p className="note sec" style={{ margin: 0 }}>
          {plural(waiting, 'reminder')} on{' '}
          <Link className="link accent" to="/app">Home</Link>.
        </p>
      )}

      {isLoading ? <Loading h="14rem" what="your notifications" />
        : !data ? <Failed what="Notifications" error={error} boxed h="14rem" />
          : items.length === 0 ? (
            <Empty boxed h="14rem" icon="ok" title="No notifications">
              When a document finishes reading after you close Add property, it shows up here.
            </Empty>
          ) : (
            <section className="card" style={{ padding: 0 }} aria-label="Notifications">
              <div className="rows boxed">
                {items.map((i) => <Row key={i.id} item={i} />)}
              </div>
            </section>
          )}
    </main>
  );
}
