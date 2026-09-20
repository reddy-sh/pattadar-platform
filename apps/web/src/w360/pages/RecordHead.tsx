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
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router';
import type { ReactNode } from 'react';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';

import {
  EMPTY_FILTER, useArchiveRecords, useCreateShareLink, useDeleteRecords, useNotes, usePapers,
  useProperties,
} from '../api';
import type { RecordDetail } from '../api';
import { Crumbs, Icon, Menu, Pill, num, statusWord } from '../ui';
import { Dialog } from '../Dialog';
import ShareResult from '../components/ShareResult';
import { useToast } from '../Toast';
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
  /** False for a hanger that draws its own chrome instead of sitting inside the
   *  shared frame. Nothing sets it today, and the gallery — which did — is why
   *  the flag is kept rather than deleted: it was full-bleed with its own back
   *  button, and the effect was that opening Media dropped you out of the record
   *  with no tab strip to get back. A hanger that leaves the frame is a hanger
   *  that stops being one. */
  frame?: boolean;
}[] = [
  { to: '', label: 'Papers', end: true, count: (r) => r.paperCount },
  { to: 'features', label: 'Features', count: (r) => r.featureCount },
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
  { to: 'money', label: 'Money', count: () => null },
  { to: 'history', label: 'Audit', count: () => null },
];

/** Which hanger a URL is on, so the shell can name it in the breadcrumb and
 *  know whether to draw the frame around it at all.
 *
 *  Undefined means "this screen owns the page": the flows that also live under
 *  `records/:id` — ordering a service, requesting work, the expense ledger —
 *  and the gallery, which is a viewer rather than a panel (see `frame`). */
export function tabFor(pathname: string) {
  const tail = pathname.replace(/\/+$/, '').split('/app/records/')[1]?.split('/')[1] ?? '';
  return TABS.find((t) => t.to === tail && t.frame !== false);
}

