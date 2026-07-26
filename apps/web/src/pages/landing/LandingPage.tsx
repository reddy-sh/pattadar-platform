/**
 * Public landing page for pattadar.com — Aceternity-style redesign
 * (ui.aceternity.com aesthetic: near-black canvas, dot grid, spotlight +
 * aurora glows, gradient-text hero, glowing product frame, bento feature
 * grid, moving-border CTA) recreated with self-contained CSS keyframes on
 * the MUI stack. No Tailwind, no external assets, no new dependencies.
 *
 * Founder rules kept: plain-language copy only (no fabricated testimonials,
 * stats or logos), self-hosted everything, links never open new tabs, and
 * sign-in always goes to OUR native /login page.
 */
import type { ReactElement } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import GlobalStyles from '@mui/material/GlobalStyles';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import DocumentScannerOutlinedIcon from '@mui/icons-material/DocumentScannerOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import SquareFootOutlinedIcon from '@mui/icons-material/SquareFootOutlined';
import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { isAuthMocked, useAuth } from '../../auth/AuthProvider';

/* ── Palette (page-local — the landing is deliberately dark) ──────────── */
const INK = '#ededf0';
const INK_DIM = 'rgba(237, 237, 240, 0.72)';
const INK_FAINT = 'rgba(237, 237, 240, 0.55)';
const CANVAS = '#08080c';
const SURFACE = 'rgba(255, 255, 255, 0.04)';
const BORDER = 'rgba(255, 255, 255, 0.10)';
const BLUE = '#64b5f6';
const BLUE_DEEP = '#1976d2';

/* Shared card look — dark surface, 1px border, hover glow (Aceternity). */
const glowCardSx = {
  position: 'relative',
  height: '100%',
  borderRadius: '16px',
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  p: 2.5,
  overflow: 'hidden',
  transition: 'border-color .3s, transform .3s, box-shadow .3s',
  '&::before': {
    content: '""',
    position: 'absolute',
    inset: '0 0 auto 0',
    height: '1px',
    background: `linear-gradient(90deg, transparent, ${BLUE}, transparent)`,
    opacity: 0,
    transition: 'opacity .3s',
  },
  '&:hover': {
    borderColor: 'rgba(100, 181, 246, 0.45)',
    transform: 'translateY(-3px)',
    boxShadow: '0 18px 40px -18px rgba(25, 118, 210, 0.45)',
    '&::before': { opacity: 1 },
  },
} as const;

const sectionEyebrowSx = {
  textAlign: 'center',
  color: BLUE,
  letterSpacing: 2.4,
  textTransform: 'uppercase',
  fontSize: 12,
  fontWeight: 600,
  mb: 1,
} as const;

const sectionTitleSx = { textAlign: 'center', color: INK, fontWeight: 700, mb: 1.5 } as const;

interface Feature {
  icon: ReactElement;
  title: string;
  body: string;
  wide?: boolean;
}

const FEATURES: Feature[] = [
  {
    icon: <DashboardOutlinedIcon fontSize="large" />,
    title: 'Land portfolio dashboard',
    body: 'See all your parcels, passbooks and properties in one place, with values and health at a glance.',
    wide: true,
  },
  {
    icon: <DocumentScannerOutlinedIcon fontSize="large" />,
    title: 'AI deed & passbook reading',
    body: 'Upload a photo of a land deed or pattadar passbook and the details are read and filled in for you.',
  },
  {
    icon: <FolderOutlinedIcon fontSize="large" />,
    title: 'Documents drive',
    body: 'Keep deeds, passbooks and receipts safe and organised, ready whenever you need them.',
  },
  {
    icon: <Diversity3OutlinedIcon fontSize="large" />,
    title: 'Family groups & heirs',
    body: 'Invite family members, record heirs, and verify each person with a secure link.',
    wide: true,
  },
];

const TRUST_ITEMS = [
  { icon: <LockOutlinedIcon fontSize="small" />, text: 'Encrypted at rest, stored in India' },
  { icon: <VisibilityOffOutlinedIcon fontSize="small" />, text: 'Aadhaar numbers always masked' },
  { icon: <ManageAccountsOutlinedIcon fontSize="small" />, text: 'You control your data' },
];

