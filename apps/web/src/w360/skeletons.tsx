/**
 * Content-shaped loading states for the record screens.
 *
 * The rule these follow is the one W02 and W03 already state in their own
 * markup: the screens never spin, they hold their shape. A query in flight
 * paints the SHAPE of its answer — the same grid, the same card, the same
 * seven columns — so nothing on the page moves when the bytes land and the
 * reader can already see what kind of thing is coming.
 *
 * Every placeholder here is assembled from the REAL layout classes (.cards,
 * .rec, .rectable, .strip, .rows, .split) rather than a parallel geometry of
 * its own. That is the whole trick: a card that grows a line grows its own
 * skeleton with it. A skeleton written as an independent copy of the layout
 * drifts from the thing it stands for by the second commit, and then it is
 * worse than a spinner — it promises a shape the page does not keep.
 *
 * What is NOT faked: any label the client already knows. The table's column
 * headings and the record's tab strip are constants in this codebase, so they
 * are printed for real and stay put when the data arrives. Only the parts that
 * genuinely live on the server — the facet names, every value — go grey.
 */
import { useLocation } from 'react-router';
import { Card, Cell } from './ui';
import type { CSSProperties, ReactNode } from 'react';

/** One placeholder block. Width is given per call (that is the whole point of
 *  a skeleton — the ragged line lengths are what make it read as text rather
 *  than as a loading bar); height defaults to a line of whatever font it sits
 *  in, because `em` saves a size prop at almost every call site. */
export function Sk({ w = '100%', h, r, style }: {
  w?: string; h?: string; r?: string; style?: CSSProperties;
}) {
  return (
    <span
      className="skeleton line" aria-hidden
      style={{ width: w, ...(h ? { height: h } : null), ...(r ? { borderRadius: r } : null), ...style }}
    />
  );
}

/** A placeholder sized to the LINE BOX of the text it replaces, not to the bar
 *  that is drawn inside it.
 *
 *  This is the difference between a skeleton and a skeleton that works. A 36px
 *  grey bar standing in for a 46px headline is 10px of upward jump the moment
 *  the title arrives — and the whole page below it moves with the title. So the
 *  element keeps its real class and its real font, is given its own line-height
 *  in `em` as an explicit height, and centres a shorter bar inside: the box is
 *  exactly the size the sentence will be, while the mark inside still reads as
 *  text rather than as a filled block.
 *
 *  `lh` is the line-height that element already has in w360.css — h1 is 1.05,
 *  .lede and .note are 1.5, the strip's figure is 1.1. Changing one there means
 *  changing it here, which is the one seam this file cannot borrow away. */
function SkText({ as: Tag = 'span', className, w, lh = 1.5, bar = '0.62em', style }: {
  as?: 'span' | 'p' | 'h1' | 'h3' | 'div'; className?: string; w: string;
  lh?: number; bar?: string; style?: CSSProperties;
}) {
  return (
    <Tag className={className} style={{ height: `${lh}em`, display: 'flex', alignItems: 'center', ...style }}>
      <Sk w={w} h={bar} />
    </Tag>
  );
}

/** Placeholders pulsing in lockstep read as one flashing slab — worse than the
 *  spinner they replace. A small offset per item turns the grid into a wave.
 *  Inline rather than in the stylesheet because the count is a render-time
 *  fact, and it wraps so a long list does not drift a whole second out. */
const wave = (i: number): CSSProperties => ({ animationDelay: `${(i % 6) * 90}ms` });

/** The wrapper every skeleton shares: one live region for the whole screen.
 *  Announcing forty grey boxes one at a time is how a placeholder becomes a
 *  screen-reader denial-of-service, so the scaffold inside is aria-hidden and
 *  this single status carries the message. */
function Busy({ label, children, className, style }: {
  label: string; children: ReactNode; className?: string; style?: CSSProperties;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className} style={style}>
      {children}
    </div>
  );
}

// ── W02, the properties list ───────────────────────────────────────────

