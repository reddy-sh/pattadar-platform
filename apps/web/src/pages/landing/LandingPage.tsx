/**
 * Public landing page for pattadar.com. Professional and restrained: top bar,
 * hero, feature cards, trust strip, footer. MUI + @pattadar/tokens, light/dark
 * aware via the shared theme. Plain-language copy only — no fabricated
 * testimonials, stats, or logos.
 */
import type { ReactElement } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import DocumentScannerOutlinedIcon from '@mui/icons-material/DocumentScannerOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { isAuthMocked, useAuth } from '../../auth/AuthProvider';

interface Feature {
  icon: ReactElement;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: <DashboardOutlinedIcon color="primary" fontSize="large" />,
    title: 'Land portfolio dashboard',
    body: 'See all your parcels, passbooks and properties in one place, with values and health at a glance.',
  },
  {
    icon: <DocumentScannerOutlinedIcon color="primary" fontSize="large" />,
    title: 'AI deed & passbook reading',
    body: 'Upload a photo of a land deed or pattadar passbook and the details are read and filled in for you.',
  },
  {
    icon: <FolderOutlinedIcon color="primary" fontSize="large" />,
    title: 'Documents drive',
    body: 'Keep deeds, passbooks and receipts safe and organised, ready whenever you need them.',
  },
  {
    icon: <Diversity3OutlinedIcon color="primary" fontSize="large" />,
    title: 'Family groups & heirs',
    body: 'Invite family members, record heirs, and verify each person with a secure link.',
  },
];

interface TrustItem {
  icon: ReactElement;
  text: string;
}

const TRUST_ITEMS: TrustItem[] = [
  { icon: <LockOutlinedIcon fontSize="small" />, text: 'Encrypted at rest, stored in India' },
  { icon: <VisibilityOffOutlinedIcon fontSize="small" />, text: 'Aadhaar numbers always masked' },
  { icon: <ManageAccountsOutlinedIcon fontSize="small" />, text: 'You control your data' },
];

export function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, signIn } = useAuth();
  // In mock mode (or when already signed in) the button goes straight to /app.
  const startSignIn = () => {
    if (isAuthMocked || isAuthenticated) {
      navigate('/app');
    } else {
      void signIn('/app');
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{ bgcolor: 'background.default', borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar>
          <Typography
            variant="h4"
            component="span"
            sx={{ flexGrow: 1, color: 'primary.main', fontWeight: 700 }}
          >
            Pattadar
          </Typography>
          <Button variant="outlined" onClick={startSignIn}>
            Sign in
          </Button>
        </Toolbar>
      </AppBar>

      {/* Hero */}
      <Container maxWidth="md" component="section" sx={{ textAlign: 'center', py: { xs: 8, md: 12 } }}>
        <Typography variant="h1" component="h1" gutterBottom>
          Your family's land records, in one secure place
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 640, mx: 'auto', mb: 4 }}>
          Pattadar helps Andhra Pradesh land-owners manage parcels, passbooks, registered deeds and
          family — securely, and in plain language the whole family can understand.
        </Typography>
        <Button variant="contained" size="large" onClick={startSignIn}>
          Get started
        </Button>
      </Container>

      {/* Feature cards */}
      <Box component="section" sx={{ bgcolor: 'background.paper', py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" sx={{ textAlign: 'center', mb: 4 }}>
            What you can do
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
            }}
          >
            {FEATURES.map((f) => (
              <Card key={f.title} variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  {f.icon}
                  <Typography variant="h4" component="h3" sx={{ mt: 1.5, mb: 1 }}>
                    {f.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {f.body}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Trust / compliance strip */}
      <Container maxWidth="lg" component="section" sx={{ py: { xs: 4, md: 5 } }}>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: { xs: 2, md: 6 },
          }}
        >
          {TRUST_ITEMS.map((item) => (
            <Box
              key={item.text}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}
            >
              {item.icon}
              <Typography variant="body2">{item.text}</Typography>
            </Box>
          ))}
        </Box>
      </Container>

      {/* Footer */}
      <Box component="footer" sx={{ mt: 'auto' }}>
        <Divider />
        <Container maxWidth="lg" sx={{ py: 3 }}>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              © {new Date().getFullYear()} Pattadar
            </Typography>
            <Box sx={{ display: 'flex', gap: 3 }}>
              <Link component={RouterLink} to="/privacy" variant="caption" color="text.secondary">
                Privacy
              </Link>
              <Link component={RouterLink} to="/terms" variant="caption" color="text.secondary">
                Terms
              </Link>
              <Link
                href="mailto:grievance@pattadar.com"
                variant="caption"
                color="text.secondary"
              >
                Grievance: grievance@pattadar.com
              </Link>
            </Box>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
