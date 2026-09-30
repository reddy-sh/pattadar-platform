/**
 * The heir's own screen, /app/heir/:id — reached from the invitation they
 * claimed and from the setup tasks on Home.
 *
 * It shows how they were listed (by whom, as what, with what share), lets them
 * agree or ask for a correction, and lets them complete the profile fields
 * that are theirs to know: date of birth, address, gender, marital status and
 * spouse. It never shows the family's land or documents — verification is not
 * access (docs/specs/2026-09-19-family-household-management-functional-design.md).
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router';

import { useToast } from '../Toast';
import { useConfirmHeir, useHeirRecords, useUpdateHeirProfile } from '../growthData';
import type { HeirRecord } from '../growthData';
import { Card, Empty, Failed, KV, Loading, PageHead, StatusChip, ddmmyyyy, num } from '../ui';

/** 23/04/1990 → 1990-04-23, or '' when it is not a real past date. */
function isoFromDdmm(text: string): string {
  const m = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return '';
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00`);
  // 31/02/1990 rolls over to March in Date; a rolled date is not the one typed.
  if (d.getFullYear() !== Number(m[3]) || d.getMonth() + 1 !== Number(m[2]) || d.getDate() !== Number(m[1])) return '';
  return d > new Date() || d.getFullYear() < 1900 ? '' : iso;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, ' ') : '—');

export function Heir() {
  const { id = '' } = useParams();
  const q = useHeirRecords();
  const rec = q.data?.find((r) => r.memberId === id);

  if (q.isPending) return <main><Loading h="20rem" what="how you are listed" /></main>;
  if (q.isError && !q.data) {
    return <main><Failed what="Your heir record" error={q.error} onRetry={() => q.refetch()} boxed h="20rem" /></main>;
  }
  if (!rec) {
    return (
      <main>
        <PageHead title="Your heir record" />
        <Empty boxed h="16rem" icon="person" title="This record is not linked to your account"
               action={<Link className="btn" to="/app">Go to Home</Link>}>
          Open the invitation link you were sent and accept it while signed in.
        </Empty>
      </main>
    );
  }
  return (
    <main>
      <PageHead eyebrow="Your heir record" title={`Listed by ${rec.listedBy}`}>
        {rec.groupName && <p className="note" style={{ margin: 0 }}>{rec.groupName}</p>}
      </PageHead>
      <div style={{ display: 'grid', gap: 'var(--space-md)', maxWidth: '46rem' }}>
        <HowListed rec={rec} />
        <ProfileForm rec={rec} />
      </div>
    </main>
  );
}

function HowListed({ rec }: { rec: HeirRecord }) {
  const confirm = useConfirmHeir();
  const toast = useToast();
  const [correcting, setCorrecting] = useState(false);
  const [note, setNote] = useState(rec.note);
  const [err, setErr] = useState('');

  const send = async (agree: boolean) => {
    if (!agree && !note.trim()) { setErr('Say what should be corrected.'); return; }
    setErr('');
    try {
      await confirm.mutateAsync({ memberId: rec.memberId, agree, note: agree ? '' : note.trim() });
      toast.ok(agree ? 'Thank you. Marked as correct.' : `${rec.listedBy} will see your correction.`);
      setCorrecting(false);
    } catch { /* the write raised the toast */ }
  };

  return (
    <Card title="How you are listed"
          aside={rec.confirmed && (
            <StatusChip state={rec.confirmed === 'agreed' ? 'good' : 'warn'}>
              {rec.confirmed === 'agreed' ? 'You confirmed this' : 'Correction asked'}
            </StatusChip>
          )}>
      <KV rows={[
        { k: 'Relationship', v: cap(rec.relation) },
        { k: 'Listed as', v: cap(rec.kind) },
        { k: 'Share', v: rec.sharePct ? `${num(rec.sharePct, rec.sharePct % 1 ? 1 : 0)}%` : '—' },
      ]} />
      {rec.confirmed === 'disputed' && rec.note && (
        <p className="note">You asked: “{rec.note}”</p>
      )}
      {correcting ? (
        <div className="field" style={{ marginTop: 'var(--space-md)' }}>
          <label htmlFor="heir-note">What should be corrected?</label>
          <textarea id="heir-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          {err && <span className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{err}</span>}
          <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
            <button type="button" className="btn primary" disabled={confirm.isPending} onClick={() => void send(false)}>
              {confirm.isPending ? 'Sending…' : 'Send correction'}
            </button>
            <button type="button" className="btn" disabled={confirm.isPending} onClick={() => setCorrecting(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="row tight" style={{ marginTop: 'var(--space-md)' }}>
          <button type="button" className="btn primary" disabled={confirm.isPending} onClick={() => void send(true)}>
            This is correct
          </button>
          <button type="button" className="btn" onClick={() => setCorrecting(true)}>Something is wrong</button>
        </div>
      )}
    </Card>
  );
}

function ProfileForm({ rec }: { rec: HeirRecord }) {
  const save = useUpdateHeirProfile();
  const toast = useToast();
  const [dob, setDob] = useState(rec.dob ? ddmmyyyy(rec.dob) : '');
  const [address, setAddress] = useState(rec.presentAddress);
  const [gender, setGender] = useState(rec.gender);
  const [marital, setMarital] = useState(rec.maritalStatus);
  const [spouse, setSpouse] = useState(rec.spouseName);
  const [err, setErr] = useState('');
  useEffect(() => { setErr(''); }, [dob, address, marital, spouse]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const iso = isoFromDdmm(dob);
    if (!iso) { setErr('Enter your date of birth as DD/MM/YYYY.'); return; }
    if (!address.trim()) { setErr('Add your present address.'); return; }
    if (marital === 'married' && !spouse.trim()) { setErr("Add your spouse's name."); return; }
    try {
      await save.mutateAsync({
        memberId: rec.memberId, dob: iso, presentAddress: address.trim(), gender, maritalStatus: marital, spouseName: spouse.trim(),
      });
      toast.ok('Your heir profile is saved');
    } catch { /* the write raised the toast */ }
  };

  return (
    <Card title="Your heir profile"
          aside={<StatusChip state={rec.complete ? 'good' : 'warn'}>{rec.complete ? 'Complete' : 'Needs details'}</StatusChip>}>
      <form onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: 'var(--space-md)' }}>
        {err && <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>}
        <div className="field">
          <label htmlFor="heir-dob">Date of birth</label>
          <input id="heir-dob" type="text" inputMode="numeric" placeholder="DD/MM/YYYY" maxLength={10}
                 autoComplete="bday" value={dob} onChange={(e) => setDob(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="heir-address">Present address</label>
          <textarea id="heir-address" rows={2} maxLength={500} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="row" style={{ gap: 'var(--space-md)', alignItems: 'flex-start' }}>
          <div className="field grow">
            <label htmlFor="heir-gender">Gender</label>
            <select id="heir-gender" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field grow">
            <label htmlFor="heir-marital">Marital status</label>
            <select id="heir-marital" value={marital} onChange={(e) => setMarital(e.target.value)}>
              <option value="">Not stated</option>
              <option value="single">Single</option>
              <option value="married">Married</option>
              <option value="widowed">Widowed</option>
              <option value="divorced">Divorced</option>
            </select>
          </div>
        </div>
        {marital === 'married' && (
          <div className="field">
            <label htmlFor="heir-spouse">Spouse's name</label>
            <input id="heir-spouse" type="text" maxLength={160} value={spouse} onChange={(e) => setSpouse(e.target.value)} />
          </div>
        )}
        <div>
          <button type="submit" className="btn primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </Card>
  );
}
