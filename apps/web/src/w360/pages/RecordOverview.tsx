/** Overview — the property's master record, the index tab of /properties/:id.
 *
 *  docs/specs/2026-10-11-property-overview.md §1–§2 (Reddy, 11/10/2026: "show
 *  what is the document number, type of ownership… from whom"; "master record
 *  has to be very strong"). Every source — a deed upload, the public record
 *  via the assistant, a passbook reading, the owner's own typing — fills one
 *  record; the server keeps each source's claim and picks the value shown.
 *  This tab says the value, who said it, where two sources disagree, and what
 *  the Compliance check finds. It never draws an empty form: a field with no
 *  value is either a check's way in (when a check needs it) or not drawn.
 */
import { useId, useRef, useState } from 'react';
import { Link } from 'react-router';

import {
  useChooseFieldClaim, useRecordOverview, useSetAcquisition, useSetRecordFields,
} from '../api';
import type {
  AcquisitionParty, AcquisitionPartyInput, ComplianceCheck, RecordAcquisition, RecordCompliance, RecordField, RecordFieldSource,
  RecordOverview as Overview, RecordSummary,
} from '../api';
import { Card, Cell, Failed, Icon, InfoTip, KV, Pill, ddmmyyyy, inr, plural } from '../ui';
import { orderHref } from '../orderFlow';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { SkOverview } from '../skeletons';
import {
  MODES, acquisitionInput, acquisitionSourceLine, checkedLine, checksInOrder, claimChoiceNames, clearedTitleKeys, conflictText,
  editableIn, inputKind, isTitleCheck, modeLabel, partiesChanged, partyLabels, shareText, shownIn, sourceTag, sourceTitle,
} from '../recordMaster';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';
import { PaperDrawer } from './RecordPapers';
import { ConvertKindDialog } from '../ConvertKindDialog';

const GROUPS: { key: string; title: string; icon: string }[] = [
  { key: 'identity', title: 'Identity', icon: 'identity' },
  { key: 'physical', title: 'Physical', icon: 'measure' },
  { key: 'status', title: 'Status', icon: 'status' },
];

/** A title field's box in the acquisition drawer, so a gap's Add lands on it. */
const ACQ_BOX: Record<string, string> = {
  acquisition_mode: 'mode', registered: 'registered', doc_no: 'docNo', reg_date: 'regDate', exec_date: 'execDate',
  sro: 'sro', consideration: 'consideration', govt_value: 'govtValue', stamp_duty: 'stampDuty',
};

/** A zero, said short and dimmed — never hidden, never a dash (design.md zero state). */
const n0 = (n: number) => (n > 0 ? n : <span className="none">None</span>);

