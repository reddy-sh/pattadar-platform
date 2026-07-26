'use client';

/**
 * Shared frame for the public auth pages (/login, /signup, /forgot-password):
 * a logo, a centred form card, and (on wider screens) the kit's classic
 * split-screen hero panel. All auth happens on OUR pages (founder rule:
 * customers never see a non-pattadar.com URL).
 *
 * Restyled from apps/web/src/pages/auth/AuthLayout.tsx onto the look of the
 * kept kit layout at src/layouts/auth/classic.js (split hero panel + centred
 * form) — that file itself isn't reused because it hard-codes a multi-method
 * auth switcher (jwt/firebase/amplify/auth0/supabase) this app doesn't have.
 */
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { useResponsive } from 'src/hooks/use-responsive';
import { RouterLink } from 'src/routes/components';
import Logo from 'src/components/logo';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const theme = useTheme();
  const mdUp = useResponsive('up', 'md');

  const overlay = alpha(theme.palette.background.default, theme.palette.mode === 'light' ? 0.88 : 0.94);

  return (
    <Stack component="main" direction="row" sx={{ minHeight: '100vh' }}>
      <Logo sx={{ zIndex: 9, position: 'absolute', m: { xs: 2, md: 5 } }} />

      {mdUp && (
        <Stack
          spacing={6}
          sx={{
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'center',
            background: `linear-gradient(${overlay}, ${overlay}), url(/assets/background/overlay_2.jpg)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat',
          }}
        >
          <Typography variant="h3" sx={{ maxWidth: 480, textAlign: 'center', px: 3 }}>
            Keep your family&apos;s land records safe, in one place.
          </Typography>
          <Box
            component="img"
            alt="Pattadar"
            src="/assets/illustrations/illustration_dashboard.png"
            sx={{ maxWidth: { md: 420, lg: 480 } }}
          />
        </Stack>
      )}

      <Stack
        sx={{
          width: 1,
          mx: 'auto',
          maxWidth: 480,
          px: { xs: 2, md: 8 },
          pt: { xs: 15, md: 20 },
          pb: { xs: 15, md: 8 },
        }}
      >
        <Typography variant="h4" component="h1" gutterBottom>
          {title}
        </Typography>
        {subtitle && (
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {subtitle}
          </Typography>
        )}

        {children}

        <Divider sx={{ my: 3 }} />
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
          {`© ${new Date().getFullYear()} Pattadar · `}
          <Link component={RouterLink} href="/privacy" color="text.secondary">
            Privacy
          </Link>
          {' · '}
          <Link component={RouterLink} href="/terms" color="text.secondary">
            Terms
          </Link>
        </Typography>
      </Stack>
    </Stack>
  );
}
