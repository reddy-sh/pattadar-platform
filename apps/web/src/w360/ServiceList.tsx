/** The catalogue, drawn one way wherever it appears.
 *
 *  An owner choosing a service compares three facts: what it is, what it
 *  costs and how long it takes. So each service is one row carrying those
 *  facts once — `ServiceTable` on the order page (and the read-only catalogue
 *  an account with no land sees), `ServiceList` in the super-admin's Service
 *  catalogue. design.md allows no scenes on /app pages.
 *
 *  "What is this?" answers in place, under the row, in Pattadar's words first,
 *  and then hands the owner to Pattadar University for the full guide to the
 *  paper — for the state the land is in. It sits beside the row's own control,
 *  never inside it: a link inside a button is a control nobody can tab to.
 */
import { Fragment, useId, useState } from 'react';
import type { ReactNode } from 'react';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import type { ServiceOffer } from './api';
import { groupsOf } from './orderFlow';
import { STATE_NAME, guidesFor } from './serviceGuides';
import type { StateCode } from './serviceGuides';
import { Card, Menu, SelectAllBox, StatusChip, Tag, inr, inrOr, plural } from './ui';
import type { MenuItem } from './ui';

/** Is there anything to say under "What is this?" beyond the row itself? */
const explains = (o: ServiceOffer) => !!o.deliverable || !!o.alsoCalled || o.guides.length > 0;

/** The answer to "What is this?" for one service.
 *
 *  `state` is the land's state. When it is not known — the catalogue before a
 *  property is chosen — the University link is offered for both states rather
 *  than guessing Andhra Pradesh. */
export function ServiceExplainer({ offer, state, id }: {
  offer: ServiceOffer; state: StateCode | null; id?: string;
}) {
  const get = offer.deliverable;
  const also = offer.alsoCalled;
  const states: StateCode[] = state ? [state] : ['AP', 'TS'];
  const links = states.flatMap((code) => guidesFor(offer, code).map((g) => ({ ...g, code })));
  // The limit is the University's real contribution: what this paper does not
  // prove. Said only when the state is known, because the two states' guides
  // put it differently.
  const limits = state ? links.map((l) => l.limit).filter(Boolean) : [];
  return (
    <div className="svc-explain-panel" id={id}>
      {get && (
        <p><strong>What you get</strong> {get}.</p>
      )}
      {also && <p>{also}.</p>}
      {limits.map((l) => (
        <p key={l}><strong>What it cannot prove</strong> {l}</p>
      ))}
      {links.length > 0 && (
        <p className="svc-uni">
          <span>Read the full guide on Pattadar University:</span>
          {links.map((l) => (
            <a key={l.href} className="link" href={l.href} target="_blank" rel="noopener noreferrer"
               aria-label={`${state ? '' : `${STATE_NAME[l.code]}: `}${l.title}, on Pattadar University (opens in a new tab)`}>
              {state ? l.title : `${STATE_NAME[l.code]} · ${l.title}`}
              <OpenInNewOutlined sx={{ fontSize: 13 }} aria-hidden />
            </a>
          ))}
        </p>
      )}
    </div>
  );
}

/** The "What is this?" toggle, for a row or for a page that names one service. */
export function ExplainToggle({ offer, open, onToggle, controls }: {
  offer: ServiceOffer; open: boolean; onToggle: () => void; controls: string;
}) {
  if (!explains(offer)) return null;
  return (
    // The service's name rides along hidden, so a list of twelve toggles is
    // not twelve identical "What is this?" — and the visible words stay at the
    // front of the accessible name.
    <button type="button" className="svc-explain" aria-expanded={open} aria-controls={controls}
            onClick={onToggle}>
      {open ? 'Hide' : 'What is this?'}
      <span className="sr-only"> {offer.label}</span>
    </button>
  );
}

/** The super-admin's view of the marketplace (Service catalogue): every row
 *  opens its editor. `off` rows are shown, marked, because the admin switches
 *  them back on here; `note` says who set the row. Owners choose services from
 *  `ServiceTable` below. */
type Mode = {
  mode: 'manage'; onManage: (o: ServiceOffer) => void; off?: (key: string) => boolean;
  note?: (o: ServiceOffer) => string;
  /** The row's ⋮: everything else the manager can do to this service. */
  menu?: (o: ServiceOffer) => MenuItem[];
};

