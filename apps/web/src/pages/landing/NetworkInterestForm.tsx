/**
 * Pattadar Network register-interest form, rendered inside the landing
 * page's #network section. The page's one Network action: one submit, no
 * duplicate "register" buttons elsewhere.
 *
 * Copy comes from NETWORK_INTEREST in landingContent.ts. The server
 * (services/api/src/network.py, `registerNetworkInterest`) is authoritative;
 * the checks here mirror it for UX only, with the same phone and Aadhaar-run
 * rules from @pattadar/core. Signed-out visitors only: the landing page
 * redirects signed-in owners to /app, and any thrown gql() error — network,
 * masked server error, or a stale-session 401 — shows one generic failure and
 * keeps the values.
 */
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link as RouterLink } from 'react-router';
import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import TextField from '@mui/material/TextField';
import { looksLikeAadhaar, normalizeIndianMobile } from '@pattadar/core';
import { gql } from '../../api/client';
import { NETWORK_INTEREST as COPY } from './landingContent';

const REGISTER_NETWORK_INTEREST = `mutation RegisterNetworkInterest($input: NetworkInterestInput!) {
  registerNetworkInterest(input: $input) { status field }
}`;

interface Result {
  registerNetworkInterest: { status: string; field: string };
}

const NAME_MAX = 80;
const EMAIL_MAX = 254;
const PLACE_MAX = 60;
const NOTE_MAX = 500;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Field = 'interest' | 'name' | 'phone' | 'email' | 'district' | 'mandal' | 'note' | 'consent';
const ORDER: Field[] = ['interest', 'name', 'phone', 'email', 'district', 'mandal', 'note', 'consent'];

interface Values {
  interest: string;
  name: string;
  phone: string;
  email: string;
  district: string;
  mandal: string;
  note: string;
  consent: boolean;
  website: string;
}

const EMPTY: Values = {
  interest: '', name: '', phone: '', email: '', district: '', mandal: '', note: '', consent: false, website: '',
};

type Errors = Partial<Record<Field, string>>;

/** Every client-side error, in the server's table order. */
function check(v: Values): Errors {
  const e: Errors = {};
  const name = v.name.trim();
  const phone = v.phone.trim();
  const email = v.email.trim();
  const free = (text: string, limit: number, message: string) =>
    text.trim().length > limit ? message : looksLikeAadhaar(text) ? COPY.errors.idNumber : undefined;
  if (!COPY.groups.some((g) => g.options.some((o) => o.value === v.interest))) e.interest = COPY.errors.interest;
  if (name.length < 2 || name.length > NAME_MAX) e.name = COPY.errors.name;
  else if (looksLikeAadhaar(name)) e.name = COPY.errors.idNumber;
  if (phone && !normalizeIndianMobile(phone)) e.phone = COPY.errors.phone;
  if (email && (email.length > EMAIL_MAX || !EMAIL.test(email))) e.email = COPY.errors.email;
  if (!phone && !email) {
    e.phone = COPY.errors.contact;
    e.email = COPY.errors.contact;
  }
  const district = free(v.district, PLACE_MAX, COPY.errors.district);
  if (district) e.district = district;
  const mandal = free(v.mandal, PLACE_MAX, COPY.errors.mandal);
  if (mandal) e.mandal = mandal;
  const note = free(v.note, NOTE_MAX, COPY.errors.note);
  if (note) e.note = note;
  if (!v.consent) e.consent = COPY.errors.consent;
  return e;
}

/** The server names one field; show its sentence (Aadhaar-like text gets the
 * ID-number sentence, `contact` marks both phone and email). */
function serverError(field: string, v: Values): Errors {
  if (field === 'contact') return { phone: COPY.errors.contact, email: COPY.errors.contact };
  if (!(ORDER as string[]).includes(field)) return {};
  const f = field as Field;
  const text = typeof v[f] === 'string' ? (v[f] as string) : '';
  const idLike = ['name', 'district', 'mandal', 'note'].includes(f) && looksLikeAadhaar(text);
  return { [f]: idLike ? COPY.errors.idNumber : COPY.errors[f] };
}

function firstError(errors: Errors): Field | undefined {
  return ORDER.find((f) => errors[f]);
}

type Outcome = 'idle' | 'sending' | 'received' | 'rate_limited' | 'failed' | 'stale';

