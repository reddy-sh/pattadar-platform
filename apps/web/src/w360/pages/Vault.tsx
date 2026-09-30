/** W15 — Documents: a file list, folders and every link you have out.
 *
 *  The share log is not buried in settings. It sits under the shelves because
 *  the only honest way to promise "no document leaves without appearing in
 *  this list" is to put the list where the documents are. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, FormEvent, MouseEvent, ReactNode, RefObject } from 'react';
import { Link, useSearchParams } from 'react-router';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import CreateNewFolderOutlined from '@mui/icons-material/CreateNewFolderOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import GppGoodOutlined from '@mui/icons-material/GppGoodOutlined';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { FILE_KIND_LABEL, fileKindOf, formatBytes } from '@pattadar/core';
import type { FileKind } from '@pattadar/core';

import {
  EMPTY_FILTER, useCombinedProperties, useCreateShareLink, useDeletePaper, useProperties,
  useRevokeLink, useVault, useLinkPapers, useVaultPapers, useVaultFolders,
  useMovePapersToFolder, useMoveVaultFolder, useDeleteVaultFolder, useTagPapers,
} from '../api';
import type { Combined, Paper, RecordCard, ShareLink, VaultFolder } from '../api';
import { Dialog } from '../Dialog';
import ShareResult from '../components/ShareResult';
import { reasonOf, useToast } from '../Toast';
import {
  Chip, Crumbs, Empty, FacetFilter, Failed, InfoTip, Loading, PageHead, PhotoImg, Tag, VideoThumb, ddmmyyyy,
  plural,
} from '../ui';
import type { FacetFilterGroup } from '../ui';
import { PaperPreview } from '../paper/PaperPreview';
import { PaperDrawer } from './RecordPapers';
import { ConfirmDialog, RecordDrawer, TagDialog } from './PropertyActions';
import {
  EditTagsDialog, FileKindGlyph, FolderNameDialog, MoveToFolderDialog, folderPath, subtreeOf,
} from './VaultFolders';

const SHELF_FILTERS = [
  ['all', 'All files'], ['title', 'Title'], ['revenue', 'Revenue record'],
  ['map', 'Map'], ['photos', 'Photos & video'], ['identity', 'Identity'],
  ['search', 'Search & tax'], ['old', 'Old record'], ['unsorted', 'Unsorted'],
] as const;
const FILES_PER_PAGE = 25;
type FileSort = 'recent' | 'name-asc' | 'name-desc';
/** One press cycles the order, the way Properties' "Sort:" does — a select
 *  here wrapped its own label onto two lines beside the toolbar. */
const SORTS: { key: FileSort; label: string }[] = [
  { key: 'recent', label: 'Recently added' },
  { key: 'name-asc', label: 'Name A–Z' },
  { key: 'name-desc', label: 'Name Z–A' },
];
/** The groups the shared `+ Filter` offers, in the order it lists them. */
type FacetKey = 'shelf' | 'kind' | 'property' | 'combined' | 'linked' | 'tag';
type Facets = Record<FacetKey, string[]>;
const NO_FACETS: Facets = { shelf: [], kind: [], property: [], combined: [], linked: [], tag: [] };
const FACET_WORD: Record<FacetKey, string> = {
  shelf: 'Type', kind: 'File', property: 'Property', combined: 'Combined view', linked: 'Linked', tag: 'Tag',
};

/** DD/MM/YYYY — the only shape share_links stores, and sometimes it stores
 *  nothing at all — to whole days from today, or null when the row carries no
 *  usable date.
 *
 *  The server sends `daysLeft` as well, but it is clamped: `_days_until`
 *  returns 0 for a date that passed in August and 0 again for an empty column,
 *  so this screen told the owner "expires tomorrow" over links that had
 *  already lapsed and over links nobody had ever given an expiry. Parsing the
 *  stored date here is what separates those three cases; the arithmetic is the
 *  same one the server does. */
function daysTo(stored: string): number | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((stored || '').trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const when = new Date(year, month - 1, day);
  // 31/02/2026 parses into 03/03/2026 rather than failing, and a link whose
  // date is nonsense must read as "no expiry recorded", not as four days out.
  if (when.getDate() !== day || when.getMonth() !== month - 1) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((when.getTime() - today.getTime()) / 86_400_000);
}

interface Span {
  /** The date has passed: whoever holds this link cannot open it any more. */
  expired: boolean;
  /** Worth a colour — it lapses within a day, or it never lapses at all. */
  urgent: boolean;
  word: string;
}

/** What to say about a link's remaining life. A link that runs out today still
 *  opens today, so it stays in the live list and says which day it is. */
function spanOf(l: ShareLink): Span {
  const days = daysTo(l.expiresOn);
  if (days === null) return { expired: false, urgent: true, word: 'no expiry recorded' };
  if (days < 0) return { expired: true, urgent: true, word: `expired ${ddmmyyyy(l.expiresOn)}` };
  if (days === 0) return { expired: false, urgent: true, word: 'expires today' };
  if (days === 1) return { expired: false, urgent: true, word: 'expires tomorrow' };
  return { expired: false, urgent: false, word: `${plural(days, 'day')} left` };
}

/**
 * One link out of the vault, with its own revoke.
 *
 * Its own, deliberately: `useRevokeLink()` called once in Vault and shared by
 * every row means one `isPending` for the whole list, so a busy label or a
 * disabled button would spread across links nobody had touched.
 *
 * "Extend" used to sit beside Revoke and is gone. It called `extendShareLink`,
 * which does `UPDATE share_links SET sort = sort + days` — days left is read
 * off `expires_on`, so extending moved the row down the list and changed
 * nothing else, while telling the owner a buyer had another week they did not
 * have. It belongs back here the day that mutation writes `expires_on`; until
 * then the footnote under the list says how a longer link is actually made.
 */
function LinkRow({ link, n }: { link: ShareLink; n: number }) {
  const revoke = useRevokeLink();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const span = spanOf(link);

  const kill = async () => {
    try {
      const removed = (await revoke.mutateAsync({ linkId: link.id })).web.revokeShareLink;
      if (!removed) {
        toast.bad('That link could not be revoked. It may already be off the list — reload to check.');
        return;
      }
    } catch {
      // The mutation raises its own failure toast with the reason. The dialog
      // stays open, because the link is still live and still unwanted.
      return;
    }
    setAsking(false);
    toast.ok(span.expired
      ? `The lapsed link to ${link.audience} is off this list. The full share log keeps it.`
      : `${link.audience} can no longer open ${link.subject}.`);
  };

  // A register entry: its place in the list, who holds it and of what, the
  // terms, the date it lapses (only when the stored date is a real one), and
  // what is left of it. The number is the list's own order — an <ol> says the
  // same to a screen reader, so the drawn numeral is hidden from it.
  const days = daysTo(link.expiresOn);
  return (
    <li className="reg-row">
      <span className="reg-n mono" aria-hidden>{String(n).padStart(2, '0')}</span>
      <span className="reg-main">
        <strong>{link.audience} — {link.subject}</strong>
        <span className="note">{link.terms}</span>
      </span>
      <span className="note mono reg-date">
        {days !== null && days >= 0 ? `lapses ${ddmmyyyy(link.expiresOn)}` : ''}
      </span>
      <span className={span.urgent ? 'down' : 'note'} style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
        {span.word}
      </span>
      <span className="row tight" style={{ flexWrap: 'nowrap' }}>
        <button type="button" className="btn sm danger" disabled={revoke.isPending}
                onClick={() => setAsking(true)}>
          {revoke.isPending ? 'Revoking…' : 'Revoke'}
        </button>
      </span>

      {/* Cutting off a bank's loan desk mid-read is not undoable from this
          screen, so it is asked in a dialog rather than done on one click. */}
      {asking && (
        <Dialog
          title={`Revoke the link to ${link.audience}?`}
          busy={revoke.isPending}
          onClose={() => setAsking(false)}
          footer={
            <>
              <button type="button" className="btn" disabled={revoke.isPending}
                      onClick={() => setAsking(false)}>
                Keep the link
              </button>
              <button type="button" className="btn danger" disabled={revoke.isPending}
                      onClick={() => { void kill(); }}>
                {revoke.isPending ? 'Revoking…' : 'Revoke it'}
              </button>
            </>
          }
        >
          {span.expired ? (
            <p className="note">
              This link has already lapsed. Revoking takes it off this list.
            </p>
          ) : (
            <p className="note">
              {link.audience} loses access to {link.subject} immediately. This cannot be undone.
            </p>
          )}
        </Dialog>
      )}
    </li>
  );
}