export function RecordOverview() {
  const rec = useRecordCtx();
  const { data, isLoading, error } = useRecordOverview(rec.id);
  const [editing, setEditing] = useState<'' | 'acquisition' | string>('');
  // The field a gap's Add opened the drawer for, focused first.
  const [focus, setFocus] = useState('');
  const [uploading, setUploading] = useState<'' | 'deed' | 'paper'>('');
  const [converting, setConverting] = useState(false);
  // Answered for THIS record: the route reuses this component across records.
  const [notNowFor, setNotNowFor] = useState('');
  const notNow = notNowFor === rec.id || readNotNow(rec.id);
  const opener = useRef<HTMLButtonElement>(null);

  if (isLoading) return <SkOverview />;
  // One failure for the page, not one per card.
  if (error || !data) return <Failed what="This property's overview" error={error} boxed h="18rem" />;

  const base = `/properties/${rec.id}`;
  const edit = (what: string, field = '') => (e: React.MouseEvent<HTMLButtonElement>) => {
    opener.current = e.currentTarget;
    setFocus(field);
    setEditing(what);
  };
  const upload = (as: 'deed' | 'paper') => (e: React.MouseEvent<HTMLButtonElement>) => {
    opener.current = e.currentTarget;
    setUploading(as);
  };
  // Every group the kind has is drawn, since its Edit is the only way into
  // its drawer (Status has no important field, so no gap's Add reaches it).
  // One with nothing set is a one-line card, never a card of blanks.
  const drawn = GROUPS.filter((g) => editableIn(data.fields, g.key).length > 0);
  // A check's Add opens the drawer its field lives in; Title's own fields
  // (and who held it before) open the Title drawer on that box.
  const addFor = (c: ComplianceCheck) => {
    const f = data.fields.find((x) => x.key === c.fieldKey);
    if (isTitleCheck(c, data.fields)) return edit('acquisition', ACQ_BOX[c.fieldKey] ?? '');
    return f && editableIn(data.fields, f.group).length ? edit(f.group, f.key) : null;
  };

  return (
    <div className="stack lg ov-root">
      <SectionHead
        title="Overview"
        sub={data.conflictCount > 0
          ? `${plural(data.conflictCount, 'field')} where your sources disagree`
          : undefined}
      />

      {/* D1: a plot that reads as farmland is asked about once, quietly;
          "Not now" is this browser's own answer, never the record's. */}
      {data.suggestKind === 'parcel' && !notNow && (
        <Card>
          <p style={{ margin: 0 }}>This reads as farmland — keep it as agricultural land in acres?</p>
          {data.suggestReason && <p className="note" style={{ margin: '0.25rem 0 0' }}>{data.suggestReason}.</p>}
          <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
            <button type="button" className="btn sm" onClick={() => setConverting(true)}>Convert</button>
            <button type="button" className="btn sm"
                    onClick={() => { writeNotNow(rec.id); setNotNowFor(rec.id); }}>Not now</button>
          </div>
        </Card>
      )}

      <SummaryStrip base={base} s={data.summary} />

      {/* The property on the left, the Compliance check as the rail on the
          right — the Documents tab's layout, so the check runs the page's
          height without leaving a gap beside a short Title card. */}
      <div className="split ov-split">
        <div className="stack ov-main">
          <HowYouHold overview={data} base={base} onEdit={edit('acquisition')} onUpload={upload('deed')} />

      {drawn.length > 0 && (
        <div className="ov-groups">
          {/* Boundaries live in their own card, so they never make Physical "full". */}
          {drawn.map((g) => (shownIn(data.fields, g.key).filter((f) => !f.key.startsWith('boundary_')).length === 0 ? (
            <Card key={g.key} className="ov-bare">
              <div className="row tight">
                <p className="note"><strong>{g.title}</strong> · nothing recorded yet</p>
                <button type="button" className="btn sm" onClick={edit(g.key)}
                        aria-label={`Add ${g.title.toLowerCase()}`}>Add</button>
              </div>
            </Card>
          ) : (
            <Card key={g.key} title={g.title} icon={g.icon}
                  aside={<button type="button" className="btn sm" onClick={edit(g.key)}
                                 aria-label={`Edit ${g.title.toLowerCase()}`}>Edit</button>}>
              <GroupFields recordId={rec.id} group={g.key} fields={data.fields} extentDetail={rec.extentDetail} />
            </Card>
          )))}
          {(() => {
            const sides = data.fields.filter((f) => f.group === 'physical' && f.key.startsWith('boundary_'));
            if (!sides.length) return null;
            return sides.some((f) => f.value.trim())
              ? <BoundariesCard recordId={rec.id} sides={sides} onEdit={edit('physical')} />
              : (
                <Card className="ov-bare">
                  <div className="row tight">
                    <p className="note"><strong>Boundaries</strong> · nothing recorded yet</p>
                    <button type="button" className="btn sm" onClick={edit('physical')}
                            aria-label="Add boundaries">Add</button>
                  </div>
                </Card>
              );
          })()}
        </div>
      )}
        </div>
        {data.compliance && (
          <aside className="stack">
            <ComplianceCard
              c={data.compliance} recordId={rec.id} onAdd={addFor}
              onUpload={(c) => upload(isTitleCheck(c, data.fields) ? 'deed' : 'paper')}
            />
          </aside>
        )}
      </div>

      {editing === 'acquisition' && (
        <AcquisitionDrawer recordId={rec.id} recordTitle={rec.title} acq={data.acquisition}
                           watching={rec.stake === 'watch'} focus={focus}
                           onClose={() => setEditing('')} returnFocus={opener} />
      )}
      {editing && editing !== 'acquisition' && (
        <FieldsDrawer recordId={rec.id} recordTitle={rec.title}
                      title={GROUPS.find((g) => g.key === editing)?.title ?? 'Details'}
                      fields={editableIn(data.fields, editing)} focus={focus}
                      onClose={() => setEditing('')} returnFocus={opener} />
      )}
      {converting && <ConvertKindDialog rec={rec} onClose={() => setConverting(false)} />}
      {uploading && (
        <PaperDrawer recordId={rec.id} recordTitle={rec.title} returnFocus={opener} asDeed={uploading === 'deed'}
                     onClose={() => setUploading('')}
                     onEnterDeed={() => { setUploading(''); setFocus(''); setEditing('acquisition'); }} />
      )}
    </div>
  );
}

