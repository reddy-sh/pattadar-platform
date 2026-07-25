import Typography from '@mui/material/Typography';
import { useParams } from 'react-router';

/** PUBLIC route — beneficiary verification landing must work WITHOUT login. */
export function VerifyPage() {
  const { token } = useParams();
  return (
    <>
      <Typography variant="h2">Verify membership</Typography>
      <Typography color="text.secondary">
        Token-based beneficiary verification landing (token: {token ?? 'missing'}); rebuilt from
        rhub VerifyView / verifyBeneficiary mutation.
      </Typography>
    </>
  );
}
