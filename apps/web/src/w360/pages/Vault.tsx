/** W15 — Documents: a file list, folders and every link you have out.
 *
 *  The share log is not buried in settings. It sits under the shelves because
 *  the only honest way to promise "no document leaves without appearing in
 *  this list" is to put the list where the documents are. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, FormEvent, MouseEvent, ReactNode, RefObject } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import AddHomeOutlined from '@mui/icons-material/AddHomeOutlined';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import CreateNewFolderOutlined from '@mui/icons-material/CreateNewFolderOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import DriveFileMoveOutlined from '@mui/icons-material/DriveFileMoveOutlined';
import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import GppGoodOutlined from '@mui/icons-material/GppGoodOutlined';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import { FILE_KIND_LABEL, fileKindOf, formatBytes } from '@pattadar/core';
import type { FileKind } from '@pattadar/core';

import {
  EMPTY_FILTER, useHoldings, useCreateDocumentShareLink, useCreateShareLink, useDeletePaper, useProperties,
  useRevokeLink, useVault, useLinkPapers, useVaultPapers, useVaultFolders,
  useMovePapersToFolder, useMoveVaultFolder, useDeleteVaultFolder, useTagPapers,
} from '../api';
import type { HoldingCard, Paper, RecordCard, ShareLink, VaultFolder } from '../api';
import { Dialog } from '../Dialog';
import ShareResult from '../components/ShareResult';
import { reasonOf, useToast } from '../Toast';
import {
  BandSearch, Card, Chip, Crumbs, Empty, FacetFilter, Failed, HOLDING_WORD, InfoLink, Menu, PageHead, PhotoImg,
  PlaceLine, SelectAllBox, SelectionBar, SortCycle, TablePager, Tag, VideoThumb, ViewToggle, ddmmyyyy, extentText, plural,
  downloadCsv,
} from '../ui';
import type { FacetFilterGroup, HeadActions, MenuItem } from '../ui';
import { passbookGuideHref } from '../serviceGuides';
import { Sk, SkRowItems } from '../skeletons';
import { PaperPreview } from '../paper/PaperPreview';
import { PaperDetailsDrawer } from '../paper/PaperDetailsDrawer';
import { displayDetail } from '../paperFiling';
import { paperFileName, paperTitle } from '../paperTitle';
import { downloadBlob, fetchFileBlob, isStorageRef } from '../../pages/documents/storage';
import { PaperDrawer } from './RecordPapers';
import { SectionHead } from './RecordHead';
import { folderLabel, linkedLabel } from './vaultFolderLabel';
import { ConfirmDialog, RecordDrawer, TagDialog } from './PropertyActions';
import { DeletePaperDialog, EditPaperDialog, SetTypeDialog, fileNameFor } from './PaperDialogs';
import {
  EditTagsDialog, FileKindGlyph, FolderNameDialog, MoveToFolderDialog, folderPath, subtreeOf,
} from './VaultFolders';

const SHELF_FILTERS = [
  ['all', 'All'], ['title', 'Title deeds'], ['revenue', 'Revenue records'],
  ['map', 'Map'], ['photos', 'Photos & video'], ['identity', 'Identity'],
  ['search', 'EC & tax receipts'], ['old', 'Old records'], ['unsorted', 'Not sorted yet'],
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
/** The groups the shared `+ Filter` offers, in the order it lists them.
 *  Facets live in React state only, never in the URL or storage; if a URL key
 *  is ever added, it must also accept the old `combined` key on read. */