/** The paper a deed-reading source names, '' for any other source. */
const fileOf = (a: RecordAcquisition) => (a.source?.source === 'deed_reading'
  ? a.source.documentId || a.deedDocumentId : '');

const NOT_NOW = 'w360.farmland-not-now.';
function readNotNow(id: string): boolean {
  try { return localStorage.getItem(NOT_NOW + id) === '1'; } catch { return false; }
}
function writeNotNow(id: string) {
  try { localStorage.setItem(NOT_NOW + id, '1'); } catch { /* the prompt just hides for now */ }
}

/** One compact cell per tab, each a link to it. A long note is cut to one
 *  line; its whole text is the cell's title. */
function SummaryStrip({ base, s }: { base: string; s: RecordSummary }) {
  const located = s.hasPin ? 'Pinned' : s.hasOutline ? 'Outlined' : <span className="none">Not set</span>;
  const line = (t: string) => (t ? <span title={t}>{t}</span> : undefined);
  return (
    <div className="strip overview-strip">
      <Cell k="Documents" icon="paper" v={n0(s.paperCount)} note={line(s.newestPaper)} to={`${base}/documents`} />
      <Cell k="Site features" icon="fence" v={n0(s.featureCount)}
            note={s.featureAttention > 0 ? `${s.featureAttention} need attention` : undefined}
            to={`${base}/site-features`} />
      <Cell k="Owners" icon="person" v={n0(s.ownerCount)} to={`${base}/people`} />
      <Cell k="Location" icon="place" v={located}
            note={s.hasPin && s.hasOutline ? 'Outline drawn' : undefined} to={`${base}/location`} />
      <Cell k="Media" icon="photos" v={n0(s.mediaCount)} to={`${base}/media`} />
      <Cell k="Notes" icon="note" v={n0(s.noteCount)} note={s.newestNoteAt ? ddmmyyyy(s.newestNoteAt) : undefined}
            to={`${base}/notes`} />
      <Cell k="Services" icon="service" v={n0(s.servicesOpen)} note={s.servicesDone ? `${s.servicesDone} done` : undefined}
            to={`${base}/services`} />
      <Cell k="Paid" icon="rupee" v={s.paidTotal > 0 ? inr(s.paidTotal) : <span className="none">None</span>}
            note={s.marketTotal > 0 ? `Worth ${inr(s.marketTotal)}` : undefined} to={`${base}/money`} />
      <Cell k="Activity" icon="activity" v={s.newestActivityAt ? ddmmyyyy(s.newestActivityAt) : <span className="none">None</span>}
            note={line(s.newestActivity)} to={`${base}/activity`} />
    </div>
  );
}

/** Who said a value: a short tag that says the whole source on hover, focus
 *  and tap, and is named by the whole source for a screen reader. */
function SourceMark({ src }: { src: RecordFieldSource }) {
  const full = sourceTitle(src);
  return <InfoTip label={full} tag={sourceTag(src)}>{full}</InfoTip>;
}

/** Label above value, in as many columns as the card has room for; a field
 *  in conflict spans the card with the later claim and its two choices. */
