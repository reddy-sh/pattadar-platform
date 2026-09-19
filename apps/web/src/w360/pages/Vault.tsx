/** W15 — the vault: eight shelves, and every link you have out.
 *
 *  The share log is not buried in settings. It sits under the shelves because
 *  the only honest way to promise "nothing leaves this vault without appearing
 *  in this list" is to put the list where the papers are. */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, MouseEvent, RefObject } from 'react';
import { Link, useNavigate } from 'react-router';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import GppGoodOutlined from '@mui/icons-material/GppGoodOutlined';

import {
  EMPTY_FILTER, useCreateShareLink, useProperties, useRevokeLink, useSearch, useVault,
} from '../api';
import type { RecordCard, ShareLink } from '../api';
import { Dialog } from '../Dialog';
import ShareResult from '../components/ShareResult';
import { useToast } from '../Toast';
import { Chip, Empty, Eyebrow, Failed, Icon, Loading, PageHead, ddmmyyyy, plural } from '../ui';
import { PaperPreview } from '../paper/PaperPreview';

/** Each shelf gets its own edge colour so the wall reads as a wall, not a grid
 *  of identical cards. Hues are the Bloom slots, never literals. */
const EDGE: Record<string, string> = {
  title: 'var(--w-info)',
  revenue: 'var(--w-ok)',
  map: 'var(--w-info)',
  identity: 'var(--color-accent-2)',
  search: 'var(--w-warn)',
  old: 'var(--w-ink-3)',
  photos: 'var(--w-danger)',
  unsorted: 'var(--w-ink-3)',
};

/** The jump box and this box both answer from `search`, which hands back five
 *  papers at a time. Saying so is better than silently truncating a match the
 *  owner knows is there. */
const SEARCH_CAP = 5;

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
function LinkRow({ link }: { link: ShareLink }) {
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

  return (
    <div>
      <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem', fontSize: '0.75rem' }}>
        {link.initials}
      </span>
      <span className="grow">
        <strong style={{ fontSize: '0.9375rem' }}>
          {link.audience} — {link.subject}
        </strong>
        <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>{link.terms}</span>
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
              This link has already lapsed, so nobody loses access today — revoking takes it off
              this list for good. The full share log keeps the history of it either way.
            </p>
          ) : (
            <p className="note">
              {link.audience} loses access to {link.subject} the moment you do this, mid-read if
              they are reading it. It cannot be brought back from this screen: you can make a new
              link, but this one is gone.
            </p>
          )}
        </Dialog>
      )}
    </div>
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
                               fontWeight: 600, fontSize: '0.9375rem', textAlign: 'left' }}
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
            ? `The first ${rows.length} of ${plural(matches.length, 'match', 'matches')} — narrow it further.`
            : `The first ${rows.length} of ${plural(cards.length, 'property', 'properties')} — search to narrow it.`}
        </p>
      )}
    </>
  );
}

/** "Add papers" used to be a filled primary button with no onClick at all.
 *  Filing needs a record — the reader files a deed against the land it claims
 *  to be about — so the vault asks which property and hands over to that
 *  record's Papers tab, where the upload, the size limit, the reader and the
 *  shelf classification already work. */
function AddPapers({ onClose }: { onClose: () => void }) {
  const { data, isLoading, error } = useProperties(EMPTY_FILTER);
  const nav = useNavigate();

  return (
    <Dialog
      title="Which property are these papers for?"
      onClose={onClose}
      footer={<button type="button" className="btn" onClick={onClose}>Cancel</button>}
    >
      <p className="note" style={{ marginBottom: 'var(--space-md)' }}>
        Every paper is filed against the property it belongs to — that is what lets a deed be
        checked against the record it names. Choose the property and the papers go on its Papers
        tab, read and shelved as they land.
      </p>
      {isLoading && <Loading h="10rem" />}
      {!isLoading && !data && <Failed what="Your properties" error={error} h="10rem" />}
      {data && data.cards.length === 0 && (
        <Empty icon="parcel" title="There is nothing to file papers against yet"
               action={<Link className="btn" to="/app/properties" onClick={onClose}>Your properties</Link>}>
          A property comes first; its papers hang off it.
        </Empty>
      )}
      {data && data.cards.length > 0 && (
        <RecordPick cards={data.cards} onPick={(c) => { onClose(); nav(`/app/records/${c.id}`); }} />
      )}
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
      setSharePath(made);
    } catch {
      // The mutation's own toast carries the reason; what was typed stays on
      // screen so the link can be made again without picking the property twice.
      return;
    }
    // The list below gains a row, but it is under the fold on a tall vault, so
    // the confirmation says the link exists rather than trusting the scroll.
    toast.ok('The link is ready to copy and send.');
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
          <Empty icon="parcel" title="There is nothing to share yet"
                 action={<Link className="btn" to="/app/properties" onClick={onClose}>Your properties</Link>}>
            A link is made against one property and carries that property&rsquo;s papers.
          </Empty>
        )}

        {data && data.cards.length > 0 && !pick && (
          <>
            {/* Said here rather than left to a greyed-out button: a link is one
                property's papers, and nothing can be made until one is chosen. */}
            <p className="note" style={{ marginBottom: 'var(--space-md)' }}>
              A link carries one property&rsquo;s papers. Choose which, then say who it is for.
            </p>
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
              The current papers are selected when you make the link. Anyone with the link
              can view and download them for 30 days. You can revoke it from this page.
            </p>
          </>
        )}
      </form>}
    </Dialog>
  );
}

