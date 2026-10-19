/** The signed-in app's top-level sections, as routes.tsx spells them under the
 *  pathless `app` layout. Keep in step with it: a section missing here is a
 *  link the assistant or a `back=` cannot take you to, never a security hole. */
const SECTIONS = [
  'home', 'properties', 'holdings', 'map', 'maps', 'shared', 'assigned', 'services', 'order',
  'papers', 'wallet', 'account', 'admin', 'desk', 'groups', 'audit', 'notifications', 'tools',
  'profile', 'invitations', 'help', 'heir', 'refer',
];
const APP_PATH = new RegExp(`^/(?:${SECTIONS.join('|')})(?=[/?#]|$)`);

/** True only for an in-app path that starts with a known section. A URL from
 *  outside (the assistant's stream, a `back=` query, history state) can spell
 *  "//evil.example" or "https://…", and nav() would walk the owner off the
 *  app; an anchored allowlist rejects both, where startsWith('/') did not. */
export const isAppPath = (path: string | null | undefined): path is string =>
  !!path && APP_PATH.test(path);
