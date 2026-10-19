/** W13a — one shelf of the vault, across every record.
 *
 *  The destination the eight shelf cards on the Papers wall have claimed since
 *  they were drawn. Until now `/papers?shelf=title` resolved to the wall
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
import { Link, useParams, useSearchParams } from 'react-router';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import { fileKindOf } from '@pattadar/core';

import { useVaultPapers, useVault } from '../api';
import type { Paper } from '../api';
import {
  BandSearch, Card, Empty, Failed, Icon, PageHead, PhotoImg, SelectAllBox, SelectCell, SelectionBar, TablePager, Tag,
  ToolbarBand, VideoThumb, ViewToggle, downloadCsv, num, plural, usePaged, useRowSelection,
} from '../ui';
import { SkRowItems } from '../skeletons';
import { PaperPreview } from '../paper/PaperPreview';
import { displayDetail } from '../paperFiling';
import { FileKindGlyph } from './VaultFolders';

/** The eight shelves, as `vault` in web360.py spells them. Kept here so an
 *  unknown key in the URL is refused by name rather than fetched. */
const SHELVES: Record<string, { label: string; note: string }> = {
  title: { label: 'Title deeds', note: 'Deeds, wills, agreements' },
  revenue: { label: 'Revenue records', note: 'Passbooks, ROR, mutations' },
  map: { label: 'Map', note: 'FMB, tippons, sketches' },
  identity: { label: 'Identity', note: 'Masked until you unlock' },
  search: { label: 'EC & tax receipts', note: 'ECs, receipts, challans' },
  old: { label: 'Old records', note: 'Sethwar, khasra' },
  photos: { label: 'Photos & video', note: 'Of the land itself' },
  unsorted: { label: 'Not sorted yet', note: 'Nothing recognised it' },
};

const idOf = (p: Paper) => p.id;

/** The tile's picture, as Documents draws it: the photo or the video frame,
 *  else the file-kind glyph. */
function thumbOf(p: Paper) {
  const kind = fileKindOf(p.mimeType, p.fileName || p.title);
  const glyph = <FileKindGlyph kind={kind} size={40} />;
  if (kind === 'image') return <PhotoImg fileRef={p.fileRef} alt="" thumb={320} className="vault-thumb-img" fallback={glyph} />;
  if (kind === 'video') return <VideoThumb fileRef={p.fileRef} fallback={glyph} />;
  return glyph;
}