export function Vault() {
  const { data, isLoading, error } = useVault();
  const [panel, setPanel] = useState<'' | 'add' | 'share'>('');
  // A search hit opens in the preview drawer, the same as a shelf row. The row
  // stays a real <Link to={h.route}> so a modified click still routes to the
  // full Reader; only a plain left-click is intercepted.
  const [preview, setPreview] = useState('');
  const hitsRef = useRef<HTMLDivElement>(null);
  const openPreview = (e: MouseEvent, id: string) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setPreview(id);
  };

  // The box was decoration: no value, no onChange, nothing behind it. It is
  // the same `search` the jump box uses, deferred so typing stays smooth.
  const [q, setQ] = useState('');
  const vaultSearch = useRef<HTMLInputElement>(null);
  const deferredQ = useDeferredValue(q);
  const found = useSearch(deferredQ);
  const asked = q.trim();

  // `search` answers records, papers and people in one list. Only papers
  // belong on a screen called Papers — a parcel or a person dropped in here
  // would be a hit the heading denies. The rest is the Shell's jump box.
  const hits = useMemo(
    () => (found.data ?? []).filter((h) => h.kind === 'paper'),
    [found.data],
  );

  // `useDeferredValue` paints the old value first, so for a frame the query
  // behind the box is still answering the previous string. Saying "no paper is
  // named that" in that gap answers a question nobody has asked yet.
  const settling = deferredQ.trim() !== asked;
  const searching = found.isLoading || settling;

  // A link whose date has passed is not "out right now", and counting it as
  // though it were is how an owner comes to believe a stranger still has
  // access — or that they no longer do.
  const [live, lapsed] = useMemo(() => {
    const all = data?.links ?? [];
    return [all.filter((l) => !spanOf(l).expired), all.filter((l) => spanOf(l).expired)];
  }, [data?.links]);

  if (isLoading) return <main><Loading h="70vh" what="your papers" /></main>;
  if (!data) return <main><Failed what="Your papers" error={error} boxed h="26rem" /></main>;

  return (
    <main>
      <PageHead
        eyebrow="Your papers"
        title="Papers"
        actions={
          <>
            {/* The placeholder used to promise "including their text". Nothing
                indexes the writing inside a scan — the query matches the name a
                paper was filed under — so it now says only that. */}
            <span className="search" style={{ width: '21rem' }}>
              <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
              <input ref={vaultSearch} value={q} onChange={(e) => setQ(e.target.value)}
                     placeholder={`Search ${plural(data.total, 'paper')} by name`}
                     aria-label="Search your papers by name" />
            </span>
            <button type="button" className="btn" onClick={() => setPanel('share')}>
              <IosShareOutlined sx={{ fontSize: 16 }} /> Share a property
            </button>
            <button type="button" className="btn primary" onClick={() => setPanel('add')}>
              <FileUploadOutlined sx={{ fontSize: 16 }} /> Add papers
            </button>
          </>
        }
      >
        <p className="note row tight" style={{ marginTop: '0.375rem' }}>
          <span className="up" style={{ display: 'flex' }}><GppGoodOutlined sx={{ fontSize: 15 }} /></span>
          {plural(data.total, 'paper')}, {data.regionNote}
        </p>
      </PageHead>

      {/* Results sit above the wall rather than under it: eight shelf cards is
          most of a screen, and a search that answers below the fold reads as a
          search that answered nothing. */}
      {asked.length >= 2 && (
        <section className="sec">
          <div className="row between" style={{ marginBottom: 'var(--space-md)' }}>
            <Eyebrow>Papers named like “{asked}” · {hits.length}</Eyebrow>
            <button type="button" className="btn sm" onClick={() => {
              vaultSearch.current?.focus();
              setQ('');
            }}>Clear</button>
          </div>

          {/* The previous answer stays on screen while the next one loads —
              blanking the list on every keystroke is worse than a stale row
              that is about to be replaced. */}
          {searching && hits.length === 0 && <Loading h="8rem" />}

          {!searching && found.error && (
            <Failed what="That search" error={found.error} boxed h="10rem" />
          )}

          {!searching && !found.error && hits.length === 0 && (
            <Empty boxed h="12rem" icon="search" title={`No paper is named “${asked}”`}>
              Search reads the names papers were filed under, not the writing inside them. A survey
              number that appears only on the page itself will not match yet.
            </Empty>
          )}

          {hits.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div className="rows boxed" ref={hitsRef}>
                {hits.map((h) => (
                  <Link key={h.id} to={h.route} style={{ color: 'inherit', textDecoration: 'none' }}
                        onClick={(e) => openPreview(e, h.id)}>
                    <span className="muted" style={{ display: 'flex', color: 'var(--w-info)' }}>
                      <Icon name="paper" size={19} />
                    </span>
                    <span className="grow">
                      <span style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem' }}>
                        {h.title}
                      </span>
                      {h.subtitle && <span className="note" style={{ display: 'block' }}>{h.subtitle}</span>}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {hits.length >= SEARCH_CAP && (
            <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
              The {SEARCH_CAP} closest by name — the box answers {SEARCH_CAP} at a time. Open a
              shelf below to look through everything filed on it.
            </p>
          )}
        </section>
      )}

      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 17rem), 1fr))' }}>
        {data.shelves.map((s) => (
          <Link key={s.key} className="shelf" to={`/app/papers/shelf/${s.key}`}
                style={{ borderLeftColor: EDGE[s.key] ?? 'var(--w-accent)' }}>
            <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <span style={{ display: 'flex', color: EDGE[s.key] ?? 'var(--w-accent)' }}>
                <Icon name={s.key} size={22} />
              </span>
              <span className="num" style={{ fontSize: '1.25rem' }}>{s.count}</span>
            </div>
            <h3 style={{ marginTop: 'var(--space-md)' }}>{s.label}</h3>
            <p className="note" style={{ marginTop: '0.1875rem' }}>{s.note}</p>
          </Link>
        ))}
      </div>

      <section className="sec">
        <div className="row between" style={{ marginBottom: 'var(--space-md)' }}>
          <Eyebrow>Out on a link right now · {live.length}</Eyebrow>
          <Link className="accent" to="/app/audit" style={{ fontSize: '0.8125rem', textDecoration: 'none' }}>
            Full share log ›
          </Link>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="rows boxed">
            {live.map((l) => <LinkRow key={l.id} link={l} />)}
            {live.length === 0 && (
              <div><p className="note">Nothing is out on a link right now.</p></div>
            )}
          </div>
        </div>

        {/* Lapsed links are shown, not hidden: someone held this link, and a
            link that quietly disappears from the log is the thing this list
            exists to make impossible. */}
        {lapsed.length > 0 && (
          <>
            <div className="row between" style={{ margin: 'var(--space-lg) 0 var(--space-md)' }}>
              <Eyebrow>Lapsed · {lapsed.length}</Eyebrow>
            </div>
            <div className="card" style={{ padding: 0 }}>
              <div className="rows boxed">
                {lapsed.map((l) => <LinkRow key={l.id} link={l} />)}
              </div>
            </div>
            <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
              These have passed their date and no longer open. They stay here until you revoke
              them, and the full share log keeps them after that.
            </p>
          </>
        )}

        <p className="note" style={{ marginTop: 'var(--space-md)' }}>
          Revoking kills a link in seconds rather than at expiry. Nothing leaves this vault without
          appearing in this list. A link&rsquo;s span is fixed when it is made. Re-sharing here makes
          a new view-only link that runs for 30 days; revoke the old link first only when that is
          the access you intend.
        </p>
      </section>

      {panel === 'add' && <AddPapers onClose={() => setPanel('')} />}
      {panel === 'share' && <ShareRecord onClose={() => setPanel('')} />}
      {preview && (
        <PaperPreview paperId={preview} onClose={() => setPreview('')} returnFocus={hitsRef} />
      )}
    </main>
  );
}
