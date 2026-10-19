/**
 * Invite & earn, /refer — the account's referral link and what it has done.
 *
 * A referral counts once the person who joined adds their first property; both
 * sides then earn AI credits (growth.py). Credits are recorded here and are
 * not yet spendable — that is said on the screen rather than implied.
 */
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import WhatsApp from '@mui/icons-material/WhatsApp';
import type { CSSProperties } from 'react';

import { useToast } from '../Toast';
import { useReferral } from '../growthData';
import { Sk } from '../skeletons';
import { Card, Failed, KV, PageHead, ddmmyyyy, num, plural } from '../ui';

export function Refer() {
  const q = useReferral();
  const toast = useToast();
  if (q.isPending) return <main><PageHead title="Invite & earn" summary={<Sk w="18rem" h="1rem" r="var(--radius-xs)" />} /><ReferSkeleton /></main>;
  if (q.isError || !q.data) {
    return <main><PageHead title="Invite & earn" /><Failed what="Your referral link" error={q.error} onRetry={() => q.refetch()} boxed h="16rem" /></main>;
  }
  const r = q.data;
  const link = `${window.location.origin}${r.path}`;
  const message = `I keep my property documents on Pattadar: passbooks, deeds and heirs in one place. Join with my link: ${link}`;
  const copy = () => navigator.clipboard.writeText(link)
    .then(() => toast.ok('Link copied'))
    .catch(() => toast.bad('Could not copy the link. Select it and copy by hand.'));
  // Credits include the joining side's reward, so a referee nobody has joined
  // through yet still has a fact; no figure at all is first run, title alone.
  const summaryLine = [
    r.joined > 0 ? `${plural(r.joined, 'person', 'people')} joined` : '',
    r.qualified > 0 ? `${num(r.qualified)} added a property` : '',
    r.creditsEarned > 0 ? `${plural(r.creditsEarned, 'AI credit')} earned` : '',
  ].filter(Boolean).join(' · ') || undefined;

  return (
    <main>
      <PageHead title="Invite & earn" summary={summaryLine}
                info="When someone joins with your link and adds their first property, you both earn AI credits. You can earn from up to the monthly limit of referrals." />
      {/* The shared 80rem measure, not a 46rem column of its own (design.md
          § Page head, "One frame"): the link and its results side by side,
          stacking under 1200px, and the credits under both. */}
      <div className="stack">
        <div className="two">
          <Card title="Your link">
            <p className="mono" style={{ margin: 0, overflowWrap: 'anywhere', fontSize: '1rem' }}>{link}</p>
            <p className="note">Code {r.code}</p>
            <div className="row tight">
              <button type="button" className="btn primary" onClick={copy}>
                <ContentCopyOutlined sx={{ fontSize: 16 }} aria-hidden /> Copy link
              </button>
              <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                 target="_blank" rel="noopener noreferrer">
                <WhatsApp sx={{ fontSize: 16 }} aria-hidden /> Share on WhatsApp
              </a>
            </div>
          </Card>

          <Card title="What it has done">
            <KV rows={[
              { k: 'Joined with your link', v: num(r.joined) },
              { k: 'Added their first property', v: num(r.qualified) },
              { k: 'AI credits earned', v: num(r.creditsEarned), highlight: r.creditsEarned > 0 },
            ]} />
            {r.referredBy && <p className="note">You joined through {r.referredBy}.</p>}
            <p className="note" style={{ marginBottom: 0 }}>
              Credits are recorded against your account and are not spendable yet. Rewards count for up
              to {plural(r.monthlyCap, 'referral')} a month.
            </p>
          </Card>
        </div>

        {r.rewards.length > 0 && (
          <Card title="Credits">
            <div className="rows">
              {r.rewards.map((w) => (
                <div key={`${w.side}-${w.createdAt}`} className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{w.side === 'referrer' ? 'Someone you invited added a property' : 'You joined through a referral'}</span>
                  <span className="note">{plural(w.units, 'credit')} · {ddmmyyyy(w.createdAt)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}

/** First read: the same two cards with their real titles and key labels, only
 *  the server's values grey, so nothing moves when the link lands. */
function ReferSkeleton() {
  // .skeleton.line is display:block, so a bar alone would shrink each text
  // line to its own 0.62em; inline-block keeps the real line box.
  const bar = (w: string, extra?: CSSProperties) => <Sk w={w} h="0.62em" style={{ display: 'inline-block', verticalAlign: 'middle', ...extra }} />;
  const v = bar('2.5rem');
  return (
    <div role="status" aria-busy="true" aria-label="Loading your referral link">
      <div className="stack" aria-hidden>
        <div className="two">
          <Card title="Your link">
            <p className="mono" style={{ margin: 0, fontSize: '1rem' }}>{bar('22rem', { maxWidth: '100%' })}</p>
            <p className="note">{bar('7rem')}</p>
            <div className="row tight">
              <Sk w="7.5rem" h="2.375rem" r="var(--radius-pill)" />
              <Sk w="10.5rem" h="2.375rem" r="var(--radius-pill)" />
            </div>
          </Card>
          <Card title="What it has done">
            <KV rows={[
              { k: 'Joined with your link', v },
              { k: 'Added their first property', v },
              { k: 'AI credits earned', v },
            ]} />
            <p className="note" style={{ marginBottom: 0 }}>{bar('90%')}<br />{bar('60%')}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
