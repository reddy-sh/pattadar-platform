'use client';

import NProgress from 'nprogress';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// ----------------------------------------------------------------------
// Minimal App-Router nprogress: start on same-origin link clicks, finish
// when the pathname actually changes. Styles live in src/global.css.
// ----------------------------------------------------------------------

export default function ProgressBar() {
  const pathname = usePathname();

  useEffect(() => {
    NProgress.done();
  }, [pathname]);

  useEffect(() => {
    NProgress.configure({ showSpinner: false });

    const onClick = (event) => {
      const anchor = event.target.closest?.('a');

      if (
        anchor?.href &&
        anchor.target !== '_blank' &&
        anchor.origin === window.location.origin &&
        anchor.pathname !== window.location.pathname
      ) {
        NProgress.start();
      }
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return null;
}