/** One record card, grey. Mirrors Card() in pages/Properties.tsx line for
 *  line: band, title, owner, place, rule, figure row, extent reading, what is
 *  filed, chips. The state capsule is not among them — it moved onto the band,
 *  where a grey placeholder for something absent on nine cards out of ten would
 *  be a promise the answer usually breaks. */
function SkCard({ i }: { i: number }) {
  return (
    <div className="rec sk" aria-hidden>
      <div className="art" style={wave(i)} />
      <div className="meat">
        <Sk w="55%" h="1rem" />
        <Sk w="38%" style={{ marginTop: '0.5rem' }} />
        <Sk w="64%" style={{ marginTop: '0.4375rem' }} />
        <hr className="hr" style={{ margin: '0.625rem 0' }} />
        {/* The line the card exists for — extent and worth — so it is the one
            that must not reflow when the figures land. */}
        <div className="row" style={{ flexWrap: 'nowrap', gap: '0.5rem' }}>
          <Sk w="4.5rem" h="1.125rem" style={{ flex: 'none' }} />
          <Sk w="2.75rem" h="0.875rem" style={{ flex: 'none', marginLeft: 'auto' }} />
        </div>
        {/* The reading under it, and the digest under that. Both are single
            truncating lines on the real card, so the placeholder is one bar
            each and the card's height is the same before and after the answer
            lands. */}
        <Sk w="86%" h="0.6875rem" style={{ marginTop: '0.3125rem' }} />
        <Sk w="70%" h="0.75rem" style={{ marginTop: '0.4375rem' }} />
        <div className="row tight" style={{ marginTop: '0.5rem' }}>
          <Sk w="5.5rem" h="1.25rem" r="var(--radius-pill)" style={{ flex: 'none' }} />
          <Sk w="3.25rem" h="1.25rem" r="var(--radius-pill)" style={{ flex: 'none' }} />
        </div>
      </div>
    </div>
  );
}

/** The grid view. Six is a screenful at the default track width and reads as
 *  "a list is coming" without pretending to know how long it is. */
export function SkRecordCards({ count = 6 }: { count?: number }) {
  return (
    <Busy label="Loading your properties" className="cards">
      {Array.from({ length: count }, (_, i) => <SkCard key={i} i={i} />)}
    </Busy>
  );
}

/** The list view. The headings are real — they are constants in Properties.tsx,
 *  not server data — so the ledger reads as itself immediately. They are not
 *  sort buttons yet, because there is nothing to sort. */
export function SkRecordTable({ rows = 8 }: { rows?: number }) {
  return (
    <Busy label="Loading your properties" className="card scroll-x" style={{ padding: 0 }}>
      <table className="rectable" style={{ minWidth: '106rem' }}>
        <thead>
          <tr>
            <th className="selcol" />
            {/* PropertyTable's headings, so the frame does not jump on load. */}
            {['Survey No / LP', 'Type', 'Owner', 'Where', 'Held by', 'Holding', 'Managed by', 'Status']
              .map((h) => <th key={h}>{h}</th>)}
            <th className="right">Extent</th>
            <th className="right">Market estimate</th>
            <th>Title deed</th>
            <th>Last activity</th>
            <th className="menucol" />
          </tr>
        </thead>
        <tbody aria-hidden>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              <td className="selcol">
                <Sk w="0.9375rem" h="0.9375rem" r="var(--radius-xs)" style={{ margin: '0 auto' }} />
              </td>
              {[72, 60, 58, 80, 60, 40, 55].map((w, j) => <td key={j}><Sk w={`${w}%`} style={wave(i)} /></td>)}
              <td><Sk w="3.75rem" h="1.25rem" r="var(--radius-pill)" style={wave(i)} /></td>
              <td className="right"><Sk w="3.5rem" style={{ marginLeft: 'auto', ...wave(i) }} /></td>
              <td className="right"><Sk w="3rem" style={{ marginLeft: 'auto', ...wave(i) }} /></td>
              <td><Sk w="70%" style={wave(i)} /></td>
              <td><Sk w="65%" style={wave(i)} /></td>
              <td className="menucol" />
            </tr>
          ))}
        </tbody>
      </table>
    </Busy>
  );
}

