/** What Pattadar University says about the paper behind each service.
 *
 *  Which guide explains which service is the catalogue's (`offer.guides`); the
 *  guide itself is read from the University's own data file, not copied. On a
 *  page a guide that is missing is simply not linked. Only
 *  `shortTitle` and `limit` are used.
 *  The rest of each guide is written for professionals ("indexed registered
 *  transactions…") and the order flow speaks to owners.
 *
 *  Guides are per state, because Andhra Pradesh and Telangana keep the same
 *  paper under different names. A service with no guide gets no link: the
 *  University's home page is not an answer to "what is a site visit?".
 */
import guides from '../../../university/src/data/recordGuides.json';
import { UNIVERSITY_URL } from '../lib/links';
import type { ServiceOffer } from './api';

export type StateCode = 'AP' | 'TS';

const STATE_SLUG: Record<StateCode, string> = { AP: 'andhra-pradesh', TS: 'telangana' };
export const STATE_NAME: Record<StateCode, string> = { AP: 'Andhra Pradesh', TS: 'Telangana' };

const STATE_CODE: Record<string, StateCode> = {
  ap: 'AP', 'andhra pradesh': 'AP',
  ts: 'TS', tg: 'TS', telangana: 'TS',
};

/** The record's state as the passbook spells it, or null when it does not say. */
export const stateCodeOf = (state: string | undefined): StateCode | null =>
  STATE_CODE[(state ?? '').trim().toLowerCase()] ?? null;

const PASSBOOK_GUIDE: Record<StateCode, string> = { AP: 'pattadar-passbook', TS: 'eppb-and-ror-1b' };

/** The University's passbook guide (one passbook, many survey numbers) for
 *  this state; the state chooser when the paper does not say which. */
export const passbookGuideHref = (code: StateCode | null): string =>
  code ? `${UNIVERSITY_URL}/states/${STATE_SLUG[code]}/records/${PASSBOOK_GUIDE[code]}` : `${UNIVERSITY_URL}/states`;

export interface GuideLink { href: string; title: string; limit: string }

/** The University pages for this service in this state; empty when there are none.
 *
 *  Which pages explain a service is the catalogue's (`offer.guides`). A guide
 *  with `ownPaper: false` explains the paper the service WORKS FROM, so its
 *  "cannot prove" line is about that other paper — the FMB guide warns that a
 *  map is not a field survey, which under Boundary re-survey would read as a
 *  warning against the very service being bought. */
export function guidesFor(offer: Pick<ServiceOffer, 'guides'>, code: StateCode): GuideLink[] {
  return offer.guides.filter((t) => t.state === code).flatMap((t) => {
    if (t.topic) {
      return [{ href: `${UNIVERSITY_URL}/states/${STATE_SLUG[code]}#${t.topic}`, title: t.title, limit: '' }];
    }
    const g = guides.find((x) => x.stateCode === code && x.slug === t.slug);
    return g
      ? [{
          href: `${UNIVERSITY_URL}/states/${STATE_SLUG[code]}/records/${g.slug}`,
          title: g.shortTitle,
          limit: t.ownPaper ? g.limit : '',
        }]
      : [];
  });
}

/** Catalogue guide slugs the University no longer has. Empty is the only right answer. */
export function missingGuides(offers: Pick<ServiceOffer, 'key' | 'guides'>[]): string[] {
  return offers.flatMap((o) => o.guides
    .filter((t) => t.slug && !guides.some((x) => x.stateCode === t.state && x.slug === t.slug))
    .map((t) => `${o.key} → ${t.state}/${t.slug}`));
}