/** Which property — the step both header actions need before they can do
 *  anything. A paper is filed against one record, and `createShareLink` takes
 *  one recordId; there is no portfolio-wide set on either side. */
function RecordPick({ cards, onPick, searchRef }: {
  cards: RecordCard[]; onPick: (c: RecordCard) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
}) {
  const [q, setQ] = useState('');
  useEffect(() => { searchRef?.current?.focus(); }, [searchRef]);
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? cards.filter((c) => `${c.title} ${c.placeLine} ${c.khataNo} ${c.ownerName}`
          .toLowerCase().includes(needle))
      : cards;
  }, [cards, q]);
  const rows = matches.slice(0, 12);

  return (
    <>
      <span className="search" style={{ width: '100%', minWidth: 0 }}>
        <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
        <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Search your properties by survey no, village or khata"
               aria-label="Search your properties" />
      </span>
      <div className="rows boxed" style={{ marginTop: 'var(--space-sm)' }}>
        {rows.map((c) => (
          <div key={c.id}>
            <span className="grow">
              <button type="button" className="link"
                      style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer',
                               fontWeight: 700, fontSize: '0.9375rem', textAlign: 'left' }}
                      onClick={() => onPick(c)}>
                {c.title}
              </button>
              <span className="note" style={{ display: 'block' }}>{c.placeLine}</span>
            </span>
            <Chip>{c.extent} {c.extentUnit}</Chip>
          </div>
        ))}
        {rows.length === 0 && (
          <div><p className="note">No property matches “{q.trim()}”.</p></div>
        )}
      </div>
      {matches.length > rows.length && (
        <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
          {q.trim()
            ? `The first ${rows.length} of ${plural(matches.length, 'match', 'matches')}`
            : `The first ${rows.length} of ${plural(cards.length, 'property', 'properties')}`}
        </p>
      )}
    </>
  );
}

/** Multi-target picker for files such as an undivided FMB or a combined-site
 *  drone recording. Every entry comes from the owner's own property list. */
function RecordMultiPick({ cards, combined, alreadyLinkedIds, onConfirm, busy }: {
  cards: RecordCard[]; combined: Combined[]; alreadyLinkedIds: string[];
  onConfirm: (ids: string[]) => void; busy: boolean;
}) {
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return {
      combined: needle ? combined.filter((c) =>
        `${c.name} ${c.placeLine} ${c.members.map((m) => m.title).join(' ')}`
          .toLowerCase().includes(needle)) : combined,
      records: needle ? cards.filter((c) =>
        `${c.title} ${c.placeLine} ${c.khataNo} ${c.ownerName}`
          .toLowerCase().includes(needle)) : cards,
    };
  }, [cards, combined, q]);
  const toggle = (id: string) => setChosen((before) => {
    const next = new Set(before);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <>
      <p className="note">Choose the properties and combined views this file belongs to.</p>
      <span className="search" style={{ width: '100%', minWidth: 0 }}>
        <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Search properties or combined views"
               aria-label="Search properties and combined views to link" />
      </span>
      <div style={{ marginTop: 'var(--space-sm)', maxHeight: 'min(50vh, 28rem)', overflowY: 'auto' }}>
        {matches.combined.length > 0 && (
          <section aria-label="Combined views">
            <h3 className="eyebrow">Combined views</h3>
            <div className="rows boxed">
              {matches.combined.map((c) => (
                <label key={c.id} style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={chosen.has(c.id)}
                         disabled={busy || alreadyLinkedIds.includes(c.id)}
                         onChange={() => toggle(c.id)} />
                  <span className="grow">
                    <strong>{c.name}</strong>
                    <span className="note" style={{ display: 'block' }}>
                      {plural(c.memberCount, 'property')}
                      {c.members.length > 0 && ` · ${c.members.slice(0, 3).map((m) => m.title).join(', ')}`}
                      {c.memberCount > 3 && ` +${c.memberCount - 3}`}
                    </span>
                    {c.placeLine && <span className="note" style={{ display: 'block' }}>{c.placeLine}</span>}
                  </span>
                  <Chip>{alreadyLinkedIds.includes(c.id) ? 'Already linked' : 'Combined view'}</Chip>
                </label>
              ))}
            </div>
          </section>
        )}
        {matches.records.length > 0 && (
          <section aria-label="Individual properties">
            <h3 className="eyebrow">Individual properties</h3>
            <div className="rows boxed">
              {matches.records.map((c) => (
                <label key={c.id} style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={chosen.has(c.id)}
                         disabled={busy || alreadyLinkedIds.includes(c.id)}
                         onChange={() => toggle(c.id)} />
                  <span className="grow">
                    <strong>{c.title}</strong>
                    <span className="note" style={{ display: 'block' }}>{c.placeLine}</span>
                  </span>
                  <Chip>{alreadyLinkedIds.includes(c.id) ? 'Already linked' : `${c.extent} ${c.extentUnit}`}</Chip>
                </label>
              ))}
            </div>
          </section>
        )}
        {matches.combined.length === 0 && matches.records.length === 0 && (
          <p className="note">No property or combined view matches “{q.trim()}”.</p>
        )}
      </div>
      <div className="row between" style={{ marginTop: 'var(--space-md)' }}>
        <span className="note">{chosen.size} selected</span>
        <button type="button" className="btn primary" disabled={!chosen.size || busy}
                onClick={() => onConfirm([...chosen])}>
          {busy ? 'Linking…' : 'Link to selected'}
        </button>
      </div>
    </>
  );
}

function LinkedPropertiesDialog({ paper, onClose, onLinkAnother }: {
  paper: Paper; onClose: () => void; onLinkAnother: () => void;
}) {
  const links = linkedPropertiesFor(paper);
  const unlink = useDeletePaper(false);
  const [error, setError] = useState('');
  async function remove(documentId: string, recordId: string) {
    setError('');
    try {
      const result = (await unlink.mutateAsync({ paperId: documentId, recordId })).web.deletePaper;
      if (!result) setError('The link could not be removed. Try again.');
    } catch {
      setError('The link could not be removed. Try again.');
    }
  }
  return (
    <Dialog title={`Linked to ${paper.title}`} onClose={onClose}
            footer={<span className="row tight">
              <button type="button" className="btn" onClick={onClose}>Done</button>
              <button type="button" className="btn primary" onClick={onLinkAnother}>Add link</button>
            </span>}>
      {links.length ? (
        <div className="rows boxed">
          {links.map((property) => (
            <div key={property.id} className="row between">
              <span className="grow"><strong>{property.title}</strong></span>
              <Link className="linkbtn"
                    to={property.kind === 'combined'
                      ? `/app/combined/${property.id}` : `/app/records/${property.id}`}
                    onClick={onClose}>
                {property.kind === 'combined' ? 'Open combined view' : 'Open property'}
              </Link>
              <button type="button" className="linkbtn" disabled={unlink.isPending}
                      onClick={() => { void remove(property.documentId, property.id); }}>
                Remove link
              </button>
            </div>
          ))}
        </div>
      ) : <p className="note">This file is not linked to a property or combined view yet.</p>}
      {error && <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{error}</p>}
    </Dialog>
  );
}