export function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  // In mock mode (or when already signed in) the button goes straight to
  // /app; otherwise to OUR native /login page — never an external URL.
  const startSignIn = () => {
    navigate(isAuthMocked || isAuthenticated ? '/app' : '/login');
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: CANVAS, colorScheme: 'dark' }}>
      <GlobalStyles
        styles={{
          '@keyframes landing-spotlight': {
            '0%': { opacity: 0, transform: 'translate(-30%, -62%) scale(0.8)' },
            '100%': { opacity: 1, transform: 'translate(-15%, -40%) scale(1)' },
          },
          '@keyframes landing-aurora': {
            '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
            '50%': { transform: 'translate(4%, 6%) scale(1.08)' },
          },
          '@keyframes landing-fadeup': {
            from: { opacity: 0, transform: 'translateY(18px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
          '@keyframes landing-border-spin': {
            to: { transform: 'rotate(360deg)' },
          },
        }}
      />

      {/* ── Floating nav — blurred, bordered ─────────────────────────── */}
      <Box
        component="header"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          background: 'rgba(8, 8, 12, 0.72)',
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', py: 1.5 }}>
          <Typography variant="h6" component="span" sx={{ flexGrow: 1, fontWeight: 700, color: INK }}>
            Pattadar<Box component="span" sx={{ color: BLUE }}>.</Box>
          </Typography>
          <Button
            onClick={startSignIn}
            sx={{
              color: INK,
              border: `1px solid ${BORDER}`,
              px: 2.5,
              '&:hover': { borderColor: 'rgba(100,181,246,0.6)', background: 'rgba(100,181,246,0.08)' },
            }}
          >
            Sign in
          </Button>
        </Container>
      </Box>

      {/* ── Hero — dot grid + spotlight + aurora ─────────────────────── */}
      <Box component="section" sx={{ position: 'relative', overflow: 'hidden' }}>
        {/* Dot grid, faded towards the edges */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse 68% 62% at 50% 38%, #000 55%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 68% 62% at 50% 38%, #000 55%, transparent 100%)',
          }}
        />
        {/* Spotlight beam */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: 0,
            left: '50%',
            width: 1200,
            height: 900,
            pointerEvents: 'none',
            background:
              'radial-gradient(ellipse 50% 38% at 50% 42%, rgba(100, 181, 246, 0.22), transparent 70%)',
            animation: 'landing-spotlight 1.4s cubic-bezier(0.2, 0, 0, 1) both',
          }}
        />
        {/* Aurora blobs */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            right: '-12%',
            top: '18%',
            width: 520,
            height: 520,
            borderRadius: '50%',
            pointerEvents: 'none',
            background: 'radial-gradient(circle, rgba(25, 118, 210, 0.20), transparent 65%)',
            filter: 'blur(40px)',
            animation: 'landing-aurora 14s ease-in-out infinite',
          }}
        />
        <Container maxWidth="md" sx={{ position: 'relative', textAlign: 'center', pt: { xs: 10, md: 14 }, pb: { xs: 7, md: 9 } }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 0.6,
              mb: 3.5,
              borderRadius: 999,
              border: `1px solid ${BORDER}`,
              background: SURFACE,
              color: BLUE,
              fontSize: 12.5,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              animation: 'landing-fadeup .7s .1s cubic-bezier(0.2, 0, 0, 1) both',
            }}
          >
            Land · Records · Family
          </Box>
          <Typography
            variant="h2"
            component="h1"
            sx={{
              color: INK,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.12,
              fontSize: { xs: 40, md: 58 },
              animation: 'landing-fadeup .7s .2s cubic-bezier(0.2, 0, 0, 1) both',
            }}
          >
            Your family&apos;s land records,
            <Box
              component="span"
              sx={{
                display: 'block',
                background: `linear-gradient(100deg, ${BLUE} 10%, #bbdefb 50%, ${BLUE} 90%)`,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                color: 'transparent',
              }}
            >
              in one secure place
            </Box>
          </Typography>
          <Typography
            variant="body1"
            sx={{
              maxWidth: 620,
              mx: 'auto',
              mt: 2.5,
              mb: 4.5,
              color: INK_DIM,
              fontSize: 17,
              animation: 'landing-fadeup .7s .3s cubic-bezier(0.2, 0, 0, 1) both',
            }}
          >
            Pattadar helps Andhra Pradesh land-owners manage parcels, passbooks, registered deeds and
            family — securely, and in plain language the whole family can understand.
          </Typography>
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              justifyContent: 'center',
              flexWrap: 'wrap',
              animation: 'landing-fadeup .7s .4s cubic-bezier(0.2, 0, 0, 1) both',
            }}
          >
            {/* Moving-border CTA (Aceternity signature) */}
            <Box
              sx={{
                position: 'relative',
                borderRadius: 999,
                p: '1.5px',
                overflow: 'hidden',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  inset: '-150%',
                  background: `conic-gradient(from 0deg, transparent 0 70%, ${BLUE} 85%, #bbdefb 92%, transparent 100%)`,
                  animation: 'landing-border-spin 3.5s linear infinite',
                },
              }}
            >
              <Button
                size="large"
                onClick={startSignIn}
                sx={{
                  position: 'relative',
                  px: 5,
                  py: 1.4,
                  fontSize: '1.02rem',
                  borderRadius: 999,
                  color: '#0a0a0f',
                  background: '#fff',
                  '&:hover': { background: '#e3f2fd' },
                }}
              >
                Get started
              </Button>
            </Box>
            <Button
              size="large"
              onClick={startSignIn}
              sx={{
                px: 4,
                borderRadius: 999,
                color: INK,
                border: `1px solid ${BORDER}`,
                '&:hover': { borderColor: 'rgba(100,181,246,0.6)', background: 'rgba(100,181,246,0.08)' },
              }}
            >
              Sign in
            </Button>
          </Box>
          {/* Trust line */}
          <Box
            sx={{
              display: 'flex',
              gap: { xs: 2, md: 4 },
              justifyContent: 'center',
              flexWrap: 'wrap',
              mt: 5,
              animation: 'landing-fadeup .7s .5s cubic-bezier(0.2, 0, 0, 1) both',
            }}
          >
            {TRUST_ITEMS.map((item) => (
              <Box key={item.text} sx={{ display: 'flex', alignItems: 'center', gap: 1, color: INK_FAINT, '& svg': { color: BLUE } }}>
                {item.icon}
                <Typography variant="caption">{item.text}</Typography>
              </Box>
            ))}
          </Box>
        </Container>

        {/* Product frame — the portfolio preview in a glowing border */}
        <Container maxWidth="md" sx={{ position: 'relative', pb: { xs: 8, md: 11 } }}>
          <Box
            sx={{
              borderRadius: '20px',
              p: '1px',
              background: `linear-gradient(135deg, rgba(100,181,246,0.55), rgba(255,255,255,0.08) 40%, rgba(25,118,210,0.45))`,
              boxShadow: '0 30px 80px -30px rgba(25, 118, 210, 0.35), 0 20px 60px -30px rgba(0,0,0,0.8)',
            }}
          >
            <Box sx={{ borderRadius: '19px', background: '#0d0d13', p: { xs: 2.5, md: 3.5 } }}>
              <Typography variant="overline" sx={{ color: BLUE, letterSpacing: 1.6 }}>
                Land portfolio · sample
              </Typography>
              <Typography variant="h4" component="p" sx={{ color: INK, my: 0.5, fontWeight: 700 }} className="tnum">
                ₹2,84,50,000
              </Typography>
              <Typography variant="body2" sx={{ color: INK_DIM, mb: 2.5 }}>
                12 parcels · 3 passbooks · 2 properties
              </Typography>
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                {[
                  ['Survey 123/2A · Guntur', '2.45 acres'],
                  ['Survey 87/1B · Krishna', '1.10 acres'],
                  ['Flat · Vijayawada', '1,250 sft'],
                  ['Survey 456/3 · Kurnool', '3.20 acres'],
                ].map(([k, v]) => (
                  <Box key={k} sx={{ p: 1.5, borderRadius: '12px', border: `1px solid ${BORDER}`, background: SURFACE }}>
                    <Typography variant="caption" sx={{ color: INK_FAINT, display: 'block' }}>
                      {k}
                    </Typography>
                    <Typography variant="body2" sx={{ color: INK, fontWeight: 600 }}>
                      {v}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* ── Bento features ───────────────────────────────────────────── */}
      <Container maxWidth="lg" component="section" sx={{ py: { xs: 7, md: 9 } }}>
        <Typography component="p" sx={sectionEyebrowSx}>
          Everything in one place
        </Typography>
        <Typography variant="h4" component="h2" sx={{ ...sectionTitleSx, mb: 4 }}>
          What you can do
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gap: 2.5,
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
          }}
        >
          {FEATURES.map((f) => (
            <Box key={f.title} sx={{ ...glowCardSx, gridColumn: { md: f.wide ? 'span 2' : 'span 1' } }}>
              <Box sx={{ color: BLUE, mb: 1.5 }}>{f.icon}</Box>
              <Typography variant="h6" component="h3" sx={{ color: INK, mb: 1 }}>
                {f.title}
              </Typography>
              <Typography variant="body2" sx={{ color: INK_DIM }}>
                {f.body}
              </Typography>
            </Box>
          ))}
        </Box>
      </Container>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <Container maxWidth="lg" component="section" sx={{ py: { xs: 6, md: 8 } }}>
        <Typography component="p" sx={sectionEyebrowSx}>
          Three simple steps
        </Typography>
        <Typography variant="h4" component="h2" sx={{ ...sectionTitleSx, mb: 5 }}>
          How Pattadar works
        </Typography>
        <Box sx={{ display: 'grid', gap: 4, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
          {[
            {
              n: '1',
              title: 'Add your land in minutes',
              body: 'Take a photo of your pattadar passbook or registered deed — the details are read for you and filled in automatically. No typing, no forms from scratch.',
            },
            {
              n: '2',
              title: 'Bring in your family',
              body: 'Add family members and heirs, send each one a secure verification link on WhatsApp or SMS, and see who has confirmed — all in one place.',
            },
            {
              n: '3',
              title: 'Everything stays organised',
              body: 'Parcels, passbooks, property papers and values — safe, together, and explained in plain language. Your records are ready whenever you need them.',
            },
          ].map((step) => (
            <Box key={step.n} sx={{ textAlign: 'center', px: 2 }}>
              <Box
                sx={{
                  width: 52,
                  height: 52,
                  mx: 'auto',
                  mb: 2,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  fontWeight: 700,
                  color: '#0a0a0f',
                  background: `linear-gradient(135deg, #bbdefb 0%, ${BLUE} 55%, ${BLUE_DEEP} 100%)`,
                  boxShadow: '0 8px 24px rgba(25, 118, 210, 0.4)',
                }}
              >
                {step.n}
              </Box>
              <Typography variant="h6" component="h3" sx={{ color: INK, mb: 1 }}>
                {step.title}
              </Typography>
              <Typography variant="body2" sx={{ color: INK_DIM }}>
                {step.body}
              </Typography>
            </Box>
          ))}
        </Box>
      </Container>

      {/* ── 6 Pillars ────────────────────────────────────────────────── */}
      <Container maxWidth="lg" component="section" sx={{ py: { xs: 6, md: 8 } }}>
        <Typography component="p" sx={sectionEyebrowSx}>
          Built on how AP land records actually work
        </Typography>
        <Typography variant="h4" component="h2" sx={sectionTitleSx}>
          The 6 pillars of your land record
        </Typography>
        <Typography variant="body1" sx={{ textAlign: 'center', color: INK_DIM, maxWidth: 680, mx: 'auto', mb: 5 }}>
          Accurate ownership rests on six kinds of records. Pattadar understands each one — and keeps
          your copies organised, linked and explained.
        </Typography>
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
          {[
            { icon: <ArticleOutlinedIcon />, title: '1B & Adangal', body: 'The core ownership record — who holds the land and with what rights. Validating its history is how true ownership is established and protected from tampering.' },
            { icon: <StraightenOutlinedIcon />, title: 'Survey number & boundaries', body: 'The identity of your land on the ground. Captured precisely so your parcel can be identified at any point in time, without ambiguity.' },
            { icon: <HistoryEduOutlinedIcon />, title: 'Register of Survey Records', body: 'The historical archive. Old records go missing or fade — your copies are preserved digitally as lasting evidence.' },
            { icon: <SquareFootOutlinedIcon />, title: 'Field Measurement Book', body: 'The exact dimensions and extents used in surveys, disputes and transactions. Essential when the size of the land is questioned.' },
            { icon: <MapOutlinedIcon />, title: 'Village & registration maps', body: 'Where your land sits and which registration office serves it — so the right office and the right map are always one tap away.' },
            { icon: <GavelOutlinedIcon />, title: 'Legal rights', body: 'Court orders and legal developments can affect property interests. Keeping the legal picture beside the land record keeps decisions informed.' },
          ].map((p, i) => (
            <Box key={p.title} sx={glowCardSx}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Box sx={{ color: BLUE, display: 'flex' }}>{p.icon}</Box>
                <Typography variant="caption" sx={{ color: BLUE, fontWeight: 700, letterSpacing: 1 }}>
                  {'0' + (i + 1)}
                </Typography>
              </Box>
              <Typography variant="h6" component="h3" sx={{ color: INK, mb: 1 }}>
                {p.title}
              </Typography>
              <Typography variant="body2" sx={{ color: INK_DIM }}>
                {p.body}
              </Typography>
            </Box>
          ))}
        </Box>
      </Container>

      {/* ── Stages ───────────────────────────────────────────────────── */}
      <Container maxWidth="lg" component="section" sx={{ py: { xs: 6, md: 8 } }}>
        <Typography component="p" sx={sectionEyebrowSx}>
          Solutions for common revenue issues
        </Typography>
        <Typography variant="h4" component="h2" sx={sectionTitleSx}>
          With you at every stage
        </Typography>
        <Typography variant="body1" sx={{ textAlign: 'center', color: INK_DIM, maxWidth: 660, mx: 'auto', mb: 5 }}>
          Revenue problems appear before, during and after a property changes hands. Pattadar was born
          from those pain points — and organises your records so each stage goes smoothly.
        </Typography>
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
          {[
            { stage: 'Before buying or selling', body: 'Have the 1B, Adangal and field measurement records validated and side-by-side, so surprises surface before money moves — not after.' },
            { stage: 'During the transaction', body: 'The right documents, the right extents and the right parties — everything the registration needs, organised and shareable in one place.' },
            { stage: 'After the transaction', body: 'New ownership lands in your passbook automatically, with the deed, receipts and family records linked and preserved from day one.' },
          ].map((c, i) => (
            <Box key={c.stage} sx={glowCardSx}>
              <Typography variant="caption" sx={{ color: BLUE, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                Stage {i + 1}
              </Typography>
              <Typography variant="h6" component="h3" sx={{ color: INK, mt: 0.5, mb: 1 }}>
                {c.stage}
              </Typography>
              <Typography variant="body2" sx={{ color: INK_DIM }}>
                {c.body}
              </Typography>
            </Box>
          ))}
        </Box>
      </Container>

      {/* ── Wallet teaser — glow frame ───────────────────────────────── */}
      <Container maxWidth="md" component="section" sx={{ py: { xs: 6, md: 8 }, textAlign: 'center' }}>
        <Box
          sx={{
            borderRadius: '20px',
            p: '1px',
            background: `linear-gradient(135deg, rgba(100,181,246,0.5), rgba(255,255,255,0.08) 45%, rgba(25,118,210,0.4))`,
          }}
        >
          <Box sx={{ borderRadius: '19px', background: '#0d0d13', px: { xs: 3, md: 6 }, py: { xs: 4, md: 5 } }}>
            <AccountBalanceWalletOutlinedIcon sx={{ fontSize: 40, color: BLUE, mb: 1 }} />
            <Typography variant="h6" component="h2" sx={{ color: INK, mb: 1 }}>
              Pattadar Wallet
              <Chip
                label="Coming soon"
                size="small"
                sx={{ ml: 1.5, fontWeight: 600, color: BLUE, border: `1px solid rgba(100,181,246,0.5)`, background: 'rgba(100,181,246,0.1)' }}
              />
            </Typography>
            <Typography variant="body1" sx={{ color: INK_DIM, maxWidth: 560, mx: 'auto' }}>
              Pay stamp duty, registration fees and family expenses from one secure balance — with
              every transaction recorded next to the land it belongs to.
            </Typography>
          </Box>
        </Box>
      </Container>

      {/* ── Roadmap ──────────────────────────────────────────────────── */}
      <Container maxWidth="lg" component="section" sx={{ py: { xs: 6, md: 8 } }}>
        <Typography component="p" sx={sectionEyebrowSx}>
          Beyond record-keeping
        </Typography>
        <Typography variant="h4" component="h2" sx={{ ...sectionTitleSx, mb: 5 }}>
          Services we&apos;re building next
        </Typography>
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
          {[
            { title: 'AI Watch Dog', body: 'Alerts you to suspicious activity around your records — like double registrations or unauthorised 1B/Adangal changes.' },
            { title: 'On-demand property visits', body: 'Living far away? Request a photo visit, maintenance check or paperwork errand, delivered on a promised timeline.' },
            { title: 'Legal connect', body: 'When something goes wrong, reach a lawyer and share documents securely — everything stays inside the platform.' },
            { title: 'Trusted document writers', body: 'Ready to transact? Find rated document writers to prepare your papers at the right time.' },
          ].map((sv) => (
            <Box key={sv.title} sx={glowCardSx}>
              <Chip
                label="On the roadmap"
                size="small"
                sx={{ mb: 1.5, color: BLUE, border: `1px solid rgba(100,181,246,0.4)`, background: 'transparent' }}
              />
              <Typography variant="h6" component="h3" sx={{ color: INK, mb: 1 }}>
                {sv.title}
              </Typography>
              <Typography variant="body2" sx={{ color: INK_DIM }}>
                {sv.body}
              </Typography>
            </Box>
          ))}
        </Box>
      </Container>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <Container maxWidth="md" component="section" sx={{ py: { xs: 6, md: 8 } }}>
        <Typography component="p" sx={sectionEyebrowSx}>
          Common questions
        </Typography>
        <Typography variant="h4" component="h2" sx={{ ...sectionTitleSx, mb: 4 }}>
          Asked by families like yours
        </Typography>
        {[
          ['Is my Aadhaar number safe here?', 'Yes. Aadhaar numbers are always shown masked (XXXX XXXX 1234), stored encrypted in India, and never shared. Pattadar does not perform any Aadhaar authentication — your card photo is kept only for your own records.'],
          ['Who can see my land records?', 'Only you, and the family members you personally invite. Each member confirms through a secure link before they can see anything.'],
          ['Is Pattadar a government website?', 'No. Pattadar is a private service that helps you keep your own copies organised. Your official records always remain with the government registration offices.'],
          ['What if the AI reads my deed wrongly?', 'Every detail the AI fills in is shown to you for checking before it is saved — you always have the final word.'],
          ['What does it cost?', 'The pilot is free for invited families. Pricing for later will be announced well in advance — nothing is charged silently.'],
        ].map(([q, a]) => (
          <Accordion
            key={q}
            disableGutters
            elevation={0}
            sx={{
              background: SURFACE,
              color: INK,
              border: `1px solid ${BORDER}`,
              '&:not(:last-child)': { mb: 1 },
              '&::before': { display: 'none' },
              borderRadius: '12px !important',
              overflow: 'hidden',
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: BLUE }} />}>
              <Typography variant="body1" sx={{ fontWeight: 600, color: INK }}>
                {q}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" sx={{ color: INK_DIM }}>
                {a}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Container>

      {/* ── Final CTA — centered glow ────────────────────────────────── */}
      <Box component="section" sx={{ position: 'relative', overflow: 'hidden', textAlign: 'center', py: { xs: 8, md: 11 } }}>
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: '50%',
            bottom: '-40%',
            transform: 'translateX(-50%)',
            width: 900,
            height: 500,
            pointerEvents: 'none',
            background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(25, 118, 210, 0.28), transparent 70%)',
            filter: 'blur(30px)',
          }}
        />
        <Container maxWidth="sm" sx={{ position: 'relative' }}>
          <Typography variant="h4" component="h2" sx={{ color: INK, fontWeight: 700, mb: 1.5 }}>
            Your family&apos;s land deserves this care
          </Typography>
          <Typography variant="body1" sx={{ color: INK_DIM, mb: 3.5 }}>
            Start with one passbook photo — see everything fall into place.
          </Typography>
          <Button
            size="large"
            onClick={startSignIn}
            sx={{
              px: 5,
              py: 1.4,
              fontSize: '1.02rem',
              borderRadius: 999,
              color: '#0a0a0f',
              background: '#fff',
              boxShadow: '0 10px 40px -10px rgba(100, 181, 246, 0.5)',
              '&:hover': { background: '#e3f2fd' },
            }}
          >
            Get started free
          </Button>
        </Container>
      </Box>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <Box component="footer" sx={{ mt: 'auto', borderTop: `1px solid ${BORDER}` }}>
        <Container maxWidth="lg" sx={{ py: 3 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="caption" sx={{ color: INK_FAINT }}>
              © {new Date().getFullYear()} Pattadar
            </Typography>
            <Box sx={{ display: 'flex', gap: 3 }}>
              <Link component={RouterLink} to="/privacy" variant="caption" sx={{ color: INK_FAINT }}>
                Privacy
              </Link>
              <Link component={RouterLink} to="/terms" variant="caption" sx={{ color: INK_FAINT }}>
                Terms
              </Link>
              <Link href="mailto:grievance@pattadar.com" variant="caption" sx={{ color: INK_FAINT }}>
                Grievance: grievance@pattadar.com
              </Link>
            </Box>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
