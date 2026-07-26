/**
 * Profile — functional port of the rhub ProfileView: identity card, preferred
 * language, step-up MFA toggle, "My Address" (feeds the "Same as my address"
 * shortcut when adding family members), districts of interest, notification
 * channels, and the DPDP-compliant masked-Aadhaar reference (raw Aadhaar is
 * never stored). Saves via the updateProfile mutation.
 */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { gql } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { HeaderSkeleton, TableSkeleton } from '../components/Skeletons';
import { avaColor } from '../lib/format';
import { useLiveOrSample } from '../data/useLiveOrSample';
import { useProfile } from '../data/hooks';

interface DistrictRow {
  id: string;
  name: string;
  code: string;
}

function useDistricts() {
  return useLiveOrSample<DistrictRow[]>(
    'profile-districts',
    async () => (await gql<{ districts: DistrictRow[] }>('query { districts { id name code } }')).districts ?? [],
    [],
  );
}

interface Toast {
  msg: string;
  severity: 'success' | 'error';
}

export function ProfilePage() {
  const { data: me, isSample, isLoading } = useProfile();
  const { data: districts } = useDistricts();
  const queryClient = useQueryClient();

  const [language, setLanguage] = useState('en');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [address, setAddress] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<string[]>([]);
  const [masked, setMasked] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Seed the form once the profile lands (same fields the source loads).
  useEffect(() => {
    // Normalize legacy/sample labels ("English"/"Telugu") to the en/te keys.
    const lang = String(me.language || 'en').toLowerCase();
    setLanguage(lang.startsWith('te') ? 'te' : 'en');
    setMfaEnabled(!!me.mfaEnabled);
    setAddress(me.address || '');
    setInterests((me.districtsOfInterest || '').split(',').filter(Boolean));
    setPrefs((me.notificationPrefs || '').split(',').filter(Boolean));
    setMasked(me.kycRefMasked || '');
  }, [me]);

  const togglePref = (key: string) =>
    setPrefs((p) => (p.includes(key) ? p.filter((x) => x !== key) : [...p, key]));

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await gql<{ updateProfile: { kycRefMasked: string } | null }>(
        'mutation($l:String!,$d:String!,$n:String!,$k:String!,$m:Boolean!,$a:String){ updateProfile(language:$l, districtsOfInterest:$d, notificationPrefs:$n, kycRef:$k, mfaEnabled:$m, address:$a){ kycRefMasked } }',
        {
          l: language,
          d: interests.join(','),
          n: prefs.join(','),
          k: aadhaar,
          m: mfaEnabled,
          a: address,
        },
      );
      if (data?.updateProfile) {
        setToast({ msg: 'Profile saved', severity: 'success' });
        setMasked(data.updateProfile.kycRefMasked);
        setAadhaar('');
        void queryClient.invalidateQueries({ queryKey: ['pattadar', 'profile'] });
      } else {
        setToast({ msg: 'Could not save the profile', severity: 'error' });
      }
    } catch {
      setToast({ msg: 'Could not save the profile', severity: 'error' });
    }
    setSaving(false);
  };

  // Shaped loading state — never seed the form with uncredited sample data.
  if (isLoading)
    return (
      <>
        <HeaderSkeleton />
        <TableSkeleton rows={4} />
      </>
    );

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Profile"
        subtitle="Your identity, preferences and consent — used across passbooks, families and notifications."
        sample={isSample}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' }, gap: 2 }}>
        {/* ── Identity ─────────────────────────────────────────────── */}
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <Avatar sx={{ width: 52, height: 52, bgcolor: avaColor(me.name || me.id || '?'), fontWeight: 700 }}>
                {(me.name || me.id || '?').slice(0, 1).toUpperCase()}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" component="h2">
                  {me.name || '—'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {me.id || '—'}
                </Typography>
              </Box>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Email
            </Typography>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              {me.email || '—'}
            </Typography>
            <Alert severity="info">
              You&apos;re signed in via the platform. Mobile-number + OTP sign-in and Aadhaar eKYC
              verification arrive in a later wave.
            </Alert>
          </CardContent>
        </Card>

        {/* ── Preferences & Consent ────────────────────────────────── */}
        <Card>
          <CardContent>
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
              Preferences & Consent
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
              <TextField
                select
                size="small"
                label="Preferred Language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <MenuItem value="en">English</MenuItem>
                <MenuItem value="te">తెలుగు (Telugu)</MenuItem>
              </TextField>
              <FormControlLabel
                control={<Switch checked={mfaEnabled} onChange={(e) => setMfaEnabled(e.target.checked)} />}
                label="Step-up MFA for sensitive actions"
              />
            </Box>
            <TextField
              fullWidth
              size="small"
              multiline
              minRows={2}
              label="My Address"
              placeholder="Door no / street / village / mandal / district"
              helperText="Used for the 'Same as my address' shortcut when adding family members"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              select
              fullWidth
              size="small"
              label="Districts of Interest"
              value={interests}
              onChange={(e) => {
                const v = e.target.value as unknown;
                setInterests(Array.isArray(v) ? (v as string[]) : String(v).split(',').filter(Boolean));
              }}
              slotProps={{
                select: {
                  multiple: true,
                  renderValue: (selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as string[]).map((id) => (
                        <Chip key={id} size="small" label={districts.find((d) => d.id === id)?.name || id} />
                      ))}
                    </Box>
                  ),
                },
              }}
              helperText={districts.length === 0 ? 'District list loads from the live service' : undefined}
              sx={{ mb: 1.5 }}
            >
              {districts.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </TextField>
            <Typography variant="caption" color="text.secondary">
              Notifications
            </Typography>
            <FormGroup row sx={{ mb: 1 }}>
              <FormControlLabel
                control={<Checkbox checked={prefs.includes('email')} onChange={() => togglePref('email')} />}
                label="Email"
              />
              <FormControlLabel
                control={<Checkbox checked={prefs.includes('sms')} onChange={() => togglePref('sms')} />}
                label="SMS"
              />
            </FormGroup>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              Aadhaar — masked reference only (DPDP-2023: raw Aadhaar is never stored)
            </Typography>
            <Box sx={{ mb: 1 }}>
              {masked ? (
                <Chip size="small" color="success" variant="outlined" label={`On file: ${masked}`} />
              ) : (
                <Chip size="small" variant="outlined" label="Not provided" />
              )}
            </Box>
            <TextField
              fullWidth
              size="small"
              type="password"
              placeholder="Enter 12-digit Aadhaar to update (stored masked, never raw)"
              value={aadhaar}
              onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))}
              sx={{ mb: 2 }}
            />
            <Button variant="contained" disabled={saving || isSample} onClick={() => void handleSave()}>
              {saving ? 'Saving…' : 'Save Profile'}
            </Button>
          </CardContent>
        </Card>
      </Box>
      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast?.severity ?? 'success'} onClose={() => setToast(null)} variant="filled">
          {toast?.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
