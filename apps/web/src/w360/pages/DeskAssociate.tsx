/** One associate — everything the desk knows about a person who takes jobs.
 *
 *  This is the file somebody opens when an associate rings to ask why they
 *  stopped getting work, so it is built to answer that: what they do, where
 *  they work, what papers are on file and what state each is in, what they are
 *  holding right now, owner ratings, and an append-only trail of every
 *  certification, training and company-message decision.
 *
 *  The number is masked until it is asked for. The roster deliberately carries
 *  no contact at all; this page carries one, behind a button, because revealing
 *  a person's phone number should be something a human did rather than
 *  something a page did while they were looking at something else.
 *
 *  Nothing here is an offer screen. Phase 1 sends no offers and runs no timer —
 *  the desk puts people on jobs by hand — so the "how it has gone" figures are
 *  all zero for now and say so in words rather than drawing three zeroes and
 *  letting the reader guess whether that is a bug.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';

import {
  useAssociate, useAssociateEvents, useAssociateJobs, useAssociateTrainingCertificates,
  useDeleteUnclaimedAssociate, useDisciplines, useIssueTrainingCertificate,
  useMessageAssociate, useRevokeTrainingCertificate, useSetAssociateAreas,
  useSetAssociateCertification, useSetAssociateDisciplines,
  useSetAssociateState, useSetAssociateTraining, useUpdateAssociate,
} from '../api';
import type { Associate, AssociateArea, AssociateCredential, TrainingCertificate } from '../api';
import { Dialog } from '../Dialog';
import {
  Card, Chip, Crumbs, Empty, Failed, Loading, Menu, State, Tag, ddmmyyyy, plural,
} from '../ui';

/** The review vocabulary, which is `ticket_deliverables`' vocabulary — the same
 *  three words for the same three facts, so a reviewer who has learned one has
 *  learned both. `pending` is colourless on purpose: green would be Pattadar
 *  vouching for a licence nobody has looked at, and amber would raise an alarm
 *  nobody has grounds for. */
const REVIEW: Record<string, { word: string; tone: string }> = {
  verified: { word: 'Verified', tone: 'good' },
  pending: { word: 'Nobody has checked it', tone: 'unknown' },
  rejected: { word: 'Refused', tone: 'bad' },
};

/** A server word this screen has no rule for is humanised rather than dropped.
 *  A blank capsule is the one outcome that tells the reader nothing at all. */
const humanise = (k: string) =>
  (k || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** `associate_disciplines.state` is on | off | blocked and carries no colour of
 *  its own from the server, unlike the person's own state. */
const discTone = (s: string) => (s === 'on' ? 'good' : s === 'blocked' ? 'bad' : 'warn');

/** The five levels `associates.AREA_LEVELS` spells, in the desk's words.
 *  `state` is the one that is not a place: it means no geographic limit at all,
 *  which is exactly right for an advocate and exactly wrong for a surveyor. */
const LEVELS: { key: string; word: string }[] = [
  { key: 'village', word: 'Village' },
  { key: 'mandal', word: 'Mandal' },
  { key: 'city', word: 'City' },
  { key: 'district', word: 'District' },
  { key: 'state', word: 'All of Telangana' },
];

/** What a refused write says. Word for word what every other refusal in this
 *  module says, because the same refusal in two places must not sound like two
 *  different problems. */
const WRITE_FAILED =
  'That did not go through. Nothing about this person has changed — reload the page and try again.';

const Refused = ({ children }: { children: ReactNode }) => (
  <p className="note" role="alert" style={{ margin: 'var(--space-xs) 0 0', color: 'var(--w-danger)' }}>
    {children}
  </p>
);

/** The reason a disabled primary is disabled, printed where the pointer already
 *  is. Never a `title=` — no browser shows one on a disabled control, which is
 *  how a button ends up looking broken instead of looking unready. */
const Why = ({ children }: { children: ReactNode }) => (
  <span className="note">{children}</span>
);

const isoDate = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || '');
  return match ? `${match[3]}-${match[2]}-${match[1]}` : (value || '').slice(0, 10);
};

function CertificationDialog({ id, discipline, label, credential, verified, onClose }: {
  id: string; discipline: string; label: string;
  credential?: AssociateCredential; verified: boolean; onClose: () => void;
}) {
  const save = useSetAssociateCertification();
  const catalogue = useDisciplines();
  const kind = catalogue.data?.find((item) => item.key === discipline)?.credential
    || credential?.kind || 'Company verification';
  const requirementKnown = !!credential?.kind || !!catalogue.data;
  const regulated = kind !== 'Company verification';
  const [authority, setAuthority] = useState(credential?.authority || (regulated ? '' : 'Pattadar'));
  const [issuedOn, setIssuedOn] = useState(isoDate(credential?.issuedOn || ''));
  const [expiresOn, setExpiresOn] = useState(isoDate(credential?.expiresOn || ''));
  const [credentialRef, setCredentialRef] = useState('');
  const [evidenceName, setEvidenceName] = useState(credential?.fileName || '');
  const [evidenceRef, setEvidenceRef] = useState(credential?.fileRef || '');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const ready = verified ? !!note.trim()
    : requirementKnown && !!authority.trim() && !!issuedOn
      && (!regulated || !!credentialRef.trim());

  const commit = async () => {
    if (!ready || save.isPending) return;
    setErr('');
    try {
      const res = await save.mutateAsync({
        id, discipline, certified: !verified, note: note.trim(), authority: authority.trim(),
        issuedOn, expiresOn, credentialRef: credentialRef.trim(),
        evidenceName: evidenceName.trim(), evidenceRef: evidenceRef.trim(),
      });
      if (!res.web.setAssociateCertification) { setErr(WRITE_FAILED); return; }
      onClose();
    } catch { setErr(WRITE_FAILED); }
  };

  return (
    <Dialog
      title={verified ? `Revoke ${label} certification` : `Review ${label} certification`}
      onClose={onClose} busy={save.isPending} dismissable={false}
      footer={(
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {!ready && <Why>{verified ? 'Record the reason first.'
            : regulated ? 'Authority, issue date and credential reference are required.'
              : 'Authority and issue date are required.'}</Why>}
          <button type="button" className="btn" onClick={onClose}>Leave it</button>
          <button type="button" className={verified ? 'btn danger' : 'btn primary'}
                  disabled={!ready || save.isPending} onClick={() => { void commit(); }}>
            {save.isPending ? 'Saving…' : verified ? 'Revoke certification' : 'Verify certification'}
          </button>
        </div>
      )}
    >
      {verified ? (
        <label className="field">
          Reason for revocation
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Expired, withdrawn by authority, or evidence could not be confirmed" />
        </label>
      ) : (
        <div className="stack sm">
          <p className="note">Required evidence: {kind}.</p>
          <div className="two">
            <label className="field">
              Issuing authority
              <input value={authority} onChange={(e) => setAuthority(e.target.value)}
                     placeholder="Government department or Pattadar" />
            </label>
            <label className="field">
              Issued on
              <input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
            </label>
          </div>
          <div className="two">
            <label className="field">
              {regulated ? 'Credential reference' : 'Verification reference'}
              <input value={credentialRef} onChange={(e) => setCredentialRef(e.target.value)}
                     placeholder={credential?.numberMasked || 'Registration or certificate number'} />
              <span className="note">Only a masked reference is retained for display.</span>
            </label>
            <label className="field">
              Valid until
              <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
              <span className="note">Leave blank only when the authority gives no expiry.</span>
            </label>
          </div>
          <div className="two">
            <label className="field">
              Evidence name
              <input value={evidenceName} onChange={(e) => setEvidenceName(e.target.value)}
                     placeholder="Survey licence.pdf" />
            </label>
            <label className="field">
              Evidence reference
              <input value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)}
                     placeholder="Secure file or registry reference" />
            </label>
          </div>
          <label className="field">
            Review note
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder="How the authority or evidence was checked" />
          </label>
        </div>
      )}
      {err && <Refused>{err}</Refused>}
    </Dialog>
  );
}