function linkedPropertiesFor(paper: Paper) {
  return paper.linkedProperties?.length
    ? paper.linkedProperties
    : paper.recordId ? [{ id: paper.recordId, title: paper.recordTitle || 'Property', kind: 'parcel', documentId: paper.id }] : [];
}

/** Older joint FMB uploads wrote one document row for each property. In the
 *  library they remain one file, with every property's association preserved. */
function oneRowPerFile(papers: Paper[]): Paper[] {
  const byKey = new Map<string, Paper>();
  for (const paper of papers) {
    const key = paper.jointFmbId ? `joint:${paper.jointFmbId}` : paper.id;
    const earlier = byKey.get(key);
    if (!earlier) {
      byKey.set(key, { ...paper, linkedProperties: linkedPropertiesFor(paper),
        detail: paper.jointFmbId ? 'Joint FMB' : paper.detail });
      continue;
    }
    const merged = new Map(earlier.linkedProperties.map((property) => [property.id, property]));
    for (const property of linkedPropertiesFor(paper)) {
      if (!merged.has(property.id)) merged.set(property.id, property);
    }
    earlier.linkedProperties = [...merged.values()];
    earlier.shared ||= paper.shared;
  }
  return [...byKey.values()];
}

/** Upload files to the owner's private library first. They can be linked to a
 *  property now or later from the file's own actions. */
function AddPapers({ onClose, returnFocus, folderId }: {
  onClose: () => void; returnFocus: RefObject<HTMLButtonElement | null>; folderId: string;
}) {
  return <PaperDrawer recordId="" recordTitle="" onClose={onClose} returnFocus={returnFocus}
                      folderId={folderId} />;
}

function LinkPapersDialog({ paperIds, alreadyLinkedIds, onClose }: {
  paperIds: string[]; alreadyLinkedIds: string[]; onClose: () => void;
}) {
  const { data, isLoading, error } = useProperties(EMPTY_FILTER);
  const combined = useCombinedProperties();
  const link = useLinkPapers();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function fileTo(recordIds: string[]) {
    if (busy) return;
    setBusy(true);
    try {
      const result = (await link.mutateAsync({ paperIds, recordIds })).web.linkPapers;
      if (!result) {
        toast.bad('Those files could not be linked. Nothing has changed.');
        return;
      }
      onClose();
    } catch {
      // The mutation reports its own failure and leaves the picker open.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={paperIds.length === 1 ? 'Link file' : `Link ${paperIds.length} files`} onClose={onClose}
            footer={<button type="button" className="btn" onClick={onClose}>Cancel</button>}>
      {(isLoading || combined.isLoading) && <Loading h="10rem" />}
      {!isLoading && !data && <Failed what="Your properties" error={error} h="10rem" />}
      {!combined.isLoading && !combined.data && (
        <Failed what="Your combined views" error={combined.error} h="10rem" />
      )}
      {data && combined.data && data.cards.length === 0 && combined.data.length === 0 && (
        <Empty icon="parcel" title="Add a property or combined view first"
               action={<Link className="btn" to="/app/properties" onClick={onClose}>Your properties</Link>} />
      )}
      {data && combined.data && (data.cards.length > 0 || combined.data.length > 0) && (busy
        ? <Loading h="8rem" what="filing your documents" />
        : <RecordMultiPick cards={data.cards} combined={combined.data}
                           alreadyLinkedIds={alreadyLinkedIds}
                           onConfirm={(ids) => { void fileTo(ids); }} busy={busy} />)}
    </Dialog>
  );
}

/**
 * A link out, made from the vault.
 *
 * The button here said "Share a set" and did nothing. A set is not a thing the
 * API can share: `createShareLink` takes one recordId, one audience, terms and
 * a span — so the control now says what it can actually do, asks which
 * property, and makes the link on the same 30-day view-only terms the record's
 * own Share panel uses. The new link appears in the list behind this dialog.
 */
function ShareRecord({ onClose }: { onClose: () => void }) {
  const { data, isLoading, error } = useProperties(EMPTY_FILTER);
  const share = useCreateShareLink();
  const toast = useToast();
  const [pick, setPick] = useState<RecordCard | null>(null);
  const [audience, setAudience] = useState('');
  const [sharePath, setSharePath] = useState('');
  const pickSearch = useRef<HTMLInputElement>(null);
  const audienceInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      (pick ? audienceInput.current : pickSearch.current)?.focus();
    });
  }, [pick]);

  const make = async (e: FormEvent) => {
    e.preventDefault();
    if (!pick || !audience.trim()) return;
    try {
      const made = (await share.mutateAsync({
        recordId: pick.id, audience: audience.trim(), terms: 'view', days: 30,
      })).web.createShareLink;
      if (!made) {
        toast.bad(`No link was made for ${audience.trim()} — this property may no longer be yours to share.`);
        return;
      }
      // ShareResult says "Link ready." and holds the link on screen, so a
      // success toast on top of it would say the same thing twice.
      setSharePath(made);
    } catch {
      // The mutation's own toast carries the reason; what was typed stays on
      // screen so the link can be made again without picking the property twice.
      return;
    }
  };

  return (
    <Dialog
      title="Share a property"
      busy={share.isPending}
      dismissable={false}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" disabled={share.isPending} onClick={onClose}>
            {sharePath ? 'Done' : 'Cancel'}
          </button>
          {!sharePath && <button type="submit" form="vault-share" className="btn primary"
                  disabled={!pick || !audience.trim() || share.isPending}>
            {share.isPending ? 'Making the link…' : 'Make the link'}
          </button>}
        </>
      }
    >
      {sharePath ? <ShareResult path={sharePath} /> : <form id="vault-share" onSubmit={(e) => { void make(e); }}>
        {isLoading && <Loading h="10rem" />}
        {!isLoading && !data && <Failed what="Your properties" error={error} h="10rem" />}
        {data && data.cards.length === 0 && (
          <Empty icon="parcel" title="Nothing to share yet"
                 action={<Link className="btn" to="/app/properties" onClick={onClose}>Your properties</Link>} />
        )}

        {data && data.cards.length > 0 && !pick && (
          <>
            <RecordPick cards={data.cards} onPick={setPick} searchRef={pickSearch} />
          </>
        )}

        {pick && (
          <>
            <div className="row between" style={{ marginBottom: 'var(--space-md)' }}>
              <span className="grow">
                <strong style={{ fontSize: '0.9375rem', display: 'block' }}>{pick.title}</strong>
                <span className="note">{pick.placeLine}</span>
              </span>
              <button type="button" className="btn sm" disabled={share.isPending}
                      onClick={() => setPick(null)}>
                Change
              </button>
            </div>
            <span className="search" style={{ width: '100%', minWidth: 0 }}>
              <input ref={audienceInput} value={audience} onChange={(e) => setAudience(e.target.value)}
                     placeholder="Who is it for — a name, a firm"
                     aria-label="Who the link is for" />
            </span>
            <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
              Anyone with the link can view and download the current documents for 30 days.
            </p>
          </>
        )}
      </form>}
    </Dialog>
  );
}

type Layout = 'list' | 'grid';
/** A working preference, like the old vault's folders/list switch: someone
 *  sorting a stack of scans wants pictures, someone hunting one deed wants
 *  rows. Remembered per browser. */
const LAYOUT_KEY = 'pattadar.documents.layout';
/** What a drag inside Documents carries. Its own type, so a file dragged in
 *  from the desktop is never mistaken for a move. */
const DRAG_TYPE = 'application/x-pattadar-documents';
interface Dragged { papers: string[]; folder?: string }

function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

/** "PDF · 1.4 MB" — what the file is, when nothing read it into a detail. */
function fileLine(paper: Paper): string {
  const kind = fileKindOf(paper.mimeType, paper.title);
  return [paper.detail || FILE_KIND_LABEL[kind], formatBytes(paper.sizeBytes ?? 0)]
    .filter(Boolean).join(' · ');
}

