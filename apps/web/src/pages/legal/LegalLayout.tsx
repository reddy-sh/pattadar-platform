/**
 * Shared frame for the public legal placeholder pages (/privacy, /terms):
 * wordmark bar linking home, narrow content column, slim footer.
 */
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';

export function LegalLayout({ children }: { children: ReactNode }) {
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
      <Container maxWidth="md" sx={{ py: 6, flexGrow: 1 }}>
        {children}
      </Container>
      <Divider />
      <Container maxWidth="md" component="footer" sx={{ py: 3 }}>
        <Typography variant="caption" color="text.secondary">
          © {new Date().getFullYear()} Pattadar · Grievance:{' '}
          <Link href="mailto:grievance@pattadar.com" color="text.secondary">
            grievance@pattadar.com
          </Link>
        </Typography>
      </Container>
    </Box>
  );
}
