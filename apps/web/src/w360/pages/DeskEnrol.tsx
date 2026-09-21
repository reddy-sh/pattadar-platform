/** Adding somebody to the roster — the form the desk fills in during the call.
 *
 *  The lede assumes the phone call has already happened, because it has. This
 *  is not a sign-up page and there is nothing here for the associate to do: a
 *  surveyor Pattadar has worked with for two years is not going to fill in a
 *  web form, and a roster that waits for them to is a roster that stays empty
 *  for the entire cold start. Somebody at the desk types what they were just
 *  told, and that person can be put on a job the same minute.
 *
 *  A name, a way to reach them, a complete postal hierarchy, one kind of work
 *  and one coverage area are needed. The address and the coverage are separate:
 *  where an office receives post is not proof that its crew accepts work there.
 *
 *  Papers follow after enrolment, but allocation does not: every active
 *  discipline stays unavailable until its statutory credential or company
 *  verification is reviewed.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

import { useDisciplines, useInviteAssociate, useUpdateAssociate } from '../api';
import { Card, Crumbs, Failed, Loading, PageHead } from '../ui';

/** The five levels `associates.AREA_LEVELS` spells, in the desk's words.
 *  `state` is the one that is not a place at all: it means no geographic limit,
 *  which is exactly right for an advocate — a title opinion is document
 *  analysis and the land can be anywhere — and exactly wrong for a surveyor,
 *  who has to stand on it. */
const LEVELS: { key: string; word: string }[] = [
  { key: 'village', word: 'Village' },
  { key: 'mandal', word: 'Mandal' },
  { key: 'city', word: 'City' },
  { key: 'district', word: 'District' },
  { key: 'state', word: 'All of Telangana' },
];

/** How Pattadar writes to them. 'auto' picks by the shape of what was typed —
 *  an address goes by email, a number by SMS — which is right for everybody the
 *  desk enrols by phone. The other three exist for the person who says
 *  "WhatsApp only", and that is stored on their row rather than remembered. */
const CHANNELS: { key: string; word: string }[] = [
  { key: 'auto', word: 'Whatever fits the number' },
  { key: 'whatsapp', word: 'WhatsApp' },
  { key: 'sms', word: 'SMS' },
  { key: 'email', word: 'Email' },
];

/** The reason a disabled primary is disabled, printed beside it. Never a
 *  `title=` — no browser shows one on a disabled control. */
const Why = ({ children }: { children: ReactNode }) => (
  <span className="note">{children}</span>
);

/** The same fold the server uses to decide whether two places are one place.
 *  Without it "Peddapuram" and "Peddapuram (R)" go on as two areas and the
 *  person looks like they cover twice as much ground as they do. */
const foldName = (s: string) =>
  s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, '');