// ── The state change ───────────────────────────────────────────────────

/** Pausing, stopping, or letting somebody take work again.
 *
 *  One dialog for all three because they are one decision with three
 *  directions, and because the reason field is the whole point: an associate
 *  who is stopped and never told why is the failure this trail exists to make
 *  impossible. The reason is mandatory in both directions that take work away,
 *  and the primary stays disabled — with the reason for that printed beside
 *  it — until one is typed.
 */
function StateDialog({ id, name, to, jobsOpen, onClose }: {
  id: string; name: string; to: string; jobsOpen: number; onClose: () => void;
}) {
  const setState = useSetAssociateState();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  const needsReason = to === 'paused' || to === 'blocked';
  const ready = !needsReason || reason.trim().length > 0;

  const title = to === 'paused' ? `Pause ${name}`
    : to === 'blocked' ? `Stop ${name} taking work`
      : `Let ${name} take work again`;
  const verb = to === 'paused' ? 'Pause them'
    : to === 'blocked' ? 'Stop them' : 'Let them take work';

  const commit = async () => {
    if (!ready || setState.isPending) return;
    setErr('');
    try {
      const res = await setState.mutateAsync({ id, state: to, reason: reason.trim() });
      if (!res.web.setAssociateState) { setErr(WRITE_FAILED); return; }
      onClose();
    } catch {
      // The reason itself arrives as a toast from the shared mutation helper;
      // this line is what the dialog says about its own state.
      setErr(WRITE_FAILED);
    }
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      busy={setState.isPending}
      dismissable={false}
      initialFocus="textarea"
      footer={(
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {!ready && <Why>Type why first — this is what the trail will say, and it is what they are told.</Why>}
          <button type="button" className="btn" onClick={onClose} disabled={setState.isPending}>
            Leave it
          </button>
          <button
            type="button"
            className={to === 'blocked' ? 'btn danger' : 'btn primary'}
            disabled={!ready || setState.isPending}
            onClick={() => { void commit(); }}
          >
            {setState.isPending ? 'Saving…' : verb}
          </button>
        </div>
      )}
    >
      <div className="stack sm">
        <p className="note">
          {to === 'paused'
            ? 'They stop being offered work. Nothing else changes, and you can turn it back on from this page.'
            : to === 'blocked'
              ? 'They stop being offered work and stay stopped until somebody here decides otherwise.'
              : 'They start being offered work again from now on.'}
        </p>
        {/* The sentence that stops the operator assuming a pause clears their
            desk. It does not: the machine never takes a job off anybody. */}
        {needsReason && jobsOpen > 0 && (
          <p className="note">
            They have {plural(jobsOpen, 'job')} in hand. Those stay with them — take each
            one off by hand from the desk if you need to.
          </p>
        )}
        <label className="field">
          {needsReason ? 'Why' : 'Why, if it is worth writing down'}
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={to === 'blocked'
              ? 'Did not turn up twice in Peddapuram and did not answer'
              : 'Away until the end of the month'}
          />
        </label>
        {err && <Refused>{err}</Refused>}
      </div>
    </Dialog>
  );
}

// ── The one hard delete ────────────────────────────────────────────────

/** Removing somebody who never claimed an account.
 *
 *  This exists because an invited associate who never signs in has no Cognito
 *  principal, and the platform's entire erasure model keys on one — so there
 *  would otherwise be no way at all to honour "take me off your list" from
 *  somebody the desk typed in after a phone call. It is the only hard delete in
 *  the module and the dialog names every table it empties, because an operator
 *  who is surprised by what a delete took is an operator who will not use it
 *  when somebody asks them to.
 */
function DeleteDialog({ id, name, kinds, places, papers, onClose, onGone }: {
  id: string; name: string; kinds: number; places: number; papers: number;
  onClose: () => void; onGone: () => void;
}) {
  const del = useDeleteUnclaimedAssociate();
  const [err, setErr] = useState('');

  const commit = async () => {
    if (del.isPending) return;
    setErr('');
    try {
      const res = await del.mutateAsync({ id });
      if (!res.web.deleteUnclaimedAssociate) { setErr(WRITE_FAILED); return; }
      onGone();
    } catch {
      setErr(WRITE_FAILED);
    }
  };

  return (
    <Dialog
      title={`Remove ${name} completely`}
      onClose={onClose}
      busy={del.isPending}
      dismissable={false}
      footer={(
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={del.isPending}>
            Keep them
          </button>
          <button type="button" className="btn danger" disabled={del.isPending}
                  onClick={() => { void commit(); }}>
            {del.isPending ? 'Removing…' : 'Remove them'}
          </button>
        </div>
      )}
    >
      <div className="stack sm">
        <p>
          This deletes their name, their number, {plural(kinds, 'kind')} of work,
          {' '}{plural(places, 'place')} they cover, {plural(papers, 'paper')} on file and
          every line of their trail.
        </p>
        <p className="note">
          Nothing is kept and nothing can bring it back.
        </p>
        <p className="note">
          This is only possible because they never signed in and have never been on a
          job. Once somebody claims their record it is their own personal data and it
          leaves through their account&rsquo;s erasure; once they have worked, their name
          is written into an owner&rsquo;s job trail and it stays there.
        </p>
        {err && <Refused>{err}</Refused>}
      </div>
    </Dialog>
  );
}