const folderLine = (f: VaultFolder) =>
  [f.folderCount ? plural(f.folderCount, 'folder') : '', plural(f.fileCount, 'file')]
    .filter(Boolean).join(' · ');

export function Vault() {
  const { data, isLoading, error } = useVault();
  const [panel, setPanel] = useState<'' | 'add' | 'share'>('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [linking, setLinking] = useState<string[] | null>(null);
  const [createFrom, setCreateFrom] = useState<Paper | null>(null);
  const [viewingLinksId, setViewingLinksId] = useState('');
  // Within a group the choices widen (Title OR Map); across groups they
  // narrow (Title AND tagged "bank"), as on Properties and Cadastral maps.
  const [facets, setFacets] = useState<Facets>(NO_FACETS);
  const [sortMode, setSortMode] = useState<FileSort>('recent');
  const [page, setPage] = useState(1);
  const [actionMenu, setActionMenu] = useState<{ paper: Paper; anchor: HTMLElement } | null>(null);
  const [folderMenu, setFolderMenu] = useState<{ folder: VaultFolder; anchor: HTMLElement } | null>(null);
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [naming, setNaming] = useState<{ folder?: VaultFolder } | null>(null);
  const [removing, setRemoving] = useState<VaultFolder | null>(null);
  const [removeError, setRemoveError] = useState('');
  const [moving, setMoving] = useState<{ paperIds: string[]; folder?: VaultFolder } | null>(null);
  const [moveError, setMoveError] = useState('');
  const [tagging, setTagging] = useState<string[] | null>(null);
  const [tagError, setTagError] = useState('');
  const [editingTagsId, setEditingTagsId] = useState('');
  // The folder (or '' for the top level) a drag is hovering over right now.
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const allPapers = useVaultPapers('all');
  const vaultFolders = useVaultFolders();
  // Combined views and who is in them, so a file filed against one member
  // property is found under the view that property belongs to.
  const combinedViews = useCombinedProperties();
  const movePapers = useMovePapersToFolder();
  const moveFolder = useMoveVaultFolder();
  const deleteFolder = useDeleteVaultFolder();
  const tagPapers = useTagPapers();
  const toast = useToast();
  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, layout);
    } catch {
      /* private browsing — the preference just does not persist */
    }
  }, [layout]);
  // `?do=add` / `?do=share` opens that dialog on arrival, so Home's shortcuts
  // are one click, like Properties' `?new=1`. The flag is taken off the URL
  // at once, so a reload or a shared link does not reopen it.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const want = params.get('do');
    if (want !== 'add' && want !== 'share') return;
    setPanel(want);
    const next = new URLSearchParams(params);
    next.delete('do');
    setParams(next, { replace: true });
  }, [params, setParams]);
  // A file row opens a preview on a plain click; modified clicks still open
  // the document route in a separate tab, like a familiar file manager.
  const [preview, setPreview] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const openPreview = (e: MouseEvent, id: string) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setPreview(id);
  };

  // Search spans every owned vault item before the list is paged.
  const [q, setQ] = useState('');
  const vaultSearch = useRef<HTMLInputElement>(null);

  // ── Where the owner is standing ─────────────────────────────────────
  // The open folder lives in the URL (`?folder=`), so Back leaves a folder
  // the way it does in any file manager and a folder can be bookmarked. A
  // folder id that is not in the owner's tree — deleted, or not theirs — is
  // the top level; while the tree is still loading it is trusted, so a
  // bookmarked folder does not flash the top level first.
  const folders = useMemo(() => vaultFolders.data ?? [], [vaultFolders.data]);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const wanted = params.get('folder') ?? '';
  const currentFolder = wanted && (vaultFolders.isLoading || folderById.has(wanted)) ? wanted : '';
  const trail = folderPath(currentFolder, folderById);
  const here = folderById.get(currentFolder);
  const placeOf = (p: Paper) => (p.folderId && folderById.has(p.folderId) ? p.folderId : '');
  const parentOf = (f: VaultFolder) => (f.parentId && folderById.has(f.parentId) ? f.parentId : '');
  const nameOf = (id: string) => (id ? folderById.get(id)?.name ?? 'that folder' : 'My files');
  const folderHref = (id: string) => (id ? `/app/papers?folder=${encodeURIComponent(id)}` : '/app/papers');
  useEffect(() => { setSelected(new Set()); setPage(1); }, [currentFolder]);

  /** Into a folder, leaving any search or filter behind: those span every
   *  folder, and carrying one in would show a folder that looks empty. */
  const openFolder = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('folder', id); else next.delete('folder');
    setParams(next);
    setQ(''); setFacets(NO_FACETS);
  };
  const toggleFacet = (group: string, key: string) => {
    setFacets((before) => {
      const g = group as FacetKey;
      const on = before[g].includes(key);
      return { ...before, [g]: on ? before[g].filter((k) => k !== key) : [...before[g], key] };
    });
    setPage(1);
  };
  const clearFilters = () => { setFacets(NO_FACETS); setQ(''); setPage(1); };

  // Search, a type, a tag or "Not linked" each mean "these documents,
  // wherever they are": the list goes flat across every folder and each row
  // says where it lives. With none of them, the list is the open folder.
  const faceted = Object.values(facets).some((values) => values.length > 0);
  const filtering = !!q.trim() || faceted;

  // A link whose date has passed is not "out right now", and counting it as
  // though it were is how an owner comes to believe a stranger still has
  // access — or that they no longer do.
  const [live, lapsed] = useMemo(() => {
    const all = data?.links ?? [];
    return [all.filter((l) => !spanOf(l).expired), all.filter((l) => spanOf(l).expired)];
  }, [data?.links]);

  const files = useMemo(() => oneRowPerFile(allPapers.data ?? []), [allPapers.data]);
  const combinedList = useMemo(() => combinedViews.data ?? [], [combinedViews.data]);
  /** Individual properties a file is linked to — combined views are not one. */
  const propertiesOf = (p: Paper) => linkedPropertiesFor(p).filter((l) => l.kind !== 'combined');
  /** Combined views a file belongs to: linked to the view itself, or to any of
   *  its member properties. */
  const combinedOf = useMemo(() => {
    const viewsOfRecord = new Map<string, string[]>();
    for (const c of combinedList) {
      for (const m of c.members) viewsOfRecord.set(m.recordId, [...(viewsOfRecord.get(m.recordId) ?? []), c.id]);
    }
    return (p: Paper): string[] => [...new Set(linkedPropertiesFor(p).flatMap((l) =>
      l.kind === 'combined' ? [l.id] : viewsOfRecord.get(l.id) ?? []))];
  }, [combinedList]);
  const knownTags = useMemo(() => [...new Set(files.flatMap((p) => p.tags))]
    .sort((a, b) => a.localeCompare(b)), [files]);
  // Every option counted over every file, and only options something carries
  // are offered: a filter that leads to nothing is not a choice.
  const facetGroups = useMemo<FacetFilterGroup[]>(() => {
    const tally = (keyOf: (p: Paper) => string[]) => {
      const n = new Map<string, number>();
      for (const p of files) for (const k of new Set(keyOf(p))) n.set(k, (n.get(k) ?? 0) + 1);
      return n;
    };
    const shelves = tally((p) => [p.shelf || 'unsorted']);
    const kinds = tally((p) => [fileKindOf(p.mimeType, p.title)]);
    const props = new Map<string, string>();
    for (const p of files) for (const l of propertiesOf(p)) props.set(l.id, l.title);
    const propCount = tally((p) => propertiesOf(p).map((l) => l.id));
    const viewName = new Map(combinedList.map((c) => [c.id, c.name]));
    for (const p of files) {
      for (const l of linkedPropertiesFor(p)) if (l.kind === 'combined' && !viewName.has(l.id)) viewName.set(l.id, l.title);
    }
    const viewCount = tally(combinedOf);
    const linked = tally((p) => [linkedPropertiesFor(p).length ? 'linked' : 'unlinked']);
    const tags = tally((p) => p.tags);
    const groups: FacetFilterGroup[] = [
      { key: 'shelf', label: 'Type', options: SHELF_FILTERS.filter(([k]) => k !== 'all' && shelves.get(k))
        .map(([k, label]) => ({ key: k, label, count: shelves.get(k) ?? 0 })) },
      { key: 'kind', label: 'File', options: [...kinds].sort((a, b) => b[1] - a[1])
        .map(([k, count]) => ({ key: k, label: FILE_KIND_LABEL[k as FileKind], count })) },
      { key: 'property', label: 'Property', options: [...propCount]
        .sort((a, b) => (props.get(a[0]) ?? '').localeCompare(props.get(b[0]) ?? ''))
        .map(([k, count]) => ({ key: k, label: props.get(k) ?? 'Property', count })) },
      { key: 'combined', label: 'Combined view', options: [...viewCount]
        .sort((a, b) => (viewName.get(a[0]) ?? '').localeCompare(viewName.get(b[0]) ?? ''))
        .map(([k, count]) => ({ key: k, label: viewName.get(k) ?? 'Combined view', count })) },
      { key: 'linked', label: 'Linked', options: (['linked', 'unlinked'] as const).filter((k) => linked.get(k))
        .map((k) => ({ key: k, label: k === 'linked' ? 'Linked to a property' : 'Not linked', count: linked.get(k) ?? 0 })) },
      { key: 'tag', label: 'Tag', options: [...tags].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, count]) => ({ key: k, label: k, count })) },
    ];
    return groups.filter((g) => g.options.length > 0);
    // propertiesOf reads nothing from state; combinedOf and the view names are listed.
  }, [files, combinedOf, combinedList]);
  const selectionRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matches = files.filter((p) => (filtering || placeOf(p) === currentFolder)
      && (!facets.shelf.length || facets.shelf.includes(p.shelf || 'unsorted'))
      && (!facets.kind.length || facets.kind.includes(fileKindOf(p.mimeType, p.title)))
      && (!facets.property.length || propertiesOf(p).some((l) => facets.property.includes(l.id)))
      && (!facets.combined.length || combinedOf(p).some((id) => facets.combined.includes(id)))
      && (!facets.linked.length
        || facets.linked.includes(linkedPropertiesFor(p).length ? 'linked' : 'unlinked'))
      && (!facets.tag.length || p.tags.some((t) => facets.tag.includes(t)))
      && (!needle || `${p.title} ${p.detail} ${p.tags.join(' ')} ${linkedPropertiesFor(p)
        .map((property) => property.title).join(' ')}`.toLowerCase().includes(needle)));
    return matches.sort((a, b) => sortMode === 'recent'
      ? b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title)
      : sortMode === 'name-asc'
        ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title));
    // placeOf reads folderById, which is in the list.
  }, [files, q, facets, sortMode, filtering, currentFolder, folderById, combinedOf]);
  const subfolders = useMemo(() => (filtering ? [] : folders
    .filter((f) => (f.parentId && folderById.has(f.parentId) ? f.parentId : '') === currentFolder)
    .sort((a, b) => (sortMode === 'name-desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)))),
  [filtering, folders, folderById, currentFolder, sortMode]);
  const pageCount = Math.max(1, Math.ceil(selectionRows.length / FILES_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = selectionRows.slice((currentPage - 1) * FILES_PER_PAGE, currentPage * FILES_PER_PAGE);
  // Folders sit above the files, on the first page only — they are the way
  // in, not more of the list.
  const folderRows = currentPage === 1 ? subfolders : [];
  const chosenRows = files.filter((p) => selected.has(p.id));
  const viewingLinks = files.find((paper) => paper.id === viewingLinksId);
  const editingTags = files.find((paper) => paper.id === editingTagsId);
  const linkingRows = files.filter((paper) => linking?.includes(paper.id));
  const alreadyLinkedIds = linkingRows.length
    ? linkedPropertiesFor(linkingRows[0]).map((property) => property.id)
      .filter((id) => linkingRows.every((paper) => linkedPropertiesFor(paper)
        .some((property) => property.id === id)))
    : [];
  const toggleSelected = (paper: Paper) => {
    setSelected((before) => {
      const next = new Set(before);
      if (next.has(paper.id)) next.delete(paper.id); else next.add(paper.id);
      return next;
    });
  };

  // ── Moving things ───────────────────────────────────────────────────
  // From a dialog, a refusal is said inside the dialog and it stays open;
  // from a drag there is no dialog, so it is a toast.
  async function moveFiles(paperIds: string[], folderId: string, fromDialog: boolean) {
    setMoveError('');
    const refused = 'Those files could not be moved. Nothing has changed.';
    try {
      const n = (await movePapers.mutateAsync({ paperIds, folderId })).web.movePapersToFolder;
      if (!n) {
        if (fromDialog) setMoveError(refused); else toast.bad(refused);
        return;
      }
      setMoving(null);
      setSelected(new Set());
      toast.ok(`${plural(n, 'file')} moved to ${nameOf(folderId)}.`);
    } catch (err) {
      if (fromDialog) setMoveError(reasonOf(err) || refused); else toast.bad(refused, err);
    }
  }

  async function moveFolderInto(folder: VaultFolder, parentId: string, fromDialog: boolean) {
    setMoveError('');
    const refused = `“${folder.name}” could not be moved. Nothing has changed.`;
    try {
      const ok = (await moveFolder.mutateAsync({ folderId: folder.id, parentId })).web.moveVaultFolder;
      if (!ok) {
        if (fromDialog) setMoveError(refused); else toast.bad(refused);
        return;
      }
      setMoving(null);
      toast.ok(`“${folder.name}” moved to ${nameOf(parentId)}.`);
    } catch (err) {
      if (fromDialog) setMoveError(reasonOf(err) || refused); else toast.bad(refused, err);
    }
  }

  async function removeFolder(folder: VaultFolder) {
    setRemoveError('');
    try {
      const ok = (await deleteFolder.mutateAsync({ folderId: folder.id })).web.deleteVaultFolder;
      if (!ok) {
        setRemoveError('That folder is no longer here. Reload to check.');
        return;
      }
      setRemoving(null);
      toast.ok(`“${folder.name}” is removed. What was in it is now in ${nameOf(parentOf(folder))}.`);
    } catch (err) {
      setRemoveError(reasonOf(err) || 'The folder could not be removed. Nothing has changed.');
    }
  }

  async function tagAll(word: string) {
    if (!tagging) return;
    setTagError('');
    try {
      const n = (await tagPapers.mutateAsync({ paperIds: tagging, tag: word, on: true })).web.tagPapers;
      setTagging(null);
      setSelected(new Set());
      toast.ok(n ? `Tagged ${plural(n, 'file')} “${word}”.` : `Those files already carry “${word}”.`);
    } catch (err) {
      setTagError(reasonOf(err) || 'That tag could not be saved. Nothing has changed.');
    }
  }

  // ── Drag and drop ───────────────────────────────────────────────────
  // Files and folders drag onto a folder, or onto a crumb of the path above
  // the list. Every drag has a keyboard twin: "Move to folder…" on the row's
  // menu and on the selection bar.
  const dragFiles = (e: DragEvent, paper: Paper) => {
    const ids = selected.has(paper.id) ? [...selected] : [paper.id];
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ papers: ids } satisfies Dragged));
    e.dataTransfer.effectAllowed = 'move';
  };
  const dragFolder = (e: DragEvent, folder: VaultFolder) => {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ papers: [], folder: folder.id } satisfies Dragged));
    e.dataTransfer.effectAllowed = 'move';
  };
  const dropOnto = (folderId: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!Array.from(e.dataTransfer.types).includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropTarget !== folderId) setDropTarget(folderId);
    },
    onDragLeave: () => setDropTarget((at) => (at === folderId ? null : at)),
    onDrop: (e: DragEvent) => {
      if (!Array.from(e.dataTransfer.types).includes(DRAG_TYPE)) return;
      e.preventDefault();
      setDropTarget(null);
      let dragged: Dragged;
      try {
        dragged = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as Dragged;
      } catch {
        return;
      }
      if (dragged.folder) {
        const folder = folderById.get(dragged.folder);
        // Onto itself, into its own subtree, or where it already is: nothing.
        if (!folder || subtreeOf(folder.id, folders).has(folderId) || parentOf(folder) === folderId) return;
        void moveFolderInto(folder, folderId, false);
        return;
      }
      const ids = (dragged.papers ?? []).filter((id) => {
        const paper = files.find((p) => p.id === id);
        return paper && placeOf(paper) !== folderId;
      });
      if (ids.length) void moveFiles(ids, folderId, false);
    },
  });
  const dropClass = (folderId: string) => (dropTarget === folderId ? ' drop-over' : '');

  if (isLoading) return <main><Loading h="70vh" what="your documents" /></main>;
  if (!data) return <main><Failed what="Your documents" error={error} boxed h="26rem" /></main>;

  const heading = filtering ? 'All folders' : here?.name ?? 'My files';
  const nothingHere = selectionRows.length === 0 && folderRows.length === 0;

  /** Where a row lives, said only while the list is flat across folders. */
  const whereLine = (paper: Paper): ReactNode => {
    if (!filtering) return null;
    const at = placeOf(paper);
    return (
      <button type="button" className="vault-where" onClick={() => openFolder(at)}
              aria-label={`Open ${nameOf(at)}, where ${paper.title} is kept`}>
        in {nameOf(at)}
      </button>
    );
  };
  const tagsOf = (paper: Paper): ReactNode => (paper.tags.length > 0 && (
    <span className="vault-tags">
      {paper.tags.map((t) => (
        <Tag key={t} label={`Show files tagged ${t}`}
             onClick={() => { if (!facets.tag.includes(t)) toggleFacet('tag', t); }}>{t}</Tag>
      ))}
    </span>
  ));
  // What a file is filed against, as words. It used to be a link to the
  // property, and a click meant for the file landed on the land instead: the
  // row belongs to the file. Links are changed from the file's own menu.
  const linksOf = (paper: Paper): ReactNode => {
    const linked = linkedPropertiesFor(paper);
    if (linked.length === 0) return <span className="note vault-link-text unlinked">Not linked</span>;
    const names = linked.map((property) => property.title).join(', ');
    return (
      <span className="vault-link-text" title={names}>
        {linked[0].title}
        {linked.length > 1 && <span className="note"> +{linked.length - 1}</span>}
      </span>
    );
  };
  /** A press anywhere on a row or tile that is not one of its own controls
   *  opens the file, the way a file manager does. */
  const openFromRow = (e: MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest('a, button, input, label, select, [role="menuitem"]')) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    setPreview(id);
  };
  const fileMenuButton = (paper: Paper) => (
    <IconButton size="small" aria-label={`Actions for ${paper.title}`} aria-haspopup="menu"
                sx={{ color: 'var(--w-ink-2)' }}
                onClick={(e) => setActionMenu({ paper, anchor: e.currentTarget })}>
      <MoreVertOutlined fontSize="small" />
    </IconButton>
  );
  const folderMenuButton = (folder: VaultFolder) => (
    <IconButton size="small" aria-label={`Actions for the folder ${folder.name}`} aria-haspopup="menu"
                sx={{ color: 'var(--w-ink-2)' }}
                onClick={(e) => setFolderMenu({ folder, anchor: e.currentTarget })}>
      <MoreVertOutlined fontSize="small" />
    </IconButton>
  );
  const thumbOf = (paper: Paper): ReactNode => {
    const kind = fileKindOf(paper.mimeType, paper.title);
    const glyph = <FileKindGlyph kind={kind} size={40} />;
    if (kind === 'image') {
      return <PhotoImg fileRef={paper.fileRef} alt="" thumb={320} className="vault-thumb-img" fallback={glyph} />;
    }
    if (kind === 'video') return <VideoThumb fileRef={paper.fileRef} fallback={glyph} />;
    return glyph;
  };

  return (
    <main>
      {/* No eyebrow: a top-level page does not repeat its rail label above
          its title (PageHead contract). */}
      <PageHead
        title="Documents"
        actions={
          <>
            <button type="button" className="btn" onClick={() => setPanel('share')}>
              <IosShareOutlined sx={{ fontSize: 16 }} /> Share a property
            </button>
            <button ref={addTrigger} type="button" className="btn primary" onClick={() => setPanel('add')}>
              <FileUploadOutlined sx={{ fontSize: 16 }} /> Add documents
            </button>
          </>
        }
      >
        <p className="note row tight" style={{ marginTop: '0.375rem' }}>
          <span className="up" style={{ display: 'flex' }}><GppGoodOutlined sx={{ fontSize: 15 }} /></span>
          {data.regionNote} · Private unless shared
        </p>
      </PageHead>

      {/* The Cadastral maps shape: where you are, then one filter bar that
          carries the count and the search, straight under the page head. */}
      <section className="vault-files" aria-labelledby="files-heading">
        <div className="vault-place">
          <h2 id="files-heading" className="sr-only">
            {heading}{' · '}{plural(selectionRows.length, 'file')}
            {folderRows.length > 0 && ` · ${plural(subfolders.length, 'folder')}`}
          </h2>
          {filtering ? (
            <span className="vault-place-where" aria-hidden>
              <span>Documents</span><strong>All folders</strong>
            </span>
          ) : currentFolder ? (
            <Crumbs label="Folder path" trail={[
              { label: 'My files', to: folderHref(''),
                props: { ...dropOnto(''), className: `vault-crumb${dropClass('')}` } },
              ...trail.map((f) => ({
                label: f.name, to: folderHref(f.id),
                props: { ...dropOnto(f.id), className: `vault-crumb${dropClass(f.id)}` },
              })),
            ]} />
          ) : (
            <span className="vault-place-where" aria-hidden>
              <span>Documents</span><strong>My files</strong>
            </span>
          )}
          {selected.size > 0 && (
            <span className="row tight vault-selbar" role="toolbar" aria-label="Selected file actions">
              <span className="note" role="status">{plural(selected.size, 'file')} selected</span>
              <button type="button" className="btn sm" disabled={!chosenRows.length}
                      onClick={() => setLinking(chosenRows.map((p) => p.id))}>
                Link to property or view
              </button>
              <button type="button" className="btn sm" disabled={!chosenRows.length}
                      onClick={() => { setMoveError(''); setMoving({ paperIds: chosenRows.map((p) => p.id) }); }}>
                Move to folder…
              </button>
              <button type="button" className="btn sm" disabled={!chosenRows.length}
                      onClick={() => { setTagError(''); setTagging(chosenRows.map((p) => p.id)); }}>
                Tag…
              </button>
              <button type="button" className="btn sm" disabled={chosenRows.length !== 1}
                      onClick={() => setCreateFrom(chosenRows[0] ?? null)}>
                Create property
              </button>
              <button type="button" className="btn sm" onClick={() => setSelected(new Set())}>Clear</button>
            </span>
          )}
        </div>
        <FacetFilter
          groups={facetGroups}
          selected={facets}
          onToggle={toggleFacet}
          onClear={clearFilters}
          ariaLabel="Narrow your documents"
          searchPlaceholder="Search types, files, properties or tags"
          groupLabel={(key, group) => group?.label ?? FACET_WORD[key as FacetKey] ?? key}
          tally={filtering
            ? `${selectionRows.length} of ${plural(files.length, 'file')}`
            : [folderRows.length ? plural(subfolders.length, 'folder') : '', plural(selectionRows.length, 'file')]
              .filter(Boolean).join(' · ')}
          extraChips={q.trim() ? [{
            id: 'q', group: 'Search', label: q.trim(),
            removeLabel: `Clear the search for ${q.trim()}`,
            onRemove: () => { setQ(''); setPage(1); },
          }] : []}
          trailing={(
            <span className="row tight vault-view-tools">
              {/* Search spans every owned file, in every folder. */}
              <span className="search vault-search">
                <SearchOutlined sx={{ fontSize: 17 }} aria-hidden />
                <input ref={vaultSearch} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
                       placeholder="Search files, tags or properties"
                       aria-label="Search files, tags or linked properties" />
              </span>
              <button type="button" className="sortcycle"
                      aria-label={`Sort: ${SORTS.find((x) => x.key === sortMode)?.label}. Press to change.`}
                      onClick={() => {
                        const at = SORTS.findIndex((x) => x.key === sortMode);
                        setSortMode(SORTS[(at + 1) % SORTS.length].key);
                        setPage(1);
                      }}>
                Sort: {SORTS.find((x) => x.key === sortMode)?.label} ⌄
              </button>
              <span className="segmented" role="group" aria-label="Layout">
                <button type="button" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>List</button>
                <button type="button" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>Grid</button>
              </span>
              <button type="button" className="btn sm" onClick={() => setNaming({})}>
                <CreateNewFolderOutlined sx={{ fontSize: 16 }} /> New folder
              </button>
            </span>
          )}
        />

        {vaultFolders.error && (
          <p className="note" role="alert" style={{ marginTop: 0 }}>
            Your folders did not load, so every file is shown at the top level for now.
          </p>
        )}
        {allPapers.isLoading && <Loading h="12rem" what="your files" />}
        {!allPapers.isLoading && allPapers.error && (
          <Failed what="Your files" error={allPapers.error} boxed h="12rem" />
        )}
        {!allPapers.isLoading && !allPapers.error && nothingHere && (
          filtering || !currentFolder ? (
            <Empty boxed h="14rem" icon={q.trim() ? 'search' : 'paper'}
                   title={q.trim() ? `No file matches “${q.trim()}”`
                     : faceted ? 'No file matches these filters' : 'No documents yet'}
                   action={filtering
                     ? <button type="button" className="btn"
                               onClick={clearFilters}>
                         Clear filters
                       </button>
                     : <button type="button" className="btn primary" onClick={() => setPanel('add')}>Add documents</button>} />
          ) : (
            <div {...dropOnto(currentFolder)} className={`vault-drop-zone${dropClass(currentFolder)}`}>
              <Empty boxed h="14rem" icon="folder" title="This folder is empty">
                Add documents here, drag files onto it, or choose Move to folder on any file.
              </Empty>
            </div>
          )
        )}

        {!nothingHere && layout === 'list' && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <div ref={listRef} role="table" aria-label="Your private documents"
                   className="vault-file-grid">
                <div role="row" className="note vault-file-row vault-file-header">
                  <span role="columnheader">
                    <input type="checkbox" aria-label="Select all files on this page"
                      disabled={pageRows.length === 0}
                      checked={pageRows.length > 0 && pageRows.every((p) => selected.has(p.id))}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelected((before) => {
                          const next = new Set(before);
                          for (const p of pageRows) {
                            if (checked) next.add(p.id); else next.delete(p.id);
                          }
                          return next;
                        });
                      }} />
                  </span>
                  <span role="columnheader">Name</span>
                  <span role="columnheader">Linked to</span>
                  <span role="columnheader">Type</span>
                  <span role="columnheader" aria-label="Actions" />
                </div>
                {folderRows.map((folder) => (
                  <div key={folder.id} role="row" draggable
                       className={`vault-file-row vault-folder-row${dropClass(folder.id)}`}
                       onDragStart={(e) => dragFolder(e, folder)} onDragEnd={() => setDropTarget(null)}
                       {...dropOnto(folder.id)}>
                    <span role="cell" />
                    <span role="cell" className="vault-name-cell">
                      <FileKindGlyph kind="folder" />
                      <span style={{ minWidth: 0 }}>
                        <Link to={folderHref(folder.id)} className="vault-name">{folder.name}</Link>
                        <span className="note vault-line">{folderLine(folder)}</span>
                      </span>
                    </span>
                    <span role="cell" />
                    <span role="cell" className="note">Folder</span>
                    <span role="cell" style={{ justifySelf: 'end' }}>{folderMenuButton(folder)}</span>
                  </div>
                ))}
                {pageRows.map((paper) => (
                  <div key={paper.id} role="row" className="vault-file-row opens" draggable
                       onClick={(e) => openFromRow(e, paper.id)}
                       onDragStart={(e) => dragFiles(e, paper)} onDragEnd={() => setDropTarget(null)}>
                    <span role="cell">
                      <input type="checkbox" checked={selected.has(paper.id)}
                             aria-label={`Select ${paper.title}`}
                             onChange={() => toggleSelected(paper)} />
                    </span>
                    <span role="cell" className="vault-name-cell">
                      <FileKindGlyph kind={fileKindOf(paper.mimeType, paper.title)} />
                      <span style={{ minWidth: 0 }}>
                        <Link to={`/app/papers/${paper.id}`} onClick={(e) => openPreview(e, paper.id)}
                              className="vault-name" draggable={false}>
                          {paper.title}
                        </Link>
                        <span className="note vault-line">{fileLine(paper)}{whereLine(paper) && ' · '}{whereLine(paper)}</span>
                        {tagsOf(paper)}
                        <span className="note vault-mobile-property">
                          {linkedPropertiesFor(paper).length
                            ? plural(linkedPropertiesFor(paper).length, 'linked property', 'linked properties')
                            : 'Not linked'}
                        </span>
                      </span>
                    </span>
                    <span role="cell" style={{ minWidth: 0 }}>{linksOf(paper)}</span>
                    <span role="cell" className="note">
                      {SHELF_FILTERS.find(([key]) => key === paper.shelf)?.[1] ?? 'Unsorted'}
                      {paper.shared && <span style={{ marginLeft: 6 }}>· Shared</span>}
                    </span>
                    <span role="cell" style={{ justifySelf: 'end' }}>{fileMenuButton(paper)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!nothingHere && layout === 'grid' && (
          <div ref={listRef} className="vault-grid" role="list" aria-label="Your private documents">
            {folderRows.map((folder) => (
              <div key={folder.id} role="listitem" draggable
                   className={`vault-tile vault-tile-folder${dropClass(folder.id)}`}
                   onDragStart={(e) => dragFolder(e, folder)} onDragEnd={() => setDropTarget(null)}
                   {...dropOnto(folder.id)}>
                <FileKindGlyph kind="folder" size={28} />
                <span className="vault-tile-body">
                  <Link to={folderHref(folder.id)} className="vault-name">{folder.name}</Link>
                  <span className="note vault-line">{folderLine(folder)}</span>
                </span>
                {folderMenuButton(folder)}
              </div>
            ))}
            {pageRows.map((paper) => (
              <div key={paper.id} role="listitem" draggable
                   className={`vault-tile opens${selected.has(paper.id) ? ' selected' : ''}`}
                   onClick={(e) => openFromRow(e, paper.id)}
                   onDragStart={(e) => dragFiles(e, paper)} onDragEnd={() => setDropTarget(null)}>
                <Link to={`/app/papers/${paper.id}`} onClick={(e) => openPreview(e, paper.id)}
                      className="vault-tile-thumb" tabIndex={-1} aria-hidden draggable={false}>
                  {thumbOf(paper)}
                </Link>
                <input type="checkbox" className="vault-tile-check" checked={selected.has(paper.id)}
                       aria-label={`Select ${paper.title}`} onChange={() => toggleSelected(paper)} />
                <span className="vault-tile-foot">
                  <span className="vault-tile-body">
                    <Link to={`/app/papers/${paper.id}`} onClick={(e) => openPreview(e, paper.id)}
                          className="vault-name" draggable={false}>
                      {paper.title}
                    </Link>
                    <span className="note vault-line">{fileLine(paper)}</span>
                    {whereLine(paper)}
                    {tagsOf(paper)}
                    <span className="vault-tile-links">{linksOf(paper)}</span>
                  </span>
                  {fileMenuButton(paper)}
                </span>
              </div>
            ))}
          </div>
        )}

        <Menu anchorEl={actionMenu?.anchor ?? null} open={!!actionMenu}
              onClose={() => setActionMenu(null)}>
          <MenuItem onClick={() => {
            if (actionMenu) setPreview(actionMenu.paper.id);
            setActionMenu(null);
          }}>Preview</MenuItem>
          {actionMenu && (
            <>
              {linkedPropertiesFor(actionMenu.paper).length > 0 ? (
                <MenuItem onClick={() => {
                  setViewingLinksId(actionMenu.paper.id); setActionMenu(null);
                }}>Manage links</MenuItem>
              ) : (
                <MenuItem onClick={() => {
                  setLinking([actionMenu.paper.id]); setActionMenu(null);
                }}>Link to a property or view</MenuItem>
              )}
              <MenuItem onClick={() => {
                setMoveError(''); setMoving({ paperIds: [actionMenu.paper.id] }); setActionMenu(null);
              }}>Move to folder…</MenuItem>
              <MenuItem onClick={() => {
                setEditingTagsId(actionMenu.paper.id); setActionMenu(null);
              }}>Edit tags…</MenuItem>
              <MenuItem onClick={() => {
                setCreateFrom(actionMenu.paper); setActionMenu(null);
              }}>Create property from this file</MenuItem>
            </>
          )}
        </Menu>
        <Menu anchorEl={folderMenu?.anchor ?? null} open={!!folderMenu}
              onClose={() => setFolderMenu(null)}>
          {folderMenu && (
            <>
              <MenuItem onClick={() => { openFolder(folderMenu.folder.id); setFolderMenu(null); }}>Open</MenuItem>
              <MenuItem onClick={() => { setNaming({ folder: folderMenu.folder }); setFolderMenu(null); }}>
                Rename…
              </MenuItem>
              <MenuItem onClick={() => {
                setMoveError(''); setMoving({ paperIds: [], folder: folderMenu.folder }); setFolderMenu(null);
              }}>Move to folder…</MenuItem>
              <MenuItem onClick={() => {
                setRemoveError(''); setRemoving(folderMenu.folder); setFolderMenu(null);
              }}>Remove folder…</MenuItem>
            </>
          )}
        </Menu>
        {selectionRows.length > FILES_PER_PAGE && (
          <nav className="vault-pagination" aria-label="File pages">
            <span className="note">
              {`${(currentPage - 1) * FILES_PER_PAGE + 1}–${Math.min(currentPage * FILES_PER_PAGE, selectionRows.length)}`}
              {' of '}{selectionRows.length}
            </span>
            <button type="button" className="btn sm" disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}>Previous</button>
            <span className="note">Page {currentPage} of {pageCount}</span>
            <button type="button" className="btn sm" disabled={currentPage === pageCount}
                    onClick={() => setPage(currentPage + 1)}>Next</button>
          </nav>
        )}
      </section>

      <section className="sec">
        <div className="row between" style={{ marginBottom: 'var(--space-md)' }}>
          {/* Standing guidance sits behind the ⓘ, not under the list. */}
          <span className="row tight">
            <h2 className="eyebrow" style={{ margin: 0 }}>Active share links · {live.length}</h2>
            <InfoTip label="Active share links">New links are view-only for 30 days.</InfoTip>
          </span>
          <Link className="accent" to="/app/audit" style={{ fontSize: '0.8125rem', textDecoration: 'none' }}>
            Share activity ›
          </Link>
        </div>

        {/* A register, not a contact list: numbered hairline entries. */}
        {live.length > 0
          ? <ol className="register">{live.map((l, i) => <LinkRow key={l.id} link={l} n={i + 1} />)}</ol>
          : <p className="note register-empty">No active share links.</p>}

        {/* Lapsed links are shown, not hidden: someone held this link, and a
            link that quietly disappears from the log is the thing this list
            exists to make impossible. */}
        {lapsed.length > 0 && (
          <>
            <div className="row between" style={{ margin: 'var(--space-lg) 0 var(--space-md)' }}>
              <h2 className="eyebrow" style={{ margin: 0 }}>Expired links · {lapsed.length}</h2>
            </div>
            <ol className="register">
              {lapsed.map((l, i) => <LinkRow key={l.id} link={l} n={i + 1} />)}
            </ol>
          </>
        )}
      </section>

      {panel === 'add' && (
        <AddPapers onClose={() => setPanel('')} returnFocus={addTrigger} folderId={currentFolder} />
      )}
      {panel === 'share' && <ShareRecord onClose={() => setPanel('')} />}
      {linking && linking.length > 0 && (
        <LinkPapersDialog paperIds={linking} alreadyLinkedIds={alreadyLinkedIds}
                          onClose={() => { setLinking(null); setSelected(new Set()); }} />
      )}
      {viewingLinks && (
        <LinkedPropertiesDialog paper={viewingLinks}
          onClose={() => setViewingLinksId('')}
          onLinkAnother={() => { setLinking([viewingLinks.id]); setViewingLinksId(''); }} />
      )}
      {naming && (
        <FolderNameDialog folder={naming.folder} parentId={currentFolder} parentName={nameOf(currentFolder)}
                          onClose={() => setNaming(null)}
                          onDone={(id) => {
                            const renamed = !!naming.folder;
                            setNaming(null);
                            if (!renamed) toast.ok(`Folder made in ${nameOf(currentFolder)}.`);
                            else if (id) toast.ok('Folder renamed.');
                          }} />
      )}
      {moving && (
        <MoveToFolderDialog
          title={moving.folder ? `Move “${moving.folder.name}”`
            : moving.paperIds.length === 1
              ? `Move ${files.find((p) => p.id === moving.paperIds[0])?.title ?? 'this file'}`
              : `Move ${plural(moving.paperIds.length, 'file')}`}
          folders={folders}
          currentId={moving.folder ? parentOf(moving.folder)
            : (() => {
                const places = new Set(moving.paperIds.map((id) => {
                  const paper = files.find((p) => p.id === id);
                  return paper ? placeOf(paper) : '';
                }));
                return places.size === 1 ? [...places][0] : '\u0000';
              })()}
          exclude={moving.folder ? subtreeOf(moving.folder.id, folders) : undefined}
          busy={movePapers.isPending || moveFolder.isPending}
          error={moveError}
          onClose={() => setMoving(null)}
          onMove={(target) => {
            if (moving.folder) void moveFolderInto(moving.folder, target, true);
            else void moveFiles(moving.paperIds, target, true);
          }} />
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove the folder “${removing.name}”?`}
          body={removing.fileCount || removing.folderCount
            ? `Everything inside (${folderLine(removing)}) moves up to ${nameOf(parentOf(removing))}. No file is deleted.`
            : 'The folder is empty. No file is deleted.'}
          actionLabel="Remove folder" danger busy={deleteFolder.isPending} error={removeError}
          onConfirm={() => { void removeFolder(removing); }}
          onClose={() => setRemoving(null)} />
      )}
      {tagging && (
        <TagDialog count={tagging.length} existing={knownTags} noun={['file', 'files']}
                   busy={tagPapers.isPending} error={tagError} onApply={(word) => { void tagAll(word); }}
                   onClose={() => { setTagError(''); setTagging(null); }} />
      )}
      {editingTags && (
        <EditTagsDialog paperId={editingTags.id} title={editingTags.title} tags={editingTags.tags}
                        known={knownTags} onClose={() => setEditingTagsId('')} />
      )}
      {createFrom && (
        <RecordDrawer card={null} sourcePaper={createFrom}
                      onClose={() => { setCreateFrom(null); setSelected(new Set()); }} />
      )}
      {preview && (
        <PaperPreview paperId={preview} onClose={() => setPreview('')}
                      returnFocus={listRef} />
      )}
    </main>
  );
}
