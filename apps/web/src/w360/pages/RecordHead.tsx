/** The chrome every hanger of the record 360 shares.
 *
 *  This used to live inside the Papers tab, which meant only Papers had it:
 *  open Features and the page's <h1> became "On this land", the extent and the
 *  place vanished, and the record you were looking at was named nowhere on
 *  screen except the breadcrumb. Eight tabs, eight different answers to "which
 *  parcel am I on".
 *
 *  So the identity block is chrome now, drawn once by the shell (Record.tsx)
 *  for every tab: the record is the <h1> on all nine, and each tab writes a
 *  section heading underneath instead (`SectionHead`). The share panel, the
 *  edit drawer and the archive/delete confirmations came with it, because they
 *  hang off the header's own buttons and menu.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import type { ReactNode } from 'react';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';

import {
  EMPTY_FILTER, useArchiveRecords, useCreateShareLink, useDeleteRecords, useNotes, usePapers,
  useProperties,
} from '../api';
import type { RecordDetail } from '../api';
import { Crumbs, HOLDING_WORD, Icon, InfoTip, Menu, Pill, num, statusWord } from '../ui';
import { Dialog } from '../Dialog';
import ShareResult from '../components/ShareResult';
import { RecordDrawer } from './PropertyActions';
import { SecureShareGuidance } from '../GovernanceGuidance';

/** The nine hangers, in the order the strip draws them.
 *
 *  Location and Media were reachable only from a card in the Papers rail and a
 *  row in the kebab, so the two things a record most often lacks — a pin and a
 *  photograph — were the two hardest to get to. Notes was not a screen at all.
 *
 *  `count` is what the strip prints beside the label. It returns a number
 *  wherever the record carries one; `null` means "this hanger has no count",
 *  which is not the same as zero and must not be drawn as one. Money and Audit
 *  are the two: their totals are computed by their own resolvers and are not on
 *  RecordDetail, and a wrong number in permanent chrome is worse than none.
 */
export const TABS: {
  to: string; label: string; end?: boolean; count: (r: RecordDetail) => number | null;
  /** Screens under this hanger that are drawn inside its frame, with this tab
   *  still the one you are on — Money's expense ledger. It used to own the
   *  page, so one click from Money the property's nine tabs vanished. `path`
   *  is its URL segment and `label` its breadcrumb. (Not `to`: `to:` is how a
   *  tab of the strip is spelled here, and scripts/ux-guards.ts counts them.) */
  also?: { path: string; label: string }[];
  /** False for a hanger that draws its own chrome instead of sitting inside the
   *  shared frame. Nothing sets it today, and the gallery — which did — is why
   *  the flag is kept rather than deleted: it was full-bleed with its own back
   *  button, and the effect was that opening Media dropped you out of the record
   *  with no tab strip to get back. A hanger that leaves the frame is a hanger
   *  that stops being one. */
  frame?: boolean;
}[] = [
  { to: '', label: 'Documents', end: true, count: (r) => r.paperCount },
  { to: 'features', label: 'Site features', count: (r) => r.featureCount },
  { to: 'people', label: 'People', count: (r) => r.peopleCount },
  // What the record knows about where it is: a pin someone stood on, and a
  // boundary somebody drew. Both, one, or — as here, usually — neither.
  {
    to: 'map',
    label: 'Location',
    count: (r) => (r.lat || r.lon ? 1 : 0) + (r.ring.length >= 6 ? 1 : 0),
  },
  { to: 'photos', label: 'Media', count: (r) => r.photoCount },
  // Overridden in RecordTabs by the real list once it lands: RecordDetail
  // carries only the newest note, so this alone could never say more than 1.
  { to: 'notes', label: 'Notes', count: (r) => (r.noteBody ? 1 : 0) },
  { to: 'services', label: 'Services', count: (r) => r.serviceCount },
  { to: 'money', label: 'Money', count: () => null, also: [{ path: 'expenses', label: 'Expenses' }] },
  { to: 'history', label: 'Activity', count: () => null },
];

/** The part of a record URL after the record's id: '' for Documents,
 *  'money', 'expenses', 'order'… */