// ── What they do ───────────────────────────────────────────────────────

/** The disciplines editor.
 *
 *  `setAssociateDisciplines` replaces the whole set rather than adding one, so
 *  the editor is a draft of the whole set and the panel says out loud what
 *  taking one off does. Capacity rides with the kind of work and not with the
 *  person because a surveyor who will take three surveys a week will happily
 *  take six site visits, and one number for both is a number that is wrong for
 *  one of them.
 */
function DisciplinesEditor({ id, current, onClose }: {
  id: string;
  current: { key: string; capacity: number }[];
  onClose: () => void;
}) {
  const save = useSetAssociateDisciplines();
  const catalogue = useDisciplines();
  const [draft, setDraft] = useState<Map<string, number>>(
    () => new Map(current.map((d) => [d.key, d.capacity])),
  );
  const [err, setErr] = useState('');

  const keys = [...draft.keys()];
  const was = current.map((d) => `${d.key}:${d.capacity}`).sort().join('|');
  const now = keys.map((k) => `${k}:${draft.get(k) ?? 3}`).sort().join('|');
  const dirty = was !== now;

  const toggle = (key: string, capacity: number) => setDraft((m) => {
    const next = new Map(m);
    if (next.has(key)) next.delete(key); else next.set(key, capacity);
    return next;
  });

  const commit = async () => {
    if (!dirty || keys.length === 0 || save.isPending) return;
    setErr('');
    try {
      const res = await save.mutateAsync({
        id, disciplines: keys, capacities: keys.map((k) => draft.get(k) ?? 3),
      });
      if (!res.web.setAssociateDisciplines) { setErr(WRITE_FAILED); return; }
      onClose();
    } catch {
      setErr(WRITE_FAILED);
    }
  };

  return (
    <div className="stack sm" style={{ marginTop: 'var(--space-sm)' }}>
      <p className="note">
        Taking a kind of work off this list stops them being offered it. Jobs they
        are already holding are not affected.
      </p>
      {catalogue.isLoading ? <Loading h="8rem" what="the kinds of work" />
        : !catalogue.data ? <Failed what="The kinds of work" error={catalogue.error} boxed h="8rem" />
          : (
            <div className="checks">
              {catalogue.data.map((d) => {
                const on = draft.has(d.key);
                return (
                  <div key={d.key} className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-sm)' }}>
                    <label className="check grow">
                      <input
                        type="checkbox" checked={on}
                        onChange={() => toggle(d.key, 3)}
                      />
                      <span className="grow">
                        {d.label}
                        <small style={{ display: 'block', color: 'var(--w-ink-3)' }}>
                          {d.blurb || `${d.kinds.join(', ')} · ${d.areaGrain} work`}
                        </small>
                      </span>
                    </label>
                    {/* The capacity only exists for a kind of work they
                        actually do, so it is drawn only when the box is
                        ticked — a stepper beside an unticked line is a
                        control with nothing behind it. */}
                    {on && (
                      <label className="note" style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '0.125rem' }}>
                        At a time
                        <input
                          type="number" min={1} max={20} style={{ width: '4.5rem' }}
                          value={draft.get(d.key) ?? 3}
                          aria-label={`How many ${d.label.toLowerCase()} jobs at a time`}
                          onChange={(e) => {
                            const n = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                            setDraft((m) => new Map(m).set(d.key, n));
                          }}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      <div className="row">
        <button
          type="button" className="btn primary"
          disabled={!dirty || keys.length === 0 || save.isPending}
          onClick={() => { void commit(); }}
        >
          {save.isPending ? 'Saving…' : 'Save what they do'}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={save.isPending}>
          Leave it
        </button>
        {keys.length === 0
          ? <Why>Keep at least one — somebody with no kind of work is never offered anything.</Why>
          : !dirty ? <Why>Nothing has changed yet.</Why> : null}
      </div>
      {err && <Refused>{err}</Refused>}
    </div>
  );
}

// ── Where they work ────────────────────────────────────────────────────

/** The areas editor.
 *
 *  Same shape as the disciplines editor and for the same reason:
 *  `setAssociateAreas` replaces the set, so what is on screen is the whole
 *  answer and Save writes it once. The level is not decoration — a surveyor
 *  who covers *Peddapuram mandal* must not be offered a plot in a *Peddapuram*
 *  locality of a city, and the level is the only thing that tells those two
 *  apart.
 */
function AreasEditor({ id, current, onClose }: {
  id: string; current: AssociateArea[]; onClose: () => void;
}) {
  const save = useSetAssociateAreas();
  const [draft, setDraft] = useState<{ level: string; name: string }[]>(
    () => current.map((a) => ({ level: a.level, name: a.name })),
  );
  const [level, setLevel] = useState('mandal');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [dupe, setDupe] = useState('');

  // 'state' means no geographic limit at all, so it has no name to type. The
  // word that goes on the row is the only thing the select needs to decide.
  const wholeState = level === 'state';
  const typed = wholeState ? 'Telangana' : name.trim();

  const was = current.map((a) => `${a.level}:${a.name}`).sort().join('|');
  const now = draft.map((a) => `${a.level}:${a.name}`).sort().join('|');
  const dirty = was !== now;

  /** The same fold the server uses to decide whether two places are one place,
   *  in its simplest form: a duplicate that only differs by case or a bracketed
   *  qualifier is a duplicate, and adding it twice would put "Peddapuram" and
   *  "Peddapuram (R)" on the same person as two different places. */
  const foldName = (s: string) =>
    s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, '');

  const add = () => {
    if (!typed) return;
    const already = draft.some(
      (a) => a.level === level && foldName(a.name) === foldName(typed),
    );
    if (already) { setDupe(`${typed} is already on the list.`); return; }
    setDupe('');
    setDraft((d) => [...d, { level, name: typed }]);
    setName('');
  };

  const commit = async () => {
    if (!dirty || draft.length === 0 || save.isPending) return;
    setErr('');
    try {
      const res = await save.mutateAsync({
        id, areas: draft.map((a) => `${a.level}:${a.name}`),
      });
      if (!res.web.setAssociateAreas) { setErr(WRITE_FAILED); return; }
      onClose();
    } catch {
      setErr(WRITE_FAILED);
    }
  };

  return (
    <div className="stack sm" style={{ marginTop: 'var(--space-sm)' }}>
      <div className="row tight">
        {draft.length === 0 ? (
          <p className="note">Nowhere yet.</p>
        ) : draft.map((a) => (
          <span key={`${a.level}:${a.name}`} className="fchip">
            <span className="grp">{LEVELS.find((l) => l.key === a.level)?.word ?? a.level}</span>
            <span className="val">{a.name}</span>
            <button
              type="button"
              aria-label={`Remove ${a.name}`}
              onClick={() => setDraft((d) => d.filter(
                (x) => !(x.level === a.level && x.name === a.name),
              ))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ width: '10rem' }}>
          Level
          <select value={level} onChange={(e) => { setLevel(e.target.value); setDupe(''); }}>
            {LEVELS.map((l) => <option key={l.key} value={l.key}>{l.word}</option>)}
          </select>
        </label>
        {wholeState ? (
          <p className="note" style={{ paddingBottom: '0.5625rem' }}>
            Everywhere — no local presence needed. An advocate opines on Nizamabad
            land from Hyderabad.
          </p>
        ) : (
          <label className="field grow">
            Place
            <input
              type="text" value={name}
              placeholder="Peddapuram"
              onChange={(e) => { setName(e.target.value); setDupe(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            />
          </label>
        )}
        <button type="button" className="btn" disabled={!typed} onClick={add}>Add</button>
        {!typed && <Why>Type the place first.</Why>}
      </div>
      {dupe && <p className="note">{dupe}</p>}
      <div className="row">
        <button
          type="button" className="btn primary"
          disabled={!dirty || draft.length === 0 || save.isPending}
          onClick={() => { void commit(); }}
        >
          {save.isPending ? 'Saving…' : 'Save where they work'}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={save.isPending}>
          Leave it
        </button>
        {draft.length === 0
          ? <Why>Keep at least one place — somebody who covers nowhere is never offered anything.</Why>
          : !dirty ? <Why>Nothing has changed yet.</Why> : null}
      </div>
      {err && <Refused>{err}</Refused>}
    </div>
  );
}

// ── Their postal address ───────────────────────────────────────────────

function AddressEditor({ a, onClose }: { a: Associate; onClose: () => void }) {
  const save = useUpdateAssociate();
  const [addressLine, setAddressLine] = useState(a.addressLine);
  const [villageLocality, setVillageLocality] = useState(a.villageLocality);
  const [postOffice, setPostOffice] = useState(a.postOffice);
  const [mandalCity, setMandalCity] = useState(a.mandalCity);
  const [district, setDistrict] = useState(a.district);
  const [stateName, setStateName] = useState(a.stateName || 'Andhra Pradesh');
  const [postalCode, setPostalCode] = useState(a.postalCode);
  const [err, setErr] = useState('');
  const complete = !!villageLocality.trim() && !!mandalCity.trim() && !!district.trim()
    && !!stateName.trim() && /^\d{6}$/.test(postalCode.trim());
  const now = [addressLine, villageLocality, postOffice, mandalCity, district, stateName, postalCode].join('|');
  const was = [a.addressLine, a.villageLocality, a.postOffice, a.mandalCity,
    a.district, a.stateName, a.postalCode].join('|');

  const commit = async () => {
    if (!complete || now === was || save.isPending) return;
    setErr('');
    try {
      const res = await save.mutateAsync({
        id: a.id, addressLine: addressLine.trim(), villageLocality: villageLocality.trim(),
        postOffice: postOffice.trim(), mandalCity: mandalCity.trim(), district: district.trim(),
        stateName: stateName.trim(), postalCode: postalCode.trim(),
      });
      if (!res.web.updateAssociate) { setErr(WRITE_FAILED); return; }
      onClose();
    } catch { setErr(WRITE_FAILED); }
  };

  return (
    <div className="stack sm" style={{ marginTop: 'var(--space-sm)' }}>
      <label className="field">
        House, building or street
        <input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
      </label>
      <div className="two">
        <label className="field">Village or locality
          <input value={villageLocality} onChange={(e) => setVillageLocality(e.target.value)} />
        </label>
        <label className="field">Delivery post office
          <input value={postOffice} onChange={(e) => setPostOffice(e.target.value)} />
        </label>
      </div>
      <div className="two">
        <label className="field">Mandal or city
          <input value={mandalCity} onChange={(e) => setMandalCity(e.target.value)} />
        </label>
        <label className="field">District
          <input value={district} onChange={(e) => setDistrict(e.target.value)} />
        </label>
      </div>
      <div className="two">
        <label className="field">State
          <input value={stateName} onChange={(e) => setStateName(e.target.value)} />
        </label>
        <label className="field">PIN code
          <input inputMode="numeric" maxLength={6} value={postalCode}
                 onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        </label>
      </div>
      <div className="row">
        <button type="button" className="btn primary" disabled={!complete || now === was || save.isPending}
                onClick={() => { void commit(); }}>{save.isPending ? 'Saving…' : 'Save address'}</button>
        <button type="button" className="btn" onClick={onClose}>Leave it</button>
        {!complete && <Why>Village/locality, mandal/city, district, state and a 6-digit PIN are required.</Why>}
      </div>
      {err && <Refused>{err}</Refused>}
    </div>
  );
}

// ── How to reach them ──────────────────────────────────────────────────

/** The number, and the one switch that decides whether an owner ever sees it.
 *
 *  Masked at rest and revealed by a button, so that the number appearing on a
 *  screen is always something a person did. The reveal is drawn only when the
 *  server actually sent a number to reveal — a Show button over nothing is the
 *  definition of a dead control.
 */
function Reach({ id, masked, contact, visible, name }: {
  id: string; masked: string; contact: string; visible: boolean; name: string;
}) {
  const update = useUpdateAssociate();
  const [shown, setShown] = useState(false);
  const [err, setErr] = useState('');

  const flip = async (on: boolean) => {
    if (update.isPending) return;
    setErr('');
    try {
      // Only `contactVisible` is sent. Every string argument defaults to "" and
      // means "leave this alone" — which is precisely why the boolean is
      // nullable in the schema and the strings are not.
      const res = await update.mutateAsync({ id, contactVisible: on });
      if (!res.web.updateAssociate) setErr(WRITE_FAILED);
    } catch {
      setErr(WRITE_FAILED);
    }
  };

  return (
    <div className="stack sm">
      <div className="row tight">
        {shown && contact ? (
          <a className="link mono" href={`tel:${contact}`}>{contact}</a>
        ) : (
          <span className="mono">{masked || 'No number on file'}</span>
        )}
        {contact && !shown && (
          <button type="button" className="btn sm" onClick={() => setShown(true)}>
            Show the number
          </button>
        )}
        {shown && (
          <button type="button" className="btn sm" onClick={() => setShown(false)}>Hide it</button>
        )}
      </div>
      {!contact && masked && (
        <p className="note">
          The full number is not sent to this screen. Whoever enrolled them has it,
          and Pattadar writes to them without anybody reading it out.
        </p>
      )}

      <label className="check">
        <input
          type="checkbox" checked={visible} disabled={update.isPending}
          onChange={(e) => { void flip(e.target.checked); }}
        />
        <span>An owner may see this number while they are on that owner&rsquo;s job</span>
      </label>
      <p className="note">
        {visible
          ? `They agreed that an owner can see this number while ${name} is on that owner's job. Nowhere else — every offer stays masked.`
          : 'They asked that owners not be given this number. Pattadar does the writing instead.'}
      </p>
      {err && <Refused>{err}</Refused>}
    </div>
  );
}

// ── Pattadar University training credentials ──────────────────────────

function IssueTrainingCertificate({ member, onClose }: {
  member: Associate; onClose: () => void;
}) {
  const issue = useIssueTrainingCertificate();
  const today = new Date().toISOString().slice(0, 10);
  const [courseCode, setCourseCode] = useState('PU-FIELD-SAFETY');
  const [courseTitle, setCourseTitle] = useState('Field safety and owner privacy');
  const [version, setVersion] = useState('1.0');
  const [trainerName, setTrainerName] = useState('Pattadar University Faculty');
  const [trainerRef, setTrainerRef] = useState('PU-FACULTY-001');
  const [completedOn, setCompletedOn] = useState(today);
  const [validUntil, setValidUntil] = useState('');
  const [hours, setHours] = useState('8');
  const [skills, setSkills] = useState('Owner privacy, Field safety, Evidence handling');
  const [evidenceRef, setEvidenceRef] = useState(`attendance:${member.id}:${today}`);
  const [note, setNote] = useState('Identity and attendance verified by the trainer.');
  const [err, setErr] = useState('');
  const ready = !!courseCode.trim() && !!courseTitle.trim() && !!version.trim()
    && !!trainerName.trim() && !!completedOn && Number(hours) > 0 && !!evidenceRef.trim();

  const commit = async () => {
    if (!ready || issue.isPending) return;
    setErr('');
    try {
      const res = await issue.mutateAsync({
        id: member.id, courseCode: courseCode.trim(), courseTitle: courseTitle.trim(),
        courseVersion: version.trim(), trainerName: trainerName.trim(), trainerRef: trainerRef.trim(),
        completedOn, validUntil, hours: Number(hours),
        skills: skills.split(',').map((item) => item.trim()).filter(Boolean),
        evidenceRef: evidenceRef.trim(), note: note.trim(),
      });
      if (!res.web.issueTrainingCertificate) { setErr(WRITE_FAILED); return; }
      onClose();
    } catch { setErr(WRITE_FAILED); }
  };

  return (
    <Dialog title={`Issue training certificate to ${member.name}`} onClose={onClose}
            busy={issue.isPending} dismissable={false}
            footer={(
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                {!ready && <Why>Course, trainer, completion date, duration and evidence are required.</Why>}
                <button type="button" className="btn" onClick={onClose}>Leave it</button>
                <button type="button" className="btn primary" disabled={!ready || issue.isPending}
                        onClick={() => { void commit(); }}>
                  {issue.isPending ? 'Issuing…' : 'Issue certificate'}
                </button>
              </div>
            )}>
      <div className="stack sm">
        <p className="note">
          This is a Pattadar University internal training credential. It does not replace a
          government licence or professional registration.
        </p>
        <div className="two">
          <label className="field">Course code
            <input value={courseCode} onChange={(e) => setCourseCode(e.target.value.toUpperCase())} />
          </label>
          <label className="field">Course version
            <input value={version} onChange={(e) => setVersion(e.target.value)} />
          </label>
        </div>
        <label className="field">Course title
          <input value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} />
        </label>
        <div className="two">
          <label className="field">Trainer name
            <input value={trainerName} onChange={(e) => setTrainerName(e.target.value)} />
          </label>
          <label className="field">Trainer or faculty reference
            <input value={trainerRef} onChange={(e) => setTrainerRef(e.target.value)} />
          </label>
        </div>
        <div className="two">
          <label className="field">Completed on
            <input type="date" value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} />
          </label>
          <label className="field">Valid until
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </label>
        </div>
        <div className="two">
          <label className="field">Learning hours
            <input type="number" min="0.5" max="1000" step="0.5" value={hours}
                   onChange={(e) => setHours(e.target.value)} />
          </label>
          <label className="field">Completion evidence reference
            <input value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} />
          </label>
        </div>
        <label className="field">Skills, separated by commas
          <input value={skills} onChange={(e) => setSkills(e.target.value)} />
        </label>
        <label className="field">Issuance note
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {err && <Refused>{err}</Refused>}
      </div>
    </Dialog>
  );
}

function RevokeTrainingCertificate({ certificate, onClose }: {
  certificate: TrainingCertificate; onClose: () => void;
}) {
  const revoke = useRevokeTrainingCertificate();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const commit = async () => {
    if (!reason.trim() || revoke.isPending) return;
    try {
      const res = await revoke.mutateAsync({ id: certificate.id, reason: reason.trim() });
      if (!res.web.revokeTrainingCertificate) { setErr(WRITE_FAILED); return; }
      onClose();
    } catch { setErr(WRITE_FAILED); }
  };
  return (
    <Dialog title={`Revoke ${certificate.certificateNo}`} onClose={onClose} busy={revoke.isPending}
            dismissable={false} footer={(
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                {!reason.trim() && <Why>Record the revocation reason first.</Why>}
                <button type="button" className="btn" onClick={onClose}>Keep it active</button>
                <button type="button" className="btn danger" disabled={!reason.trim() || revoke.isPending}
                        onClick={() => { void commit(); }}>Revoke certificate</button>
              </div>
            )}>
      <label className="field">Reason
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Issued in error, training invalidated, or identity mismatch" />
      </label>
      {err && <Refused>{err}</Refused>}
    </Dialog>
  );
}

// ── The page ───────────────────────────────────────────────────────────

/** The page once the person has actually loaded.
 *
 *  A component of its own so that the route below can say its three states in
 *  three sentences and mean them. Written inline, the loaded branch would be
 *  four hundred lines of JSX hanging off the end of a ternary, and the first
 *  person to tidy that would collapse it into `isLoading || !data` — which
 *  draws a skeleton that can never resolve, because react-query settles a
 *  twice-failed read into `isLoading: false, data: undefined` and leaves it
 *  there. */
function Person({ a, onGone }: { a: Associate; onGone: () => void }) {
  const events = useAssociateEvents(a.id);
  const jobs = useAssociateJobs(a.id);
  const certificates = useAssociateTrainingCertificates(a.id);
  const training = useSetAssociateTraining();
  const message = useMessageAssociate();
  const [memberError, setMemberError] = useState('');
  const [companyMessage, setCompanyMessage] = useState('');
  const [trainingNote, setTrainingNote] = useState(a.trainingNote);

  const [stateTo, setStateTo] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<'' | 'what' | 'address' | 'where'>('');
  const [certReview, setCertReview] = useState('');
  const [issuingTraining, setIssuingTraining] = useState(false);
  const [revokingTraining, setRevokingTraining] = useState<TrainingCertificate | null>(null);

  const roles = a.disciplines.map((d) => d.label).join(', ');
  const setTraining = async (state: string) => {
    setMemberError('');
    try {
      const res = await training.mutateAsync({ id: a.id, state, note: trainingNote.trim() });
      if (!res.web.setAssociateTraining) setMemberError(WRITE_FAILED);
    } catch { setMemberError(WRITE_FAILED); }
  };

  const sendCompanyMessage = async () => {
    const body = companyMessage.trim();
    if (!body) return;
    setMemberError('');
    try {
      const res = await message.mutateAsync({ id: a.id, message: body });
      if (!res.web.messageAssociate) { setMemberError(WRITE_FAILED); return; }
      setCompanyMessage('');
    } catch { setMemberError(WRITE_FAILED); }
  };

  /** What the head menu offers, and nothing it cannot do. There is no Retire
   *  and no "send the claim link again": phase 1 mints no claim links and the
   *  four states are the four states. A menu item that would do nothing is a
   *  lie told in one word. */
  const menu = [
    ...(a.state === 'active' || a.state === 'invited'
      ? [{ label: 'Pause them', onClick: () => setStateTo('paused') }] : []),
    ...(a.state === 'paused' || a.state === 'blocked'
      ? [{ label: 'Let them take work again', onClick: () => setStateTo('active') }] : []),
    ...(a.state !== 'blocked'
      ? [{ label: 'Stop them taking work', danger: true, onClick: () => setStateTo('blocked') }] : []),
    // The server refuses this for anybody who has claimed a record or has ever
    // been on a job — their history is somebody else's ticket trail — so the
    // item is not drawn for them either. A menu item that always answers false
    // is a dead control with a confirmation dialog in front of it.
    ...(!a.claimed && a.jobsOpen === 0 && a.jobsDone === 0
      && certificates.data?.length === 0
      ? [{ label: 'Remove them completely', danger: true, rule: true, onClick: () => setDeleting(true) }] : []),
  ];

  return (
    <>
      <header className="pagehead">
        {/* `.grow` has to ride on the pagehead's own child — `.pagehead .grow`
            is what claims the leftover width — so the avatar and the name sit
            inside it rather than beside it. */}
        <div className="row grow" style={{ flexWrap: 'nowrap', gap: 'var(--space-md)' }}>
          <span className="avatarlg">{a.initials}</span>
          <div style={{ minWidth: 0 }}>
            <h1>{a.name}</h1>
            <p className="lede" style={{ marginTop: '0.25rem' }}>
              {[roles, a.addressLabel || 'Full address not recorded',
                a.createdAt ? `with us since ${ddmmyyyy(a.createdAt)}` : '']
                .filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="actions">
          <State state={a.stateState}>{a.stateWord}</State>
          {menu.length > 0 && <Menu label={`What to do about ${a.name}`} header={a.name} items={menu} />}
        </div>
      </header>

      {/* The reason somebody is paused or stopped belongs beside the word, not
          buried in the trail: an operator who cannot see why will undo it. */}
      {a.stateReason && (
        <p className="note" style={{ marginTop: 'calc(var(--space-sm) * -1)' }}>
          {a.stateWord}: {a.stateReason}
        </p>
      )}

      <div className="split" style={{ marginTop: 'var(--space-md)' }}>
        <div className="stack">
          <Card
            title="What they do"
            aside={editing !== 'what' ? (
              <button type="button" className="btn sm" onClick={() => setEditing('what')}>
                Change
              </button>
            ) : undefined}
          >
            {a.disciplines.length === 0 ? (
              <p className="note">
                Nothing yet. Until a kind of work is on this list they cannot be put on
                anything.
              </p>
            ) : (
              <div className="rows">
                {a.disciplines.map((d) => (
                  <div key={d.key}>
                    <span className="grow">
                      <strong style={{ fontSize: '0.875rem' }}>{d.label}</strong>
                      {d.credentialState && (
                        <span className="note" style={{ display: 'block' }}>
                          {humanise(d.credentialState)}
                        </span>
                      )}
                    </span>
                    {d.state !== 'on' && (
                      <State state={discTone(d.state)}>{d.stateWord || humanise(d.state)}</State>
                    )}
                    <span className="note mono" style={{ whiteSpace: 'nowrap' }}>
                      {d.openCount} of {d.capacity} in hand
                    </span>
                    <button type="button" className="btn sm"
                            onClick={() => setCertReview(d.key)}>
                      {['verified', 'expiring'].includes(d.credentialState)
                        ? 'Review certification' : 'Verify certification'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {editing === 'what' && (
              <DisciplinesEditor
                id={a.id}
                current={a.disciplines.map((d) => ({ key: d.key, capacity: d.capacity }))}
                onClose={() => setEditing('')}
              />
            )}
          </Card>

          <Card
            title="Full postal address"
            aside={editing !== 'address' ? (
              <button type="button" className="btn sm" onClick={() => setEditing('address')}>
                Change
              </button>
            ) : undefined}
          >
            {a.addressLabel ? (
              <div className="stack sm">
                <p>{a.addressLabel}</p>
                {!a.addressComplete && (
                  <p className="note" style={{ color: 'var(--w-danger)' }}>
                    Address incomplete. Add the village/locality, mandal/city, district,
                    state and 6-digit PIN before relying on this location.
                  </p>
                )}
              </div>
            ) : (
              <p className="note" style={{ color: 'var(--w-danger)' }}>
                Full address not recorded. A work coverage area is not a postal address.
              </p>
            )}
            {editing === 'address' && <AddressEditor a={a} onClose={() => setEditing('')} />}
          </Card>

          <Card
            title="Where they take work"
            aside={editing !== 'where' ? (
              <button type="button" className="btn sm" onClick={() => setEditing('where')}>
                Change
              </button>
            ) : undefined}
          >
            {a.areas.length === 0 ? (
              <p className="note">
                Nowhere yet. Somebody who covers nowhere is never offered anything.
              </p>
            ) : (
              <div className="row tight">
                {a.areas.map((x) => <Chip key={x.id} wash>{x.label || x.name}</Chip>)}
              </div>
            )}
            {editing === 'where' && (
              <AreasEditor id={a.id} current={a.areas} onClose={() => setEditing('')} />
            )}
          </Card>

          <Card title="Papers" aside={<span className="num muted">{a.credentials.length}</span>}>
            {a.credentials.length === 0 ? (
              <p className="note">
                Nothing is certified. This member cannot receive work until each active
                discipline has verified evidence or a company verification.
              </p>
            ) : (
              <div className="rows">
                {a.credentials.map((c) => {
                  const r = REVIEW[c.review] ?? { word: humanise(c.review), tone: 'unknown' };
                  return (
                    <div key={c.id}>
                      <span className="grow">
                        <span className="row tight">
                          <strong style={{ fontSize: '0.875rem' }}>{c.kind}</strong>
                          {c.numberMasked && <span className="note mono">{c.numberMasked}</span>}
                        </span>
                        <span className="note" style={{ display: 'block' }}>
                          {[c.authority, c.discipline].filter(Boolean).join(' · ')}
                          {c.reviewNote ? ` — ${c.reviewNote}` : ''}
                        </span>
                        <span className="note" style={{ display: 'block' }}>
                          {c.issuedOn ? `Issued ${ddmmyyyy(c.issuedOn)}` : 'Issue date not recorded'}
                          {c.reviewedAt ? ` · Reviewed ${ddmmyyyy(c.reviewedAt)}` : ''}
                          {c.reviewedBy ? ` · By ${c.reviewedBy}` : ''}
                        </span>
                        {(c.fileName || c.fileRef) && (
                          <span className="note" style={{ display: 'block' }}>
                            Evidence: {[c.fileName, c.fileRef].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                      {c.lapsed ? <Tag alert>Lapsed {ddmmyyyy(c.expiresOn)}</Tag>
                        : c.expiring ? <Tag alert>{plural(c.daysLeft, 'day')} left</Tag>
                          : c.expiresOn ? (
                            <span className="note" style={{ whiteSpace: 'nowrap' }}>
                              Good until {ddmmyyyy(c.expiresOn)}
                            </span>
                          ) : <span className="note">No expiry recorded</span>}
                      <State state={r.tone}>{r.word}</State>
                      {(c.fileRef.startsWith('/') || /^https?:\/\//.test(c.fileRef)) && (
                        <a className="btn sm" href={c.fileRef} target="_blank" rel="noreferrer">
                          View evidence
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
              Certification is enforced by the server on owner assignment, desk assignment
              and automatic candidate selection.
            </p>
          </Card>

          <Card
            title="Pattadar University"
            aside={(
              <button type="button" className="btn sm" onClick={() => setIssuingTraining(true)}>
                Issue certificate
              </button>
            )}
          >
            <p className="note" style={{ marginBottom: 'var(--space-sm)' }}>
              Internal training credentials only. Government licences and professional
              registrations remain under Papers and are still required for regulated work.
            </p>
            {certificates.isLoading ? <Loading h="7rem" what="training certificates" />
              : !certificates.data ? (
                <Failed what="Training certificates" error={certificates.error} boxed h="7rem" />
              ) : certificates.data.length === 0 ? (
                <p className="note">No Pattadar University certificate has been issued.</p>
              ) : (
                <div className="rows">
                  {certificates.data.map((certificate) => (
                    <div key={certificate.id}>
                      <span className="grow">
                        <strong style={{ fontSize: '0.875rem' }}>{certificate.courseTitle}</strong>
                        <span className="note" style={{ display: 'block' }}>
                          {certificate.courseCode} · version {certificate.courseVersion}
                          {' '}· trained by {certificate.trainerName}
                        </span>
                        <span className="note mono" style={{ display: 'block' }}>
                          {certificate.certificateNo} · completed {ddmmyyyy(certificate.completedOn)}
                        </span>
                      </span>
                      <State state={certificate.verificationState === 'valid' ? 'good'
                        : certificate.verificationState === 'expired' ? 'warn' : 'bad'}>
                        {humanise(certificate.verificationState)}
                      </State>
                      <Link className="btn sm"
                            to={`/certificate/${encodeURIComponent(certificate.verificationCode)}`}
                            target="_blank">View certificate</Link>
                      {certificate.status === 'active' && (
                        <button type="button" className="btn sm danger"
                                onClick={() => setRevokingTraining(certificate)}>Revoke</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
          </Card>

          <Card
            title="Jobs"
            aside={(
              <span className="note">
                {a.jobsOpen > 0 ? `${a.jobsOpen} in hand` : 'Nothing in hand'}
                {a.jobsDone > 0 ? ` · ${plural(a.jobsDone, 'job')} done` : ''}
              </span>
            )}
          >
            {jobs.isLoading ? <Loading h="7rem" what="their jobs" />
              : !jobs.data ? <Failed what="Their jobs" error={jobs.error} boxed h="7rem" />
                : jobs.data.length === 0 ? (
                  <p className="note">
                    No service has been assigned to them yet. Put them on a job from the
                    job&rsquo;s own page.
                  </p>
                ) : (
                  <div className="rows">
                    {jobs.data.map((j) => (
                      <div key={j.ticketId}>
                        <span className="grow">
                          <span className="row tight">
                            <strong style={{ fontSize: '0.875rem' }}>{j.serviceLabel}</strong>
                            <span className="mono note">{j.ref}</span>
                          </span>
                          <span className="note" style={{ display: 'block' }}>{j.place}</span>
                        </span>
                        <State state={j.statusState}>{j.statusLabel}</State>
                      </div>
                    ))}
                  </div>
                )}
          </Card>
        </div>

        <aside className="stack">
          <Card title="How to reach them">
            <Reach
              id={a.id} name={a.name} masked={a.contactMasked} contact={a.contact}
              visible={a.contactVisible}
            />
            {a.claimed ? (
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                They have signed in and this record is theirs. It leaves Pattadar through
                their own account, not from this page.
              </p>
            ) : (a.jobsOpen > 0 || a.jobsDone > 0) && (
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                They have been on jobs, so their record stays — their name is written into
                an owner&rsquo;s job trail and nothing here can take it back out.
              </p>
            )}
            {a.note && (
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>{a.note}</p>
            )}
          </Card>

          <Card title="How it has gone">
            {a.ratingCount > 0 && (
              <p style={{ marginBottom: 'var(--space-sm)' }}>
                <strong>{a.ratingAverage.toFixed(1)} / 5</strong>{' '}
                <span className="note">from {plural(a.ratingCount, 'completed service rating')}</span>
              </p>
            )}
            {a.offersSent === 0 ? (
              <p className="note">
                Nothing has been offered to anybody yet. Pattadar does not send offers —
                the desk puts people on jobs by hand, and that is what the trail below
                records.
              </p>
            ) : (
              <div className="stack sm">
                <p className="note">
                  {plural(a.offersSent, 'offer')} sent · {a.offersTaken} taken
                  {' '}· {a.offersDeclined} turned down
                </p>
                {/* Below five offers there is no rate worth printing. Four out
                    of four is 100% and means nothing whatever. */}
                {a.offersSent >= 5 && (
                  <p className="note">They have taken {a.offersTaken} of {a.offersSent}.</p>
                )}
                {a.lastOfferedAt && (
                  <p className="note">Last offered {ddmmyyyy(a.lastOfferedAt)}.</p>
                )}
              </div>
            )}
            <div className="field" style={{ marginTop: 'var(--space-md)' }}>
              <label htmlFor="training-note">Training decision</label>
              <textarea id="training-note" rows={2} value={trainingNote}
                        placeholder="Reason, course or company decision"
                        onChange={(e) => setTrainingNote(e.target.value)} />
            </div>
            <div className="row tight">
              <button type="button" className="btn sm" disabled={!trainingNote.trim() || training.isPending}
                      onClick={() => void setTraining('required')}>Require training</button>
              <button type="button" className="btn sm" disabled={!trainingNote.trim() || training.isPending}
                      onClick={() => void setTraining('in_training')}>In training</button>
              <button type="button" className="btn sm" disabled={training.isPending}
                      onClick={() => void setTraining('cleared')}>Clear for work</button>
            </div>
            <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
              Current training status: {humanise(a.trainingState)}. At 100 ratings, an
              average below 3 automatically requires retraining and stops new allocation.
            </p>
          </Card>

          <Card title="Message from the company">
            <div className="field">
              <label htmlFor="company-message">Message</label>
              <textarea id="company-message" rows={3} value={companyMessage}
                        placeholder="This is sent on their preferred channel and kept in the trail."
                        onChange={(e) => setCompanyMessage(e.target.value)} />
            </div>
            <button type="button" className="btn primary"
                    disabled={!companyMessage.trim() || message.isPending}
                    onClick={() => void sendCompanyMessage()}>
              {message.isPending ? 'Sending…' : 'Send message'}
            </button>
          </Card>

          {memberError && <Refused>{memberError}</Refused>}

          <Card title="Everything that happened">
            {events.isLoading ? <Loading h="8rem" what="their trail" />
              : !events.data ? <Failed what="Their trail" error={events.error} boxed h="8rem" />
                : events.data.length === 0 ? (
                  <p className="note">
                    Nothing yet beyond being written down. Every decision anybody makes
                    about them lands here and stays.
                  </p>
                ) : (
                  <div className="rows">
                    {events.data.map((e) => (
                      <div key={e.id}>
                        <span className="grow">
                          <span style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500 }}>
                            {e.headline}
                          </span>
                          {e.detail && (
                            <span className="note" style={{ display: 'block' }}>{e.detail}</span>
                          )}
                          <span className="note" style={{ display: 'block' }}>
                            {[e.actorLabel, e.atLabel].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
          </Card>
        </aside>
      </div>

      {stateTo && (
        <StateDialog
          id={a.id} name={a.name} to={stateTo} jobsOpen={a.jobsOpen}
          onClose={() => setStateTo('')}
        />
      )}
      {deleting && (
        <DeleteDialog
          id={a.id} name={a.name}
          kinds={a.disciplines.length} places={a.areas.length} papers={a.credentials.length}
          onClose={() => setDeleting(false)}
          onGone={() => { setDeleting(false); onGone(); }}
        />
      )}
      {certReview && (() => {
        const discipline = a.disciplines.find((item) => item.key === certReview);
        const credential = a.credentials.find((item) => item.discipline === certReview);
        if (!discipline) return null;
        return (
          <CertificationDialog
            id={a.id} discipline={discipline.key} label={discipline.label}
            credential={credential}
            verified={['verified', 'expiring'].includes(discipline.credentialState)}
            onClose={() => setCertReview('')}
          />
        );
      })()}
      {issuingTraining && (
        <IssueTrainingCertificate member={a} onClose={() => setIssuingTraining(false)} />
      )}
      {revokingTraining && (
        <RevokeTrainingCertificate certificate={revokingTraining}
                                   onClose={() => setRevokingTraining(null)} />
      )}
    </>
  );
}

// ── The route ──────────────────────────────────────────────────────────

export function DeskAssociate() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useAssociate(id);
  /** The delete succeeded and this person no longer exists. Held here rather
   *  than navigating away: the operator has just destroyed something on
   *  purpose and the page should say so in the place they were looking,
   *  rather than dropping them on a roster and leaving them to work out
   *  whether it went through. */
  const [gone, setGone] = useState(false);

  return (
    <main>
      <Crumbs trail={[{ label: 'Administration', to: '/app/admin/members' },
                      { label: 'Company members', to: '/app/admin/members' },
                      ...(data && !gone ? [{ label: data.name }] : [])]} />
      {gone ? (
        <Empty
          boxed h="18rem" icon="person" title="They have been removed."
          action={<Link className="btn" to="/app/admin/members">Back to the roster</Link>}
        >
          Nothing of theirs is kept. Nobody will be offered a job in their name again.
        </Empty>
      ) : isLoading ? <Loading h="20rem" what="this associate" />
        : !data ? <Failed what="This associate" error={error} boxed h="20rem" />
          : <Person a={data} onGone={() => setGone(true)} />}
    </main>
  );
}
