/** Sections the W01–W15 handover did not draw.
 *
 *  These exist and work in the previous app. Rather than invent a design for
 *  them — or leave the rail pointing at nothing — each says plainly what it is
 *  for and links to the working screen at `/legacy/*`. When a design arrives
 *  for one, it replaces its entry here — which is what happened to `admin`:
 *  /app/admin is now a redirect into the Pattadar desk (routes.tsx), so a stub
 *  under that key would be an entry nothing routes to.
 */
import { Link } from 'react-router';

import { PageHead } from '../ui';

const SECTIONS: Record<string, { eyebrow: string; title: string; blurb: string; legacy: string }> = {
  // `groups` was here and is gone: Families & Groups is drawn in this design
  // now (w360/pages/Groups.tsx) and routed at /app/groups, so a stub under
  // that key would be an entry nothing routes to — the same reason `admin`
  // left. It was also the clearest case against the pattern: the one control
  // on the card sent you out of this app and into /legacy in the same tab.
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
  tools: {
    eyebrow: 'Reference',
    title: 'Tools',
    blurb: 'Stamp duty, market value, unit conversion and the SRO directory.',
    legacy: '/legacy/tools',
  },
  // `audit` was here and is gone: the owner's audit trail is drawn in this
  // design now (w360/pages/Audit.tsx) and routed at /app/audit, so a stub
  // under that key would be an entry nothing routes to — the same reason
  // `groups` and `admin` left.
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
        {/* This used to carry the open-in-new-window glyph, which promised a
            second tab and delivered a same-tab SPA navigation into the previous
            interface. Nothing here opens externally — /legacy is this same app,
            one route over — so the button is plain, the way every other in-app
            link in the module is drawn. */}
        <Link className="btn" to={s.legacy}>Open {s.title}</Link>
      </div>
    </main>
  );
}
