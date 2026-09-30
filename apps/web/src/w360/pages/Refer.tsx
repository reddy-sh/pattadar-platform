/**
 * Invite & earn, /app/refer — the account's referral link and what it has done.
 *
 * A referral counts once the person who joined files their first record; both
 * sides then earn AI credits (growth.py). Credits are recorded here and are
 * not yet spendable — that is said on the screen rather than implied.
 */
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import WhatsApp from '@mui/icons-material/WhatsApp';

import { useToast } from '../Toast';
import { useReferral } from '../growthData';
import { Card, Failed, KV, Loading, PageHead, ddmmyyyy, num, plural } from '../ui';

export function Refer() {
  const q = useReferral();
  const toast = useToast();
  if (q.isPending) return <main><PageHead title="Invite & earn" /><Loading h="16rem" what="your referral link" /></main>;
  if (q.isError || !q.data) {
    return <main><PageHead title="Invite & earn" /><Failed what="Your referral link" error={q.error} onRetry={() => q.refetch()} boxed h="16rem" /></main>;
  }
  const r = q.data;
  const link = `${window.location.origin}${r.path}`;
  const message = `I keep my land records on Pattadar: passbooks, deeds and heirs in one place. Join with my link: ${link}`;
  const copy = () => navigator.clipboard.writeText(link)
    .then(() => toast.ok('Link copied'))
    .catch(() => toast.bad('Could not copy the link. Select it and copy by hand.'));

  return (
    <main>
      <PageHead title="Invite & earn"
                info="When someone joins with your link and adds their first land record, you both earn AI credits. You can earn from up to the monthly limit of referrals." />
      <div style={{ display: 'grid', gap: 'var(--space-md)', maxWidth: '46rem' }}>
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
            { k: 'Added their first record', v: num(r.qualified) },
            { k: 'AI credits earned', v: num(r.creditsEarned), highlight: r.creditsEarned > 0 },
          ]} />
          {r.referredBy && <p className="note">You joined through {r.referredBy}.</p>}
          <p className="note" style={{ marginBottom: 0 }}>
            Credits are recorded against your account and are not spendable yet. Rewards count for up
            to {plural(r.monthlyCap, 'referral')} a month.
          </p>
        </Card>

        {r.rewards.length > 0 && (
          <Card title="Credits">
            <div className="rows">
              {r.rewards.map((w) => (
                <div key={`${w.side}-${w.createdAt}`} className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{w.side === 'referrer' ? 'Someone you invited added a record' : 'You joined through a referral'}</span>
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