export function Shelf() {
  const { key = '' } = useParams();
  const shelf = SHELVES[key];
  const papers = useVaultPapers(shelf ? key : undefined);
  const vault = useVault();
  const [q, setQ] = useState('');
  // Table is the default, as on Documents; ?view=grid is the tile view (design.md § Tables).
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'grid' ? 'grid' : 'table';
  const setView = (v: 'grid' | 'table') => {
    const next = new URLSearchParams(params);
    if (v === 'grid') next.set('view', 'grid'); else next.delete('view');
    setParams(next, { replace: true });
  };
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
  // A shelf of loose papers can run to hundreds; page it like a data table.
  // One selection across both views, dropped when the search narrows the list.
  const narrowKey = `${key}|${q.trim()}`;
  const sel = useRowSelection(rows, idOf, narrowKey);
  // One pager for both views (as Documents): usePaged reads its key only at mount.
  const paged = usePaged(rows, { resetKey: narrowKey, storeKey: 'pattadar.table.shelf' });
  const pages = (sel.picked.length > 0 ? sel.picked : rows).reduce((n, p) => n + p.pageCount, 0);
  // A row press that is not one of its own controls previews the paper.
  const openFromRow = (e: MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest('a, button, input, label, td.selcol')) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    setPreview(id);
  };

  const trail = [{ label: 'Documents', to: '/papers' }, { label: shelf ? shelf.label : 'Shelf' }];

  // A key nobody filed anything under is a typed URL or a stale bookmark, not
  // a failure — say which shelves exist rather than spinning on a fetch.
  if (!shelf) {
    return (
      <main>
        <PageHead crumbs={trail} title="There is no shelf by that name" />
        <Empty boxed h="22rem" icon="unsorted"
               action={<Link className="btn" to="/papers">Back to your documents</Link>} />
      </main>
    );
  }

  const count = vault.data?.shelves.find((s) => s.key === key)?.count;

  return (
    <main>
      {/* Detail head (design.md § Page head): the crumbs are the wayfinding,
          so no eyebrow repeats "Documents" above the title (F7). What the
          shelf holds is standing guidance, behind the ⓘ; the summary is the
          count; the search is the band's. */}
      <PageHead
        crumbs={trail}
        title={shelf.label}
        info={shelf.note}
        summary={papers.data && papers.data.length > 0 ? plural(papers.data.length, 'document') : undefined}
      />
      {papers.data && papers.data.length > 0 && (
        <ToolbarBand
          tally={q.trim() ? `${rows.length} of ${papers.data.length} shown` : undefined}
          search={(
            <BandSearch
              value={q}
              onChange={setQ}
              placeholder={`Search ${plural(papers.data.length, 'document')} on this shelf`}
              label={`Search the ${shelf.label} shelf`}
            />
          )}
          view={<ViewToggle views={['grid', 'table']} value={view} onChange={setView} />}
        />
      )}

      {papers.isLoading && <SkRowItems rows={5} />}

      {!papers.isLoading && !papers.data && (
        <Failed what={`The ${shelf.label} shelf`} error={papers.error} boxed h="20rem" />
      )}

      {papers.data && papers.data.length === 0 && (
        <Empty boxed h="20rem" icon={key} title={`Nothing is filed under ${shelf.label} yet`}
               action={<Link className="btn" to="/papers">Back to your documents</Link>}>
          {count ? 'The shelf count disagrees with this list.' : null}
        </Empty>
      )}

      {papers.data && papers.data.length > 0 && rows.length === 0 && (
        <Empty boxed h="14rem" icon="search" title={`Nothing on this shelf matches “${q.trim()}”`}
               action={<button type="button" className="btn" onClick={() => setQ('')}>Clear</button>} />
      )}

      {rows.length > 0 && view === 'table' && (
        <Card flush className="scroll-x edgefade">
          <div ref={listRef}>
            <table className="rectable" aria-label={`Documents on the ${shelf.label} shelf`} style={{ minWidth: '36rem' }}>
              <thead>
                <tr>
                  <th className="selcol">
                    <SelectAllBox total={rows.length} picked={sel.picked.length} noun={['document', 'documents']}
                                  onToggle={sel.toggleAll} />
                  </th>
                  <th scope="col">Document</th>
                  <th scope="col">Tags</th>
                  <th scope="col" className="right">Pages</th>
                </tr>
              </thead>
              <tbody>
                {paged.shown.map((p) => (
                  <tr key={p.id} className={sel.selected.has(p.id) ? 'openrow selected' : 'openrow'}
                      onClick={(e) => openFromRow(e, p.id)}>
                    <SelectCell checked={sel.selected.has(p.id)} label={`Select ${p.title}`}
                                onToggle={() => sel.toggle(p.id)} />
                    <td>
                      <span className="row tight" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                        <span style={{ display: 'flex', color: 'var(--w-info)' }}>
                          <Icon name={p.icon || key} size={19} />
                        </span>
                        <span>
                          <Link className="accent" to={`/papers/${p.id}`} onClick={(e) => openPreview(e, p.id)}
                                style={{ textDecoration: 'none', fontWeight: 700 }}>{p.title}</Link>
                          {p.detail && <span className="note" style={{ display: 'block' }}>{displayDetail(p.detail)}</span>}
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="row tight" style={{ flexWrap: 'wrap' }}>
                        {p.tags.map((t) => <Tag key={t}>{t}</Tag>)}
                        {p.shared && <Tag>shared</Tag>}
                      </span>
                    </td>
                    <td className="right num">{p.pageCount > 0 ? num(p.pageCount) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="selcol" />
                  <th scope="row" colSpan={2}>
                    {sel.picked.length > 0
                      ? `${plural(sel.picked.length, 'document')} selected`
                      : `Total · ${plural(rows.length, 'document')}`}
                  </th>
                  <td className="right num">{pages > 0 ? num(pages) : ''}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
      {rows.length > 0 && view === 'grid' && (
        <div ref={listRef} className="vault-grid" role="list" aria-label={`Documents on the ${shelf.label} shelf`}>
          {paged.shown.map((p) => {
            const on = sel.selected.has(p.id);
            return (
              <div key={p.id} role="listitem" className={`vault-tile opens${on ? ' selected' : ''}`}
                   onClick={(e) => openFromRow(e, p.id)}>
                <Link to={`/papers/${p.id}`} onClick={(e) => openPreview(e, p.id)}
                      className="vault-tile-thumb" tabIndex={-1} aria-hidden>
                  {thumbOf(p)}
                </Link>
                <label className="vault-tile-check">
                  <input type="checkbox" checked={on} aria-label={`Select ${p.title}`} onChange={() => sel.toggle(p.id)} />
                </label>
                <span className="vault-tile-foot">
                  <span className="vault-tile-body">
                    <Link to={`/papers/${p.id}`} onClick={(e) => openPreview(e, p.id)}
                          className="vault-name" title={p.title}>{p.title}</Link>
                    {(p.detail || p.pageCount > 0) && (
                      <span className="note vault-line">
                        {[displayDetail(p.detail), p.pageCount > 0 && plural(p.pageCount, 'page')].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    {(p.tags.length > 0 || p.shared) && (
                      <span className="vault-tags">
                        {p.tags.map((t) => <Tag key={t}>{t}</Tag>)}
                        {p.shared && <Tag>shared</Tag>}
                      </span>
                    )}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {rows.length > 0 && <TablePager {...paged} onSize={paged.setSize} label={`${shelf.label} pages`} />}

      {/* Ticking covers every paper the search lets through, in either view. */}
      <SelectionBar count={sel.picked.length} noun={['document', 'documents']}
                    label="Act on the selected documents" onClear={sel.clear}>
        <button type="button" className="btn sm"
                onClick={() => downloadCsv(`pattadar-${key}.csv`, [
                  ['Document', 'Detail', 'Tags', 'Pages'],
                  ...sel.picked.map((p) => [p.title, displayDetail(p.detail), [...p.tags, ...(p.shared ? ['shared'] : [])].join(', '), p.pageCount || '']),
                ])}>
          <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
        </button>
      </SelectionBar>

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
