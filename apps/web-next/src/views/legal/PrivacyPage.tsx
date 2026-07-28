'use client';

/**
 * /privacy — public placeholder.
 * TODO(DPDP): replace with the final DPDP-compliant privacy notice, published
 * in both English and Telugu, before public launch.
 */
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { LegalLayout } from './LegalLayout';

export function PrivacyPage() {
  return (
    <LegalLayout>
      <Typography variant="h4" component="h1" gutterBottom>
        Privacy notice
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        The full privacy notice for Pattadar will be published here before public launch, in
        English and Telugu. It will explain what personal data we hold, why, and your rights.
      </Typography>
      <Typography color="text.secondary">
        Questions or grievances about your data:{' '}
        <Link href="mailto:grievance@pattadar.com">grievance@pattadar.com</Link>
      </Typography>
    </LegalLayout>
  );
}
