import Typography from '@mui/material/Typography';
import { useParams } from 'react-router';
import '../styles/site.css';

/** PUBLIC route — beneficiary verification landing must work WITHOUT login.
 * Bloom canvas only (design.md) — no frame text may be added here. */
export function VerifyPage() {
  const { token } = useParams();
  return (
    <div className="dark site">
      <main className="legalMain">
        <Typography variant="h4">Verify membership</Typography>
        <Typography color="text.secondary">
          Token-based beneficiary verification landing (token: {token ?? 'missing'}); rebuilt from
          rhub VerifyView / verifyBeneficiary mutation.
        </Typography>
      </main>
    </div>
  );
}
