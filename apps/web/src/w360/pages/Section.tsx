/** Sections the W01–W15 handover did not draw.
 *
 *  These exist and work in the previous app. Rather than invent a design for
 *  them — or leave the rail pointing at nothing — each says plainly what it is
 *  for and links to the working screen at `/legacy/*`. When a design arrives
 *  for one, it replaces its entry here.
 */
import { Link } from 'react-router';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';

import { PageHead } from '../ui';

const SECTIONS: Record<string, { eyebrow: string; title: string; blurb: string; legacy: string }> = {
  groups: {
    eyebrow: 'People',
    title: 'Families & Groups',
    blurb: 'Who is in the family, what each person may see, and which records a group holds together.',
    legacy: '/legacy/groups',
  },
  invitations: {
    eyebrow: 'People',
    title: 'Invitations',
    blurb: 'People you have asked to join, and the ones who have asked to join you.',
    legacy: '/legacy/invitations',
  },
  notifications: {
    eyebrow: 'Waiting on you',
    title: 'Notifications',
    blurb: 'Everything with a deadline, in one place. The two most urgent also sit on your dashboard.',
    legacy: '/legacy/notifications',
  },
  wallet: {
    eyebrow: 'Money',
    title: 'Wallet',
    blurb: 'The balance the caretaker, the surveyor and the advocate are paid from, and every movement in and out.',
    legacy: '/legacy/wallet',
  },
  tools: {
    eyebrow: 'Reference',
    title: 'Tools',
    blurb: 'Stamp duty, market value, unit conversion and the SRO directory.',
    legacy: '/legacy/tools',
  },
  audit: {
    eyebrow: 'Reference',
    title: 'Audit Log',
    blurb: 'Every link opened, every paper downloaded, every record changed — with who and when.',
    legacy: '/legacy/audit',
  },
  admin: {
    eyebrow: 'Reference',
    title: 'Admin & Ref Data',
    blurb: 'Districts, mandals, villages, SRO offices, deed types and the fee schedule behind them.',
    legacy: '/legacy/admin',
  },
  profile: {
    eyebrow: 'You',
    title: 'Profile',
    blurb: 'Your name, your language, how you sign in, and how you would like to be told about things.',
    legacy: '/legacy/profile',
  },
};

export function Section({ id }: { id: keyof typeof SECTIONS }) {
  const s = SECTIONS[id];
  return (
    <main>
      <PageHead eyebrow={s.eyebrow} title={s.title}>
        <p className="lede" style={{ maxWidth: '46rem' }}>{s.blurb}</p>
      </PageHead>
      <div className="card pad-lg" style={{ maxWidth: '46rem' }}>
        <h3>Not yet redrawn</h3>
        <p className="note" style={{ margin: '0.5rem 0 var(--space-md)', color: 'var(--w-ink-2)' }}>
          The fifteen screens in the current design cover the portfolio, records, papers, photos,
          money and shared kits. This section still runs on the previous interface — it works, it
          just has not been redrawn yet.
        </p>
        <Link className="btn" to={s.legacy}>
          <OpenInNewOutlined sx={{ fontSize: 16 }} /> Open {s.title}
        </Link>
      </div>
    </main>
  );
}
