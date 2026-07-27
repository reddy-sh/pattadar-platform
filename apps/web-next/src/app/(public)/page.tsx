'use client';

// Route skeleton stub (task B5) — C9 ports the real marketing landing page.
// Minimal placeholder only: a heading and a way into the app.
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { RouterLink } from 'src/routes/components';

export default function LandingPage() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center', p: 3 }}>
      <Box>
        <Typography variant="h3" component="h1" gutterBottom>
          Pattadar
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Your land and property, in one place.
        </Typography>
        <Link component={RouterLink} href="/login" variant="body1">
          Sign in
        </Link>
      </Box>
    </Box>
  );
}
