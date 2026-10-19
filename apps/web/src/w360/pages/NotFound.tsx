/** A signed-in address that matches nothing, inside the shell and on the shared
 *  head (design.md § Page head), so it sits where every other title sits and
 *  names the tab. routes.tsx marks it `noindex`. */
import { Link, useLocation } from 'react-router';

import { PageHead } from '../ui';

export function NotFound() {
  const { pathname } = useLocation();
  return (
    <main>
      <PageHead title="There is no page at that address" summary={pathname} />
      <div className="row tight"><Link className="btn primary" to="/home">Go to Home</Link></div>
    </main>
  );
}