type FacetKey = 'shelf' | 'kind' | 'property' | 'holding' | 'linked' | 'tag';
type Facets = Record<FacetKey, string[]>;
const NO_FACETS: Facets = { shelf: [], kind: [], property: [], holding: [], linked: [], tag: [] };
const FACET_WORD: Record<FacetKey, string> = {
  shelf: 'Type', kind: 'Format', property: 'Property', holding: 'Holding', linked: 'Linked', tag: 'Tag',
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
        toast.bad(span.expired
          ? 'That link could not be removed. It may already be off the list — reload to check.'
          : 'That link could not be revoked. It may already be off the list — reload to check.');
        return;
      }
    } catch {
      // The mutation raises its own failure toast with the reason. The dialog
      // stays open, because the link is still live and still unwanted.
      return;
    }
    setAsking(false);
    toast.ok(span.expired
      ? `The expired link to ${link.audience} is off this list. Activity still records it.`
      : `${link.audience} can no longer open ${link.subject}.`);
  };

  // A register entry: its place in the list, who holds it and of what, the
  // terms and what went out on it, the date it lapsed or lapses (only when
  // the stored date is a real one), and what is left of it. The number is the
  // list's own order — an <ol> says the same to a screen reader, so the drawn
  // numeral is hidden from it.
  const days = daysTo(link.expiresOn);
  // What went out on it and whether anyone opened it: the query paid for both,
  // and "did the bank ever read it?" is the question this list exists for.
  const reach = [
    link.docCount ? plural(link.docCount, 'document') : '',
    link.openedCount
      ? `opened ${plural(link.openedCount, 'time')}${link.lastOpenedAt ? `, last ${ddmmyyyy(link.lastOpenedAt)}` : ''}`
      : 'Not opened yet',
  ].filter(Boolean).join(' · ');
  // An expired link cuts nobody off: the only thing left to do is take it off
  // this list (A3 Remove), and that is not a danger-red act.
  const verb = span.expired ? 'Remove from list' : 'Revoke';
  const busyWord = span.expired ? 'Removing…' : 'Revoking…';
  return (
    <li className="reg-row">
      <span className="reg-n mono" aria-hidden>{String(n).padStart(2, '0')}</span>
      <span className="reg-main">
        <strong>{link.audience} — {link.subject}</strong>
        <span className="note">{link.terms}</span>
        <span className="note">{reach}</span>
      </span>
      <span className="note mono reg-date">
        {span.expired ? span.word : days !== null && days >= 0 ? `expires ${ddmmyyyy(link.expiresOn)}` : ''}
      </span>
      <span className={span.urgent ? 'down' : 'note'} style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
        {span.expired ? '' : span.word}
      </span>
      <span className="row tight" style={{ flexWrap: 'nowrap' }}>
        {/* Every row's button names whose link it ends; three bare "Revoke"s
            cannot be told apart by a screen reader browsing buttons. */}
        <button type="button" className={span.expired ? 'btn sm' : 'btn sm danger'} disabled={revoke.isPending}
                aria-label={revoke.isPending ? undefined : span.expired
                  ? `Remove from list the expired link to ${link.audience} for ${link.subject}`
                  : `Revoke the link to ${link.audience} for ${link.subject}`}
                onClick={() => setAsking(true)}>
          {revoke.isPending ? busyWord : verb}
        </button>
      </span>

      {/* Cutting off a bank's loan desk mid-read is not undoable from this
          screen, so it is asked in a dialog rather than done on one click. */}
      {asking && (
        <Dialog
          title={span.expired
            ? `Remove the expired link to ${link.audience} from the list?`
            : `Revoke the link to ${link.audience}?`}
          busy={revoke.isPending}
          onClose={() => setAsking(false)}
          footer={
            <>
              <button type="button" className="btn" disabled={revoke.isPending}
                      onClick={() => setAsking(false)}>
                Cancel
              </button>
              <button type="button" className={span.expired ? 'btn primary' : 'btn danger'}
                      disabled={revoke.isPending}
                      onClick={() => { void kill(); }}>
                {revoke.isPending ? busyWord : span.expired ? 'Remove from list' : 'Revoke link'}
              </button>
            </>
          }
        >
          {span.expired ? (
            <p className="note">
              This link has already expired, so nobody loses access. It comes off this list; Activity still records it.
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
               placeholder="Search your properties by survey number, village or khata"
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
            <Chip>{extentText(c)}</Chip>
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

/** First read of a picker: the search box and the boxed rows it will hold. */
function SkPick({ label, lead }: { label: string; lead?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      <div aria-hidden>
        {/* RecordMultiPick opens with a lead line and a section eyebrow; hold both so nothing drops. */}
        {lead && <p className="note">{lead}</p>}
        <span className="search" style={{ width: '100%', minWidth: 0 }}><Sk w="14rem" h="0.8125rem" /></span>
        <div style={{ marginTop: 'var(--space-sm)' }}>
          {lead && <h3 className="eyebrow"><Sk w="6rem" h="0.75rem" /></h3>}
          <div className="rows boxed"><SkRowItems rows={5} /></div>
        </div>
      </div>
    </div>
  );
}

/** Multi-target picker for files such as an undivided FMB or a combined-site
 *  drone recording. Every entry comes from the owner's own property list. */
function RecordMultiPick({ cards, holdings, alreadyLinkedIds, chosen, onToggle, busy }: {
  cards: RecordCard[]; holdings: HoldingCard[]; alreadyLinkedIds: string[];
  chosen: Set<string>; onToggle: (id: string) => void; busy: boolean;
}) {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return {
      holdings: needle ? holdings.filter((c) =>
        `${c.name} ${c.placeLine} ${c.members.map((m) => m.title).join(' ')}`
          .toLowerCase().includes(needle)) : holdings,
      records: needle ? cards.filter((c) =>
        `${c.title} ${c.placeLine} ${c.khataNo} ${c.ownerName}`
          .toLowerCase().includes(needle)) : cards,
    };
  }, [cards, holdings, q]);
  const toggle = onToggle;
  return (
    <>
      <p className="note">Choose the properties and holdings this document belongs to.</p>
      <span className="search" style={{ width: '100%', minWidth: 0 }}>
        <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Search properties or holdings"
               aria-label="Search properties and holdings to link" />
      </span>
      <div style={{ marginTop: 'var(--space-sm)', maxHeight: 'min(50vh, 28rem)', overflowY: 'auto' }}>
        {matches.holdings.length > 0 && (
          <section aria-label={HOLDING_WORD.many}>
            <h3 className="eyebrow">{HOLDING_WORD.many}</h3>
            <div className="rows boxed">
              {matches.holdings.map((c) => (
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
                  <Chip>{alreadyLinkedIds.includes(c.id) ? 'Already linked' : 'Holding'}</Chip>
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
                  <Chip>{alreadyLinkedIds.includes(c.id) ? 'Already linked' : extentText(c)}</Chip>
                </label>
              ))}
            </div>
          </section>
        )}
        {matches.holdings.length === 0 && matches.records.length === 0 && (
          <p className="note">No property or holding matches “{q.trim()}”.</p>
        )}
      </div>
    </>
  );
}

/** Where one document is linked, opened from its menu entry of the same name
 *  (V4). Removing a link asks first, in the row, because on the server it
 *  also takes the document's photo row off that property. */
function LinkedPropertiesDialog({ paper, title, onClose, onLinkAnother }: {
  paper: Paper; title: string; onClose: () => void; onLinkAnother: () => void;
}) {
  const links = linkedPropertiesFor(paper);
  const unlink = useDeletePaper(false);
  const toast = useToast();
  const [error, setError] = useState('');
  const [asking, setAsking] = useState('');
  async function remove(documentId: string, property: { id: string; title: string }) {
    setError('');
    try {
      const result = (await unlink.mutateAsync({ paperId: documentId, recordId: property.id })).web.deletePaper;
      if (!result) { setError('The link could not be removed. Try again.'); return; }
      setAsking('');
      toast.ok(`${title} is no longer linked to ${property.title}.${links.length === 1 ? ' It stays in Documents.' : ''}`);
    } catch {
      setError('The link could not be removed. Try again.');
    }
  }
  return (
    <Dialog title="Linked properties and holdings" onClose={onClose} busy={unlink.isPending}
            footer={<span className="row tight">
              <button type="button" className="btn" onClick={onClose}>Done</button>
              <button type="button" className="btn primary" onClick={onLinkAnother}>
                Link to another property or holding
              </button>
            </span>}>
      <p className="note" style={{ marginTop: 0 }}>
        {links.length ? `${title} is linked to:` : `${title} is not linked to a property or holding yet.`}
      </p>
      {links.length > 0 && (
        <div className="rows boxed">
          {/* Server contract: link kind `combined` is the server's name for a holding. */}
          {links.map((property) => (
            <div key={property.id} className="row between">
              <span className="grow"><strong>{property.title}</strong></span>
              {asking === property.id ? (
                <span className="row tight" role="group" aria-label={`Remove the link to ${property.title}?`}>
                  <span className="note">Remove the link? The document stays in Documents.</span>
                  <button type="button" className="btn sm" disabled={unlink.isPending}
                          onClick={() => setAsking('')}>Cancel</button>
                  <button type="button" className="btn sm danger" disabled={unlink.isPending}
                          onClick={() => { void remove(property.documentId, property); }}>
                    {unlink.isPending ? 'Removing…' : 'Remove link'}
                  </button>
                </span>
              ) : (
                <span className="row tight">
                  <Link className="btn sm"
                        to={property.kind === 'combined'
                          ? `/holdings/${property.id}` : `/properties/${property.id}`}
                        onClick={onClose}>
                    {property.kind === 'combined' ? 'Open holding' : 'Open property'}
                  </Link>
                  <button type="button" className="btn sm" disabled={unlink.isPending}
                          aria-label={`Remove the link to ${property.title}`}
                          onClick={() => { setError(''); setAsking(property.id); }}>
                    Remove link
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
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
  const holdings = useHoldings();
  const link = useLinkPapers();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // Held here, not in the picker, so the one primary sits in the footer
  // beside Cancel the way every other dialog on this page pairs them.
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setChosen((before) => {
    const next = new Set(before);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  async function fileTo(recordIds: string[]) {
    if (busy || !recordIds.length) return;
    setBusy(true);
    try {
      const result = (await link.mutateAsync({ paperIds, recordIds })).web.linkPapers;
      if (!result) {
        toast.bad('Those documents could not be linked. Nothing has changed.');
        return;
      }
      onClose();
    } catch {
      // The mutation reports its own failure and leaves the picker open.
    } finally {
      setBusy(false);
    }
  }

  const ready = !!data && !!holdings.data && (data.cards.length > 0 || holdings.data.length > 0);
  return (
    <Dialog title={paperIds.length === 1 ? 'Link to a property or holding'
              : `Link ${paperIds.length} documents to a property or holding`}
            onClose={onClose} busy={busy}
            footer={<>
              <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
              {ready && (
                <button type="button" className="btn primary" disabled={!chosen.size || busy}
                        onClick={() => { void fileTo([...chosen]); }}>
                  {busy ? 'Linking…' : chosen.size
                    ? `Link to ${plural(chosen.size, 'property or holding', 'properties or holdings')}`
                    : 'Choose a property or holding'}
                </button>
              )}
            </>}>
      {(isLoading || holdings.isLoading) && <SkPick label="Loading your properties and holdings"
                                                           lead="Choose the properties and holdings this document belongs to." />}
      {!isLoading && !data && <Failed what="Your properties" error={error} h="10rem" />}
      {!holdings.isLoading && !holdings.data && (
        <Failed what="The holdings list" error={holdings.error} h="10rem" />
      )}
      {data && holdings.data && data.cards.length === 0 && holdings.data.length === 0 && (
        <Empty icon="parcel" title="Add a property or holding first"
               action={<Link className="btn" to="/properties" onClick={onClose}>Properties</Link>} />
      )}
      {/* While linking, the picker stays put and inert (busy) and the footer says "Linking…". */}
      {ready && data && holdings.data && (
        <RecordMultiPick cards={data.cards} holdings={holdings.data}
                         alreadyLinkedIds={alreadyLinkedIds}
                         chosen={chosen} onToggle={toggle} busy={busy} />)}
    </Dialog>
  );
}

/**
 * A link out, made from the vault.
 *
 * The button here said "Share a set" and did nothing. A set is not a thing the
 * API can share: `createShareLink` takes one recordId, one audience, terms and
 * a span — so the control now says what it can actually do, asks which
 * property, and makes the link on the same 30-day terms the record's own
 * Share panel uses (`terms: 'view'`, which the recipient page still lets them
 * download from — said as "view and download" in both places). The new link appears in the list behind this dialog.
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
        {isLoading && <SkPick label="Loading your properties" />}
        {!isLoading && !data && <Failed what="Your properties" error={error} h="10rem" />}
        {data && data.cards.length === 0 && (
          <Empty icon="parcel" title="Nothing to share yet"
                 action={<Link className="btn" to="/properties" onClick={onClose}>Properties</Link>} />
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

/** Share chosen documents, wherever they are filed — not a property. The link
 *  carries exactly these documents, on the same 30-day view-and-download
 *  terms a property link has, and joins the register under the list. */
function ShareDocuments({ papers, titleOf, onClose }: {
  papers: Paper[]; titleOf: (p: Paper) => string; onClose: () => void;
}) {
  const share = useCreateDocumentShareLink();
  const toast = useToast();
  const [audience, setAudience] = useState('');
  const [sharePath, setSharePath] = useState('');
  const one = papers.length === 1;

  const make = async (e: FormEvent) => {
    e.preventDefault();
    if (!audience.trim()) return;
    try {
      const made = (await share.mutateAsync({
        documentIds: papers.map((p) => p.id), audience: audience.trim(), terms: 'view', days: 30,
      })).web.createDocumentShareLink;
      if (!made) {
        toast.bad(`No link was made for ${audience.trim()}. ${one ? 'This document' : 'One of these documents'} may no longer be yours to share.`);
        return;
      }
      setSharePath(made);
    } catch {
      return;
    }
  };

  return (
    <Dialog
      title={one ? `Share ${titleOf(papers[0])}` : `Share ${plural(papers.length, 'document')}`}
      busy={share.isPending}
      dismissable={false}
      initialFocus="#vault-share-audience"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" disabled={share.isPending} onClick={onClose}>
            {sharePath ? 'Done' : 'Cancel'}
          </button>
          {!sharePath && (
            <button type="submit" form="vault-share-docs" className="btn primary"
                    disabled={!audience.trim() || share.isPending}>
              {share.isPending ? 'Making the link…' : 'Make the link'}
            </button>
          )}
        </>
      }
    >
      {sharePath ? <ShareResult path={sharePath} /> : (
        <form id="vault-share-docs" onSubmit={(e) => { void make(e); }}
              style={{ display: 'grid', gap: 'var(--space-sm)' }}>
          {!one && (
            <ul className="note" style={{ margin: 0, paddingInlineStart: '1.25rem' }}>
              {papers.slice(0, 5).map((p) => <li key={p.id}>{titleOf(p)}</li>)}
              {papers.length > 5 && <li>and {plural(papers.length - 5, 'more document')}</li>}
            </ul>
          )}
          <div className="field">
            <label htmlFor="vault-share-audience">Who the link is for</label>
            <input id="vault-share-audience" type="text" value={audience} autoComplete="off"
                   placeholder="A name, a firm" onChange={(e) => setAudience(e.target.value)} />
          </div>
          <p className="note" style={{ margin: 0 }}>
            Anyone with the link can view and download {one ? 'this document' : 'these documents'} for 30 days.
          </p>
        </form>
      )}
    </Dialog>
  );
}

type Layout = 'table' | 'grid';
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
    return localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'table';
  } catch {
    return 'table';
  }
}

/** The small line under a name: the file it arrived as (when the title is not
 *  already that), what it is, and its size. */
function fileLine(paper: Paper): string {
  const kind = fileKindOf(paper.mimeType, paper.fileName || paper.title);
  return [paperFileName(paper), displayDetail(paper.detail) || FILE_KIND_LABEL[kind],
    formatBytes(paper.sizeBytes ?? 0)].filter(Boolean).join(' · ');
}

/** Documents before folders, as every count line on the page reads. */
const folderLine = (f: VaultFolder) =>
  [plural(f.fileCount, 'document'), f.folderCount ? plural(f.folderCount, 'folder') : '']
    .filter(Boolean).join(' · ');

const shelfWord = (shelf: string) => SHELF_FILTERS.find(([key]) => key === shelf)?.[1] ?? 'Not sorted yet';
const ico = (G: typeof EditOutlined) => <G sx={{ fontSize: 16 }} aria-hidden />;

export function Vault() {
  const vault = useVault();
  const data = vault.data;
  const nav = useNavigate();
  const location = useLocation();
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
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [naming, setNaming] = useState<{ folder?: VaultFolder } | null>(null);
  const [removing, setRemoving] = useState<VaultFolder | null>(null);
  const [removeError, setRemoveError] = useState('');
  const [moving, setMoving] = useState<{ paperIds: string[]; folder?: VaultFolder } | null>(null);
  const [moveError, setMoveError] = useState('');
  const [tagging, setTagging] = useState<string[] | null>(null);
  const [tagError, setTagError] = useState('');
  const [editingTagsId, setEditingTagsId] = useState('');
  const [renaming, setRenaming] = useState<Paper | null>(null);
  const [detailing, setDetailing] = useState<Paper | null>(null);
  const [deleting, setDeleting] = useState<Paper | null>(null);
  const [typing, setTyping] = useState<Paper[] | null>(null);
  const [sharing, setSharing] = useState<Paper[] | null>(null);
  // The folder (or '' for the top level) a drag is hovering over right now.
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const addTrigger = useRef<HTMLButtonElement & HTMLAnchorElement>(null);
  const allPapers = useVaultPapers('all');
  const vaultFolders = useVaultFolders();
  // Holdings and who is in them, so a file filed against one member
  // property is found under the view that property belongs to.
  const holdingsQuery = useHoldings();
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
  // at once, so a reload or a shared link does not reopen it. Sharing a whole
  // property lives on the property's page; Home's "Share a property" shortcut
  // still lands here and opens the property picker.
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
  const nameOf = (id: string) => (id ? folderById.get(id)?.name ?? 'that folder' : 'Documents');
  const folderHref = (id: string) => (id ? `/papers?folder=${encodeURIComponent(id)}` : '/papers');
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
  const needle = q.trim().toLowerCase();
  const filtering = !!needle || faceted;
  // A new search or filter drops the selection rather than act on rows it hid.
  useEffect(() => { setSelected(new Set()); }, [needle, facets]);

  // A link whose date has passed is not "out right now", and counting it as
  // though it were is how an owner comes to believe a stranger still has
  // access — or that they no longer do.
  const [live, lapsed] = useMemo(() => {
    const all = data?.links ?? [];
    return [all.filter((l) => !spanOf(l).expired), all.filter((l) => spanOf(l).expired)];
  }, [data?.links]);

  const files = useMemo(() => oneRowPerFile(allPapers.data ?? []), [allPapers.data]);
  /** What a document is called here: what it is, not its file name. */
  const titleOf = (p: Paper) => paperTitle(p);
  const holdingRows = useMemo(() => holdingsQuery.data ?? [], [holdingsQuery.data]);
  /** Individual properties a file is linked to — holdings are not one.
   *  Server contract: link kind `combined` is the server's name for a holding. */
  const propertiesOf = (p: Paper) => linkedPropertiesFor(p).filter((l) => l.kind !== 'combined');
  /** Holdings a file belongs to: linked to the view itself, or to any of
   *  its member properties. */
  const holdingsOf = useMemo(() => {
    const viewsOfRecord = new Map<string, string[]>();
    for (const c of holdingRows) {
      for (const m of c.members) viewsOfRecord.set(m.recordId, [...(viewsOfRecord.get(m.recordId) ?? []), c.id]);
    }
    return (p: Paper): string[] => [...new Set(linkedPropertiesFor(p).flatMap((l) =>
      l.kind === 'combined' ? [l.id] : viewsOfRecord.get(l.id) ?? []))];
  }, [holdingRows]);
  const holdingName = useMemo(() => {
    const names = new Map(holdingRows.map((c) => [c.id, c.name]));
    for (const p of files) {
      for (const l of linkedPropertiesFor(p)) if (l.kind === 'combined' && !names.has(l.id)) names.set(l.id, l.title);
    }
    return names;
  }, [holdingRows, files]);
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
    const kinds = tally((p) => [fileKindOf(p.mimeType, p.fileName || p.title)]);
    const props = new Map<string, string>();
    for (const p of files) for (const l of propertiesOf(p)) props.set(l.id, l.title);
    const propCount = tally((p) => propertiesOf(p).map((l) => l.id));
    const viewCount = tally(holdingsOf);
    const linked = tally((p) => [linkedPropertiesFor(p).length ? 'linked' : 'unlinked']);
    const tags = tally((p) => p.tags);
    const groups: FacetFilterGroup[] = [
      { key: 'shelf', label: 'Type', options: SHELF_FILTERS.filter(([k]) => k !== 'all' && shelves.get(k))
        .map(([k, label]) => ({ key: k, label, count: shelves.get(k) ?? 0 })) },
      { key: 'kind', label: 'Format', options: [...kinds].sort((a, b) => b[1] - a[1])
        .map(([k, count]) => ({ key: k, label: FILE_KIND_LABEL[k as FileKind], count })) },
      { key: 'property', label: 'Property', options: [...propCount]
        .sort((a, b) => (props.get(a[0]) ?? '').localeCompare(props.get(b[0]) ?? ''))
        .map(([k, count]) => ({ key: k, label: props.get(k) ?? 'Property', count })) },
      { key: 'holding', label: 'Holding', options: [...viewCount]
        .sort((a, b) => (holdingName.get(a[0]) ?? '').localeCompare(holdingName.get(b[0]) ?? ''))
        .map(([k, count]) => ({ key: k, label: holdingName.get(k) ?? 'Holding', count })) },
      { key: 'linked', label: 'Linked', options: (['linked', 'unlinked'] as const).filter((k) => linked.get(k))
        .map((k) => ({ key: k, label: k === 'linked' ? 'Linked to a property or holding' : 'Not linked',
                       count: linked.get(k) ?? 0 })) },
      { key: 'tag', label: 'Tag', options: [...tags].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, count]) => ({ key: k, label: k, count })) },
    ];
    return groups.filter((g) => g.options.length > 0);
    // propertiesOf reads nothing from state; holdingsOf and the view names are listed.
  }, [files, holdingsOf, holdingName]);
  const selectionRows = useMemo(() => {
    const matches = files.filter((p) => (filtering || placeOf(p) === currentFolder)
      && (!facets.shelf.length || facets.shelf.includes(p.shelf || 'unsorted'))
      && (!facets.kind.length || facets.kind.includes(fileKindOf(p.mimeType, p.fileName || p.title)))
      && (!facets.property.length || propertiesOf(p).some((l) => facets.property.includes(l.id)))
      && (!facets.holding.length || holdingsOf(p).some((id) => facets.holding.includes(id)))
      && (!facets.linked.length
        || facets.linked.includes(linkedPropertiesFor(p).length ? 'linked' : 'unlinked'))
      && (!facets.tag.length || p.tags.some((t) => facets.tag.includes(t)))
      // What it is called here and what it arrived as, its line, tags, type
      // and every property or holding it reaches.
      && (!needle || [paperTitle(p), p.title, p.fileName ?? '', p.detail, p.docNo ?? '', p.tags.join(' '),
        shelfWord(p.shelf), linkedPropertiesFor(p).map((l) => l.title).join(' '),
        holdingsOf(p).map((id) => holdingName.get(id) ?? '').join(' ')]
        .join(' ').toLowerCase().includes(needle)));
    return matches.sort((a, b) => sortMode === 'recent'
      ? b.createdAt.localeCompare(a.createdAt) || paperTitle(a).localeCompare(paperTitle(b))
      : sortMode === 'name-asc'
        ? paperTitle(a).localeCompare(paperTitle(b)) : paperTitle(b).localeCompare(paperTitle(a)));
    // placeOf reads folderById, which is in the list.
  }, [files, needle, facets, sortMode, filtering, currentFolder, folderById, holdingsOf, holdingName]);
  // Folders sit above the files: the open folder's own, or — while a search
  // (and nothing else) narrows the list — every folder whose name matches.
  const subfolders = useMemo(() => (faceted ? [] : folders
    .filter((f) => (needle
      ? f.name.toLowerCase().includes(needle)
      : (f.parentId && folderById.has(f.parentId) ? f.parentId : '') === currentFolder))
    .sort((a, b) => (sortMode === 'name-desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)))),
  [faceted, needle, folders, folderById, currentFolder, sortMode]);
  const pageCount = Math.max(1, Math.ceil(selectionRows.length / FILES_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = selectionRows.slice((currentPage - 1) * FILES_PER_PAGE, currentPage * FILES_PER_PAGE);
  // Folders sit above the files, on the first page only — they are the way
  // in, not more of the list.
  const folderRows = currentPage === 1 ? subfolders : [];
  // Only what is on screen counts: a row a filter has hidden is not acted on.
  const chosenRows = selectionRows.filter((p) => selected.has(p.id));
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
  /** Clearing the selection takes the bar away, so the keyboard is handed to
   *  the select-all box (or the list) rather than dropped on <body>. */
  const clearSelection = () => {
    setSelected(new Set());
    requestAnimationFrame(() => {
      (listRef.current?.querySelector<HTMLInputElement>('.vault-file-header input') ?? listRef.current)?.focus();
    });
  };

  // ── Moving things ───────────────────────────────────────────────────
  // From a dialog, a refusal is said inside the dialog and it stays open;
  // from a drag there is no dialog, so it is a toast.
  async function moveFiles(paperIds: string[], folderId: string, fromDialog: boolean) {
    setMoveError('');
    const refused = 'Those documents could not be moved. Nothing has changed.';
    try {
      const n = (await movePapers.mutateAsync({ paperIds, folderId })).web.movePapersToFolder;
      if (!n) {
        if (fromDialog) setMoveError(refused); else toast.bad(refused);
        return;
      }
      setMoving(null);
      setSelected(new Set());
      toast.ok(`${plural(n, 'document')} moved to ${nameOf(folderId)}.`);
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
      toast.ok(`“${folder.name}” is deleted. What was in it is now in ${nameOf(parentOf(folder))}.`);
    } catch (err) {
      setRemoveError(reasonOf(err) || 'The folder could not be deleted. Nothing has changed.');
    }
  }

  async function tagAll(word: string) {
    if (!tagging) return;
    setTagError('');
    try {
      const n = (await tagPapers.mutateAsync({ paperIds: tagging, tag: word, on: true })).web.tagPapers;
      setTagging(null);
      setSelected(new Set());
      toast.ok(n ? `Tagged ${plural(n, 'document')} “${word}”.` : `Those documents already carry “${word}”.`);
    } catch (err) {
      setTagError(reasonOf(err) || 'That tag could not be saved. Nothing has changed.');
    }
  }

  async function download(paper: Paper) {
    try {
      const blob = await fetchFileBlob(paper.fileRef);
      downloadBlob(blob, fileNameFor(titleOf(paper), blob.type || paper.mimeType));
    } catch (e) {
      // A storage read is not a w360 mutation, so it raises its own toast.
      toast.bad('That file could not be downloaded. The document itself is unchanged.', e);
    }
  }

  // ── Drag and drop ───────────────────────────────────────────────────
  // Files and folders drag onto a folder, or onto a crumb of the path above
  // the list. Every drag has a keyboard twin: "Move to a folder" on the row's
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

  // ── What state the page is in ───────────────────────────────────────
  // The list is ready when the files AND the folder tree have answered: a
  // filed document shown at the top level while folders load would jump.
  const filesReady = !!allPapers.data && !vaultFolders.isLoading;
  // A null where the schema promises a list is a broken answer, not an empty
  // library — said as a failure, never as "no documents yet".
  const papersFailed = !!allPapers.error || (allPapers.isSuccess && !allPapers.data);
  const vaultFailed = vault.isError || (vault.isSuccess && !vault.data);
  // An account with nothing in it, as opposed to a filter that matched none:
  // no head actions, no filter row, no share register — one box, one action.
  const virgin = filesReady && files.length === 0 && !!vaultFolders.data && folders.length === 0;
  const nothingHere = selectionRows.length === 0 && folderRows.length === 0;
  const inFolder = !filtering && !!currentFolder;
  /** Folder is a column only while the list is flat across folders (a search
   *  or a filter). Unfiltered, every row already sits in the folder on screen,
   *  so the column was blank on every row. */
  const folderCol = filtering;
  const emptyFolder = filesReady && inFolder && nothingHere;
  const foldersKnown = !!vaultFolders.data;
  const heading = filtering ? 'All folders' : here?.name ?? 'Documents';

  /** Where a row lives, said only while the list is flat across folders. */
  const whereLine = (paper: Paper): ReactNode => {
    if (!filtering) return null;
    const at = placeOf(paper);
    // "Ravi › Aadhaar" rather than one of several folders called Aadhaar.
    const label = folderLabel({ folderId: at, linkedProperties: [] }, folderById);
    const name = label.kind === 'folder' ? label.text : nameOf(at);
    return (
      <button type="button" className="vault-where" onClick={() => openFolder(at)}
              aria-label={`Open ${name}, where ${titleOf(paper)} is kept`}>
        in {name}
      </button>
    );
  };
  const tagsOf = (paper: Paper): ReactNode => (paper.tags.length > 0 && (
    <span className="vault-tags">
      {paper.tags.map((t) => (
        <Tag key={t} label={`Show documents tagged ${t}`}
             onClick={() => { if (!facets.tag.includes(t)) toggleFacet('tag', t); }}>{t}</Tag>
      ))}
    </span>
  ));
  // Folder: only where the file is kept — blank at the top level. Words, not
  // a link: a press on the row opens the file; "in …" below the name (while
  // the list is flat) is the way into the folder.
  const folderCellOf = (paper: Paper): ReactNode => {
    const at = folderLabel({ folderId: placeOf(paper), linkedProperties: [] }, folderById);
    return at.kind === 'folder' ? <span className="vault-link-text" title={at.text}>{at.text}</span> : null;
  };
  // Linked to: the properties and holdings it is filed against, the first by
  // name and the rest counted, the whole list in the title. Words, never a
  // link away from the file the row belongs to.
  const linkedCellOf = (paper: Paper): ReactNode => {
    const at = linkedLabel(linkedPropertiesFor(paper));
    if (at.kind === 'none') return <span className="vault-link-text unlinked">{at.text}</span>;
    return (
      <span className="vault-link-text" title={at.all}>
        {at.text}{at.more > 0 && <span className="note"> +{at.more}</span>}
      </span>
    );
  };
  /** A press anywhere on a row or tile that is not one of its own controls
   *  opens the file, the way a file manager does. */
  /** ⓘ beside a passbook: one book lists many survey numbers (University guide). */
  const passbookInfo = (paper: Paper) =>
    /passbook/i.test(titleOf(paper)) && <InfoLink label="passbooks" href={passbookGuideHref(null)} />;
  const openFromRow = (e: MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest('a, button, input, label, select, [role="menuitem"]')) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    setPreview(id);
  };
  const here_ = `${location.pathname}${location.search}`;
  /** One document's actions, the house kebab (ui.tsx Menu): what to do with
   *  it, then where it belongs, then what it is, then Delete. */
  const fileMenu = (paper: Paper): MenuItem[] => {
    const joint = !!paper.jointFmbId;
    const items: MenuItem[] = [
      { label: 'Open', icon: ico(ArrowForwardOutlined),
        onClick: () => nav(`/papers/${paper.id}`, { state: { from: here_ } }) },
      { label: 'Preview', icon: ico(VisibilityOutlined), onClick: () => setPreview(paper.id) },
    ];
    if (isStorageRef(paper.fileRef)) {
      items.push({ label: 'Download', icon: ico(FileDownloadOutlined), onClick: () => { void download(paper); } });
    }
    // A kept Aadhaar card is a person's identity, never put on land or sent
    // out on a link (the server refuses both), so it offers neither.
    if (!paper.aadhaarCard) {
      items.push({ label: 'Share', icon: ico(IosShareOutlined), onClick: () => setSharing([paper]) });
      items.push(linkedPropertiesFor(paper).length > 0
        ? { label: 'Linked properties and holdings', icon: ico(LinkOutlined), rule: true,
            onClick: () => setViewingLinksId(paper.id) }
        : { label: 'Link to a property or holding', icon: ico(LinkOutlined), rule: true,
            onClick: () => setLinking([paper.id]) });
    }
    if (foldersKnown) {
      items.push({ label: 'Move to a folder', icon: ico(DriveFileMoveOutlined), rule: !!paper.aadhaarCard,
        onClick: () => { setMoveError(''); setMoving({ paperIds: [paper.id] }); } });
    }
    items.push({ label: 'Edit tags', icon: ico(LocalOfferOutlined), onClick: () => setEditingTagsId(paper.id) });
    if (!joint) {
      items.push({ label: 'Rename', icon: ico(EditOutlined), rule: true, onClick: () => setRenaming(paper) });
      items.push({ label: 'Edit details', icon: ico(EditNoteOutlined), onClick: () => setDetailing(paper) });
    }
    if (!paper.aadhaarCard) {
      items.push({ label: 'Add a property from this document', icon: ico(AddHomeOutlined),
        rule: joint, onClick: () => setCreateFrom(paper) });
    }
    if (!joint) {
      items.push({ label: 'Delete this document', icon: ico(DeleteOutlineOutlined), danger: true, rule: true,
        onClick: () => setDeleting(paper) });
    }
    return items;
  };
  const folderMenu = (folder: VaultFolder): MenuItem[] => [
    { label: 'Open folder', icon: ico(ArrowForwardOutlined), onClick: () => openFolder(folder.id) },
    { label: 'Rename folder', icon: ico(EditOutlined), onClick: () => setNaming({ folder }) },
    { label: 'Move to a folder', icon: ico(DriveFileMoveOutlined),
      onClick: () => { setMoveError(''); setMoving({ paperIds: [], folder }); } },
    { label: 'Delete folder', icon: ico(DeleteOutlineOutlined), danger: true, rule: true,
      onClick: () => { setRemoveError(''); setRemoving(folder); } },
  ];
  const fileKebab = (paper: Paper) => (
    <Menu label={`Actions for ${titleOf(paper)}`} header={titleOf(paper)} items={fileMenu(paper)} />
  );
  const folderKebab = (folder: VaultFolder) => (
    <Menu label={`Actions for the folder ${folder.name}`} header={folder.name} items={folderMenu(folder)} />
  );
  const thumbOf = (paper: Paper): ReactNode => {
    const kind = fileKindOf(paper.mimeType, paper.fileName || paper.title);
    const glyph = <FileKindGlyph kind={kind} size={40} />;
    if (kind === 'image') {
      return <PhotoImg fileRef={paper.fileRef} alt="" thumb={320} className="vault-thumb-img" fallback={glyph} />;
    }
    if (kind === 'video') return <VideoThumb fileRef={paper.fileRef} fallback={glyph} />;
    return glyph;
  };
  const turnPage = (to: number) => {
    setPage(to);
    // The rows above changed; take the reader to the top of them.
    requestAnimationFrame(() => {
      listRef.current?.scrollIntoView({ block: 'start' });
      listRef.current?.focus({ preventScroll: true });
    });
  };
  const shareable = chosenRows.filter((p) => !p.aadhaarCard);
  // Header box: every document the filter lets through, not just this page.
  const toggleAll = () => setSelected(chosenRows.length === selectionRows.length
    ? new Set() : new Set(selectionRows.map((p) => p.id)));
  // The ticked rows as CSV, in the columns the list shows.
  const exportChosen = () => {
    const head = ['Name', ...(folderCol ? ['Folder'] : []), 'Linked to', 'Type'];
    const rows = chosenRows.map((p) => {
      const at = folderLabel({ folderId: placeOf(p), linkedProperties: [] }, folderById);
      const linked = linkedLabel(linkedPropertiesFor(p));
      return [titleOf(p), ...(folderCol ? [at.kind === 'folder' ? at.text : ''] : []),
        linked.kind === 'none' ? '' : linked.all, `${shelfWord(p.shelf)}${p.shared ? ' · Shared' : ''}`];
    });
    try { downloadCsv('documents.csv', [head, ...rows]); } catch { toast.bad('The export could not be saved. Try again.'); }
  };

  // The share register belongs to the top level of Documents, with nothing
  // narrowing it, and only once there is a link to list.
  const showRegister = !virgin && !currentFolder && !filtering
    && (vaultFailed || live.length + lapsed.length > 0);

  /** The head's commands (design.md § Page head): New folder outlined, then
   *  Add documents as the one filled primary. New folder is not offered while
   *  a search or filter spans every folder. */
  const headActions: HeadActions = {
    secondaries: filtering ? [] : [{
      label: 'New folder', icon: <CreateNewFolderOutlined sx={{ fontSize: 16 }} />,
      disabled: !foldersKnown, onClick: () => setNaming({}),
    }],
    primary: {
      label: 'Add documents', icon: <FileUploadOutlined sx={{ fontSize: 16 }} />,
      ref: addTrigger, onClick: () => setPanel('add'),
    },
  };
  /** Figures, like every page under Your portfolio: every document and every
   *  folder, then where they are kept — a fact, so it is said here and not
   *  behind an ⓘ (F19). A count of none is not a figure, and a documents
   *  read that failed with nothing in hand draws no line: the Failed card
   *  speaks (a failed refetch keeps the line it had, as Properties does). */
  // The server's note can hold several facts ("Stored in … · backed up …");
  // each is its own, with the shield on the first.
  const [kept, ...noted] = data ? data.regionNote.split(' · ') : [];
  const residency: ReactNode[] = data ? [
    <><span className="up"><GppGoodOutlined sx={{ fontSize: 15, verticalAlign: '-0.2em', mr: '0.25rem' }} aria-hidden /></span>{kept}</>,
    ...noted,
    'Private unless shared',
  ] : [];
  const counted = [
    files.length ? plural(files.length, 'document') : '',
    folders.length ? plural(folders.length, 'folder') : '',
  ];
  const facts = [...counted.filter(Boolean), ...residency];
  // Each fact unbroken, its "·" kept with it, so a phone wraps the line
  // between facts and never inside one (the shield stays with its place).
  const summary: ReactNode = !filesReady && !papersFailed
    ? <Sk w="18rem" h="1rem" r="var(--radius-xs)" />
    : filesReady && facts.length
      ? facts.flatMap((f, i) => [
        i > 0 ? ' ' : null,
        <span key={i} style={{ whiteSpace: 'nowrap' }}>{f}{i < facts.length - 1 && ' ·'}</span>,
      ])
      : undefined;

  return (
    <main>
      {/* No eyebrow: a top-level page does not repeat its rail label above
          its title (design.md § Page head). Nothing in the head on an empty
          account: the one thing to do is the empty state's own button, and
          offering it twice reads as two acts. */}
      <PageHead title="Documents" actions={virgin ? undefined : headActions} summary={virgin ? undefined : summary} />

      <section className="vault-files" aria-labelledby="files-heading">
        <h2 id="files-heading" className="sr-only">
          {heading}
          {filesReady && ` · ${plural(selectionRows.length, 'document')}`}
          {filesReady && folderRows.length > 0 && ` · ${plural(subfolders.length, 'folder')}`}
        </h2>
        {/* Where you are, said only when it is somewhere other than the top
            level the page title already names: a folder's path, or "All
            folders" while a search or filter spans them. */}
        {filesReady && (filtering || currentFolder) && (
          <PlaceLine>
            {filtering ? (
              <>
                <span aria-hidden>Documents</span>
                <strong aria-hidden>All folders</strong>
              </>
            ) : (
              <Crumbs label="Folder path" trail={[
                { label: 'Documents', to: folderHref(''),
                  props: { ...dropOnto(''), className: `vault-crumb${dropClass('')}` } },
                ...trail.map((f) => ({
                  label: f.name, to: folderHref(f.id),
                  props: { ...dropOnto(f.id), className: `vault-crumb${dropClass(f.id)}` },
                })),
              ]} />
            )}
          </PlaceLine>
        )}

        {filesReady && !virgin && (
          <FacetFilter
            groups={facetGroups}
            selected={facets}
            onToggle={toggleFacet}
            onClear={clearFilters}
            ariaLabel="Narrow your documents"
            groupLabel={(key, group) => group?.label ?? FACET_WORD[key as FacetKey] ?? key}
            tally={filtering ? `${selectionRows.length} of ${files.length} shown` : undefined}
            extraChips={q.trim() ? [{
              id: 'q', group: 'Search', label: q.trim(),
              removeLabel: `Clear the search for ${q.trim()}`,
              onRemove: () => { setQ(''); setPage(1); },
            }] : []}
            // Search spans every owned file and folder name.
            search={(
              <BandSearch
                value={q}
                onChange={(v) => { setQ(v); setPage(1); }}
                placeholder="Search documents"
                label="Search documents, folders, tags, types or linked properties"
                inputRef={vaultSearch}
              />
            )}
            sort={!emptyFolder && (
              <SortCycle
                label={SORTS.find((x) => x.key === sortMode)?.label ?? ''}
                onNext={() => {
                  const at = SORTS.findIndex((x) => x.key === sortMode);
                  setSortMode(SORTS[(at + 1) % SORTS.length].key);
                  setPage(1);
                }}
              />
            )}
            view={(!nothingHere || filtering) && (
              <ViewToggle views={['grid', 'table']} value={layout} onChange={setLayout} />
            )}
          />
        )}

        {vaultFolders.error && (
          <Failed what="Your folders" error={vaultFolders.error} onRetry={() => { void vaultFolders.refetch(); }} h="6rem" />
        )}

        {/* Waiting holds the shape of the remembered view, so nothing jumps. */}
        {!filesReady && !papersFailed && (
          <div role="status" aria-busy="true">
            <p className="sr-only">Loading your documents…</p>
            {layout === 'table' ? (
              <Card flush style={{ overflow: 'hidden' }}>
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="vault-file-row">
                    <Sk w="18px" h="18px" r="var(--radius-xs)" />
                    <span className="vault-name-cell"><Sk w="20px" h="20px" r="var(--radius-xs)" /><Sk w="60%" h="0.875rem" /></span>
                    <Sk w="60%" h="0.75rem" /><Sk w="70%" h="0.75rem" /><Sk w="60%" h="0.75rem" /><span />
                  </div>
                ))}
              </Card>
            ) : (
              <div className="vault-grid" aria-hidden>
                {Array.from({ length: 8 }, (_, i) => <Sk key={i} h="12rem" r="var(--radius-md)" />)}
              </div>
            )}
          </div>
        )}
        {papersFailed && (
          <Failed what="Your documents" error={allPapers.error} onRetry={() => { void allPapers.refetch(); }} boxed h="12rem" />
        )}

        {virgin && (
          <Empty boxed h="26rem" icon="paper" title="No documents yet"
                 action={(
                   <button ref={addTrigger} type="button" className="btn primary" onClick={() => setPanel('add')}>
                     <FileUploadOutlined sx={{ fontSize: 16 }} /> Add documents
                   </button>
                 )}>
            Add a deed, a passbook or a survey sheet. It stays private unless you share it.
          </Empty>
        )}

        {/* Narrowed to nothing: the house panel and its one remedy. */}
        {filesReady && !virgin && filtering && nothingHere && (
          <div className="emptypanel">
            <h3>{q.trim() && !faceted ? `No document matches “${q.trim()}”` : 'No documents match these filters'}</h3>
            <p className="note" style={{ maxWidth: '26rem' }}>
              {plural(files.length, 'document')} {files.length === 1 ? 'is' : 'are'} hidden by {faceted ? 'these filters' : 'this search'}.
            </p>
            <button type="button" className="btn" onClick={clearFilters}>Clear all</button>
          </div>
        )}
        {emptyFolder && (
          <div {...dropOnto(currentFolder)} className={`vault-drop-zone${dropClass(currentFolder)}`}>
            <Empty boxed h="14rem" icon="folder" title="This folder is empty">
              Add documents here, drag documents onto it, or choose Move to a folder on any document.
            </Empty>
          </div>
        )}

        {filesReady && !nothingHere && layout === 'table' && (
          <Card flush style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <div ref={listRef} role="table" aria-label="Your private documents" tabIndex={-1}
                   className={`vault-file-grid${folderCol ? '' : ' no-folder-col'}`}>
                <div role="row" className="note vault-file-row vault-file-header">
                  <span role="columnheader">
                    <label className="vault-check">
                      <SelectAllBox total={selectionRows.length} picked={chosenRows.length}
                                    noun={['document', 'documents']} onToggle={toggleAll} />
                    </label>
                  </span>
                  <span role="columnheader">Name</span>
                  {folderCol && <span role="columnheader" className="vc-folder">Folder</span>}
                  <span role="columnheader" className="vc-linked">Linked to</span>
                  <span role="columnheader" className="vc-type">Type</span>
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
                        <Link to={folderHref(folder.id)} className="vault-name" title={folder.name}
                              onClick={(e) => {
                                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                                e.preventDefault(); openFolder(folder.id);
                              }}>{folder.name}</Link>
                        <span className="note vault-line">{folderLine(folder)}</span>
                      </span>
                    </span>
                    {folderCol && <span role="cell" className="vc-folder" />}
                    <span role="cell" className="vc-linked" />
                    <span role="cell" className="note vc-type">Folder</span>
                    <span role="cell" style={{ justifySelf: 'end' }}>{folderKebab(folder)}</span>
                  </div>
                ))}
                {pageRows.map((paper) => (
                  <div key={paper.id} role="row" draggable
                       className={`vault-file-row opens${selected.has(paper.id) ? ' selected' : ''}`}
                       onClick={(e) => openFromRow(e, paper.id)}
                       onDragStart={(e) => dragFiles(e, paper)} onDragEnd={() => setDropTarget(null)}>
                    <span role="cell">
                      <label className="vault-check">
                        <input type="checkbox" checked={selected.has(paper.id)}
                               aria-label={`Select ${titleOf(paper)}`}
                               onChange={() => toggleSelected(paper)} />
                      </label>
                    </span>
                    <span role="cell" className="vault-name-cell">
                      <FileKindGlyph kind={fileKindOf(paper.mimeType, paper.fileName || paper.title)} />
                      <span style={{ minWidth: 0 }}>
                        <span className="vault-name-line">
                          <Link to={`/papers/${paper.id}`} onClick={(e) => openPreview(e, paper.id)}
                                state={{ from: here_ }}
                                className="vault-name" draggable={false} title={titleOf(paper)}>
                            {titleOf(paper)}
                          </Link>
                          {passbookInfo(paper)}
                        </span>
                        <span className="note vault-line">{fileLine(paper)}{whereLine(paper) && ' · '}{whereLine(paper)}</span>
                        {tagsOf(paper)}
                        <span className="note vault-mobile-property">
                          {linkedPropertiesFor(paper).length
                            ? plural(linkedPropertiesFor(paper).length, 'linked property', 'linked properties')
                            : 'Not linked'}
                        </span>
                      </span>
                    </span>
                    {folderCol && <span role="cell" className="vc-folder" style={{ minWidth: 0 }}>{folderCellOf(paper)}</span>}
                    <span role="cell" className="vc-linked" style={{ minWidth: 0 }}>{linkedCellOf(paper)}</span>
                    <span role="cell" className="note vc-type">
                      {shelfWord(paper.shelf)}
                      {paper.shared && <span style={{ marginLeft: 6 }}>· Shared</span>}
                    </span>
                    <span role="cell" style={{ justifySelf: 'end' }}>{fileKebab(paper)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {filesReady && !nothingHere && layout === 'grid' && (
          <>
            {/* Folders are their own short strip: a folder tile stretched to
                the height of a photo is an empty card. */}
            {folderRows.length > 0 && (
              <div className="vault-grid vault-folder-strip" role="list" aria-label="Folders">
                {folderRows.map((folder) => (
                  <div key={folder.id} role="listitem" draggable
                       className={`vault-tile vault-tile-folder${dropClass(folder.id)}`}
                       onDragStart={(e) => dragFolder(e, folder)} onDragEnd={() => setDropTarget(null)}
                       {...dropOnto(folder.id)}>
                    <FileKindGlyph kind="folder" size={24} />
                    <span className="vault-tile-body">
                      <Link to={folderHref(folder.id)} className="vault-name" title={folder.name}
                            onClick={(e) => {
                              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                              e.preventDefault(); openFolder(folder.id);
                            }}>{folder.name}</Link>
                      <span className="note vault-line">{folderLine(folder)}</span>
                    </span>
                    {folderKebab(folder)}
                  </div>
                ))}
              </div>
            )}
            {pageRows.length > 0 && (
              <div ref={listRef} className="vault-grid" role="list" aria-label="Your private documents" tabIndex={-1}>
                {pageRows.map((paper) => (
                  <div key={paper.id} role="listitem" draggable
                       className={`vault-tile opens${selected.has(paper.id) ? ' selected' : ''}`}
                       onClick={(e) => openFromRow(e, paper.id)}
                       onDragStart={(e) => dragFiles(e, paper)} onDragEnd={() => setDropTarget(null)}>
                    <Link to={`/papers/${paper.id}`} onClick={(e) => openPreview(e, paper.id)}
                          className="vault-tile-thumb" tabIndex={-1} aria-hidden draggable={false}>
                      {thumbOf(paper)}
                    </Link>
                    <label className="vault-tile-check">
                      <input type="checkbox" checked={selected.has(paper.id)}
                             aria-label={`Select ${titleOf(paper)}`} onChange={() => toggleSelected(paper)} />
                    </label>
                    <span className="vault-tile-foot">
                      <span className="vault-tile-body">
                        <span className="vault-name-line">
                          <Link to={`/papers/${paper.id}`} onClick={(e) => openPreview(e, paper.id)}
                                state={{ from: here_ }}
                                className="vault-name" draggable={false} title={titleOf(paper)}>
                            {titleOf(paper)}
                          </Link>
                          {passbookInfo(paper)}
                        </span>
                        <span className="note vault-line">{fileLine(paper)}</span>
                        {whereLine(paper)}
                        {tagsOf(paper)}
                      </span>
                      {fileKebab(paper)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* The list is a grid of divs, not a <table>, so the footer's count
            sits on the pager row: the total, or what is ticked. */}
        {filesReady && !nothingHere && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            <span className="note num vault-count" style={{ marginTop: 'var(--space-md)' }}>
              {chosenRows.length
                ? `${plural(chosenRows.length, 'document')} selected`
                : `Total · ${plural(selectionRows.length, 'document')}`}
            </span>
            {selectionRows.length > FILES_PER_PAGE && (
              <TablePager page={currentPage} pages={pageCount} size={FILES_PER_PAGE}
                          total={selectionRows.length} setPage={turnPage} label="Document pages" />
            )}
          </div>
        )}
      </section>

      {showRegister && (
        <section className="sec">
          {vaultFailed && <Failed what="Your share links" error={vault.error} onRetry={() => { void vault.refetch(); }} h="8rem" />}
          {live.length > 0 && (
            <>
              {/* Standing guidance sits behind the ⓘ, not under the list. One
                  true statement about what a link allows, the one the Share
                  dialog makes: nothing holds a `view` link back from
                  downloading, so "view-only" was a promise it did not keep. */}
              <SectionHead title="Active share links" sub={plural(live.length, 'link')}
                           info="New links let the person view and download for 30 days."
                           controls={<Link className="link" to="/audit">Activity ›</Link>} />
              {/* A register, not a contact list: numbered hairline entries. */}
              <ol className="register">{live.map((l, i) => <LinkRow key={l.id} link={l} n={i + 1} />)}</ol>
            </>
          )}
          {/* Lapsed links are shown, not hidden: someone held this link, and a
              link that quietly disappears from the log is the thing this list
              exists to make impossible. */}
          {lapsed.length > 0 && (
            <div style={live.length ? { marginTop: 'var(--space-lg)' } : undefined}>
              <SectionHead title="Expired share links" sub={plural(lapsed.length, 'link')}
                           controls={live.length === 0 ? <Link className="link" to="/audit">Activity ›</Link> : undefined} />
              <ol className="register">
                {lapsed.map((l, i) => <LinkRow key={l.id} link={l} n={i + 1} />)}
              </ol>
            </div>
          )}
        </section>
      )}

      {/* The house selection bar: floating over the list, nothing until
          something is ticked, every label counting the selection. */}
      <SelectionBar count={chosenRows.length} noun={['document', 'documents']}
                    label="Act on the selected documents" onClear={clearSelection}>
        <button type="button" className="btn sm" onClick={exportChosen}>
          <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
        </button>
        <button type="button" className="btn sm" disabled={!shareable.length}
                onClick={() => setSharing(shareable)}>
          {shareable.length ? 'Share' : 'Aadhaar cards cannot be shared'}
        </button>
        <button type="button" className="btn sm"
                onClick={() => setLinking(chosenRows.map((p) => p.id))}>
          Link to a property or holding
        </button>
        <button type="button" className="btn sm" disabled={!foldersKnown}
                onClick={() => { setMoveError(''); setMoving({ paperIds: chosenRows.map((p) => p.id) }); }}>
          Move to a folder
        </button>
        <button type="button" className="btn sm"
                onClick={() => { setTagError(''); setTagging(chosenRows.map((p) => p.id)); }}>
          Add a tag
        </button>
        <button type="button" className="btn sm" onClick={() => setTyping(chosenRows)}>
          Set the type
        </button>
        <button type="button" className="btn sm" disabled={chosenRows.length !== 1}
                onClick={() => setCreateFrom(chosenRows[0] ?? null)}>
          {chosenRows.length === 1 ? 'Add a property from this document' : 'Select one to add a property'}
        </button>
      </SelectionBar>

      {panel === 'add' && (
        <AddPapers onClose={() => setPanel('')} returnFocus={addTrigger} folderId={currentFolder} />
      )}
      {panel === 'share' && <ShareRecord onClose={() => setPanel('')} />}
      {sharing && sharing.length > 0 && (
        <ShareDocuments papers={sharing} titleOf={titleOf}
                        onClose={() => { setSharing(null); setSelected(new Set()); }} />
      )}
      {linking && linking.length > 0 && (
        <LinkPapersDialog paperIds={linking} alreadyLinkedIds={alreadyLinkedIds}
                          onClose={() => { setLinking(null); setSelected(new Set()); }} />
      )}
      {viewingLinks && (
        <LinkedPropertiesDialog paper={viewingLinks} title={titleOf(viewingLinks)}
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
              ? `Move ${(() => { const p = files.find((f) => f.id === moving.paperIds[0]); return p ? titleOf(p) : 'this document'; })()}`
              : `Move ${plural(moving.paperIds.length, 'document')}`}
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
          title={`Delete the folder “${removing.name}”?`}
          body={removing.fileCount || removing.folderCount
            ? `Everything inside (${folderLine(removing)}) moves up to ${nameOf(parentOf(removing))}. No document is deleted.`
            : 'The folder is empty. No document is deleted.'}
          actionLabel="Delete folder" danger busy={deleteFolder.isPending} error={removeError}
          onConfirm={() => { void removeFolder(removing); }}
          onClose={() => setRemoving(null)} />
      )}
      {tagging && (
        <TagDialog count={tagging.length} existing={knownTags} noun={['document', 'documents']}
                   busy={tagPapers.isPending} error={tagError} onApply={(word) => { void tagAll(word); }}
                   onClose={() => { setTagError(''); setTagging(null); }} />
      )}
      {editingTags && (
        <EditTagsDialog paperId={editingTags.id} title={titleOf(editingTags)} tags={editingTags.tags}
                        known={knownTags} onClose={() => setEditingTagsId('')} />
      )}
      {renaming && (
        <EditPaperDialog paper={{ ...renaming, title: renaming.nameSet ? renaming.title : titleOf(renaming) }}
                         onClose={() => setRenaming(null)} />
      )}
      {detailing && (
        <PaperDetailsDrawer paper={{ ...detailing, title: titleOf(detailing) }} onClose={() => setDetailing(null)} />
      )}
      {deleting && (
        <DeletePaperDialog paper={{ ...deleting, title: titleOf(deleting) }} onClose={() => setDeleting(null)}
                           onDeleted={() => {
                             const name = titleOf(deleting);
                             setDeleting(null);
                             setSelected((before) => { const next = new Set(before); next.delete(deleting.id); return next; });
                             toast.ok(`${name} is deleted.`);
                           }} />
      )}
      {typing && (
        <SetTypeDialog papers={typing} onClose={() => setTyping(null)}
                       onDone={(n) => {
                         setTyping(null);
                         setSelected(new Set());
                         toast.ok(n ? `The type of ${plural(n, 'document')} is set.` : 'Those documents already have that type.');
                       }} />
      )}
      {createFrom && (
        <RecordDrawer card={null} sourcePaper={createFrom}
                      onClose={() => { setCreateFrom(null); setSelected(new Set()); }} />
      )}
      {preview && (
        <PaperPreview paperId={preview} onClose={() => setPreview('')}
                      openState={{ from: here_ }} returnFocus={listRef} />
      )}
    </main>
  );
}