export function ServiceList(props: Mode & {
  offers: ServiceOffer[];
  state: StateCode | null;
  /** Names the list for a screen reader: "Services". */
  label: string;
  /** Draw a subhead over each group. Off when a chip has already narrowed to one. */
  grouped?: boolean;
  /** Sits under the list, inside the same box. */
  footer?: ReactNode;
  /** 'grid' draws each service as a card, several to a row (the Service
   *  catalogue's Grid view); the default is a one-column list. */
  layout?: 'list' | 'grid';
}) {
  const { offers, state, label, grouped, layout = 'list' } = props;
  const [open, setOpen] = useState('');
  const base = useId();
  const groups = grouped ? groupsOf(offers) : [''];

  const off = (key: string) => !!props.off?.(key);
  const row = (o: ServiceOffer) => {
    const panel = `${base}-${o.key}`;
    const body = (
      <>
        <span className="svc-body">
          <span className="svc-name">
            {o.label}
            {layout === 'grid' && off(o.key) && <> <StatusChip state="warn">Off</StatusChip></>}
          </span>
          <span className="svc-get">{o.blurb}</span>
          {layout === 'list' && (
            <span className="svc-days">
              about {o.days} days
              {off(o.key) && ' · Off'}
              {props.note && ` · ${props.note(o)}`}
            </span>
          )}
        </span>
        {layout === 'list' ? (
          <span className="svc-price">{inr(o.price)}</span>
        ) : (
          // The card's foot: the price large on the left, how long on the right,
          // and under them where this price comes from.
          <span className="svc-foot">
            <span className="svc-price">{inr(o.price)}</span>
            <span className="svc-days">about {o.days} days</span>
            {props.note && <span className="svc-note">{props.note(o)}</span>}
          </span>
        )}
      </>
    );
    return (
      <li key={o.key} className="svc-row" data-mode="manage" data-state={off(o.key) ? 'off' : undefined}>
        <button type="button" className="svc-main" onClick={() => props.onManage(o)}
                aria-label={`Edit ${o.label}`}>
          {body}
        </button>
        {(explains(o) || props.menu) && (
          <div className="svc-aside">
            <ExplainToggle offer={o} open={open === o.key} controls={panel}
                           onToggle={() => setOpen(open === o.key ? '' : o.key)} />
            {props.menu && layout === 'list' && (
              <Menu label={`Actions for ${o.label}`} header={o.label} items={props.menu(o)}
                    className="svc-more" />
            )}
          </div>
        )}
        {/* A card's ⋮ sits in its top-right corner, as on a property card. */}
        {props.menu && layout === 'grid' && (
          <Menu label={`Actions for ${o.label}`} header={o.label} items={props.menu(o)}
                className="svc-more svc-corner" />
        )}
        {open === o.key && <ServiceExplainer offer={o} state={state} id={panel} />}
      </li>
    );
  };

  return (
    <div className={layout === 'grid' ? 'svc-list grid' : 'svc-list'}>
      {groups.map((g) => {
        const these = g ? offers.filter((o) => o.group === g) : offers;
        if (these.length === 0) return null;
        return (
          <Fragment key={g || 'all'}>
            {g && <p className="eyebrow svc-group">{g}</p>}
            <ul aria-label={g ? `${label}: ${g}` : label}>{these.map(row)}</ul>
          </Fragment>
        );
      })}
      {props.footer}
    </div>
  );
}

/** Recommended first (the catalogue's own `featured` flag), then the groups in
 *  `groupsOf` order, then the catalogue's order within a group. */
export function rankOffers(offers: ServiceOffer[]): ServiceOffer[] {
  const groups = groupsOf(offers);
  return offers
    .map((o, i) => ({ o, i }))
    .sort((a, b) => Number(b.o.featured) - Number(a.o.featured)
      || groups.indexOf(a.o.group) - groups.indexOf(b.o.group)
      || a.i - b.i)
    .map(({ o }) => o);
}

/** One service as an owner chooses it: the facts of the row, already worked
 *  out for the land in hand. */
export interface ServiceLine {
  offer: ServiceOffer;
  /** "₹1,180", or "₹1,180–₹1,400 each" across several places. */
  price: string;
  /** What ordering it costs in rupees, across every property it goes to —
   *  the figure the footer adds up for the ticked rows. */
  amount?: number;
  /** "All" or "2 of 3": where among the chosen properties it is offered. */
  where?: string;
  /** Why it cannot be chosen; the box is off and this is said in the row. */
  blocked?: ReactNode;
}