function FieldRows({ recordId, fields, label = (f) => f.label, extentDetail = '', className = 'facts' }: {
  recordId: string; fields: RecordField[]; label?: (f: RecordField) => string; extentDetail?: string;
  className?: string;
}) {
  // The drawers say a refusal inside themselves; these one-tap choices toast.
  // "Keep mine" is the server's keep path (claimId 'keep'): it files the value
  // shown as the owner's own and clears the conflict. Re-saving the same value
  // through setRecordFields was a no-op the server skipped, so the pill stayed.
  const choose = useChooseFieldClaim();
  const busy = choose.isPending;
  return (
    <KV as="dl" className={className} rows={fields.map((f) => ({
      k: label(f),
      highlight: f.conflicts.length > 0,
      v: (
        <>
          <span className="ov-val">
            {f.value.trim() ? <span>{f.display || f.value}</span> : <span className="none">Not set</span>}
            {f.source && <SourceMark src={f.source} />}
          </span>
          {f.key === 'extent' && extentDetail && <span className="note ov-alt">{extentDetail}</span>}
          {f.conflicts.map((c) => {
            const names = claimChoiceNames(f.label, c.source);
            return (
            <span key={c.id} className="row tight ov-conflict">
              <Pill kind="watch">{conflictText(c.source.label, c.display || c.value)}</Pill>
              <button type="button" className="btn sm" disabled={busy} aria-label={names.use}
                      onClick={() => choose.mutate({ recordId, key: f.key, claimId: c.id })}>Use this</button>
              <button type="button" className="btn sm" disabled={busy} aria-label={names.keep}
                      onClick={() => choose.mutate({ recordId, key: f.key, claimId: 'keep' })}>
                Keep mine
              </button>
            </span>
            );
          })}
        </>
      ),
    }))} />
  );
}

/** One group card's body. Physical draws its four boundaries as a small
 *  compass once any is known, so a known side sits where it belongs. */
function GroupFields({ recordId, group, fields, extentDetail }: {
  recordId: string; group: string; fields: RecordField[]; extentDetail: string;
}) {
  const isSide = (f: RecordField) => f.key.startsWith('boundary_');
  const known = shownIn(fields, group);
  // Boundaries have their own card (BoundariesCard), not rows in Physical.
  const rest = known.filter((f) => !isSide(f));
  return (
    <div className="stack">
      {rest.length > 0 && <FieldRows recordId={recordId} fields={rest} extentDetail={extentDetail} />}
    </div>
  );
}

/** Boundaries as their own card (founder, 12/10/2026): the four sides laid
 *  out as a compass — North on top, South below, West and East either side —
 *  each with its letter, so a side reads where it lies on the ground. One
 *  source mark when the known sides share it; a side whose sources disagree
 *  keeps its row with Use this / Keep mine under the compass. */
