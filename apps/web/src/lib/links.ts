/**
 * Addresses outside this app that more than one screen links to.
 *
 * The University URL was local to the landing page; the signed-in rail and the
 * Help screen link to it too, and three copies of an env fallback drift.
 */
export const UNIVERSITY_URL = import.meta.env.VITE_UNIVERSITY_URL?.trim()
  || (import.meta.env.DEV ? 'http://localhost:5181' : 'https://university.pattadar.com');

/** A University address for a signed-in owner: `session=app` tells the
 *  University to sign in on arrival. Both apps share one Cognito pool and
 *  hosted login, so that redirect returns at once without a login page. */
export const universityHref = (path = ''): string => {
  const url = new URL(`${UNIVERSITY_URL}${path}`);
  url.searchParams.set('session', 'app');
  return url.toString();
};

/** The help inbox the iOS and Expo apps already offer under "Help & support". */
export const SUPPORT_EMAIL = 'support@pattadar.com';
/** The grievance officer named in the privacy notice and terms. */
export const GRIEVANCE_EMAIL = 'grievance@pattadar.com';
