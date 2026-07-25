/**
 * Shared frame for the public auth pages (/login, /signup, /forgot-password):
 * wordmark bar linking home, a centred card, slim footer. No app shell —
 * these pages are public and mobile-friendly. All auth happens on OUR pages
 * (founder rule: customers never see a non-pattadar.com URL).
 */
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{ bgcolor: 'background.default', borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar>
          <Link
            component={RouterLink}
            to="/"
            underline="none"
            sx={{ color: 'primary.main', fontWeight: 700, fontSize: '1.25rem' }}
          >
            Pattadar
          </Link>
        </Toolbar>
      </AppBar>
      <Container
        maxWidth="xs"
        sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', py: { xs: 4, sm: 6 } }}
      >
        <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, width: '100%' }}>
          <Typography variant="h2" component="h1" gutterBottom>
            {title}
          </Typography>
          {subtitle && (
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {subtitle}
            </Typography>
          )}
          {children}
        </Paper>
      </Container>
      <Divider />
      <Container maxWidth="md" component="footer" sx={{ py: 3, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          © {new Date().getFullYear()} Pattadar ·{' '}
          <Link component={RouterLink} to="/privacy" color="text.secondary">
            Privacy
          </Link>{' '}
          ·{' '}
          <Link component={RouterLink} to="/terms" color="text.secondary">
            Terms
          </Link>
        </Typography>
      </Container>
    </Box>
  );
}
