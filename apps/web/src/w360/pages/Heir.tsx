/**
 * The heir's own screen, /heir/:id — reached from the invitation they
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
import { Sk } from '../skeletons';
import { Card, Empty, Failed, KV, PageHead, StatusChip, ddmmyyyy, num } from '../ui';

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

  // Every state draws the head (design.md § Page head), not only the loaded one.
  const head = <PageHead title="How you are listed" />;
  // The loaded head has an eyebrow over "Listed by …"; keep that line so the cards do not drop.
  if (q.isPending) {
    return (
      <main>
        <PageHead eyebrow="How you are listed" title={<Sk w="14rem" h="1.5rem" />} docTitle="How you are listed" />
        <HeirSkeleton />
      </main>
    );
  }
  if (q.isError && !q.data) {
    return <main>{head}<Failed what="How you are listed" error={q.error} onRetry={() => q.refetch()} boxed h="20rem" /></main>;
  }
  if (!rec) {
    return (
      <main>
        {head}
        <Empty boxed h="16rem" icon="person" title="This listing is not linked to your account"
               action={<Link className="btn" to="/home">Go to Home</Link>}>
          Open the invitation link you were sent and accept it while signed in.
        </Empty>
      </main>
    );
  }
  return (
    <main>
      <PageHead eyebrow="How you are listed" title={`Listed by ${rec.listedBy}`}
                meta={rec.groupName || undefined} />
      <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
        <HowListed rec={rec} />
        <ProfileForm rec={rec} />
      </div>
    </main>
  );
}

/** The two cards' first read: the same Card titles, KV keys and field labels
 *  as HowListed and ProfileForm, values grey, so nothing moves when they land. */
function HeirSkeleton() {
  const field = (label: string, h = '2.5rem') => (
    <div className="field"><label>{label}</label><Sk h={h} r="var(--radius-md)" /></div>
  );
  return (
    <div role="status" aria-busy="true" aria-label="Loading how you are listed">
      <div aria-hidden style={{ display: 'grid', gap: 'var(--space-md)' }}>
        <Card title="How you are listed" aside={<Sk w="7rem" h="1.375rem" r="var(--radius-pill)" />}>
          <KV rows={['Relationship', 'Listed as', 'Share'].map((k, i) => ({ k, v: <Sk w={`${4 + i * 2}rem`} h="0.9em" /> }))} />
          <div className="row tight" style={{ marginTop: 'var(--space-md)' }}>
            <Sk w="9rem" h="2.375rem" r="var(--radius-pill)" />
            <Sk w="10rem" h="2.375rem" r="var(--radius-pill)" />
          </div>
        </Card>
        <Card title="Your heir profile" aside={<Sk w="6rem" h="1.375rem" r="var(--radius-pill)" />}>
          <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
            {field('Date of birth')}
            {field('Present address', '3.75rem')}
            <div className="row" style={{ gap: 'var(--space-md)', alignItems: 'flex-start' }}>
              <div className="grow">{field('Gender')}</div>
              <div className="grow">{field('Marital status')}</div>
            </div>
            <div><Sk w="8rem" h="2.375rem" r="var(--radius-pill)" /></div>
          </div>
        </Card>
      </div>
    </div>
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
