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
 *  line: cover, title + kind pill, owner, place, chips, rule, figure row. */
function SkCard({ i }: { i: number }) {
  return (
    <div className="rec sk" aria-hidden>
      <div className="art" style={wave(i)} />
      <div className="meat">
        <div className="row between" style={{ flexWrap: 'nowrap' }}>
          <Sk w="55%" h="1rem" />
          <Sk w="2.5rem" h="1.125rem" r="var(--radius-pill)" style={{ flex: 'none' }} />
        </div>
        <Sk w="38%" style={{ marginTop: '0.5rem' }} />
        <Sk w="64%" style={{ marginTop: '0.4375rem' }} />
        <div className="row tight" style={{ margin: '0.75rem 0' }}>
          <Sk w="5.5rem" h="1.375rem" r="var(--radius-pill)" style={{ flex: 'none' }} />
          <Sk w="3.25rem" h="1.375rem" r="var(--radius-pill)" style={{ flex: 'none' }} />
        </div>
        <hr className="hr" style={{ margin: '0 0 0.625rem' }} />
        {/* The one line the card exists for — extent, alternate unit, worth —
            so it is the one that must not reflow when the figures land. */}
        <div className="row" style={{ flexWrap: 'nowrap', gap: '0.5rem' }}>
          <Sk w="4.5rem" h="1.125rem" style={{ flex: 'none' }} />
          <Sk w="5rem" h="0.8125rem" />
          <Sk w="2.75rem" h="0.875rem" style={{ flex: 'none', marginLeft: 'auto' }} />
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
      <table className="rectable" style={{ minWidth: '46rem' }}>
        <thead>
          <tr>
            <th className="selcol" />
            <th>Record</th>
            <th>Owner</th>
            <th>Where</th>
            <th>Status</th>
            <th className="right">Extent</th>
            <th className="right">Worth</th>
            <th className="menucol" />
          </tr>
        </thead>
        <tbody aria-hidden>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              <td className="selcol">
                <Sk w="0.9375rem" h="0.9375rem" r="var(--radius-xs)" style={{ margin: '0 auto' }} />
              </td>
              <td><Sk w="72%" style={wave(i)} /></td>
              <td><Sk w="58%" style={wave(i)} /></td>
              <td><Sk w="80%" style={wave(i)} /></td>
              <td><Sk w="3.75rem" h="1.25rem" r="var(--radius-pill)" style={wave(i)} /></td>
              <td className="right"><Sk w="3.5rem" style={{ marginLeft: 'auto', ...wave(i) }} /></td>
              <td className="right"><Sk w="3rem" style={{ marginLeft: 'auto', ...wave(i) }} /></td>
              <td className="menucol" />
            </tr>
          ))}
        </tbody>
      </table>
    </Busy>
  );
}

/** The map view's stage. It carries the real `.pf` / `.pf-stage` classes, so it
 *  fills the column exactly the way the live map does — and the caption line
 *  under it is reserved too, or the map would grow by one line when the count
 *  arrives. */
export function SkPortfolioMap() {
  return (
    <Busy label="Loading the map of your properties" className="pf">
      <div className="plot pf-stage" aria-hidden />
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
  const TABS = ['Papers', 'Features', 'People', 'Services', 'Money', 'Audit'];
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
 *  The nesting matters as much as the shapes: the stat strip and the tab strip
 *  live INSIDE the split's left column on the real screen, not above it. Drawn
 *  full-width they would snap back to two-thirds the instant the record landed,
 *  and the map rail would jump a hundred pixels up the page with them. */
/** Which hanger the skeleton should be shaped like.
 *
 *  The parent route cannot see which child rendered, so this reads the segment
 *  after the record id rather than taking a prop nobody can thread. The index
 *  route has no segment and is Papers. */
function hangerOf(pathname: string): string {
  // /app/records/:id            -> '' (Papers, the index)
  // /app/records/:id/money      -> 'money'
  const seg = pathname.split('/')[4] ?? '';
  return seg || 'papers';
}

export function SkRecordPage() {
  const hanger = hangerOf(useLocation().pathname);
  const papers = hanger === 'papers';
  // Only Papers and Expenses carry the four-cell figure strip; the rest open
  // straight into their own body.
  const strip = papers || hanger === 'expenses';
  const rail = papers || hanger === 'map';

  return (
    <main>
      <Busy label="Loading this record">
        <div className="crumbs" aria-hidden style={{ height: '1.5em' }}>
          <Sk w="4.5rem" h="0.8125rem" style={{ display: 'inline-block' }} />
        </div>

        <header className="pagehead" aria-hidden>
          <div className="grow">
            <SkText as="p" className="eyebrow" w="9rem" lh={1.55} />
            <SkText as="h1" w="12rem" lh={1.05} bar="0.56em" />
            <SkText as="p" className="lede" w="20rem" style={{ marginTop: '0.375rem' }} />
          </div>
          {/* Two buttons and a kebab, at the pill height the real ones use. */}
          <div className="actions">
            <Sk w="9.5rem" h="2.375rem" r="var(--radius-pill)" />
            <Sk w="9.5rem" h="2.375rem" r="var(--radius-pill)" />
            <Sk w="2rem" h="2.375rem" r="var(--radius-pill)" />
          </div>
        </header>

        {/* Tabs sit inside the split's left column on Papers and ABOVE the body
            on every other hanger — which is exactly where each of those screens
            renders RecordTabs. Drawn in the wrong place they snapped from
            two-thirds width to full width the instant the record landed, taking
            the map rail a hundred pixels up the page with them: the jump this
            module exists to prevent, on five of the six tabs. */}
        {!papers && <SkTabs />}

        <div className={rail ? 'split' : undefined}>
          <div>
            {/* Four cells, because every record has four: extent, market value,
                the per-unit rate, and the year it was bought. The k/v/s spans
                are the real ones, so the cell's height comes from the same CSS
                that will hold the real figures. */}
            {strip && (
            <div className="strip" aria-hidden style={{ marginBottom: 'var(--space-lg)' }}>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i}>
                  <SkText className="k" w="3.75rem" />
                  <SkText className="v" w="4.5rem" lh={1.1} style={wave(i)} />
                  {/* Only the extent carries a sub-line — "12 Acres 9.3 Guntas
                      · 1,223 Cents" — so only the first cell reserves one. */}
                  {i === 0 && (
                    <span className="s" style={{ display: 'block' }}>
                      <SkText w="11rem" lh={1.4} />
                      <SkText w="7rem" lh={1.4} />
                    </span>
                  )}
                </div>
              ))}
            </div>
            )}

            {papers && <SkTabs />}

            {/* The search box and the "Add a paper" button above the list — the
                Papers hanger's own controls, and nobody else's. */}
            {papers && (
              <div className="row" aria-hidden style={{ gap: 'var(--space-sm)', margin: 'var(--space-md) 0' }}>
                <Sk w="22rem" h="2.5625rem" r="var(--radius-pill)" style={{ flex: 'none' }} />
                <Sk w="7.5rem" h="2rem" r="var(--radius-pill)" style={{ flex: 'none' }} />
              </div>
            )}

            {/* Features is a card grid; everything else is a list of rows. */}
            {hanger === 'features' ? (
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