export function NetworkInterestForm() {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [attempted, setAttempted] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>('idle');
  const refs = useRef<Partial<Record<Field, HTMLElement | null>>>({});

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));
  const recheck = () => {
    if (attempted) setErrors(check(values));
  };
  const showErrors = (next: Errors) => {
    setErrors(next);
    const first = firstError(next);
    if (first) refs.current[first]?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (outcome === 'sending') return;
    setAttempted(true);
    // A filled honeypot still goes to the server, which answers "received"
    // without validating, so a bot learns nothing from this page.
    const local = values.website.trim() ? {} : check(values);
    if (firstError(local)) {
      setOutcome('idle');
      showErrors(local);
      return;
    }
    setErrors({});
    setOutcome('sending');
    try {
      const data = await gql<Result>(REGISTER_NETWORK_INTEREST, {
        input: {
          interest: values.interest,
          name: values.name,
          phone: values.phone,
          email: values.email,
          district: values.district,
          mandal: values.mandal,
          note: values.note,
          consent: values.consent,
          consentVersion: COPY.consentVersion,
          website: values.website,
        },
      });
      const { status, field } = data.registerNetworkInterest;
      if (status === 'received') setOutcome('received');
      else if (status === 'rate_limited') setOutcome('rate_limited');
      else if (status === 'consent_required') {
        setOutcome('idle');
        showErrors({ consent: COPY.errors.consent });
      } else if (status === 'invalid' && field === 'consentVersion') setOutcome('stale');
      else if (status === 'invalid' && firstError(serverError(field, values))) {
        setOutcome('idle');
        showErrors(serverError(field, values));
      } else setOutcome('failed');
    } catch {
      setOutcome('failed');
    }
  };

  if (outcome === 'received') {
    return (
      <div className="network-form network-form--done" role="status">
        <p className="card__h">{COPY.received}</p>
      </div>
    );
  }

  const first = firstError(errors);
  const [consentBefore, consentAfter] = (() => {
    const at = COPY.consent.indexOf(COPY.consentLinkText);
    return [COPY.consent.slice(0, at), COPY.consent.slice(at + COPY.consentLinkText.length)];
  })();
  const fieldProps = (key: Exclude<Field, 'interest' | 'consent'>) => ({
    name: key,
    value: values[key],
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
    onBlur: recheck,
    error: Boolean(errors[key]),
    helperText: errors[key],
    inputRef: (el: HTMLElement | null) => { refs.current[key] = el; },
    fullWidth: true,
  });

  return (
    <form className="network-form" aria-labelledby="network-form-h" noValidate onSubmit={submit}>
      <h3 className="card__h" id="network-form-h">{COPY.h3}</h3>
      <p className="card__sub network-form__lead">{COPY.lead}</p>
      <div className="network-form__grid">
        <TextField
          select
          className="network-form__wide"
          label={COPY.interestLabel}
          name="interest"
          value={values.interest}
          onChange={(e) => set('interest', e.target.value)}
          onBlur={recheck}
          error={Boolean(errors.interest)}
          helperText={errors.interest}
          inputRef={(el: HTMLElement | null) => { refs.current.interest = el; }}
          fullWidth
          required
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        >
          <option value="">{COPY.interestPlaceholder}</option>
          {COPY.groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
          ))}
        </TextField>
        <TextField
          {...fieldProps('name')}
          label={COPY.nameLabel}
          autoComplete="name"
          required
          slotProps={{ htmlInput: { maxLength: NAME_MAX } }}
        />
        <TextField
          {...fieldProps('phone')}
          label={COPY.phoneLabel}
          type="tel"
          autoComplete="tel"
          placeholder={COPY.phonePlaceholder}
          helperText={errors.phone ?? COPY.phoneHelp}
          slotProps={{ htmlInput: { inputMode: 'tel', maxLength: 20 } }}
        />
        <TextField
          {...fieldProps('email')}
          label={COPY.emailLabel}
          type="email"
          autoComplete="email"
          slotProps={{ htmlInput: { maxLength: EMAIL_MAX } }}
        />
        <TextField
          {...fieldProps('district')}
          label={COPY.districtLabel}
          slotProps={{ htmlInput: { maxLength: PLACE_MAX } }}
        />
        <TextField
          {...fieldProps('mandal')}
          label={COPY.mandalLabel}
          slotProps={{ htmlInput: { maxLength: PLACE_MAX } }}
        />
        <TextField
          {...fieldProps('note')}
          className="network-form__wide"
          label={COPY.noteLabel}
          multiline
          minRows={3}
          helperText={errors.note ?? <span className="network-form__count">{values.note.length}/{NOTE_MAX}</span>}
          slotProps={{ htmlInput: { maxLength: NOTE_MAX } }}
        />
        <div className="network-form__wide">
          <FormControlLabel
            control={(
              <Checkbox
                name="consent"
                checked={values.consent}
                onChange={(e) => {
                  set('consent', e.target.checked);
                  if (attempted) setErrors(check({ ...values, consent: e.target.checked }));
                }}
                slotProps={{
                  input: {
                    ref: (el: HTMLElement | null) => { refs.current.consent = el; },
                    'aria-invalid': Boolean(errors.consent),
                    'aria-describedby': errors.consent ? 'network-consent-error' : undefined,
                  } as Record<string, unknown>,
                }}
              />
            )}
            label={(
              <>
                {consentBefore}
                <RouterLink to="/privacy">{COPY.consentLinkText}</RouterLink>
                {consentAfter}
              </>
            )}
          />
          {errors.consent && (
            <FormHelperText error id="network-consent-error">{errors.consent}</FormHelperText>
          )}
        </div>
      </div>
      {/* Honeypot: off-screen (not display:none) so naive bots fill it. */}
      <div className="network-form__hp" aria-hidden="true">
        <label>
          {COPY.honeypotLabel}
          <input
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={(e) => set('website', e.target.value)}
          />
        </label>
      </div>
      {first && (
        <p className="network-form__summary" role="alert">{errors[first]}</p>
      )}
      {outcome === 'rate_limited' && <Alert severity="warning">{COPY.rateLimited}</Alert>}
      {outcome === 'failed' && <Alert severity="error">{COPY.failed}</Alert>}
      {outcome === 'stale' && <Alert severity="warning">{COPY.errors.consentVersion}</Alert>}
      <button type="submit" className="cta cta--ghost network-form__submit" disabled={outcome === 'sending'}>
        {outcome === 'sending' ? COPY.sending : COPY.submit}
      </button>
    </form>
  );
}
