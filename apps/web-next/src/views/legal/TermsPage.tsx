'use client';

/**
 * /terms — public placeholder.
 * TODO(DPDP): replace with the final terms of use, published in both English
 * and Telugu, before public launch.
 */
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { LegalLayout } from './LegalLayout';

export function TermsPage() {
  return (
    <LegalLayout>
      <Typography variant="h4" component="h1" gutterBottom>
        Terms of use
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        The full terms of use for Pattadar will be published here before public launch, in English
        and Telugu.
      </Typography>
      <Typography color="text.secondary">
        Questions or grievances:{' '}
        <Link href="mailto:grievance@pattadar.com">grievance@pattadar.com</Link>
      </Typography>
    </LegalLayout>
  );
}
