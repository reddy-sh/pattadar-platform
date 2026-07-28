'use client';

// Ported from apps/web/src/pages/VerifyPage.tsx (task C9). Replaces the B5
// stub — this is the real beneficiary verification landing (fires the
// verifyBeneficiary mutation with NO auth). Also serves /active/[token].
import { VerifyPage } from 'src/views/VerifyPage';

export default function Page() {
  return <VerifyPage />;
}
