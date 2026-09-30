/** Profile — drawn in this app (the redrawn /app/profile).
 *
 *  This replaces the "still in the previous version" signpost and the MUI
 *  screen it pointed at (pages/ProfilePage.tsx, now deleted; /legacy/profile
 *  redirects here). Same fields, same writes, one Save:
 *
 *   · Your name and the email Pattadar writes to — `updateMe`. The previous
 *     screen could not change either, so a fresh account was greeted by its
 *     own principal id ("subject_f3fc…") with no way to fix it.
 *   · Address, districts of interest and notification channels —
 *     `updateProfile`. The address feeds "Same as my address" when adding a
 *     family member.
 *   · Aadhaar. Only the masked form is shown; a newly typed number replaces
 *     the stored one and the field is cleared once saved.
 *
 *  Language and step-up MFA still have no control here — the app has no
 *  translation layer and nothing enforces step-up — but their stored values are
 *  sent back unchanged, because a sent "" clears.
 *
 *  Name and photo from the sign-in provider. A Google sign-in carries the
 *  account's `name` and `picture` in the ID token (AuthProvider claimsUser).
 *  The photo is drawn from Google's URL (Face.tsx) and never stored here; it
 *  needs the pool's `picture` mapping (cognito.tf). The name is written to the
 *  account at social sign-in when the account has none, and offered in the
 *  field here otherwise — a name the owner typed is never overwritten.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { formatAadhaarMask } from '@pattadar/core';

import { useAuth } from '../../auth/AuthProvider';
import { personName } from '../../lib/identity';
import { useDistricts, useMe, useUpdateMe, useUpdateProfile } from '../api';
import type { Me } from '../api';
import { useToast } from '../Toast';
import { Card, Chip, Failed, Loading, MultiSelect, PageHead, plural } from '../ui';
import { Face } from '../Face';

/** The reason a disabled Save is disabled, printed beside it. */
const Why = ({ children }: { children: ReactNode }) => <span className="note">{children}</span>;

/** A principal id is not a person's name — `me` seeds `name` with it. */
const realName = (me: Me) => personName(me.name, me.id);