export function DeskEnrol() {
  const nav = useNavigate();
  const invite = useInviteAssociate();
  const update = useUpdateAssociate();
  const catalogue = useDisciplines();

  const [name, setName] = useState('');
  const [firm, setFirm] = useState('');
  const [contact, setContact] = useState('');
  const [channel, setChannel] = useState('auto');
  const [note, setNote] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [villageLocality, setVillageLocality] = useState('');
  const [postOffice, setPostOffice] = useState('');
  const [mandalCity, setMandalCity] = useState('');
  const [district, setDistrict] = useState('');
  const [stateName, setStateName] = useState('Andhra Pradesh');
  const [postalCode, setPostalCode] = useState('');
  const [visible, setVisible] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [areas, setAreas] = useState<{ level: string; name: string }[]>([]);
  const [level, setLevel] = useState('mandal');
  const [place, setPlace] = useState('');
  const [dupe, setDupe] = useState('');
  const [err, setErr] = useState('');
  /** Set only when the person WAS written down and the second write failed.
   *  It changes where the error line points: back to the roster is useless
   *  advice when what is needed is the switch on their own page. */
  const [halfDone, setHalfDone] = useState('');

  const wholeState = level === 'state';
  const typed = wholeState ? 'Telangana' : place.trim();

  const addressReady = !!villageLocality.trim() && !!mandalCity.trim()
    && !!district.trim() && !!stateName.trim() && /^\d{6}$/.test(postalCode.trim());
  const ready = !!name.trim() && !!contact.trim() && picked.length > 0
    && areas.length > 0 && addressReady;

  const addArea = () => {
    if (!typed) return;
    if (areas.some((a) => a.level === level && foldName(a.name) === foldName(typed))) {
      setDupe(`${typed} is already on the list.`);
      return;
    }
    setDupe('');
    setAreas((d) => [...d, { level, name: typed }]);
    setPlace('');
  };

  /** Writes the row, then — only if the person asked for it — turns the number
   *  off for owners.
   *
   *  Two writes, because `inviteAssociate` has no visibility argument and the
   *  column defaults to true. The order matters and so does what happens when
   *  the second one fails: the person exists either way, so this never pretends
   *  the enrolment failed, and it never quietly navigates away leaving a number
   *  shareable that somebody on a phone call explicitly asked to keep private.
   *  It stops, says exactly that, and links to the page with the switch on it.
   */
  const file = async () => {
    if (!ready || invite.isPending) return;
    setErr('');
    setHalfDone('');
    try {
      const res = await invite.mutateAsync({
        name: name.trim(),
        contact: contact.trim(),
        disciplines: picked,
        areas: areas.map((a) => `${a.level}:${a.name}`),
        firm: firm.trim(),
        note: note.trim(),
        channel,
        addressLine: addressLine.trim(),
        villageLocality: villageLocality.trim(),
        postOffice: postOffice.trim(),
        mandalCity: mandalCity.trim(),
        district: district.trim(),
        stateName: stateName.trim(),
        postalCode: postalCode.trim(),
      });
      const id = res.web.inviteAssociate;
      if (!id) {
        setErr('That did not go through, and nobody was added. The likeliest reason is '
          + 'that this number is already on somebody else’s row — search the roster '
          + 'for it before typing it again.');
        return;
      }
      if (!visible) {
        const off = await update.mutateAsync({ id, contactVisible: false });
        if (!off.web.updateAssociate) {
          setHalfDone(id);
          setErr(`${name.trim()} was added, but their number is still shareable with an `
            + 'owner. Open their page and turn that off.');
          return;
        }
      }
      nav(`/app/admin/members/${id}`);
    } catch {
      // The reason itself arrives as a toast from the shared mutation helper;
      // this line is what the form says about its own state.
      setErr('That did not go through. Nothing was saved — try again.');
    }
  };

  return (
    <main>
      <Crumbs trail={[{ label: 'The desk', to: '/app/desk' },
                      { label: 'Company members', to: '/app/admin/members' },
                      { label: 'Add somebody' }]} />
      <PageHead eyebrow="Pattadar desk" title="Add an associate">
        <p className="lede" style={{ marginTop: '0.375rem' }}>
          You have spoken to them. This writes it down and sends them a link — they
          can be reviewed for work with or without a Pattadar account.
        </p>
      </PageHead>

      <form
        className="stack lg"
        style={{ maxWidth: '48rem', marginTop: 'var(--space-md)' }}
        onSubmit={(e) => { e.preventDefault(); void file(); }}
      >
        <Card className="stack">
          <div className="two">
            <label className="field">
              Their name
              <input type="text" value={name} placeholder="G. Srinivas"
                     onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              Firm or office
              <input type="text" value={firm} placeholder="Srinivas &amp; Co."
                     onChange={(e) => setFirm(e.target.value)} />
              <span className="note">Optional.</span>
            </label>
          </div>
          <div className="two">
            <label className="field">
              Mobile or email
              <input type="text" value={contact} placeholder="98480 12345"
                     onChange={(e) => setContact(e.target.value)} />
            </label>
            <label className="field">
              Send work by
              <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.word}</option>)}
              </select>
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={visible}
                   onChange={(e) => setVisible(e.target.checked)} />
            <span>An owner may see their number while they are on that owner&rsquo;s job</span>
          </label>
          <p className="note" style={{ marginTop: 'calc(var(--space-xs) * -1)' }}>
            Off means owners never see it and Pattadar does the writing instead. It is
            the only place an associate&rsquo;s number is ever shown to anybody outside
            the desk — every offer stays masked whatever this says.
          </p>
          <label className="field">
            Anything worth remembering
            <textarea rows={2} value={note} placeholder="Works Peddapuram side, not Tuni. Prefers a call before 10."
                      onChange={(e) => setNote(e.target.value)} />
          </label>
        </Card>

        <Card title="Full postal address" className="stack">
          <p className="note">
            Keep this separate from the places where they accept work. The address identifies
            their home or office; coverage decides which jobs they may receive.
          </p>
          <label className="field">
            House, building or street
            <input value={addressLine} placeholder="House number, street or office"
                   onChange={(e) => setAddressLine(e.target.value)} />
            <span className="note">Optional when the village address has no street number.</span>
          </label>
          <div className="two">
            <label className="field">
              Village or locality
              <input value={villageLocality} placeholder="Katragunta"
                     onChange={(e) => setVillageLocality(e.target.value)} />
            </label>
            <label className="field">
              Delivery post office
              <input value={postOffice} placeholder="Katragunta B.O."
                     onChange={(e) => setPostOffice(e.target.value)} />
              <span className="note">Recommended for a village address.</span>
            </label>
          </div>
          <div className="two">
            <label className="field">
              Mandal or city
              <input value={mandalCity} placeholder="Konakanamitla"
                     onChange={(e) => setMandalCity(e.target.value)} />
            </label>
            <label className="field">
              District
              <input value={district} placeholder="Prakasam"
                     onChange={(e) => setDistrict(e.target.value)} />
            </label>
          </div>
          <div className="two">
            <label className="field">
              State
              <input value={stateName} placeholder="Andhra Pradesh"
                     onChange={(e) => setStateName(e.target.value)} />
            </label>
            <label className="field">
              PIN code
              <input inputMode="numeric" maxLength={6} value={postalCode} placeholder="523246"
                     onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
              {postalCode && !/^\d{6}$/.test(postalCode) && <span className="note">Enter all 6 digits.</span>}
            </label>
          </div>
        </Card>

        <Card title="What they do" className="stack">
          {catalogue.isLoading ? <Loading h="10rem" what="the kinds of work" />
            : !catalogue.data ? <Failed what="The kinds of work" error={catalogue.error} boxed h="10rem" />
              : (
                <div className="choice svc">
                  {catalogue.data.map((d) => {
                    const on = picked.includes(d.key);
                    return (
                      <button
                        key={d.key} type="button" aria-pressed={on}
                        onClick={() => setPicked(
                          (p) => (p.includes(d.key) ? p.filter((k) => k !== d.key) : [...p, d.key]),
                        )}
                      >
                        {d.label}
                        <small>
                          {d.blurb
                            || `${d.kinds.map((k) => k.replace(/_/g, ' ')).join(', ')} · ${d.areaGrain} work`}
                        </small>
                      </button>
                    );
                  })}
                </div>
              )}
          <p className="note">
            More than one is normal. A surveyor who also takes site photographs is two
            lines on their page, each with its own limit, and stopping one never stops
            the other.
          </p>
        </Card>

        <Card title="Where they work" className="stack">
          {areas.length > 0 && (
            <div className="row tight">
              {areas.map((a) => (
                <span key={`${a.level}:${a.name}`} className="fchip">
                  <span className="grp">{LEVELS.find((l) => l.key === a.level)?.word ?? a.level}</span>
                  <span className="val">{a.name}</span>
                  <button
                    type="button" aria-label={`Remove ${a.name}`}
                    onClick={() => setAreas(
                      (d) => d.filter((x) => !(x.level === a.level && x.name === a.name)),
                    )}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ width: '11rem' }}>
              Level
              <select value={level} onChange={(e) => { setLevel(e.target.value); setDupe(''); }}>
                {LEVELS.map((l) => <option key={l.key} value={l.key}>{l.word}</option>)}
              </select>
            </label>
            {wholeState ? (
              <p className="note" style={{ paddingBottom: '0.5625rem' }}>
                Everywhere — no local presence needed.
              </p>
            ) : (
              <label className="field grow">
                Place
                <input
                  type="text" value={place} placeholder="Peddapuram"
                  onChange={(e) => { setPlace(e.target.value); setDupe(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } }}
                />
              </label>
            )}
            <button type="button" className="btn" disabled={!typed} onClick={addArea}>Add</button>
            {!typed && <Why>Type the place first.</Why>}
          </div>
          {dupe && <p className="note">{dupe}</p>}
          <p className="note">
            The level is not decoration. Somebody who covers <em>Peddapuram mandal</em>{' '}
            must not be sent a plot in a <em>Peddapuram</em> locality of a city, and the
            level is the only thing that tells those two apart.
          </p>
        </Card>

        <Card title="Their papers" className="stack">
          <p className="note">
            Add and review each credential from their member page. They stay on the roster,
            but cannot receive a task until every active discipline has verified evidence.
          </p>
        </Card>

        {err && (
          <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>
            {err}
            {' '}
            {halfDone
              ? <Link className="link" to={`/app/admin/members/${halfDone}`}>Open their page</Link>
              : <Link className="link" to="/app/admin/members">Open the roster</Link>}
          </p>
        )}

        <div className="row">
          <button type="submit" className="btn primary" disabled={!ready || invite.isPending}>
            {invite.isPending ? 'Adding them…' : 'Add them'}
          </button>
          <Link className="btn" to="/app/admin/members">Cancel</Link>
          {!ready && (
            <Why>
              Add their name, contact, full address, one kind of work and one coverage area.
            </Why>
          )}
        </div>
      </form>
    </main>
  );
}
