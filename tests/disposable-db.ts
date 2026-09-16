/**
 * One rule, in one place: a browser suite may only ever point at a throwaway
 * database.
 *
 * These suites mutate rows. The founder's own database is named `pattadar` and
 * holds real land records, so a config that falls back to it turns a test run
 * into data loss. Two configs used to do exactly that — maps.config.ts defaulted
 * to it when APP_PG_DSN was unset, and e2e-ux hardcoded it with no override at
 * all. Requiring the name to look disposable is a guard a tired evening cannot
 * walk past.
 */

/** The `dbname=` of a libpq DSN, or the path of a postgres:// URL. */
export function databaseName(dsn: string): string {
  const keyword = dsn.match(/(?:^|\s)dbname=([^\s]+)/)?.[1];
  if (keyword) return keyword;
  try {
    return new URL(dsn).pathname.slice(1);
  } catch {
    return '';
  }
}

/** Names we accept as throwaway. `pattadar` is deliberately not one of them. */
export const DISPOSABLE_NAME = /(?:^|[_-])(?:test|ci|e2e|repair)(?:[_-]|$)/i;

/**
 * Resolve the DSN a suite should use, or refuse to let the suite start.
 * Returns the DSN so callers can hand it to both the API server and the seeder.
 */
export function requireDisposableDatabase(suite: string): string {
  const dsn = process.env.TEST_PG_DSN || process.env.APP_PG_DSN || '';
  if (!DISPOSABLE_NAME.test(databaseName(dsn))) {
    throw new Error(
      `${suite} writes to the database it is given, so it will not run against `
      + `"${databaseName(dsn) || '(none set)'}". Set TEST_PG_DSN to an initialized, `
      + 'disposable database whose name contains test, ci, e2e or repair — '
      + 'scripts/init-test-db.py creates one. This suite never defaults to the '
      + 'application database.',
    );
  }
  return dsn;
}