const split = (csv: string) => (csv || '').split(',').map((s) => s.trim()).filter(Boolean);
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Profile() {
  const me = useMe();
  const districts = useDistricts();
  const { user } = useAuth();
  const providerName = user?.name ?? '';
  const toast = useToast();
  const updateMe = useUpdateMe();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<string[]>([]);
  const [aadhaar, setAadhaar] = useState('');
  const [saving, setSaving] = useState(false);

  // Seed from the settled read, and again after a save refetches it. Not
  // refetched on focus (useMe), so this never overwrites typing.
  useEffect(() => {
    const m = me.data;
    if (!m) return;
    // No name on the account yet: offer the one the sign-in provider holds
    // (Google's, for a Google sign-in). It is a suggestion in the field, not
    // a saved value — Save is what writes it.
    setName(realName(m) || personName(providerName));
    setEmail(m.email || '');
    setAddress(m.address || '');
    setInterests(split(m.districtsOfInterest));
    setPrefs(split(m.notificationPrefs));
    setAadhaar('');
  }, [me.data, providerName]);

  const districtName = useMemo(() => {
    const byId = new Map((districts.data ?? []).map((d) => [d.id, d.name]));
    return (id: string) => byId.get(id) ?? id;
  }, [districts.data]);

  if (me.isLoading) {
    return (
      <main>
        <PageHead eyebrow="Account" title="Profile" />
        <Loading h="18rem" what="your profile" />
      </main>
    );
  }
  // A read that failed is not a profile with blank fields: a form painted
  // over it would offer a Save that writes the blanks back.
  if (me.isError || !me.data) {
    return (
      <main>
        <PageHead eyebrow="Account" title="Profile" />
        <Failed boxed what="Your profile" error={me.error} onRetry={() => void me.refetch()} />
      </main>
    );
  }

  const m = me.data;
  const storedName = realName(m);
  const nameDirty = name.trim() !== storedName || email.trim() !== (m.email || '');
  const prefsDirty = address !== (m.address || '')
    || !sameSet(interests, split(m.districtsOfInterest))
    || !sameSet(prefs, split(m.notificationPrefs))
    || aadhaar !== '';
  const dirty = nameDirty || prefsDirty;

  // Why Save is not ready, first reason only. The API keeps a stored value
  // when sent "", so clearing a name or email would silently not happen.
  const blocked =
    storedName && !name.trim() ? 'A name can be changed, not removed.'
    : m.email && !email.trim() ? 'An email can be changed, not removed.'
    : email.trim() && !EMAIL.test(email.trim()) ? 'That email address is not complete.'
    : aadhaar && aadhaar.length !== 12 ? 'An Aadhaar number is 12 digits.'
    : !dirty ? 'Nothing has changed yet.'
    : '';

  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((x) => x !== key) : [...list, key]);

  const save = async () => {
    if (blocked || saving) return;
    setSaving(true);
    let prefsSaved = false;
    try {
      if (prefsDirty) {
        const res = await updateProfile.mutateAsync({
          language: m.language || 'en',
          mfaEnabled: !!m.mfaEnabled,
          districtsOfInterest: interests.join(','),
          notificationPrefs: prefs.join(','),
          kycRef: aadhaar,
          address: address.trim(),
        });
        if (!res.updateProfile) throw new Error('The server did not accept the change.');
        prefsSaved = true;
      }
      if (nameDirty) {
        const res = await updateMe.mutateAsync({ name: name.trim(), email: email.trim() });
        if (!res.updateMe) throw new Error('The server did not accept the change.');
      }
      toast.ok('Profile saved');
    } catch (e) {
      toast.bad(
        prefsSaved
          ? 'Your preferences were saved, but your name and email were not.'
          : 'Your profile could not be saved. Nothing has changed.',
        e,
      );
    } finally {
      setSaving(false);
    }
  };

  const shown = name.trim() || storedName;
  const options = (districts.data ?? []).map((d) => ({ id: d.id, label: d.name }));
  // A stored district the list no longer carries still shows, by id, so a
  // save cannot quietly drop it.
  for (const id of interests) {
    if (!options.some((o) => o.id === id)) options.push({ id, label: id });
  }

  return (
    <main>
      <PageHead eyebrow="Account" title="Profile">
        <p className="lede" style={{ maxWidth: '46rem' }}>
          Your name, how to reach you, and your address and Aadhaar for family and property records.
        </p>
        {/* Consent, export and deletion live on one screen; this says where. */}
        <p className="note" style={{ marginTop: '0.5rem' }}>
          <Link className="link" to="/app/account">Privacy, export and account deletion</Link>
        </p>
      </PageHead>
      <form
        className="stack lg"
        style={{ maxWidth: '48rem', marginTop: 'var(--space-md)' }}
        onSubmit={(e) => { e.preventDefault(); void save(); }}
      >
        <Card title="You" className="stack">
          <div className="row" style={{ alignItems: 'center', gap: 'var(--space-md)' }}>
            <Face picture={user?.picture ?? ''} name={shown} size="lg" />
            <span className="grow">
              <strong style={{ display: 'block' }}>{shown || 'No name yet'}</strong>
              {user?.email && <span className="note">Signed in as {user.email}</span>}
            </span>
          </div>
          <div className="two">
            <label className="field">
              Your name
              <input type="text" value={name} autoComplete="name" placeholder="Your full name"
                     onChange={(e) => setName(e.target.value)} />
              {!storedName && providerName && name.trim() === providerName.trim() && (
                <span className="note">From the account you signed in with. Save to keep it.</span>
              )}
            </label>
            <label className="field">
              Email for notices
              <input type="email" value={email} autoComplete="email"
                     placeholder={user?.email || 'you@example.com'}
                     onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>
        </Card>

        <Card title="Address and interests" className="stack">
          <label className="field">
            My address
            <textarea rows={2} value={address}
                      placeholder="Door no, street, village, mandal, district"
                      onChange={(e) => setAddress(e.target.value)} />
            <span className="note">Used for “Same as my address” when you add a family member.</span>
          </label>
          <div className="field">
            <span aria-hidden>Districts of interest</span>
            {districts.isError ? (
              <p className="note" role="alert" style={{ margin: 0 }}>
                The district list did not load.{' '}
                <button type="button" className="btn sm" onClick={() => void districts.refetch()}>
                  Try again
                </button>
              </p>
            ) : (
              <div className="row tight" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <MultiSelect
                  label="Districts of interest"
                  summary={interests.length ? plural(interests.length, 'district') : 'None chosen'}
                  options={options}
                  selected={new Set(interests)}
                  onToggle={(id) => toggle(interests, setInterests, id)}
                  onAll={(on) => setInterests(on ? options.map((o) => o.id) : [])}
                />
                {interests.map((id) => <Chip key={id}>{districtName(id)}</Chip>)}
              </div>
            )}
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="note" style={{ padding: 0, marginBottom: '0.375rem' }}>
              Tell me about things by
            </legend>
            <div className="row">
              <label className="check">
                <input type="checkbox" checked={prefs.includes('email')}
                       onChange={() => toggle(prefs, setPrefs, 'email')} />
                Email
              </label>
              <label className="check">
                <input type="checkbox" checked={prefs.includes('sms')}
                       onChange={() => toggle(prefs, setPrefs, 'sms')} />
                SMS
              </label>
            </div>
          </fieldset>
        </Card>

        <Card title="Aadhaar" className="stack">
          <p className="note" style={{ margin: 0 }}>
            {m.kycRefMasked
              ? <>On file: <span className="mono">{formatAadhaarMask(m.kycRefMasked)}</span></>
              : 'Not provided.'}
          </p>
          <label className="field">
            {m.kycRefMasked ? 'Replace with a new number' : 'Aadhaar number'}
            <input type="password" inputMode="numeric" autoComplete="off" value={aadhaar}
                   placeholder="12 digits"
                   onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))} />
            <span className="note">Stored encrypted. Only the last four digits are ever shown.</span>
          </label>
        </Card>

        <div className="row">
          <button type="submit" className="btn primary" disabled={!!blocked || saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          {blocked && !saving && <Why>{blocked}</Why>}
        </div>
      </form>
    </main>
  );
}