function BoundariesCard({ recordId, sides, onEdit }: {
  recordId: string; sides: RecordField[];
  onEdit: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const side = (f: RecordField) => f.label.replace(/\s*boundary$/i, '');
  const known = sides.filter((f) => f.value.trim());
  const one = known.length > 0 && known.every((f) => f.source?.label === known[0].source?.label) ? known[0].source : null;
  const disputed = sides.filter((f) => f.conflicts.length > 0);
  const at = (dir: string) => sides.find((f) => side(f).toLowerCase() === dir);
  const cell = (dir: string, letter: string) => {
    const f = at(dir);
    return (
      <div className={`ov-side ov-side-${dir}`}>
        <span className="ov-dir" aria-hidden>{letter}</span>
        <span className="sr-only">{dir[0].toUpperCase() + dir.slice(1)}:</span>
        <span className="ov-sidev">
          {f?.value.trim() ? (f.display || f.value) : <span className="none">Not set</span>}
          {!one && f?.source && <SourceMark src={f.source} />}
        </span>
      </div>
    );
  };
  return (
    <Card title="Boundaries" icon="compass" className="ov-bounds"
          aside={<button type="button" className="btn sm" onClick={onEdit} aria-label="Edit boundaries">Edit</button>}>
      <div className="ov-compass">
        {cell('north', 'N')}
        {cell('west', 'W')}
        <span className="ov-rose" aria-hidden><Icon name="compass" size={28} /></span>
        {cell('east', 'E')}
        {cell('south', 'S')}
      </div>
      {one && <p className="note ov-compass-src">All sides <SourceMark src={one} /></p>}
      {disputed.length > 0 && <FieldRows recordId={recordId} fields={disputed} label={side} />}
    </Card>
  );
}

const MARK: Record<string, { icon: string; word: string }> = {
  pass: { icon: 'ok', word: 'Passed' }, warn: { icon: 'warn', word: 'Needs a look' },
  fail: { icon: 'missing', word: 'Not met' }, unknown: { icon: 'dash', word: 'Cannot tell' },
};

/** "Compliance check" (founder, 12/10/2026: "run the compliance, show tick
 *  marks otherwise"): every check the server ran on this read, what needs
 *  doing first with its one way in, each passed one a tick on one line. */
/** The rail's groups, in the order the Documents tab's Missing documents
 *  uses for papers (founder, 12/10/2026: "like that"). A check whose key is not
 *  listed (a new policy item) falls into the last group. */
const CHECK_GROUPS: { title: string; keys: (k: string) => boolean }[] = [
  { title: 'Title deeds', keys: (k) => k === 'deed' || k === 'chain' },
  { title: 'Revenue records', keys: (k) => ['khata', 'mutation', 'survey', 'extent_match', 'lp', 'policy.adangal'].includes(k) },
  { title: 'EC & tax receipts', keys: (k) => k === 'ec' || k === 'tax' },
  { title: 'Map & boundaries', keys: (k) => ['boundaries', 'policy.fmb', 'policy.survey'].includes(k) },
  { title: 'Status', keys: () => true },
];

/** Compliance check as a rail card beside the property, grouped the way
 *  Missing documents is on the Documents tab: a group heading, one line that
 *  says where the group stands, then each check with its mark and way in. */
function ComplianceCard({ c, recordId, onAdd, onUpload }: {
  c: RecordCompliance; recordId: string;
  onAdd: (c: ComplianceCheck) => ((e: React.MouseEvent<HTMLButtonElement>) => void) | null;
  onUpload: (c: ComplianceCheck) => (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const tally = `${c.passed} of ${c.total} checks passed`;
  const tone = c.passed === c.total ? 'good' : c.checks.some((x) => x.status === 'fail') ? 'bad' : 'warn';
  const when = checkedLine(c.checkedAt);
  const taken = new Set<string>();
  const groups = CHECK_GROUPS.map((g) => {
    const items = checksInOrder(c.checks.filter((x) => !taken.has(x.key) && g.keys(x.key)));
    items.forEach((x) => taken.add(x.key));
    return { ...g, items };
  }).filter((g) => g.items.length > 0);
  return (
    <Card title="Compliance check" className="railcard ov-complete">
      <div className="ov-meter">
        <span className="row tight ov-tally"><strong>{tally}</strong>{when && <span className="note">{when}</span>}</span>
        <span className="track" role="progressbar" aria-label="Checks passed"
              aria-valuemin={0} aria-valuemax={c.total} aria-valuenow={c.passed} aria-valuetext={tally}>
          <span className={`fill ${tone}`} style={{ width: `${c.total ? Math.round((c.passed / c.total) * 100) : 0}%` }} />
        </span>
      </div>
      <div className="missing-services">
        {groups.map((g) => {
          const met = g.items.filter((x) => x.status === 'pass').length;
          return (
            <section key={g.title} className="missing-group" aria-label={g.title}>
              <strong>{g.title}</strong>
              <span className="note">
                {met === g.items.length ? 'All met' : `${met} of ${g.items.length} met`}
              </span>
              <ul className="ov-gaps ov-checks">
                {g.items.map((x) => {
                  const m = MARK[x.status] ?? MARK.unknown;
                  const add = x.action === 'add' ? onAdd(x) : null;
                  return (
                    <li key={x.key} className={`ov-check ${x.status in MARK ? x.status : 'unknown'}`}>
                      <Icon name={m.icon} className="ov-mark" />
                      <span className="ov-gap">
                        <span>{x.label}</span>
                        <span className="sr-only">{m.word}.</span>
                        {x.detail && <span className="note" title={x.detail}>{x.detail}</span>}
                      </span>
                      {x.status !== 'pass' && (
                        <span className="row tight">
                          {add && <button type="button" className="btn sm" onClick={add} aria-label={`Add: ${x.label}`}>Add</button>}
                          {x.action === 'upload' && (
                            <button type="button" className="btn sm" onClick={onUpload(x)}
                                    aria-label={`Upload: ${x.label}`}>Upload</button>
                          )}
                          {x.action === 'order' && x.serviceKind && (
                            <Link className="btn sm" to={orderHref(recordId, { service: x.serviceKind })}
                                  aria-label={`Order: ${x.label}`}>Order</Link>
                          )}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Card>
  );
}

/** Names a side of the Title card shows before "+N more". */
const MAX_PARTIES = 2;

/** "Title": the acquiring event, the first thing an owner asks. */
function HowYouHold({ overview, base, onEdit, onUpload }: {
  overview: Overview; base: string;
  onEdit: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onUpload: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const a = overview.acquisition;
  const [allParties, setAllParties] = useState(false);
  // The mode and "Registered" are the pills; a row would say them twice,
  // unless a later source disagrees and the owner has to choose.
  const known = shownIn(overview.fields, 'title');
  const title = known
    .filter((f) => !['acquisition_mode', 'registered'].includes(f.key) || f.conflicts.length > 0);
  // Nothing known: one line and two ways to answer it, never an empty form.
  if (!a?.mode && !known.length) {
    return (
      <Card title="Title" icon="title" className="ov-hold bare">
        <p className="note" style={{ margin: 0 }}>How did you get this land? Add the deed, or tell us.</p>
        <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
          <button type="button" className="btn primary sm" onClick={onUpload}>Upload the deed</button>
          <button type="button" className="btn sm" onClick={onEdit}>Enter it</button>
        </div>
      </Card>
    );
  }
  const mode = a ? (a.modeLabel || modeLabel(a.mode))
    : modeLabel(known.find((f) => f.key === 'acquisition_mode')?.value ?? '');
  const inherited = a?.mode === 'inheritance';
  return (
    <Card title="Title" icon="title" className="ov-hold"
          aside={<button type="button" className="btn sm" onClick={onEdit}
                         aria-label="Edit title">Edit</button>}>
      <div className="ov-hero">
        <div className="row tight" style={{ flexWrap: 'wrap' }}>
          {mode ? <Pill kind="owned">{mode}</Pill> : <Pill kind="watch">How acquired: not set</Pill>}
          {a?.registered === 'yes' && <Pill kind="managed">Registered</Pill>}
          {a?.registered === 'no' && <Pill kind="archived">Not registered</Pill>}
        </div>
      </div>
      {a && (a.fromParties.length > 0 || a.toParties.length > 0) && (() => {
        // Who holds it now comes first (founder, 12/10/2026); at most two
        // names a side on the card, the rest one tap away in a drawer.
        const [fromLabel, toLabel] = partyLabels(a.mode, a.fromParties.length, a.toParties.length,
                                                 a.fromParties[0]?.role ?? '');
        const who = (p: { name: string; parentage: string }) => [p.name.trim(), p.parentage.trim()].filter(Boolean).join(' ');
        const toLine = (p: AcquisitionParty) => [who(p), shareText(p)].filter(Boolean).join(' · ');
        const fromLine = (p: AcquisitionParty) => `${who(p)}${inherited && p.relationship ? ` (${p.relationship})` : ''}`;
        const shown = <T,>(list: T[], line: (p: T) => string) => (
          <>
            {list.slice(0, MAX_PARTIES).map((p, i) => <span key={i} className="ov-partyv">{line(p)}</span>)}
            {list.length > MAX_PARTIES && (
              <button type="button" className="link ov-partyv" onClick={() => setAllParties(true)}>
                +{list.length - MAX_PARTIES} more
              </button>
            )}
          </>
        );
        const rows: { k: string; v: React.ReactNode }[] = [];
        if (a.toParties.length) rows.push({ k: toLabel, v: shown(a.toParties, toLine) });
        if (a.fromParties.length) rows.push({ k: fromLabel, v: shown(a.fromParties, fromLine) });
        if (inherited && a.proofNo) rows.push({ k: 'Legal-heir certificate', v: a.proofNo });
        return (
          <>
            <KV as="dl" className="facts ov-parties" rows={rows} />
            {allParties && (
              <Drawer title="Parties" sub={`${toLabel} and ${fromLabel.toLowerCase()} on this deed.`}
                      onClose={() => setAllParties(false)}>
                <h3 className="eyebrow">{toLabel} ({a.toParties.length})</h3>
                <ol className="ov-partylist">{a.toParties.map((p, i) => <li key={i}>{toLine(p)}</li>)}</ol>
                <h3 className="eyebrow">{fromLabel} ({a.fromParties.length})</h3>
                <ol className="ov-partylist">{a.fromParties.map((p, i) => <li key={i}>{fromLine(p)}</li>)}</ol>
              </Drawer>
            )}
          </>
        );
      })()}
      {title.length > 0 && <FieldRows recordId={overview.id} fields={title} />}
      <div className="row tight ov-foot">
        {/* The source line IS the link to the file it came from, when there
            is one (D2); "Open the deed" stands alone only beside another source. */}
        {a?.source && (fileOf(a)
          ? <Link className="link note" to={`/papers/${fileOf(a)}`}>{acquisitionSourceLine(a)}</Link>
          : <span className="note">{acquisitionSourceLine(a)}</span>)}
        {a?.deedDocumentId && !fileOf(a)
          && <Link className="link" to={`/papers/${a.deedDocumentId}`}>Open the deed</Link>}
        {a && a.chainLength > 1 && (
          <Link className="link" to={`${base}/people`}>Earlier owners ({a.chainLength - 1})</Link>
        )}
      </div>
    </Card>
  );
}

/** Edit one group's fields; every save is the owner's own (`manual`) claim. */
function FieldsDrawer({ recordId, recordTitle, title, fields, focus = '', onClose, returnFocus }: {
  recordId: string; recordTitle: string; title: string; fields: RecordField[];
  /** The field key a gap's Add opened this for, focused first. */
  focus?: string;
  onClose: () => void; returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const save = useSetRecordFields();
  const idBase = useId();
  const [vals, setVals] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map((f) => [f.key, f.value])),
  );
  const [err, setErr] = useState('');
  const changed = fields.filter((f) => (vals[f.key] ?? '').trim() !== f.value.trim());

  async function submit() {
    if (!changed.length) { onClose(); return; }
    setErr('');
    try {
      await save.mutateAsync({ recordId, fields: changed.map((f) => ({ key: f.key, value: vals[f.key].trim() })) });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Those details were not saved. Try again.');
    }
  }

  return (
    <Drawer
      eyebrow={drawerEyebrow(recordTitle, 'Overview')}
      title={`Edit ${title.toLowerCase()}`}
      sub="What you enter here is kept as yours and wins over any document."
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={save.isPending}
      dirty={changed.length > 0}
      returnFocus={returnFocus}
      initialFocus={focus && fields.some((f) => f.key === focus) ? `#${CSS.escape(`${idBase}-${focus}`)}` : undefined}
      primary={<DrawerAction label="Save" working="Saving…" pending={save.isPending} paused={save.isPaused} />}
    >
      {fields.map((f) => (
        <div className="field" key={f.key}>
          <label htmlFor={`${idBase}-${f.key}`}>{f.label}</label>
          <input id={`${idBase}-${f.key}`} type={inputKind(f.key)} value={vals[f.key] ?? ''}
                 maxLength={f.key.startsWith('boundary_') ? 500 : 200}
                 onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
          {f.howToFill && !f.value && <span className="note">{f.howToFill}</span>}
        </div>
      ))}
      {err && <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>}
    </Drawer>
  );
}

/** How the land was acquired, as the owner tells it (setAcquisition). */
function AcquisitionDrawer({ recordId, recordTitle, acq, watching, focus = '', onClose, returnFocus }: {
  recordId: string; recordTitle: string; acq: RecordAcquisition | null; watching: boolean;
  /** The drawer box (`ACQ_BOX`) a gap's Add opened this for; the mode otherwise. */
  focus?: string;
  onClose: () => void; returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const save = useSetAcquisition();
  const clear = useSetRecordFields();
  const id = useId();
  const whyId = useId();
  const start = {
    mode: acq?.mode === 'purchase' ? 'sale' : acq?.mode ?? '',
    registered: acq?.registered ?? '',
    docNo: acq?.docNo ?? '', regDate: acq?.regDate ?? '', execDate: acq?.execDate ?? '', sro: acq?.sro ?? '',
    consideration: acq?.consideration ? String(acq.consideration) : '',
    govtValue: acq?.govtValue ? String(acq.govtValue) : '',
    stampDuty: acq?.stampDuty ? String(acq.stampDuty) : '',
    proofNo: acq?.proofNo ?? '',
  };
  const [v, setV] = useState(start);
  const [startFrom] = useState<AcquisitionPartyInput[]>(
    () => (acq?.fromParties.length
      ? acq.fromParties.map((p) => ({ name: p.name, parentage: p.parentage, relationship: p.relationship, role: p.role }))
      : [{ name: '', parentage: '', relationship: '', role: '' }]),
  );
  const [from, setFrom] = useState<AcquisitionPartyInput[]>(startFrom);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof start) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV({ ...v, [k]: e.target.value });
  const dirty = JSON.stringify(v) !== JSON.stringify(start) || partiesChanged(startFrom, from);
  const inherited = v.mode === 'inheritance';
  const why = v.mode ? '' : 'Choose how you got this land to save it.';

  async function submit() {
    if (!v.mode || save.isPending || clear.isPending) return;
    setErr('');
    try {
      await save.mutateAsync({ recordId, input: acquisitionInput(v, watching ? [] : from) });
      // A blank box is "not stated" to setAcquisition, so an emptied one is cleared here.
      const cleared = clearedTitleKeys(start, v);
      if (cleared.length) await clear.mutateAsync({ recordId, fields: cleared.map((key) => ({ key, value: '' })) });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That was not saved. Try again.');
    }
  }

  const text = (k: keyof typeof start, label: string, type = 'text') => (
    <div className="field">
      <label htmlFor={`${id}-${k}`}>{label}</label>
      <input id={`${id}-${k}`} type={type} value={v[k]} onChange={set(k)}
             {...(type === 'number' ? { min: 0, inputMode: 'numeric' as const } : { maxLength: 200 })} />
    </div>
  );

  return (
    <Drawer
      eyebrow={drawerEyebrow(recordTitle, 'Overview')}
      title="Title"
      sub="What you enter here is kept as yours and wins over any document."
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={save.isPending || clear.isPending}
      dirty={dirty}
      returnFocus={returnFocus}
      initialFocus={`#${CSS.escape(`${id}-${focus || 'mode'}`)}`}
      primaryWhy={why ? { id: whyId, text: why } : undefined}
      primary={<DrawerAction label="Save" working="Saving…" pending={save.isPending || clear.isPending} paused={save.isPaused}
                             disabled={!v.mode} describedBy={why ? whyId : undefined} />}
    >
      <div className="field">
        <label htmlFor={`${id}-mode`}>How you got it</label>
        <select id={`${id}-mode`} value={v.mode} onChange={set('mode')}>
          <option value="">Choose…</option>
          {MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-registered`}>Registered</label>
        <select id={`${id}-registered`} value={v.registered} onChange={set('registered')}>
          <option value="">Not sure</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </div>
      {v.registered !== 'no' && (
        <>
          {text('docNo', 'Document number (no/year)')}
          {text('regDate', 'Registered on', 'date')}
          {text('sro', 'Registration office')}
        </>
      )}
      {text('execDate', 'Executed on', 'date')}
      {inherited && text('proofNo', 'Legal-heir or succession certificate number')}

      {watching ? (
        <p className="note" style={{ margin: 0 }}>
          You are watching this land, so the names of the people on its deeds are not kept in your account.
        </p>
      ) : (
        <fieldset className="stack sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="eyebrow">{inherited ? 'Inherited from' : 'From whom'}</legend>
          {from.map((p, i) => (
            <div key={i} className="row tight" style={{ flexWrap: 'wrap' }}>
              <input aria-label={`Name ${i + 1}`} placeholder="Name" value={p.name} maxLength={200}
                     onChange={(e) => setFrom(from.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input aria-label={`Parentage ${i + 1}`} placeholder="S/o, D/o, W/o" value={p.parentage ?? ''} maxLength={200}
                     onChange={(e) => setFrom(from.map((x, j) => (j === i ? { ...x, parentage: e.target.value } : x)))} />
              {inherited && (
                <input aria-label={`Relationship ${i + 1}`} placeholder="Father, late husband…"
                       value={p.relationship ?? ''} maxLength={200}
                       onChange={(e) => setFrom(from.map((x, j) => (j === i ? { ...x, relationship: e.target.value } : x)))} />
              )}
            </div>
          ))}
          {from.length < 20 && (
            <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }}
                    onClick={() => setFrom([...from, { name: '', parentage: '', relationship: '', role: '' }])}>
              Add another person
            </button>
          )}
        </fieldset>
      )}

      {text('consideration', 'Consideration (₹)', 'number')}
      {text('govtValue', 'Government value (₹)', 'number')}
      {text('stampDuty', 'Stamp duty (₹)', 'number')}

      {err && <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>}
    </Drawer>
  );
}