export function RecordTabs({ rec }: { rec: RecordDetail }) {
  // The only count not on RecordDetail. It is a small owner-scoped read and the
  // Notes hanger shares the cache, so the strip is not paying for it twice.
  const { data: notes } = useNotes(rec.id);
  return (
    <nav className="tabs" aria-label="This record">
      {TABS.map((t) => {
        const n = t.to === 'notes' && notes ? notes.length : t.count(rec);
        return (
          <NavLink key={t.label} end={t.end}
                   to={t.to ? `/app/records/${rec.id}/${t.to}` : `/app/records/${rec.id}`}>
            {t.label}
            {/* Zero is printed, dimmed. The strip used to hide a count of
                nought, so an empty hanger and a hanger whose count had not
                loaded looked identical — and "Media" with nothing beside it
                reads as a tab holding something. Saying 0 out loud is how the
                strip becomes the record's inventory. */}
            {n !== null && <span className={n > 0 ? 'n' : 'n zero'}>{n}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

/** The breadcrumb every hanger shares: Properties › the record › this hanger. */
export function RecordCrumbs({ rec, here }: { rec: RecordDetail; here?: string }) {
  return (
    <Crumbs
      trail={[
        { label: 'Properties', to: '/app/properties' },
        { label: rec.title, to: here ? `/app/records/${rec.id}` : undefined },
        ...(here ? [{ label: here }] : []),
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
export function SectionHead({ title, sub, actions }: {
  title: ReactNode;
  /** The one line under the heading: "2 features · 1 not checked · worst
   *  condition first". Counts and sort order, not marketing. */
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="sechead">
      <div className="grow">
        <h2>{title}</h2>
        {sub && <p className="note" style={{ margin: '0.25rem 0 0' }}>{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function RecordHead({ rec, here }: { rec: RecordDetail; here?: string }) {
  const shared = useCreateShareLink(false);
  const archive = useArchiveRecords(false);
  const delRecords = useDeleteRecords(false);
  const nav = useNavigate();
  const toast = useToast();
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

  return (
    <>
      <RecordCrumbs rec={rec} here={here} />

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
                label="Go to another record"
                header="Your other records"
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
          <p className="lede rechead-place">
            {rec.placeLine} — {rec.state}
            {rec.placeLineTe && <> · <span className="accent">{rec.placeLineTe}</span></>}
          </p>
        </div>
        <div className="actions">
          <Link className="btn" to={`/app/records/${rec.id}/order`}>
            <HandshakeOutlined sx={{ fontSize: 16 }} /> Order a service
          </Link>
          <button ref={shareTrigger} type="button" className="btn primary" aria-expanded={panel === 'share'}
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
            { label: 'See what changed', onClick: () => nav(`/app/records/${rec.id}/history`) },
            { label: 'Open map & boundary', onClick: () => nav(`/app/records/${rec.id}/map`) },
            { label: 'Ask a surveyor', onClick: () => nav(`/app/records/${rec.id}/request?kind=survey`) },
            // Archiving pulls the record out of every list, total and map, and
            // it used to happen on one stray menu click with nothing on screen
            // saying it had — this page cannot show it, because `record` reads
            // archived rows too. So it asks first, in the same dialog the
            // delete path uses, and lands you where the change is visible.
            { label: 'Archive this record', onClick: () => setConfirmArchive(true) },
            { label: 'Delete this record', danger: true, onClick: () => setConfirmDel(true) },
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
                setShareErr(`No link was made for ${who} — this record may no longer be yours to share.`);
                return;
              }
              // The panel closing is the only thing that changes on screen, so
              // the confirmation has to be said out loud. No date: the expiry
              // is computed and formatted on the server and never sent back,
              // and a guessed one can disagree with the row in the Vault.
              toast.ok('The link is ready to copy and send.');
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
            A link to the papers you select, good for 30 days. Anyone with it can open and download those files.
            Revoke it any time from the Vault.
          </p>
          <SecureShareGuidance district={rec.district || '*'} />
          <fieldset className="share-paper-picker">
            <legend>Choose papers for this purpose</legend>
            {papers.isLoading && <p className="note">Checking this record's papers…</p>}
            {papers.isError && <p className="note" role="alert">The papers could not be checked. Nothing can be shared yet.</p>}
            {papers.data?.map((paper) => (
              <label key={paper.id}>
                <input type="checkbox" checked={shareDocs.includes(paper.id)}
                       onChange={() => setShareDocs((current) => current.includes(paper.id)
                         ? current.filter((id) => id !== paper.id) : [...current, paper.id])} />
                <span><strong>{paper.title}</strong><small>{paper.detail || paper.shelf}</small></span>
              </label>
            ))}
            {papers.data?.length === 0 && <p className="note">There are no papers on this record to share.</p>}
          </fieldset>
          <div className="row tight">
            <span className="search" style={{ flex: '1 1 14rem', minWidth: 0 }}>
              <input value={audience} autoFocus aria-label="Who is it for"
                     placeholder="Who is it for — a name, a firm"
                     onChange={(e) => setAudience(e.target.value)} />
            </span>
            <button type="submit" className="btn sm primary"
                    disabled={!audience.trim() || shareDocs.length === 0 || shared.isPending}>
              {shared.isPending ? 'Making the link…' : 'Share'}
            </button>
            <button type="button" className="btn sm"
                    onClick={closeShare}>Cancel</button>
          </div>
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
                            setDelErr('That record could not be deleted — it may already be gone. Reload the page.');
                            return;
                          }
                          nav('/app/properties');
                        } catch {
                          // The rejection used to go nowhere: the dialog stayed
                          // open over a record that was still there, saying
                          // nothing about why.
                          setDelErr('That record could not be deleted. Nothing was removed.');
                        }
                      }}>
                {delRecords.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </>
          )}
        >
          <p className="note" style={{ margin: 0 }}>
            Everything filed under it goes too — papers, photos, features, people
            and the money ledger. There is no undo. If you only want it out of the
            way, archive it instead.
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
              <button type="button" className="btn primary" disabled={archive.isPending}
                      onClick={async () => {
                        setArchiveErr('');
                        try {
                          const count = (await archive.mutateAsync({ ids: [rec.id], archived: true })).web.archiveRecords;
                          if (!count) {
                            setArchiveErr('That record could not be archived — it may already be gone. Reload the page.');
                            return;
                          }
                          nav('/app/properties');
                        } catch {
                          setArchiveErr('That record could not be archived. Nothing was changed.');
                        }
                      }}>
                {archive.isPending ? 'Archiving…' : 'Archive'}
              </button>
            </>
          )}
        >
          <p className="note" style={{ margin: 0 }}>
            Archived records leave the list, the map and every total, but keep
            everything filed under them. Bring it back any time from the
            <strong> Archived</strong> facet in the rail.
          </p>
          {archiveErr && (
            <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{archiveErr}</p>
          )}
        </Dialog>
      )}

      {/* The "N of 9 parts filled in" indicator used to sit here as a
          full-width strip on every hanger, and briefly moved into the Papers
          rail. It is gone entirely now — the tab strip already prints a count
          against every hanger ("Media 0", "People 5"), which is the same
          inventory said where the reader is already looking. */}
      <RecordTabs rec={rec} />
    </>
  );
}
