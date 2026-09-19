/** W13a — one shelf of the vault, across every record.
 *
 *  The destination the eight shelf cards on the Papers wall have claimed since
 *  they were drawn. Until now `/app/papers?shelf=title` resolved to the wall
 *  itself and the parameter was never read, so clicking "Title 12" re-rendered
 *  the same eight cards: the primary navigation of the vault did nothing.
 *
 *  It is a route of its own rather than a filter on the wall because the two
 *  answer different questions — "what have I got, by kind" and "show me the
 *  twelve title deeds" — and because a shelf is a thing you send someone the
 *  link to.
 */
import { useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Link, useParams } from 'react-router';
import SearchOutlined from '@mui/icons-material/SearchOutlined';

import { useVaultPapers, useVault } from '../api';
import { Crumbs, Empty, Failed, Icon, PageHead, Tag, plural } from '../ui';
import { SkRowItems } from '../skeletons';
import { PaperPreview } from '../paper/PaperPreview';

/** The eight shelves, as `vault` in web360.py spells them. Kept here so an
 *  unknown key in the URL is refused by name rather than fetched. */
const SHELVES: Record<string, { label: string; note: string }> = {
  title: { label: 'Title', note: 'Deeds, wills, agreements' },
  revenue: { label: 'Revenue record', note: 'Passbooks, ROR, mutations' },
  map: { label: 'Map', note: 'FMB, tippons, sketches' },
  identity: { label: 'Identity', note: 'Masked until you unlock' },
  search: { label: 'Search & tax', note: 'ECs, receipts, challans' },
  old: { label: 'Old record', note: 'Sethwar, khasra' },
  photos: { label: 'Photos', note: 'Of the land itself' },
  unsorted: { label: 'Unsorted', note: 'Nothing recognised it' },
};

export function Shelf() {
  const { key = '' } = useParams();
  const shelf = SHELVES[key];
  const papers = useVaultPapers(shelf ? key : undefined);
  const vault = useVault();
  const [q, setQ] = useState('');
  // Which paper the preview drawer is showing, '' for none. A left-click on a
  // row opens it here rather than routing to the full Reader; the row stays a
  // real <Link> so cmd/middle-click, "open in new tab" and the deep link all
  // keep working. Focus goes back to the shelf list when the drawer closes and
  // the row that opened it has scrolled out of the (virtualised-feeling) list.
  const [preview, setPreview] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Only a plain left-click is the preview. A modified click — new tab, new
  // window, "copy link", or a middle-click — is someone deliberately asking
  // for the full page or a second tab, and must fall through to the <Link>.
  const openPreview = (e: MouseEvent, id: string) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setPreview(id);
  };

  const rows = useMemo(() => {
    const all = papers.data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((p) => `${p.title} ${p.detail}`.toLowerCase().includes(needle));
  }, [papers.data, q]);

  const crumbs = (
    <Crumbs trail={[{ label: 'Papers', to: '/app/papers' },
                    { label: shelf ? shelf.label : 'Shelf' }]} />
  );

  // A key nobody filed anything under is a typed URL or a stale bookmark, not
  // a failure — say which shelves exist rather than spinning on a fetch.
  if (!shelf) {
    return (
      <main>
        {crumbs}
        <Empty boxed h="22rem" icon="unsorted" title="There is no shelf by that name"
               action={<Link className="btn" to="/app/papers">Back to your papers</Link>}>
          The vault files everything on eight shelves: Title, Revenue record, Map, Identity,
          Search &amp; tax, Old record, Photos and Unsorted.
        </Empty>
      </main>
    );
  }

  // Photos are counted from parcel_photos, never from `documents`, so this
  // shelf is empty by construction. Saying "no papers here" would be true and
  // useless; the photographs are real and they are on the records.
  if (key === 'photos') {
    return (
      <main>
        {crumbs}
        <PageHead eyebrow="Your papers" title="Photos" />
        <Empty boxed h="22rem" icon="photos" title="Photographs live on the record they are of"
               action={<Link className="btn" to="/app/properties">Open your properties</Link>}>
          A photo is the feature&rsquo;s condition, the order&rsquo;s evidence and one of the
          parcel&rsquo;s own — the same file, three lenses. It is filed against the land it shows
          rather than in a drawer of its own, so it opens from that record&rsquo;s Photos tab.
        </Empty>
      </main>
    );
  }

  const count = vault.data?.shelves.find((s) => s.key === key)?.count;

  return (
    <main>
      {crumbs}
      <PageHead
        eyebrow="Your papers"
        title={shelf.label}
        actions={papers.data && papers.data.length > 0 ? (
          <span className="search" style={{ width: '18rem' }}>
            <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${plural(papers.data.length, 'paper')} on this shelf`}
              aria-label={`Search the ${shelf.label} shelf`}
            />
          </span>
        ) : undefined}
      >
        <p className="lede" style={{ marginTop: '0.375rem' }}>{shelf.note}</p>
      </PageHead>

      {papers.isLoading && <SkRowItems rows={5} />}

      {!papers.isLoading && !papers.data && (
        <Failed what={`The ${shelf.label} shelf`} error={papers.error} boxed h="20rem" />
      )}

      {papers.data && papers.data.length === 0 && (
        <Empty boxed h="20rem" icon={key} title={`Nothing is filed under ${shelf.label} yet`}
               action={<Link className="btn" to="/app/papers">Back to your papers</Link>}>
          {count
            ? 'The shelf count disagrees with this list — that is worth reporting.'
            : `Papers land here as they are read. ${shelf.note} belong on this shelf.`}
        </Empty>
      )}

      {papers.data && papers.data.length > 0 && rows.length === 0 && (
        <Empty boxed h="14rem" icon="search" title={`Nothing on this shelf matches “${q.trim()}”`}
               action={<button type="button" className="btn" onClick={() => setQ('')}>Clear</button>}>
          Search looks at the paper&rsquo;s name and its one-line detail.
        </Empty>
      )}

      {rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="rows boxed" ref={listRef}>
            {rows.map((p) => (
              <Link key={p.id} to={`/app/papers/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}
                    onClick={(e) => openPreview(e, p.id)}>
                <span className="muted" style={{ display: 'flex', color: 'var(--w-info)' }}>
                  <Icon name={p.icon || key} size={19} />
                </span>
                <span className="grow">
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem' }}>{p.title}</span>
                  {p.detail && <span className="note" style={{ display: 'block' }}>{p.detail}</span>}
                </span>
                <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                  {p.tags.map((t) => <Tag key={t}>{t}</Tag>)}
                  {p.shared && <Tag>shared</Tag>}
                  {p.pageCount > 0 && (
                    <span className="note mono" style={{ whiteSpace: 'nowrap' }}>
                      {plural(p.pageCount, 'page')}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {preview && (
        <PaperPreview
          paperId={preview}
          onClose={() => setPreview('')}
          returnFocus={listRef}
        />
      )}
    </main>
  );
}