export function tabTail(pathname: string): string {
  return pathname.replace(/\/+$/, '').split('/app/records/')[1]?.split('/')[1] ?? '';
}

/** Which hanger a URL is on, so the shell can name it in the breadcrumb and
 *  know whether to draw the frame around it at all.
 *
 *  Undefined means "this screen owns the page": the flows that also live under
 *  `records/:id` — ordering a service and requesting work. The expense ledger
 *  is not one of them any more: it is Money's (`also`), drawn in the frame. */
export function tabFor(pathname: string) {
  const tail = tabTail(pathname);
  return TABS.find((t) => (t.to === tail || !!t.also?.some((a) => a.path === tail))
    && t.frame !== false);
}

export function RecordTabs({ rec }: { rec: RecordDetail }) {
  // The only count not on RecordDetail. It is a small owner-scoped read and the
  // Notes hanger shares the cache, so the strip is not paying for it twice.
  const { data: notes } = useNotes(rec.id);
  const strip = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  // On a phone the strip scrolls sideways and nine tabs do not fit; the tab
  // you are on is brought into view, so arriving on Activity does not leave
  // the only marker of where you are scrolled off the right edge.
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);
  // Which tab is current comes from the same `tabFor` the frame uses, rather
  // than from each link's own path match, so a screen a hanger owns (Money's
  // ledger at /expenses) marks that hanger's tab as the one you are on.
  const current = tabFor(pathname);
  return (
    <nav ref={strip} className="tabs" aria-label="This property">
      {TABS.map((t) => {
        const n = t.to === 'notes' && notes ? notes.length : t.count(rec);
        return (
          <Link key={t.label} aria-current={current === t ? 'page' : undefined}
                to={t.to ? `/app/records/${rec.id}/${t.to}` : `/app/records/${rec.id}`}>
            {t.label}
            {/* Zero is printed, dimmed. The strip used to hide a count of
                nought, so an empty hanger and a hanger whose count had not
                loaded looked identical — and "Media" with nothing beside it
                reads as a tab holding something. Saying 0 out loud is how the
                strip becomes the record's inventory. */}
            {n !== null && <span className={n > 0 ? 'n' : 'n zero'}>{n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The breadcrumb every hanger shares: Properties › the record › this hanger —
 * and, when the record is part of a combined holding, that holding in between.
 *
 * Opening a member from a holding used to be a door that shut behind you: the
 * trail read "Properties › Sy 13/4" no matter where you arrived from, and the
 * record carried no link to its holding anywhere on the page, on any tab. The
 * way back was the browser's own button and nothing else.
 *
 * Read from `rec` rather than from a `?from=` parameter or router state on
 * purpose. The holding is a real containment — the API enforces that a record
 * belongs to at most one — so the trail is the record's own hierarchy, not a
 * history of how this visit happened to start. That means it survives a reload,
 * a shared link and a bookmark, and it holds on all nine tabs without every
 * in-record link having to forward a parameter, which is where the cheap version
 * of this goes half-right.
 */
export function RecordCrumbs({ rec, here, hereTo, leaf }: {
  rec: RecordDetail; here?: string;
  /** The hanger's own address, when a screen below it is showing (`leaf`). */
  hereTo?: string;
  /** A screen a hanger owns — "Expenses" under Money. */
  leaf?: string;
}) {
  return (
    <Crumbs
      trail={[
        ...(rec.combinedId
          ? [
            { label: HOLDING_WORD.many, to: '/app/holdings' },
            { label: rec.combinedName || HOLDING_WORD.one, to: `/app/holdings/${rec.combinedId}` },
          ]
          : [{ label: 'Properties', to: '/app/properties' }]),
        { label: rec.title, to: here ? `/app/records/${rec.id}` : undefined },
        ...(here ? [{ label: here, to: leaf ? hereTo : undefined }] : []),
        ...(here && leaf ? [{ label: leaf }] : []),
      ]}
    />
  );
}

/**
 * A tab's own heading: the question this hanger answers, what it holds, and
 * the actions that belong to it.
 *
 * The record is the page's <h1> (see the note at the top of this file), so
 * these are <h2>s — which is also what they always were semantically. Each
 * tab used to print its own `.pagehead` with an <h1> in it and no two of them
 * agreed on where the actions went.
 */
export function SectionHead({ title, sub, info, actions }: {
  title: ReactNode;
  /** The one line under the heading: "5 documents · showing 2", "6 open ·
   *  5 assigned". Counts, not marketing — and a fact another part of the tab
   *  already states (a rail card, a filter's own counts) is not repeated. */
  sub?: ReactNode;
  /** Standing guidance about this hanger — what it keeps, a payment term —
   *  behind an ⓘ beside the heading, the way PageHead's `info` does for a page,
   *  instead of a permanent sentence under it. */
  info?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="sechead">
      <div className="grow">
        {info ? (
          <div className="pagehead-title">
            <h2>{title}</h2>
            <InfoTip label={typeof title === 'string' ? title : 'this section'}>{info}</InfoTip>
          </div>
        ) : <h2>{title}</h2>}
        {sub && <p className="note" style={{ margin: '0.25rem 0 0' }}>{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function RecordHead({ rec, here, hereTo, leaf }: {
  rec: RecordDetail; here?: string; hereTo?: string; leaf?: string;
}) {
  const shared = useCreateShareLink(false);
  const archive = useArchiveRecords(false);
  const delRecords = useDeleteRecords(false);
  const nav = useNavigate();
  const shareWhyId = useId();
  const [panel, setPanel] = useState<'' | 'share'>('');
  const papers = usePapers(panel === 'share' ? rec.id : undefined);
  const [audience, setAudience] = useState('');
  const [shareDocs, setShareDocs] = useState<string[]>([]);
  const [shareErr, setShareErr] = useState('');
  const [sharePath, setSharePath] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [delErr, setDelErr] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiveErr, setArchiveErr] = useState('');
  const [editing, setEditing] = useState(false);
  const shareTrigger = useRef<HTMLButtonElement>(null);
  const [params, setParams] = useSearchParams();

  // The same portfolio query the Properties list runs, so switching records is
  // free by the time anyone asks: you arrive here THROUGH that list, and React
  // Query already holds its answer.
  const { data: portfolio } = useProperties(EMPTY_FILTER);

  /** `?share=1` opens the share panel on arrival.
   *
   *  The Properties list offers "Share…" on every record's kebab, and without
   *  this it could only drop the reader on this page and leave them to find
   *  the button — which is the "…" in the label quietly not being honoured.
   *
   *  The parameter is consumed immediately: left in the URL it would reopen
   *  the panel on every reload, and would ride along into any link the reader
   *  copied out of the address bar. */
  useEffect(() => {
    if (params.get('share') !== '1') return;
    setShareErr('');
    setPanel('share');
    const next = new URLSearchParams(params);
    next.delete('share');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const closeShare = () => {
    setSharePath('');
    setShareErr('');
    setShareDocs([]);
    setPanel('');
    requestAnimationFrame(() => shareTrigger.current?.focus());
  };

  // Every other record you hold, so the title is a way across the portfolio
  // rather than a dead end that has to be walked back through Properties.
  const siblings = (portfolio?.cards ?? []).filter((c) => c.id !== rec.id);

  /** Why "Share" is not pressable yet, said beside it. A disabled button that
   *  explains nothing reads as broken. Only once the documents have loaded and
   *  there are some to choose: the picker says so itself when there are none. */
  const shareWhy = !papers.data?.length || shared.isPending ? ''
    : !shareDocs.length && !audience.trim() ? 'Choose at least one document and say who it is for.'
      : !shareDocs.length ? 'Choose at least one document.'
        : !audience.trim() ? 'Say who the link is for.' : '';

  return (
    <>
      <RecordCrumbs rec={rec} here={here} hereTo={hereTo} leaf={leaf} />

      <header className="pagehead">
        {/* Redesigned identity block. The name is the line the eye lands on, so
            it leads — with a kind glyph before it, the record-switcher chevron
            after it, and the extent as a bordered pill at the end of the same
            line. The classifying eyebrow ("LAND PARCEL · KHATA 2 · AGRI") moved
            BELOW the name: it is what-kind-of-thing, a caption to the title
            rather than a label above it, which is what let the extent stop
            competing with the survey number for the top line. The place sits
            last. `.rechead` carries the new three-row layout; see w360.css. */}
        <div className="grow rechead">
          <div className="rechead-name">
            <Icon name={rec.kind === 'parcel' ? 'parcel' : (rec.classification || rec.kind)}
                  size={26} className="rechead-glyph" />
            <h1>{rec.title}</h1>
            {siblings.length > 0 && (
              <Menu
                label="Go to another property"
                header="Your other properties"
                triggerClassName="iconbtn"
                trigger={<ExpandMoreOutlined sx={{ fontSize: 20 }} aria-hidden />}
                items={[
                  ...siblings.slice(0, 8).map((c) => ({
                    label: c.title,
                    onClick: () => nav(`/app/records/${c.id}`),
                  })),
                  {
                    label: 'See all properties',
                    rule: true,
                    onClick: () => nav('/app/properties'),
                  },
                ]}
              />
            )}
            {/* The extent is a fact about the parcel, not part of its name, so
                it is a bordered pill set apart from the title rather than a
                chip crowding it. The long form — "3 Acres 9.6 Guntas · 324
                Cents · 15,682 Sq.yd" — rides along as the pill's title and its
                accessible name, so the reading in the units a village actually
                argues in is not lost. */}
            {rec.extent > 0 && (
              <span className="chip static num rechead-extent" title={rec.extentDetail || undefined}
                    aria-label={rec.extentDetail
                      ? `Extent ${rec.extentDetail}`
                      : `Extent ${rec.extent} ${rec.extentUnit}`}>
                {rec.extentUnit === 'ac' ? num(rec.extent, 2) : num(rec.extent)}
                <small style={{ opacity: 0.7 }}> {rec.extentUnit}</small>
              </span>
            )}
            {rec.status !== 'owned' && statusWord(rec.status)
              && <Pill kind={rec.status}>{statusWord(rec.status)}</Pill>}
            {rec.stake !== 'owned' && statusWord(rec.stake)
              && <Pill kind={rec.stake}>{statusWord(rec.stake)}</Pill>}
          </div>
          <p className="eyebrow rechead-kind">{rec.eyebrow}</p>
          {/* One line on a phone (w360.css clamps it at 640px); the whole
              place stays in the title and in the text a screen reader hears. */}
          <p className="lede rechead-place"
             title={`${rec.placeLine} — ${rec.state}${rec.placeLineTe ? ` · ${rec.placeLineTe}` : ''}`}>
            {rec.placeLine} — {rec.state}
            {rec.placeLineTe && <> · <span className="accent">{rec.placeLineTe}</span></>}
          </p>
        </div>
        <div className="actions">
          <Link className="btn" to={`/app/records/${rec.id}/order`}>
            <HandshakeOutlined sx={{ fontSize: 16 }} /> Order a service
          </Link>
          {/* Outlined, not filled. This header sits on all nine tabs, and each
              tab's own add action is the one filled button its viewport gets
              (design.md § App-surface rules, "fill means act"). */}
          <button ref={shareTrigger} type="button" className="btn" aria-expanded={panel === 'share'}
                  onClick={() => {
                    if (panel === 'share') closeShare();
                    else { setShareErr(''); setPanel('share'); }
                  }}>
            <IosShareOutlined sx={{ fontSize: 16 }} /> Share securely
          </button>
          <Menu label={`Actions for ${rec.title}`} items={[
            // Anything on a record can be corrected — the trail is what makes
            // that safe, not a locked field.
            { label: 'Edit details', onClick: () => setEditing(true) },
            // "See what changed" and "Open location & boundary" left: both are
            // tabs in the strip under this header, one click away on every tab.
            // The survey is the catalogue order the Location tab's "Order a
            // survey" places — the free-text /request form it used to open was
            // retired (RecordBoundary.tsx, the note on that button).
            { label: 'Ask a surveyor', onClick: () => nav(`/app/records/${rec.id}/order?service=survey&step=pick`) },
            // Archiving pulls the record out of every list, total and map, and
            // it used to happen on one stray menu click with nothing on screen
            // saying it had — this page cannot show it, because `record` reads
            // archived rows too. So it asks first, in the same dialog the
            // delete path uses, and lands you where the change is visible. The
            // rule above it sets the two that take the property away apart
            // from the ones that work on it.
            { label: 'Archive this property', rule: true, onClick: () => setConfirmArchive(true) },
            { label: 'Delete this property', danger: true, onClick: () => setConfirmDel(true) },
          ]} />
        </div>
      </header>

      {/* Opens under the button that asked for it. A record's header is not the
          place for a modal — the thing you are sharing has to stay on screen
          while you share it. */}
      {panel === 'share' && (
        <form
          className="card" style={{ marginBottom: 'var(--space-md)' }}
          onSubmit={async (e) => {
            e.preventDefault();
            // The pending guard is what stops a fast second press minting a
            // second link now that a refusal leaves the panel open.
            if (!audience.trim() || shareDocs.length === 0 || shared.isPending) return;
            setShareErr('');
            const who = audience.trim();
            try {
              // The server answers with the new link's id, or an empty string
              // when it refuses — this used to be thrown away, so the panel
              // closed and the field cleared whether or not a link existed.
              const id = (await shared.mutateAsync({
                recordId: rec.id, audience: who, terms: 'view', days: 30,
                documentIds: shareDocs,
              })).web.createShareLink;
              if (!id) {
                setShareErr(`No link was made for ${who}. This record may no longer be yours to share.`);
                return;
              }
              // No toast: the panel does not close, it turns into the link
              // itself (ShareResult), and that says "Link ready" as a status a
              // screen reader hears. Success is silent where the screen already
              // shows the result (design.md § Microinteractions stance).
              setAudience('');
              setSharePath(id);
            } catch {
              // The mutation has already raised the machine's own reason. This
              // keeps the panel and the typed name where they are, so trying
              // again is one press rather than a re-type.
              setShareErr('The link was not made. Nothing has been shared.');
            }
          }}
        >
          {sharePath ? <><ShareResult path={sharePath} /><button type="button" className="btn" onClick={closeShare}>Done</button></> : <>
          <p className="note" style={{ marginBottom: 'var(--space-sm)' }}>
            Valid for 30 days · Anyone with the link can download the selected documents.
          </p>
          <SecureShareGuidance district={rec.district || '*'} />
          <fieldset className="share-paper-picker">
            <legend>Choose documents for this purpose</legend>
            {papers.isLoading && <p className="note">Checking this property's documents…</p>}
            {papers.isError && <p className="note" role="alert">The documents could not be checked. Nothing can be shared yet.</p>}
            {papers.data?.map((paper) => (
              <label key={paper.id}>
                <input type="checkbox" checked={shareDocs.includes(paper.id)}
                       onChange={() => setShareDocs((current) => current.includes(paper.id)
                         ? current.filter((id) => id !== paper.id) : [...current, paper.id])} />
                <span><strong>{paper.title}</strong><small>{paper.detail || paper.shelf}</small></span>
              </label>
            ))}
            {papers.data?.length === 0 && <p className="note">There are no documents on this property to share.</p>}
          </fieldset>
          <div className="row tight">
            <span className="search" style={{ flex: '1 1 14rem', minWidth: 0 }}>
              <input value={audience} autoFocus aria-label="Who is it for"
                     placeholder="A name or a firm"
                     onChange={(e) => setAudience(e.target.value)} />
            </span>
            <button type="submit" className="btn sm primary"
                    aria-describedby={shareWhy ? shareWhyId : undefined}
                    disabled={!audience.trim() || shareDocs.length === 0 || shared.isPending}>
              {shared.isPending ? 'Making the link…' : 'Share'}
            </button>
            <button type="button" className="btn sm"
                    onClick={closeShare}>Cancel</button>
          </div>
          {shareWhy && (
            <p id={shareWhyId} className="note" style={{ margin: 'var(--space-xs) 0 0' }}>{shareWhy}</p>
          )}
          </>}
          {shareErr && (
            <p className="note" role="alert"
               style={{ color: 'var(--w-danger)', marginTop: 'var(--space-sm)' }}>
              {shareErr}
            </p>
          )}
        </form>
      )}

      {editing && (
        <RecordDrawer
          card={{
            id: rec.id, kind: rec.kind, title: rec.title, subtitle: '',
            // The 360 header does not carry either — the drawer edits the
            // record's own fields and neither of these is one of them. A
            // parcel's khata and its group belong to the passbook above it.
            passbookId: '', groupId: '',
            classification: rec.classification, status: rec.status, stake: rec.stake,
            khataNo: rec.khataNo, ownerName: rec.ownerName, village: rec.village,
            mandal: rec.mandal, district: rec.district, placeLine: rec.placeLine,
            extent: rec.extent, extentUnit: rec.extentUnit, extentAlt: '',
            marketValue: rec.marketValue, tags: rec.tags,
            // The drawer edits fields; it never draws the record.
            lat: rec.lat, lon: rec.lon, ring: rec.ring, coverFileRef: '',
            // Everything a property TILE reads and this drawer does not. They
            // are zero rather than the header's own figures on purpose: the
            // drawer edits a record's fields, and how many papers hang off it,
            // which deed registered it and whether it is in court are none of
            // them. A value here would be a value the form could not save.
            extentDetail: '', paperCount: 0, photoCount: 0, featureCount: 0,
            deedLine: '', litigation: false, paperFileRef: '',
          }}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Deleting a record takes everything filed under it, so it asks in a
          dialog over the page rather than a second tap on a menu row. */}
      {confirmDel && (
        <Dialog
          title={`Delete ${rec.title}?`}
          busy={delRecords.isPending}
          onClose={() => { setDelErr(''); setConfirmDel(false); }}
          footer={(
            <>
              <button type="button" className="btn"
                      onClick={() => { setDelErr(''); setConfirmDel(false); }}>
                Cancel
              </button>
              <button type="button" className="btn danger" disabled={delRecords.isPending}
                      onClick={async () => {
                        setDelErr('');
                        try {
                          const count = (await delRecords.mutateAsync({ ids: [rec.id] })).web.deleteRecords;
                          if (!count) {
                            setDelErr('That property could not be deleted. Reload the page.');
                            return;
                          }
                          nav('/app/properties');
                        } catch {
                          // The rejection used to go nowhere: the dialog stayed
                          // open over a record that was still there, saying
                          // nothing about why.
                          setDelErr('That property could not be deleted. Nothing was removed.');
                        }
                      }}>
                {delRecords.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </>
          )}
        >
          <p className="note" style={{ margin: 0 }}>
            Everything filed under it is deleted too. There is no undo.
          </p>
          {delErr && (
            <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{delErr}</p>
          )}
        </Dialog>
      )}

      {/* Archiving is reversible, but it takes the record out of every list,
          every total and the map — from this page, with nothing here able to
          show that it happened, because `record` reads archived rows too. */}
      {confirmArchive && (
        <Dialog
          title={`Archive ${rec.title}?`}
          busy={archive.isPending}
          onClose={() => { setArchiveErr(''); setConfirmArchive(false); }}
          footer={(
            <>
              <button type="button" className="btn"
                      onClick={() => { setArchiveErr(''); setConfirmArchive(false); }}>
                Cancel
              </button>
              {/* Outlined: archiving is reversible and is not the page's lead
                  action, so it does not take the amber fill. */}
              <button type="button" className="btn" disabled={archive.isPending}
                      onClick={async () => {
                        setArchiveErr('');
                        try {
                          const count = (await archive.mutateAsync({ ids: [rec.id], archived: true })).web.archiveRecords;
                          if (!count) {
                            setArchiveErr('That property could not be archived. Reload the page.');
                            return;
                          }
                          nav('/app/properties');
                        } catch {
                          setArchiveErr('That property could not be archived. Nothing was changed.');
                        }
                      }}>
                {archive.isPending ? 'Archiving…' : 'Archive'}
              </button>
            </>
          )}
        >
          <p className="note" style={{ margin: 0 }}>
            Hidden from lists, the map and totals. Restore it from <strong>Archived</strong>.
          </p>
          {archiveErr && (
            <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{archiveErr}</p>
          )}
        </Dialog>
      )}

      <RecordTabs rec={rec} />
    </>
  );
}
