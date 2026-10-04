/**
 * The fence calculator — a tool that takes over the map, not a card beside it.
 *
 * Fencing is a job you do to a SHAPE, and the questions it asks are about the
 * ground: which sides am I fencing, where does the gate go, how far apart do
 * the posts stand. Answering those in a 24-rem column next to a village map
 * meant the thing being priced was never actually in view. Here the boundary
 * fills the screen with its corners lettered and its sides dimensioned, the
 * panel sits on whichever hand suits you, and every number in the estimate can
 * be pointed at on the map.
 *
 * Three steps, in the order anyone would ask them: what is being fenced, what
 * it is being fenced with, and what that comes to. They are all on one panel
 * rather than behind Next buttons — a wizard hides the effect of the answer
 * you just gave, and the whole value here is watching the total move.
 *
 * Steps 2 and 3, the sheet and the sums are shared with the Tools tab
 * (`/app/tools?tab=fence`) through FenceParts.tsx and fenceBill.ts: this file
 * owns only what needs a shape — the map, the side toggles and the request.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import ViewSidebarOutlined from '@mui/icons-material/ViewSidebarOutlined';
import { cornerLabel, ringSides } from '@pattadar/core';

import { useCreateRequest, useOrders } from './api';
import { fenceBill } from './fenceBill';
import { FenceBillTable, FenceBuildFields, FenceSheet, useFenceBuild } from './FenceParts';
import { openSameJob } from './orderFlow';
import { MapCanvas } from './MapCanvasLazy';
import { inrFull, num } from './ui';

export interface FenceStudioProps {
  /** What is being fenced, in words: "Plot 839". */
  title: string;
  subtitle?: string;
  ring: Array<[number, number]>;
  /** An open run has a corner at each end; a plot closes on itself. */
  closed?: boolean;
  /** The record this plot IS, when it is one of the account's. Without it the
   *  estimate can be printed and nothing else — there is nothing to raise the
   *  work against, and inventing a record to hold it would be worse. */
  recordId?: string;
  recordTitle?: string;
  onClose: () => void;
}

