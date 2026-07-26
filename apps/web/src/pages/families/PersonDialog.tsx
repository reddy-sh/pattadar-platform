/**
 * PersonDialog — add/edit a group member. Functional port of the rhub
 * pattadar PersonModal: side-by-side "Scan Aadhaar / ID (AI)" import panel
 * (POST /api/gateway/pattadar/extract-aadhaar, with a best-effort My Drive
 * mirror) next to the manual form. DOB → minor → guardian requirement,
 * marital → spouse block, present address + "same as my address", photo/ID
 * capture, Legal-Heir type, beneficiary needs a reachable contact.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { apiFetch } from '../../api/client';
import {
  RELATIONS,
  cropSquareDataUrl,
  groupTypeDef,
  isMinorDob,
  roleOptions,
} from './familiesData';
import type { GroupMember, MemberVars, ParcelOption } from './familiesData';
import { COUNTRY_CODES, DEFAULT_DIAL, formatAadhaar, joinPhone, splitPhone } from './countryCodes';

interface FormValues {
  name: string;
  relation: string;
  role: string;
  gender: string;
  dob: string;
  phone: string; // national part (dial code kept separately)
  email: string;
  bio: string;
  sameAddress: boolean;
  presentAddress: string;
  isBeneficiary: boolean;
  kind: string;
  sharePct: string;
  parcelId: string;
  aadhaar: string;
  guardianName: string;
  guardianContact: string;
  maritalStatus: string;
  spouseName: string;
  spouseContact: string;
  spouseStatus: string;
  fatherId: string;
  motherId: string;
  spouseId: string;
}

const EMPTY: FormValues = {
  name: '', relation: 'son', role: '', gender: '', dob: '', phone: '', email: '', bio: '',
  sameAddress: false, presentAddress: '', isBeneficiary: false, kind: 'legalheir',
  sharePct: '0', parcelId: '', aadhaar: '', guardianName: '', guardianContact: '',
  maritalStatus: '', spouseName: '', spouseContact: '', spouseStatus: '',
  fatherId: '', motherId: '', spouseId: '',
};

export function PersonDialog({
  open,
  editing,
  people,
  parcels,
  myAddress,
  groupType,
  onCancel,
  onSubmit,
  notify,
}: {
  open: boolean;
  editing: GroupMember | null;
  people: GroupMember[];
  parcels: ParcelOption[];
  myAddress: string;
  groupType: string;
  onCancel: () => void;
  onSubmit: (vars: MemberVars) => Promise<void>;
  notify: (msg: string, severity?: 'success' | 'error' | 'warning' | 'info') => void;
}) {
  const hasTree = groupTypeDef(groupType).hasTree;
  const [v, setV] = useState<FormValues>(EMPTY);
  const [phoneCc, setPhoneCc] = useState(DEFAULT_DIAL);
  const [photo, setPhoto] = useState('');
  const [aadhaarUploading, setAadhaarUploading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setV((old) => ({ ...old, [key]: value }));

  // Dial-code options, de-duplicated by code (US/Canada share +1).
  const ccOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string; short: string }[] = [];
    for (const c of COUNTRY_CODES) {
      if (seen.has(c.dial)) continue;
      seen.add(c.dial);
      const names = COUNTRY_CODES.filter((x) => x.dial === c.dial)
        .map((x) => x.name)
        .join(' / ');
      opts.push({ value: c.dial, label: `${c.flag}  ${names} (${c.dial})`, short: `${c.flag} ${c.dial}` });
    }
    return opts;
  }, []);

  const minor = useMemo(() => isMinorDob(v.dob), [v.dob]);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFormError('');
    if (editing) {
      const { cc, national } = splitPhone(editing.phone);
      setPhoneCc(cc);
      setV({
        name: editing.name || '',
        relation: editing.relation || 'son',
        role: editing.role || '',
        gender: editing.gender || '',
        dob: editing.dob || '',
        phone: national,
        email: editing.email || '',
        bio: editing.bio || '',
        sameAddress: false,
        presentAddress: editing.presentAddress || '',
        isBeneficiary: !!editing.isBeneficiary,
        kind: editing.kind || 'legalheir',
        sharePct: String(editing.sharePct ?? 0),
        parcelId: editing.parcelId || '',
        aadhaar: '',
        guardianName: editing.guardianName || '',
        guardianContact: editing.guardianContact || '',
        maritalStatus: editing.maritalStatus || '',
        spouseName: editing.spouseName || '',
        spouseContact: editing.spouseContact || '',
        spouseStatus: editing.spouseStatus || '',
        fatherId: editing.fatherId || '',
        motherId: editing.motherId || '',
        spouseId: editing.spouseId || '',
      });
      setPhoto(editing.photo || '');
    } else {
      setPhoneCc(DEFAULT_DIAL);
      setV({
        ...EMPTY,
        relation: hasTree ? 'son' : '',
        role: hasTree ? '' : roleOptions(groupType)[1]?.value || '',
      });
      setPhoto('');
    }
  }, [open, editing, hasTree, groupType]);

  // Aadhaar scan → best-effort My Drive mirror → AI extract → prefill
  // (mirrors the deed/passbook importer flow).
  const handleAadhaar = useCallback(
    async (file: File) => {
      setAadhaarUploading(true);
      try {
        try {
          const fd0 = new FormData();
          fd0.append('file', file);
          await apiFetch('/api/gateway/storage/files?appId=pattadar', { method: 'POST', body: fd0 });
        } catch {
          /* best-effort mirror */
        }
        const fd = new FormData();
        fd.append('file', file);
        const res = await apiFetch('/api/gateway/pattadar/extract-aadhaar', {
          method: 'POST',
          body: fd,
        });
        if (!res.ok) {
          notify('Could not read the Aadhaar', 'error');
          return;
        }
        const f = ((await res.json()) as { fields?: Record<string, string> }).fields || {};
        setV((old) => ({
          ...old,
          name: f.name || old.name,
          dob: f.dob || old.dob,
          gender: (f.gender || '').toLowerCase() || old.gender,
          aadhaar: formatAadhaar(f.aadhaar) || old.aadhaar,
          presentAddress: f.address || old.presentAddress,
        }));
        if (file.type.startsWith('image/')) {
          try {
            setPhoto(await cropSquareDataUrl(file, 256));
          } catch {
            /* keep going without the photo */
          }
        }
        notify('Aadhaar read — fields filled and saved to My Drive');
      } catch {
        notify('Aadhaar extraction failed', 'error');
      } finally {
        setAadhaarUploading(false);
      }
    },
    [notify],
  );

  const pickPhoto = (file: File) => {
    cropSquareDataUrl(file, 256)
      .then(setPhoto)
      .catch(() => notify('Could not process image', 'error'));
  };

  const submit = useCallback(async () => {
    const errs: Partial<Record<keyof FormValues, string>> = {};
    if (!v.name.trim()) errs.name = 'Name is required';
    if (hasTree && !v.relation) errs.relation = 'Relationship is required';
    if (!hasTree && !v.role) errs.role = 'Role is required';
    if (v.email.trim() && !/^\S+@\S+\.\S+$/.test(v.email.trim())) errs.email = 'Enter a valid email';
    const aadDigits = v.aadhaar.replace(/\D/g, '');
    if (aadDigits && aadDigits.length !== 12) errs.aadhaar = 'Aadhaar must be 12 digits';
    if (v.isBeneficiary && minor) {
      if (!v.guardianName.trim()) errs.guardianName = 'Guardian is required for a minor';
      if (!v.guardianContact.trim()) errs.guardianContact = 'Guardian contact is required';
    }
    if (v.isBeneficiary && v.maritalStatus === 'married' && !v.spouseName.trim())
      errs.spouseName = 'Add the spouse for a married beneficiary';
    const fullPhone = joinPhone(phoneCc, v.phone);
    if (v.isBeneficiary && !fullPhone.trim() && !v.email.trim()) {
      setFormError('Add a mobile number or email so this beneficiary can be verified');
      setErrors(errs);
      return;
    }
    setFormError('');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await onSubmit({
        name: v.name,
        relation: hasTree ? v.relation : '',
        role: hasTree ? v.relation : v.role,
        gender: v.gender,
        dob: v.dob,
        phone: fullPhone,
        email: v.email,
        bio: v.bio,
        photo: photo || '',
        fatherId: v.fatherId,
        motherId: v.motherId,
        spouseId: v.spouseId,
        isBeneficiary: v.isBeneficiary,
        sharePct: Number(v.sharePct) || 0,
        kind: v.kind || 'legalheir',
        parcelId: v.parcelId,
        presentAddress: v.sameAddress ? myAddress : v.presentAddress,
        aadhaar: aadDigits,
        guardianName: v.guardianName,
        guardianContact: v.guardianContact,
        maritalStatus: v.maritalStatus,
        spouseName: v.spouseName,
        spouseContact: v.spouseContact,
        spouseStatus: v.spouseStatus,
      });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save this member');
    } finally {
      setSaving(false);
    }
  }, [v, hasTree, minor, phoneCc, photo, myAddress, onSubmit]);

  const peopleOpts = people
    .filter((p) => p.id !== editing?.id)
    .map((p) => ({ value: p.id, label: p.isSelf ? 'You' : p.name }));

  const linkSelect = (key: 'fatherId' | 'motherId' | 'spouseId', label: string) => (
    <TextField
      select
      fullWidth
      size="small"
      label={label}
      value={v[key]}
      onChange={(e) => set(key, e.target.value)}
    >
      <MenuItem value="">
        <em>None</em>
      </MenuItem>
      {peopleOpts.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>{editing ? 'Edit person' : 'Add person'}</DialogTitle>
      <DialogContent dividers>
        {formError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {formError}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '5fr 7fr' }, gap: 2.5 }}>
          {/* ── Left: Scan Aadhaar / ID (AI) ─────────────────────────── */}
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2.5, p: 2 }}>
            <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
              <UploadFileOutlinedIcon fontSize="small" /> Scan Aadhaar / ID (AI)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Upload the Aadhaar (PDF or image). Name, DOB, gender &amp; number auto-fill on the
              right; the card is also saved to My Drive.
            </Typography>
            <Box sx={{ my: 1.5 }}>
              <Button
                component="label"
                variant="outlined"
                fullWidth
                startIcon={<UploadFileOutlinedIcon />}
                disabled={aadhaarUploading}
              >
                {aadhaarUploading ? 'Reading…' : 'Upload & extract Aadhaar'}
                <input
                  hidden
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void handleAadhaar(f);
                  }}
                />
              </Button>
            </Box>
            {photo ? (
              <Box sx={{ textAlign: 'center' }}>
                <Box
                  component="img"
                  src={photo}
                  alt="ID"
                  sx={{ maxWidth: '100%', maxHeight: 220, borderRadius: 2, border: 1, borderColor: 'divider' }}
                />
                <Box sx={{ mt: 1, display: 'flex', gap: 2, justifyContent: 'center' }}>
                  <Link component="label" sx={{ cursor: 'pointer' }} variant="body2">
                    Change photo
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) pickPhoto(f);
                      }}
                    />
                  </Link>
                  <Link component="button" variant="body2" onClick={() => setPhoto('')}>
                    Remove
                  </Link>
                </Box>
              </Box>
            ) : (
              !aadhaarUploading && (
                <Box sx={{ textAlign: 'center', mt: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    No photo yet
                  </Typography>
                  <Button component="label" size="small" startIcon={<UploadFileOutlinedIcon />}>
                    Add a photo manually
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) pickPhoto(f);
                      }}
                    />
                  </Button>
                </Box>
              )
            )}
          </Box>

          {/* ── Right: manual form ───────────────────────────────────── */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: 1.5 }}>
              <TextField
                size="small"
                label="Full name"
                required
                value={v.name}
                onChange={(e) => set('name', e.target.value)}
                error={!!errors.name}
                helperText={errors.name}
              />
              {hasTree ? (
                <TextField
                  select
                  size="small"
                  label="Relationship to you"
                  required
                  value={v.relation}
                  onChange={(e) => set('relation', e.target.value)}
                  error={!!errors.relation}
                  helperText={errors.relation}
                >
                  {RELATIONS.filter((r) => r.value !== 'self').map((r) => (
                    <MenuItem key={r.value} value={r.value}>
                      {r.label}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField
                  select
                  size="small"
                  label="Role"
                  required
                  value={v.role}
                  onChange={(e) => set('role', e.target.value)}
                  error={!!errors.role}
                  helperText={errors.role}
                >
                  {roleOptions(groupType).map((r) => (
                    <MenuItem key={r.value} value={r.value}>
                      {r.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <TextField
                size="small"
                label="Phone"
                placeholder="98765 43210"
                value={v.phone}
                onChange={(e) => set('phone', e.target.value)}
                slotProps={{
                  htmlInput: { inputMode: 'tel' },
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <TextField
                          select
                          variant="standard"
                          value={phoneCc}
                          onChange={(e) => setPhoneCc(e.target.value)}
                          slotProps={{
                            input: { disableUnderline: true },
                            select: {
                              renderValue: (val) =>
                                ccOptions.find((o) => o.value === val)?.short || String(val),
                            },
                          }}
                          sx={{ minWidth: 74 }}
                        >
                          {ccOptions.map((o) => (
                            <MenuItem key={o.value} value={o.value}>
                              {o.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <TextField
                size="small"
                label="Email"
                placeholder="name@example.com"
                value={v.email}
                onChange={(e) => set('email', e.target.value)}
                error={!!errors.email}
                helperText={errors.email}
              />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <TextField
                size="small"
                label="Date of birth"
                type="date"
                value={v.dob}
                onChange={(e) => set('dob', e.target.value)}
                helperText={minor ? 'Under 18 — a guardian is required for an heir' : undefined}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                select
                size="small"
                label="Gender"
                value={v.gender}
                onChange={(e) => set('gender', e.target.value)}
              >
                <MenuItem value="">
                  <em>—</em>
                </MenuItem>
                <MenuItem value="male">Male</MenuItem>
                <MenuItem value="female">Female</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </TextField>
            </Box>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={v.sameAddress}
                  onChange={(e) => set('sameAddress', e.target.checked)}
                />
              }
              label="Present address same as mine"
              sx={{ mb: -0.5 }}
            />
            {!v.sameAddress && (
              <TextField
                size="small"
                label="Present address"
                placeholder="Where this person currently lives"
                multiline
                minRows={1}
                maxRows={3}
                value={v.presentAddress}
                onChange={(e) => set('presentAddress', e.target.value)}
              />
            )}
            <FormControlLabel
              control={
                <Switch
                  checked={v.isBeneficiary}
                  onChange={(e) => set('isBeneficiary', e.target.checked)}
                />
              }
              label="Is a beneficiary / heir (allocate a share and require verification)"
            />
            {v.isBeneficiary && (
              <Box
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 1.5,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5 }}>
                  <TextField
                    select
                    size="small"
                    label="Type"
                    value={v.kind}
                    onChange={(e) => set('kind', e.target.value)}
                  >
                    <MenuItem value="legalheir">Legal Heir</MenuItem>
                    <MenuItem value="coowner">Co-owner</MenuItem>
                    <MenuItem value="nominee">Nominee</MenuItem>
                  </TextField>
                  <TextField
                    size="small"
                    label="Share %"
                    type="number"
                    value={v.sharePct}
                    onChange={(e) => set('sharePct', e.target.value)}
                    slotProps={{ htmlInput: { min: 0, max: 100 } }}
                  />
                  <TextField
                    select
                    size="small"
                    label="Parcel (optional)"
                    value={v.parcelId}
                    onChange={(e) => set('parcelId', e.target.value)}
                  >
                    <MenuItem value="">
                      <em>Whole estate</em>
                    </MenuItem>
                    {parcels.map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.surveyNo}
                        {p.subdivision ? `/${p.subdivision}` : ''}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>
                <TextField
                  size="small"
                  label="Aadhaar (KYC)"
                  placeholder="1234 5678 9012 (auto-filled from scan)"
                  value={v.aadhaar}
                  onChange={(e) => set('aadhaar', formatAadhaar(e.target.value))}
                  error={!!errors.aadhaar}
                  helperText={errors.aadhaar || 'Stored masked — only last 4 digits (DPDP-2023)'}
                  slotProps={{ htmlInput: { maxLength: 14, inputMode: 'numeric' } }}
                />
                {minor && (
                  <Box
                    sx={{
                      border: 1,
                      borderColor: 'warning.main',
                      bgcolor: 'rgba(237, 108, 2, 0.06)',
                      borderRadius: 2,
                      p: 1.5,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1.5,
                    }}
                  >
                    <Typography variant="subtitle2">⚠️ Minor — guardian required</Typography>
                    <TextField
                      size="small"
                      label="Guardian name"
                      required
                      value={v.guardianName}
                      onChange={(e) => set('guardianName', e.target.value)}
                      error={!!errors.guardianName}
                      helperText={errors.guardianName}
                    />
                    <TextField
                      size="small"
                      label="Guardian contact"
                      required
                      value={v.guardianContact}
                      onChange={(e) => set('guardianContact', e.target.value)}
                      error={!!errors.guardianContact}
                      helperText={errors.guardianContact}
                    />
                  </Box>
                )}
                <TextField
                  select
                  size="small"
                  label="Marital status"
                  value={v.maritalStatus}
                  onChange={(e) => set('maritalStatus', e.target.value)}
                >
                  <MenuItem value="">
                    <em>—</em>
                  </MenuItem>
                  <MenuItem value="single">Single</MenuItem>
                  <MenuItem value="married">Married</MenuItem>
                  <MenuItem value="separated">Married — separated</MenuItem>
                  <MenuItem value="widowed">Widowed</MenuItem>
                </TextField>
                {v.maritalStatus === 'married' && (
                  <Box
                    sx={{
                      border: 1,
                      borderColor: 'info.main',
                      bgcolor: 'rgba(2, 136, 209, 0.06)',
                      borderRadius: 2,
                      p: 1.5,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1.5,
                    }}
                  >
                    <Typography variant="subtitle2">Spouse (co-heir)</Typography>
                    <TextField
                      size="small"
                      label="Spouse name"
                      required
                      value={v.spouseName}
                      onChange={(e) => set('spouseName', e.target.value)}
                      error={!!errors.spouseName}
                      helperText={errors.spouseName}
                    />
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                      <TextField
                        size="small"
                        label="Spouse contact"
                        value={v.spouseContact}
                        onChange={(e) => set('spouseContact', e.target.value)}
                      />
                      <TextField
                        select
                        size="small"
                        label="Spouse status"
                        value={v.spouseStatus}
                        onChange={(e) => set('spouseStatus', e.target.value)}
                      >
                        <MenuItem value="">
                          <em>—</em>
                        </MenuItem>
                        <MenuItem value="living">Living</MenuItem>
                        <MenuItem value="deceased">Deceased</MenuItem>
                        <MenuItem value="separated">Separated</MenuItem>
                      </TextField>
                    </Box>
                  </Box>
                )}
              </Box>
            )}
            {hasTree && (
              <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2">Advanced — Parents / Spouse links (optional)</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 1.5 }}>
                    {linkSelect('fatherId', 'Father')}
                    {linkSelect('motherId', 'Mother')}
                    {linkSelect('spouseId', 'Spouse')}
                  </Box>
                </AccordionDetails>
              </Accordion>
            )}
            <TextField
              size="small"
              label="Bio / notes"
              placeholder="Occupation, notes…"
              multiline
              minRows={1}
              maxRows={3}
              value={v.bio}
              onChange={(e) => set('bio', e.target.value)}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