/** The catalogue as a compact table: one row a service, recommended first.
 *
 *  With `selected` it is the order page's multi-select (a box per row and
 *  one over the column); without it, the read-only catalogue an account with
 *  no land yet can still read. "What is this?" opens a row under the row. */
export function ServiceTable({ lines, label, selected, onToggle, onToggleAll }: {
  lines: ServiceLine[];
  /** The table's accessible name. */
  label: string;
  selected?: ReadonlySet<string>;
  onToggle?: (key: string) => void;
  onToggleAll?: () => void;
}) {
  const [open, setOpen] = useState('');
  const base = useId();
  const picking = !!selected && !!onToggle;
  const where = lines.some((l) => l.where !== undefined);
  const free = lines.filter((l) => !l.blocked);
  const cols = 5 + (picking ? 1 : 0) + (where ? 1 : 0);
  // The table standard's footer: what the ticked services add up to, as a
  // spreadsheet's status bar would — count, rupees, and the longest wait.
  const picked = picking ? free.filter((l) => selected.has(l.offer.key)) : [];
  return (
    // Positioned, so the visually hidden names inside the rows are clipped by
    // this scroller instead of widening the page on a phone.
    <Card flush className="scroll-x edgefade" style={{ position: 'relative' }}>
      <table className="rectable svc-table" aria-label={label} style={{ minWidth: picking ? '44rem' : '36rem' }}>
        <thead>
          <tr>
            {picking && (
              <th className="selcol">
                {onToggleAll && (
                  <SelectAllBox total={free.length} picked={picked.length} noun={['service', 'services']}
                                onToggle={onToggleAll} />
                )}
              </th>
            )}
            <th>Service</th>
            <th>Group</th>
            <th className="right">Price</th>
            <th>Takes</th>
            {where && <th>Available at</th>}
            <th><span className="sr-only">About the service</span></th>
          </tr>
        </thead>
        <tbody>
          {lines.map(({ offer: o, price, where: at, blocked }) => {
            const on = picking && !blocked && selected.has(o.key);
            const panel = `${base}-${o.key}`;
            return (
              <Fragment key={o.key}>
                <tr className={`${on ? 'selected' : ''}${picking && !blocked ? ' openrow' : ''}`}
                    data-key={o.key}
                    onClick={(e) => {
                      if (!picking || blocked) return;
                      const t = e.target as HTMLElement;
                      if (t.closest('a, button, input')) return;
                      onToggle(o.key);
                    }}>
                  {picking && (
                    <td className="selcol">
                      <input type="checkbox" checked={on} disabled={!!blocked}
                             aria-label={`Choose ${o.label}`}
                             aria-describedby={blocked ? `${panel}-why` : undefined}
                             onChange={() => onToggle(o.key)} />
                    </td>
                  )}
                  <td>
                    <strong>{o.label}</strong>
                    {o.featured && <> <Tag>Recommended</Tag></>}
                    {blocked && <span id={`${panel}-why`} className="note" style={{ display: 'block' }}>{blocked}</span>}
                  </td>
                  <td className="muted">{o.group}</td>
                  <td className="right num" style={{ whiteSpace: 'nowrap' }}>{price}</td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>about {o.days} days</td>
                  {where && <td className="muted">{at}</td>}
                  <td>
                    <button type="button" className="svc-explain" aria-expanded={open === o.key}
                            aria-controls={panel} onClick={() => setOpen(open === o.key ? '' : o.key)}>
                      {open === o.key ? 'Hide' : 'What is this?'}
                      <span className="sr-only"> {o.label}</span>
                    </button>
                  </td>
                </tr>
                {open === o.key && (
                  <tr className="svc-table-more">
                    <td colSpan={cols}>
                      <p className="note" style={{ margin: '0 0 var(--space-xs)' }}>{o.blurb}</p>
                      <ServiceExplainer offer={o} state={null} id={panel} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        {picking && (
          <tfoot>
            <tr>
              <td className="selcol" />
              <th scope="row" colSpan={2}>
                {picked.length > 0 ? `${plural(picked.length, 'service')} selected` : 'Nothing chosen yet'}
              </th>
              <td className="right num">{inrOr(picked.reduce((n, l) => n + (l.amount ?? 0), 0))}</td>
              <td className="num">
                {picked.length > 0 ? `up to ${Math.max(...picked.map((l) => l.offer.days))} days` : ''}
              </td>
              {where && <td />}
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </Card>
  );
}