export function FenceStudio({
  title, subtitle, ring, closed = true, recordId, recordTitle, onClose,
}: FenceStudioProps) {
  const nav = useNavigate();
  const ask = useCreateRequest();
  const openOrders = useOrders(recordId || '', false, true);
  const duplicate = openSameJob(openOrders.data, 'fencing');
  const [asked, setAsked] = useState('');
  const [panel, setPanel] = useState<'left' | 'right'>('right');
  const [dropped, setDropped] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<number | null>(null);
  const [build, setField] = useFenceBuild();
  const { spacing, strands, gateWidth, roll, postRate, wireRate, gateRate } = build;

  const sides = useMemo(() => ringSides(ring).map((s) => s.metres), [ring]);
  const kept = useMemo(
    () => sides.map((m, i) => (dropped.has(i) ? 0 : m)).filter((m) => m > 0),
    [sides, dropped],
  );

  // Dropping a side opens the run: what is left is a set of lines with two
  // ends each, not a loop. Only a boundary with every side kept still closes.
  const bill = useMemo(
    () => fenceBill(kept, closed && dropped.size === 0, build),
    [kept, closed, dropped, build],
  );
  const { plan, gateCount, wireRun, wire, gatePosts, posts, rolls, gateCost, total } = bill;

  /** The estimate, as a sentence somebody can act on. A work request carries
   *  its message to Services and to whoever it is assigned to, so the message
   *  has to hold the whole bill — not "fencing needed". */
  const raise = async () => {
    if (!recordId || duplicate || openOrders.error || !openOrders.data) return;
    setAsked('');
    const lines = [
      `Fence ${title}${subtitle ? ` (${subtitle})` : ''} — ${num(plan.perimeter, 1)} m`
        + ` around ${plural(kept.length, 'side')}.`,
      `${num(posts)} posts: ${num(plan.cornerPosts)} at the corners,`
        + ` ${num(plan.linePosts)} along the sides at ${spacing} m at most`
        + (gatePosts ? `, ${num(gatePosts)} at the gates` : '') + '.',
      `${num(wire, 0)} m of wire — ${num(wireRun, 1)} m of fence × ${strands} strands`
        + (rolls ? `, ${num(rolls)} rolls of ${roll} m` : '') + '.',
      gateCount ? `${plural(gateCount, 'gate')}, ${gateWidth} m wide.` : '',
      total > 0 ? `Materials come to ${inrFull(total)} at the rates on file`
        + ` (${inrFull(Number(postRate) || 0)} a post,`
        + ` ${inrFull(Number(wireRate) || 0)} a metre of wire`
        + (gateCost ? `, ${inrFull(Number(gateRate) || 0)} a gate` : '') + ').' : '',
      'Materials only — labour, corner bracing and cartage are not in it.',
    ].filter(Boolean);
    try {
      const res = await ask.mutateAsync({
        recordId, kind: 'fencing', message: lines.join('\n'),
        requester: 'the owner', shared: '',
      });
      if (!res.web.createRequest) {
        setAsked('That request was not accepted.');
        return;
      }
      nav(`/app/records/${recordId}/services`);
    } catch (e) {
      setAsked(e instanceof Error ? e.message : 'That request could not be raised.');
    }
  };

  const toggle = (i: number) => {
    setActive(i);
    setDropped((was) => {
      const next = new Set(was);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  // `plot live` is the class pair every map panel in this app wears: MapCanvas
  // renders a bare `.map` div and relies on that ancestor for its size. Without
  // it Leaflet measures 0×0, computes zoom 0 and draws nothing at all.
  const map = (
    <div className="plot live fs-map">
      <MapCanvas
        basemap="satellite"
        ring={ring}
        sideLabels={sides.map((m) => `${m.toFixed(1)} m`)}
        activeSide={active}
        onSideClick={toggle}
        title={title}
      />
    </div>
  );

  const steps = (
    <div className="fs-panel">
      <section>
        <p className="eyebrow">Step 1 · What you are fencing</p>
        <p className="note">
          {plural(kept.length, 'side')} of {plural(sides.length, 'side')} ·{' '}
          <strong>{num(plan.perimeter, 1)} m</strong> to fence.
        </p>
        <div className="rows fs-sides">
          {sides.map((m, i) => {
            const on = !dropped.has(i);
            return (
              <button key={cornerLabel(i)} type="button"
                      className={`fs-side${on ? ' on' : ''}`}
                      aria-pressed={on}
                      onMouseEnter={() => setActive(i)}
                      onMouseLeave={() => setActive(null)}
                      onClick={() => toggle(i)}>
                <span className="fs-letters">
                  {cornerLabel(i)}–{cornerLabel((i + 1) % sides.length)}
                </span>
                <span className="grow num">{m.toFixed(1)} m</span>
                <span className="note">{on ? 'fencing' : 'skipped'}</span>
              </button>
            );
          })}
        </div>
      </section>

      <FenceBuildFields build={build} set={setField} />

      <section>
        <p className="eyebrow">Step 3 · What it comes to</p>
        <FenceBillTable bill={bill} build={build}>
          {/* An estimate that cannot leave the screen is arithmetic, not a tool.
              It leaves two ways: printed, for the supplier, and raised as work on
              the record, for whoever is going to build it.
              Deliberately a REQUEST and not an expense or a feature: the fence
              does not exist yet and the money has not been spent. Writing either
              of those down would put a thing on the land that is not there. */}
          {recordId ? (
            <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
              {duplicate ? (
                <>
                  <Link className="btn sm primary" to={`/app/services/${duplicate.id}`}>
                    Open fencing request
                  </Link>
                  <Link className="btn sm danger" to={`/app/services/${duplicate.id}?action=cancel`}>
                    Cancel request
                  </Link>
                </>
              ) : (
                <button type="button" className="btn sm primary"
                        disabled={ask.isPending || openOrders.isLoading || !!openOrders.error}
                        onClick={() => void raise()}>
                  {ask.isPending ? 'Asking…' : openOrders.isLoading ? 'Checking requests…'
                    : `Ask for this on ${recordTitle ?? 'the property'}`}
                </button>
              )}
              <button type="button" className="btn sm" onClick={() => window.print()}>
                <PrintOutlined sx={{ fontSize: 15 }} /> Print for the supplier
              </button>
            </div>
          ) : (
            <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
              File this plot as a property to raise it as work.
            </p>
          )}
          {openOrders.error && recordId && (
            <p className="note" style={{ color: 'var(--w-danger)' }}>
              Existing requests could not be checked.
            </p>
          )}
          {asked && <p className="note" style={{ color: 'var(--w-danger)' }}>{asked}</p>}
        </FenceBillTable>
      </section>
    </div>
  );

  return (
    <div className={`fs${panel === 'left' ? ' flip' : ''}`}>
      <header className="fs-bar">
        <span className="grow">
          <span className="eyebrow">Fence calculator</span>
          <strong>{title}</strong>
          {subtitle && <span className="note"> · {subtitle}</span>}
        </span>
        <button type="button" className="btn sm"
                title="Move the panel to the other side"
                onClick={() => setPanel((p) => (p === 'right' ? 'left' : 'right'))}>
          <ViewSidebarOutlined sx={{ fontSize: 15 }} /> Panel {panel === 'right' ? 'left' : 'right'}
        </button>
        <button type="button" className="btn sm" onClick={() => window.print()}>
          <PrintOutlined sx={{ fontSize: 15 }} /> Print
        </button>
        <button type="button" className="btn sm" aria-label="Close the fence calculator"
                onClick={onClose}>
          <CloseOutlined sx={{ fontSize: 15 }} />
        </button>
      </header>
      <div className="fs-body">
        {map}
        {steps}
      </div>
      <FenceSheet title={title} subtitle={subtitle} sides={sides} dropped={dropped}
                  ring={ring} bill={bill} build={build} />
    </div>
  );
}

/** Local so this file can be read on its own; `plural` in ui.tsx is the same
 *  rule and is not worth a cycle of imports for one word. */
function plural(n: number, one: string) {
  return `${num(n)} ${n === 1 ? one : `${one}s`}`;
}