/** Any data table while its first read is pending (design.md § Loading).
 *  The headings are the table's own constants, so the band reads as itself at
 *  once and nothing moves when the rows arrive: same columns, same widths, the
 *  tick column and the total row reserved. */
export function SkTable({ label, cols, rows = 6, select = true, foot = true, minWidth = '44rem' }: {
  label: string;
  cols: ReadonlyArray<{ head: string; right?: boolean; w?: string }>;
  rows?: number; select?: boolean; foot?: boolean; minWidth?: string;
}) {
  return (
    <Busy label={label} className="card scroll-x" style={{ padding: 0 }}>
      <table className="rectable" style={{ minWidth }}>
        <thead>
          <tr>
            {select && <th className="selcol" />}
            {cols.map((c) => <th key={c.head} className={c.right ? 'right' : undefined}>{c.head}</th>)}
          </tr>
        </thead>
        <tbody aria-hidden>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              {select && (
                <td className="selcol">
                  <Sk w="0.9375rem" h="0.9375rem" r="var(--radius-xs)" style={{ margin: '0 auto' }} />
                </td>
              )}
              {cols.map((c, j) => (
                <td key={c.head} className={c.right ? 'right' : undefined}>
                  <Sk w={c.w ?? (j === 0 ? '72%' : '55%')}
                      style={c.right ? { marginLeft: 'auto', ...wave(i) } : wave(i)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot aria-hidden>
            <tr>
              {select && <td className="selcol" />}
              <td colSpan={cols.length}><Sk w="9rem" /></td>
            </tr>
          </tfoot>
        )}
      </table>
    </Busy>
  );
}

/** Any card grid while its first read is pending: the `groupcard` shape the
 *  Services, Holdings and Invitations grids draw — tick and title, a line, a
 *  status, then the facts — so the cards land where their stand-ins were. */
export function SkGrid({ label, count = 6, facts = 3 }: { label: string; count?: number; facts?: number }) {
  return (
    <Busy label={label} className="cards">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rec groupcard sk" aria-hidden>
          <div className="meat">
            <div className="groupcard-top">
              <Sk w="1rem" h="1rem" r="var(--radius-xs)" style={wave(i)} />
              <span className="groupcard-title">
                <Sk w="62%" h="1rem" style={wave(i)} />
                <Sk w="40%" style={{ marginTop: '0.375rem', ...wave(i) }} />
              </span>
            </div>
            <Sk w="4.5rem" h="1.25rem" r="var(--radius-pill)" style={wave(i)} />
            <div className="groupcard-facts">
              {Array.from({ length: facts }, (_, j) => (
                <div key={j}><Sk w="50%" style={wave(i)} /><Sk w="70%" style={{ marginTop: '0.25rem', ...wave(i) }} /></div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </Busy>
  );
}

/** The map view's stage. It carries the real `.pf` / `.pf-stage` classes, so it
 *  fills the column exactly the way the live map does — and the caption line
 *  under it is reserved too, or the map would grow by one line when the count
 *  arrives. */
/** A map while it loads (design.md § Loading): the ground as a faint tile
 *  grid, the zoom pair top-left and the scale bottom-left where Leaflet will
 *  draw them, filling the stage it sits in — so the map replaces it in place
 *  instead of a flat slab, then a "Loading…" box, then the map. Pass `label`
 *  when nothing around it already announces the wait. */
export function SkMap({ label }: { label?: string }) {
  const scaffold = (
    <>
      <span className="skeleton skmap-ground" />
      <span className="skmap-zoom"><Sk w="1.875rem" h="1.875rem" r="var(--radius-xs)" /><Sk w="1.875rem" h="1.875rem" r="var(--radius-xs)" /></span>
      <span className="skmap-scale"><Sk w="5rem" h="0.375rem" /></span>
    </>
  );
  return label
    ? <div className="skmap" role="status" aria-busy="true" aria-label={label}><span className="skmap-fill" aria-hidden>{scaffold}</span></div>
    : <div className="skmap" aria-hidden>{scaffold}</div>;
}

/** A document while it loads: a sheet in page proportion with a heading and
 *  lines of text, so a scan or preview lands on the page it was promised. */
export function SkPaper({ label, h = '26rem' }: { label: string; h?: string }) {
  return (
    <Busy label={label} className="card" style={{ height: h, display: 'grid', alignContent: 'start', gap: '0.625rem' }}>
      <span aria-hidden style={{ display: 'contents' }}>
        <Sk w="45%" h="1rem" />
        {['92%', '88%', '95%', '70%', '90%', '84%', '60%', '93%', '78%'].map((w, i) => (
          <Sk key={i} w={w} style={wave(i)} />
        ))}
      </span>
    </Busy>
  );
}

export function SkPortfolioMap({ label = 'Loading the map of your properties' }: {
  /** What is loading, in the noun the screen's `Failed what=` uses. The
   *  combined map waited as "the map of your properties" and failed as "The
   *  combined map" — two names for one read. */
  label?: string;
} = {}) {
  return (
    <Busy label={label} className="pf">
      <div className="plot pf-stage" aria-hidden><SkMap /></div>
      <SkText className="note" w="18rem" />
    </Busy>
  );
}

/** The facet rail. Its group names and counts are all server-side — the page
 *  cannot honestly print "Kind" before the query says there is one — so this
 *  stands in for four groups of checkboxes and keeps the 15rem column from
 *  snapping open when they arrive. */
export function SkFacetRail({ groups = 4 }: { groups?: number }) {
  return (
    <Busy label="Loading filters" style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      {Array.from({ length: groups }, (_, g) => (
        <div className="grp" key={g} aria-hidden>
          <Sk w="3.5rem" h="0.625rem" style={{ marginBottom: '0.25rem', ...wave(g) }} />
          {Array.from({ length: g === 0 ? 3 : 2 }, (_, i) => (
            <div className="check" key={i} style={{ gap: '0.5625rem' }}>
              <Sk w="0.9375rem" h="0.9375rem" r="var(--radius-xs)" style={{ flex: 'none' }} />
              <Sk w={`${4 + ((g + i) % 3)}rem`} style={wave(g + i)} />
              <Sk w="0.875rem" style={{ flex: 'none', marginLeft: 'auto' }} />
            </div>
          ))}
        </div>
      ))}
    </Busy>
  );
}

// ── W03, the record 360 ────────────────────────────────────────────────

/** The rows of a hairline-ruled list, and nothing else — avatar, two stacked
 *  lines, a trailing chip. Bare so a screen that already owns the `.rows.boxed`
 *  container can put these INSIDE it: a skeleton card stacked above the real
 *  empty one is two boxes where the answer will be one.
 *
 *  The ragged widths are deliberate and derived from the index rather than
 *  random: identical bars read as a table of one repeated value, and anything
 *  actually random would reshuffle on every re-render. */
export function SkRowItems({ rows = 4 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div key={`sk-${i}`} aria-hidden>
          <Sk w="2.25rem" h="2.25rem" r="var(--radius-pill)" style={{ flex: 'none', ...wave(i) }} />
          <span className="grow">
            <Sk w={`${9 + ((i * 3) % 7)}rem`} h="0.9375rem" style={wave(i)} />
            <Sk w={`${6 + ((i * 5) % 9)}rem`} h="0.8125rem" style={{ marginTop: '0.3125rem', ...wave(i) }} />
          </span>
          <Sk w="4.5rem" h="1.375rem" r="var(--radius-pill)" style={{ flex: 'none', ...wave(i) }} />
        </div>
      ))}
    </>
  );
}

/** The same rows in their own card, for a screen that has not drawn one yet. */
export function SkRows({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <Busy label={label} className="card" style={{ padding: 0 }}>
      <div className="rows boxed"><SkRowItems rows={rows} /></div>
    </Busy>
  );
}

/** The six hangers, printed for real but inert. They are a constant in
 *  pages/Record.tsx, and a tab strip that appears late is the single most
 *  visible jump on this screen — the headline moves, then the strip lands,
 *  then the content shifts down. Here it simply never moves. */
function SkTabs() {
  const TABS = ['Overview', 'Documents', 'Site features', 'People', 'Services', 'Money', 'Activity'];
  return (
    <nav className="tabs" aria-hidden>
      {TABS.map((t) => <span key={t} className="sk-tab muted">{t}</span>)}
    </nav>
  );
}

/** The whole record page, before the record itself is known.
 *
 *  This one earns its length. `useRecord` gates the entire 360 — until it
 *  resolves there is no title, no extent, no tab strip and no map — so what
 *  stood here was a single 70vh grey slab, which tells the reader nothing
 *  except that something may be wrong with their connection.
 *
 *  The nesting matters as much as the shapes: the tab strip is the head's last
 *  row and the stat strip lives INSIDE the split's left column, as on the real
 *  screen. Drawn elsewhere they would snap into place the instant the record
 *  landed, and the map rail would jump up the page with them. */
/** Which hanger the skeleton should be shaped like.
 *
 *  The parent route cannot see which child rendered, so this reads the segment
 *  after the record id rather than taking a prop nobody can thread. The index
 *  route has no segment and is Papers. */
function hangerOf(pathname: string): string {
  // /properties/:id            -> 'overview' (the index)
  // /properties/:id/documents  -> 'papers'
  // /properties/:id/money      -> 'money'
  const seg = pathname.split('/')[3] ?? '';
  return seg === 'documents' ? 'papers' : seg || 'overview';
}

/** The Overview tab's first read: the summary strip and two cards, the
 *  shape RecordOverview draws (a strip of tab cells, then "Title"
 *  and the first field card). Drawn inside the frame, under the tab strip. */
export function SkOverview() {
  return <Busy label="Loading the overview"><OverviewShape /></Busy>;
}

function OverviewShape() {
  // The real Cell and Card, so the grey shape is the shape that lands.
  return (
    <div className="stack lg" aria-hidden>
      <div className="strip overview-strip">
        {Array.from({ length: 9 }, (_, i) => (
          <Cell key={i} k="" v={<Sk w="2.5rem" h="1.125rem" style={wave(i)} />} />
        ))}
      </div>
      {/* Title beside Complete this property, then the three groups. */}
      <div className="ov-sizer">
        <div className="ov-top">
          {['8rem', '9rem'].map((w, i) => (
            <Card key={w} title={<Sk w={w} h="1rem" />}>
              <Sk w={i ? '100%' : '40%'} h={i ? '0.5rem' : '1.25rem'} style={wave(i)} />
              <Sk w="88%" style={{ marginTop: '0.75rem' }} />
              <Sk w="70%" style={{ marginTop: '0.5rem' }} />
            </Card>
          ))}
        </div>
      </div>
      <div className="ov-groups">
        {['5rem', '5.5rem', '4rem'].map((w, i) => (
          <Card key={w} title={<Sk w={w} h="1rem" />}>
            <Sk w="60%" style={wave(i)} />
            <Sk w="80%" style={{ marginTop: '0.5rem' }} />
          </Card>
        ))}
      </div>
    </div>
  );
}

export function SkRecordPage() {
  const hanger = hangerOf(useLocation().pathname);
  const papers = hanger === 'papers';
  // Only Expenses carries a figure strip (its own totals). The record's
  // header lost its figure strip — the extent is a pill in the frame now — so
  // drawing one on Documents made the page jump when the record landed.
  const strip = hanger === 'expenses';
  const rail = papers || hanger === 'location';

  return (
    <main>
      <Busy label="Loading this property">
        {/* The shared head's slots (design.md § Page head, detail page), as
            RecordHead fills them: crumbs, the title row with two outlined
            buttons and a ⋮, the meta row (kind · place · holder), then the
            tabs as the head's last row on every hanger. The kind label sits
            under the h1, where RecordHead draws it (content-header audit F11). */}
        <header className="pagehead" data-kind="detail" aria-hidden>
          <div className="crumbs" style={{ height: '1.5em' }}>
            <Sk w="4.5rem" h="0.8125rem" style={{ display: 'inline-block' }} />
          </div>
          <div className="pagehead-row">
            <div className="pagehead-title"><SkText as="h1" w="12rem" lh={1.05} bar="0.56em" /></div>
            <div className="actions">
              <Sk w="9.5rem" h="2.375rem" r="var(--radius-pill)" />
              <Sk w="9.5rem" h="2.375rem" r="var(--radius-pill)" />
              <Sk w="2rem" h="2.375rem" r="var(--radius-pill)" />
            </div>
          </div>
          <div className="pagehead-meta">
            <SkText className="eyebrow rechead-kind" w="7rem" />
            <SkText w="18rem" />
          </div>
          <div className="pagehead-tabs"><SkTabs /></div>
        </header>

        <div className={rail ? 'split' : undefined}>
          <div>
            {/* Expenses' four totals: spent, improvements, upkeep, owed back.
                The k/v/s spans are the real ones, so the cell's height comes
                from the same CSS that will hold the real figures. */}
            {strip && (
            <div className="strip" aria-hidden style={{ marginBottom: 'var(--space-lg)' }}>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i}>
                  <SkText className="k" w="3.75rem" />
                  <SkText className="v" w="4.5rem" lh={1.1} style={wave(i)} />
                </div>
              ))}
            </div>
            )}

            {/* The search box and the "Add a paper" button above the list — the
                Papers hanger's own controls, and nobody else's. */}
            {papers && (
              <div className="row" aria-hidden style={{ gap: 'var(--space-sm)', margin: 'var(--space-md) 0' }}>
                <Sk w="22rem" h="2.5625rem" r="var(--radius-pill)" style={{ flex: 'none' }} />
                <Sk w="7.5rem" h="2rem" r="var(--radius-pill)" style={{ flex: 'none' }} />
              </div>
            )}

            {/* Overview is a strip and cards; Features is a card grid;
                everything else is a list of rows. */}
            {hanger === 'overview' ? <OverviewShape /> : hanger === 'site-features' ? (
              <div className="cards" aria-hidden>
                {Array.from({ length: 6 }, (_, i) => (
                  <div className="card" key={i} style={wave(i)}>
                    <SkText as="h3" w="7rem" lh={1.3} bar="1rem" />
                    <SkText className="note" w="90%" style={{ marginTop: '0.5rem' }} />
                    <SkText className="note" w="55%" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                <div className="rows boxed"><SkRowItems rows={papers ? 3 : 5} /></div>
              </div>
            )}
          </div>

          {rail && (
          <aside className="stack" aria-hidden>
            {/* Two captioned cards, which is what the Papers rail is: what is
                missing from the papers, and what the deed says.

                It used to promise a map thumbnail here — a fixed-height block
                the length of the rail was measured from. The map is the Location
                hanger's now, so the placeholder was reserving space for a card
                that never arrived and the page visibly collapsed once the real
                rail landed. A skeleton that draws something the screen does not
                have is worse than no skeleton: it is a promise. */}
            {[0, 1].map((i) => (
              <div className="card" key={i}>
                <SkText as="h3" w={i ? '5.5rem' : '7rem'} lh={1.3} bar="0.75rem" />
                <SkText className="note" w="100%" style={{ marginTop: '0.5rem' }} />
                <SkText className="note" w="88%" />
                <SkText className="note" w="70%" />
              </div>
            ))}
          </aside>
          )}
        </div>
      </Busy>
    </main>
  );
}
