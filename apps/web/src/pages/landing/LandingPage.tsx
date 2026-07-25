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
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import SquareFootOutlinedIcon from '@mui/icons-material/SquareFootOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Chip from '@mui/material/Chip';
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
  const { isAuthenticated } = useAuth();
  // In mock mode (or when already signed in) the button goes straight to
  // /app; otherwise to OUR native /login page — never an external URL.
  const startSignIn = () => {
    navigate(isAuthMocked || isAuthenticated ? '/app' : '/login');
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
            sx={{
              flexGrow: 1,
              fontWeight: 700,
              background: 'linear-gradient(120deg, #146c43 20%, #c9a227 80%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Pattadar
          </Typography>
          <Button variant="outlined" onClick={startSignIn}>
            Sign in
          </Button>
        </Toolbar>
      </AppBar>

      {/* Hero — deep emerald gradient: green IS the background here */}
      <Box
        component="section"
        sx={{
          background:
            'radial-gradient(1400px 620px at 50% -12%, rgba(231,199,102,0.32), transparent 62%), radial-gradient(700px 300px at 85% 105%, rgba(201,162,39,0.22), transparent 70%), linear-gradient(160deg, #0b3d2e 0%, #146c43 62%, #0f5132 100%)',
          color: '#f4f8f4',
          borderBottom: '1px solid rgba(201,162,39,0.55)',
          boxShadow: 'inset 0 -24px 48px -32px rgba(201,162,39,0.45)',
        }}
      >
        <Container maxWidth="md" sx={{ textAlign: 'center', py: { xs: 9, md: 13 } }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 0.5,
              mb: 3,
              borderRadius: 999,
              border: '1px solid rgba(231,199,102,0.55)',
              background: 'linear-gradient(135deg, rgba(231,199,102,0.16), rgba(201,162,39,0.08))',
              backdropFilter: 'blur(8px)',
              color: '#e7c766',
              fontSize: 13,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            Land · Records · Family
          </Box>
          <Typography variant="h1" component="h1" gutterBottom sx={{ color: 'inherit' }}>
            Your family's land records, in one secure place
          </Typography>
          <Typography variant="body1" sx={{ maxWidth: 640, mx: 'auto', mb: 4, color: 'rgba(244,248,244,0.82)' }}>
            Pattadar helps Andhra Pradesh land-owners manage parcels, passbooks, registered deeds and
            family — securely, and in plain language the whole family can understand.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={startSignIn}
            sx={{
              px: 5,
              py: 1.5,
              fontSize: '1.05rem',
              color: '#1c1b16',
              background: 'linear-gradient(135deg, #e7c766 0%, #c9a227 55%, #b8860b 100%)',
              border: '1px solid rgba(244,248,244,0.35)',
              boxShadow: '0 6px 24px rgba(201,162,39,0.35), inset 0 1px 0 rgba(255,255,255,0.4)',
              '&:hover': {
                background: 'linear-gradient(135deg, #f0d47e 0%, #d4ad33 55%, #c2900f 100%)',
                boxShadow: '0 8px 28px rgba(201,162,39,0.45), inset 0 1px 0 rgba(255,255,255,0.5)',
              },
            }}
          >
            Get started
          </Button>
        </Container>
      </Box>

      {/* Feature cards */}
      <Box component="section" sx={{ bgcolor: 'background.paper', py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography
            variant="overline"
            component="p"
            sx={{ textAlign: 'center', color: '#b8860b', letterSpacing: 2, mb: 0.5 }}
          >
            Everything in one place
          </Typography>
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
              <Card
                key={f.title}
                variant="outlined"
                sx={{
                  height: '100%',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'border-color .25s, box-shadow .25s, transform .25s',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    inset: '0 0 auto 0',
                    height: 3,
                    background: 'linear-gradient(90deg, transparent, #c9a227, transparent)',
                    opacity: 0,
                    transition: 'opacity .25s',
                  },
                  '&:hover': {
                    borderColor: 'rgba(201,162,39,0.6)',
                    boxShadow: '0 10px 30px -12px rgba(201,162,39,0.35)',
                    transform: 'translateY(-2px)',
                    '&::before': { opacity: 1 },
                  },
                }}
              >
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


      {/* How it works — three gold steps */}
      <Container maxWidth="lg" component="section" sx={{ py: { xs: 6, md: 8 } }}>
        <Typography variant="overline" component="p" sx={{ textAlign: 'center', color: '#b8860b', letterSpacing: 2, mb: 0.5 }}>
          Three simple steps
        </Typography>
        <Typography variant="h2" component="h2" sx={{ textAlign: 'center', mb: 5 }}>
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
                  width: 56, height: 56, mx: 'auto', mb: 2, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, fontWeight: 700, color: '#1c1b16',
                  background: 'linear-gradient(135deg, #e7c766 0%, #c9a227 60%, #b8860b 100%)',
                  boxShadow: '0 6px 18px rgba(201,162,39,0.35), inset 0 1px 0 rgba(255,255,255,0.5)',
                }}
              >
                {step.n}
              </Box>
              <Typography variant="h4" component="h3" sx={{ mb: 1 }}>{step.title}</Typography>
              <Typography variant="body2" color="text.secondary">{step.body}</Typography>
            </Box>
          ))}
        </Box>
      </Container>


      {/* 6 Pillars — domain authority from the AP revenue system */}
      <Box component="section" sx={{ bgcolor: 'background.paper', py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography variant="overline" component="p" sx={{ textAlign: 'center', color: '#b8860b', letterSpacing: 2, mb: 0.5 }}>
            Built on how AP land records actually work
          </Typography>
          <Typography variant="h2" component="h2" sx={{ textAlign: 'center', mb: 1.5 }}>
            The 6 pillars of your land record
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 680, mx: 'auto', mb: 5 }}>
            Accurate ownership rests on six kinds of records. Pattadar understands each one — and
            keeps your copies organised, linked and explained.
          </Typography>
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
            {[
              { icon: <ArticleOutlinedIcon />, title: '1B & Adangal', body: 'The core ownership record — who holds the land and with what rights. Validating its history is how true ownership is established and protected from tampering.' },
              { icon: <StraightenOutlinedIcon />, title: 'Survey number & boundaries', body: 'The identity of your land on the ground. Captured precisely so your parcel can be identified at any point in time, without ambiguity.' },
              { icon: <HistoryEduOutlinedIcon />, title: 'Register of Survey Records', body: 'The historical archive. Old records go missing or fade — your copies are preserved digitally as lasting evidence.' },
              { icon: <SquareFootOutlinedIcon />, title: 'Field Measurement Book', body: 'The exact dimensions and extents used in surveys, disputes and transactions. Essential when the size of the land is questioned.' },
              { icon: <MapOutlinedIcon />, title: 'Village & registration maps', body: 'Where your land sits and which registration office serves it — so the right office and the right map are always one tap away.' },
              { icon: <GavelOutlinedIcon />, title: 'Legal rights', body: 'Court orders and legal developments can affect property interests. Keeping the legal picture beside the land record keeps decisions informed.' },
            ].map((p, i) => (
              <Card key={p.title} variant="outlined" sx={{ height: '100%', position: 'relative' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                    <Box sx={{ color: '#b8860b', display: 'flex' }}>{p.icon}</Box>
                    <Typography variant="caption" sx={{ color: '#b8860b', fontWeight: 700, letterSpacing: 1 }}>
                      {'0' + (i + 1)}
                    </Typography>
                  </Box>
                  <Typography variant="h4" component="h3" sx={{ mb: 1 }}>{p.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{p.body}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Portfolio preview — a taste of the dashboard on emerald */}
      <Box component="section" sx={{ background: 'linear-gradient(165deg, #0b3d2e 0%, #146c43 85%)', py: { xs: 6, md: 9 } }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'grid', gap: 5, alignItems: 'center', gridTemplateColumns: { xs: '1fr', md: '5fr 6fr' } }}>
            <Box sx={{ color: '#f4f8f4' }}>
              <Typography variant="overline" component="p" sx={{ color: '#e7c766', letterSpacing: 2, mb: 0.5 }}>
                Your land, at a glance
              </Typography>
              <Typography variant="h2" component="h2" sx={{ color: 'inherit', mb: 2 }}>
                A living portfolio, not a pile of papers
              </Typography>
              <Typography variant="body1" sx={{ color: 'rgba(244,248,244,0.85)', mb: 2 }}>
                Every survey number, extent and value comes together into one clear picture — with
                gentle reminders when a document needs attention or a family member is yet to verify.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {['Parcels', 'Passbooks', 'Properties', 'Documents', 'Family'].map((c) => (
                  <Chip key={c} label={c} size="small" sx={{ color: '#e7c766', borderColor: 'rgba(231,199,102,0.5)', bgcolor: 'rgba(231,199,102,0.08)' }} variant="outlined" />
                ))}
              </Box>
            </Box>
            <Box
              sx={{
                borderRadius: 4,
                border: '1px solid rgba(231,199,102,0.5)',
                background:
                  'radial-gradient(420px 200px at 85% -10%, rgba(231,199,102,0.22), transparent 65%), linear-gradient(135deg, rgba(8,32,24,0.72), rgba(15,81,50,0.45))',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                boxShadow:
                  'inset 0 1px 0 rgba(244,248,244,0.25), 0 18px 48px -20px rgba(0,0,0,0.5), 0 8px 32px -16px rgba(201,162,39,0.35)',
              }}
            >
              <Box sx={{ p: { xs: 2.5, md: 3 } }}>
                <Typography variant="overline" sx={{ color: '#e7c766', letterSpacing: 1.5 }}>
                  Land portfolio · sample
                </Typography>
                <Typography variant="h2" component="p" sx={{ color: '#f4f8f4', my: 0.5 }}>
                  ₹2,84,50,000
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(244,248,244,0.75)', mb: 2 }}>
                  12 parcels · 3 passbooks · 2 properties
                </Typography>
                <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  {[
                    ['Survey 123/2A · Guntur', '2.45 acres'],
                    ['Survey 87/1B · Krishna', '1.10 acres'],
                    ['Flat · Vijayawada', '1,250 sft'],
                    ['Survey 456/3 · Kurnool', '3.20 acres'],
                  ].map(([k, v]) => (
                    <Box key={k} sx={{ p: 1.25, borderRadius: 2, border: '1px solid rgba(244,248,244,0.18)', bgcolor: 'rgba(244,248,244,0.06)' }}>
                      <Typography variant="caption" sx={{ color: 'rgba(244,248,244,0.7)', display: 'block' }}>{k}</Typography>
                      <Typography variant="body2" sx={{ color: '#f4f8f4', fontWeight: 600 }}>{v}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>


      {/* Revenue issues by transaction stage */}
      <Container maxWidth="lg" component="section" sx={{ py: { xs: 6, md: 8 } }}>
        <Typography variant="overline" component="p" sx={{ textAlign: 'center', color: '#b8860b', letterSpacing: 2, mb: 0.5 }}>
          Solutions for common revenue issues
        </Typography>
        <Typography variant="h2" component="h2" sx={{ textAlign: 'center', mb: 1.5 }}>
          With you at every stage
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 660, mx: 'auto', mb: 5 }}>
          Revenue problems appear before, during and after a property changes hands. Pattadar was
          born from those pain points — and organises your records so each stage goes smoothly.
        </Typography>
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
          {[
            { stage: 'Before buying or selling', body: 'Have the 1B, Adangal and field measurement records validated and side-by-side, so surprises surface before money moves — not after.' },
            { stage: 'During the transaction', body: 'The right documents, the right extents and the right parties — everything the registration needs, organised and shareable in one place.' },
            { stage: 'After the transaction', body: 'New ownership lands in your passbook automatically, with the deed, receipts and family records linked and preserved from day one.' },
          ].map((c, i) => (
            <Card key={c.stage} variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="caption" sx={{ color: '#b8860b', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                  Stage {i + 1}
                </Typography>
                <Typography variant="h4" component="h3" sx={{ mt: 0.5, mb: 1 }}>{c.stage}</Typography>
                <Typography variant="body2" color="text.secondary">{c.body}</Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Container>

      {/* Wallet teaser — gold glass */}
      <Container maxWidth="md" component="section" sx={{ py: { xs: 6, md: 8 }, textAlign: 'center' }}>
        <Box
          sx={{
            borderRadius: 4, px: { xs: 3, md: 6 }, py: { xs: 4, md: 5 },
            border: '1px solid rgba(201,162,39,0.45)',
            background: 'linear-gradient(135deg, rgba(231,199,102,0.14), rgba(201,162,39,0.05))',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 12px 40px -18px rgba(201,162,39,0.4)',
          }}
        >
          <AccountBalanceWalletOutlinedIcon sx={{ fontSize: 40, color: '#b8860b', mb: 1 }} />
          <Typography variant="h3" component="h2" sx={{ mb: 1 }}>
            Pattadar Wallet
            <Chip label="Coming soon" size="small" sx={{ ml: 1.5, color: '#1c1b16', background: 'linear-gradient(135deg, #e7c766, #c9a227)', fontWeight: 600 }} />
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 560, mx: 'auto' }}>
            Pay stamp duty, registration fees and family expenses from one secure balance — with every
            transaction recorded next to the land it belongs to.
          </Typography>
        </Box>
      </Container>


      {/* Services roadmap — the old vision, honestly labeled */}
      <Box component="section" sx={{ bgcolor: 'background.paper', py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography variant="overline" component="p" sx={{ textAlign: 'center', color: '#b8860b', letterSpacing: 2, mb: 0.5 }}>
            Beyond record-keeping
          </Typography>
          <Typography variant="h2" component="h2" sx={{ textAlign: 'center', mb: 5 }}>
            Services we're building next
          </Typography>
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
            {[
              { title: 'AI Watch Dog', body: 'Alerts you to suspicious activity around your records — like double registrations or unauthorised 1B/Adangal changes.' },
              { title: 'On-demand property visits', body: 'Living far away? Request a photo visit, maintenance check or paperwork errand, delivered on a promised timeline.' },
              { title: 'Legal connect', body: 'When something goes wrong, reach a lawyer and share documents securely — everything stays inside the platform.' },
              { title: 'Trusted document writers', body: 'Ready to transact? Find rated document writers to prepare your papers at the right time.' },
            ].map((sv) => (
              <Card key={sv.title} variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Chip label="On the roadmap" size="small" variant="outlined" sx={{ mb: 1.5, color: '#b8860b', borderColor: 'rgba(201,162,39,0.5)' }} />
                  <Typography variant="h4" component="h3" sx={{ mb: 1 }}>{sv.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{sv.body}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* FAQ — plain language, honest answers */}
      <Box component="section" sx={{ bgcolor: 'background.paper', py: { xs: 6, md: 8 } }}>
        <Container maxWidth="md">
          <Typography variant="overline" component="p" sx={{ textAlign: 'center', color: '#b8860b', letterSpacing: 2, mb: 0.5 }}>
            Common questions
          </Typography>
          <Typography variant="h2" component="h2" sx={{ textAlign: 'center', mb: 4 }}>
            Asked by families like yours
          </Typography>
          {[
            ['Is my Aadhaar number safe here?', 'Yes. Aadhaar numbers are always shown masked (XXXX XXXX 1234), stored encrypted in India, and never shared. Pattadar does not perform any Aadhaar authentication — your card photo is kept only for your own records.'],
            ['Who can see my land records?', 'Only you, and the family members you personally invite. Each member confirms through a secure link before they can see anything.'],
            ['Is Pattadar a government website?', 'No. Pattadar is a private service that helps you keep your own copies organised. Your official records always remain with the government registration offices.'],
            ['What if the AI reads my deed wrongly?', 'Every detail the AI fills in is shown to you for checking before it is saved — you always have the final word.'],
            ['What does it cost?', 'The pilot is free for invited families. Pricing for later will be announced well in advance — nothing is charged silently.'],
          ].map(([q, a]) => (
            <Accordion key={q} disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', '&:not(:last-child)': { mb: 1 }, '&::before': { display: 'none' }, borderRadius: 2, overflow: 'hidden' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#b8860b' }} />}>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>{q}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" color="text.secondary">{a}</Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Container>
      </Box>

      {/* Final CTA — emerald band */}
      <Box component="section" sx={{ background: 'radial-gradient(900px 380px at 50% 120%, rgba(231,199,102,0.25), transparent 65%), linear-gradient(160deg, #0f5132 0%, #0b3d2e 100%)', py: { xs: 7, md: 9 }, textAlign: 'center' }}>
        <Container maxWidth="sm">
          <Typography variant="h2" component="h2" sx={{ color: '#f4f8f4', mb: 1.5 }}>
            Your family's land deserves this care
          </Typography>
          <Typography variant="body1" sx={{ color: 'rgba(244,248,244,0.8)', mb: 3.5 }}>
            Start with one passbook photo — see everything fall into place.
          </Typography>
          <Button
            variant="contained" size="large" onClick={startSignIn}
            sx={{
              px: 5, py: 1.5, fontSize: '1.05rem', color: '#1c1b16',
              background: 'linear-gradient(135deg, #e7c766 0%, #c9a227 55%, #b8860b 100%)',
              border: '1px solid rgba(244,248,244,0.35)',
              boxShadow: '0 6px 24px rgba(201,162,39,0.35), inset 0 1px 0 rgba(255,255,255,0.4)',
              '&:hover': { background: 'linear-gradient(135deg, #f0d47e 0%, #d4ad33 55%, #c2900f 100%)' },
            }}
          >
            Get started free
          </Button>
        </Container>
      </Box>

      {/* Trust / compliance strip — deep emerald band, gold icons */}
      <Box
        component="section"
        sx={{
          background: 'linear-gradient(160deg, #0b3d2e 0%, #0f5132 100%)',
          borderTop: '1px solid rgba(201,162,39,0.45)',
          borderBottom: '1px solid rgba(201,162,39,0.45)',
        }}
      >
        <Container maxWidth="lg" sx={{ py: { xs: 3.5, md: 4.5 } }}>
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
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  color: 'rgba(244,248,244,0.92)',
                  '& svg': { color: '#e7c766' },
                }}
              >
                {item.icon}
                <Typography variant="body2">{item.text}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

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
