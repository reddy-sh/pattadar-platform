'use client';

// Ported from apps/web/src/pages/VerifyPage.tsx (task C9). Replaces the B5
// stub. Source apps/web/src/routes.tsx routes /active/:token to the SAME
// VerifyPage component as /verify/:token, with no distinguishing prop; both
// routes intentionally render the identical "Verify membership" probe text.
import { VerifyPage } from 'src/views/VerifyPage';

export default function Page() {
  return <VerifyPage />;
}
