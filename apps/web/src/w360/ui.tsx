/**
 * Primitives shared by the record-360 screens.
 *
 * These are plain elements over `w360.css`, not MUI components. The screens are
 * dense, hairline-ruled and mono-labelled in ways that fight MUI's defaults at
 * every turn; expressing them as semantic markup + one stylesheet is both
 * smaller and easier to keep faithful to the design.
 *
 * Numbers are formatted the Indian way throughout — lakh/crore short forms and
 * 2,2,3 digit grouping — because that is what the records actually say.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';

import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import AgricultureOutlined from '@mui/icons-material/AgricultureOutlined';
import ApartmentOutlined from '@mui/icons-material/ApartmentOutlined';
import BoltOutlined from '@mui/icons-material/BoltOutlined';
import CabinOutlined from '@mui/icons-material/CabinOutlined';
import CancelOutlined from '@mui/icons-material/CancelOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import DoorFrontOutlined from '@mui/icons-material/DoorFrontOutlined';
import ElectricBoltOutlined from '@mui/icons-material/ElectricBoltOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import FenceOutlined from '@mui/icons-material/FenceOutlined';
import GppGoodOutlined from '@mui/icons-material/GppGoodOutlined';
import GrassOutlined from '@mui/icons-material/GrassOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import MapOutlined from '@mui/icons-material/MapOutlined';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import OpacityOutlined from '@mui/icons-material/OpacityOutlined';
import ParkOutlined from '@mui/icons-material/ParkOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import RouteOutlined from '@mui/icons-material/RouteOutlined';
import SettingsInputComponentOutlined from '@mui/icons-material/SettingsInputComponentOutlined';
import StorefrontOutlined from '@mui/icons-material/StorefrontOutlined';
import VideocamOutlined from '@mui/icons-material/VideocamOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import WavesOutlined from '@mui/icons-material/WavesOutlined';
import BadgeOutlined from '@mui/icons-material/BadgeOutlined';
import HistoryEduOutlined from '@mui/icons-material/HistoryEduOutlined';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';

// ── Numbers, money, dates ──────────────────────────────────────────────

/** 12,34,567 — Indian grouping, not the western 1,234,567. */
export function inGroup(n: number): string {
  const neg = n < 0;
  const s = Math.round(Math.abs(n)).toString();
  if (s.length <= 3) return (neg ? '-' : '') + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${rest},${last3}`;
}

/** ₹1.40 Cr · ₹42.0 L · ₹10.08 L · ₹18,400 — the short forms the screens use.
 *
 *  Lakhs carry two decimals and then shed a trailing zero, so a round figure
 *  reads ₹42.0 L while a precise one keeps its paise-level truth: ₹10.08 L of
 *  stamp duty must not be rounded to ₹10.1 L on a cost sheet. */
export function inr(n: number, sign = false): string {
  const a = Math.abs(n);
  const lead = n < 0 ? '−' : sign ? '+' : '';
  if (a >= 1e7) return `${lead}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${lead}₹${(a / 1e5).toFixed(2).replace(/0$/, '')} L`;
  return `${lead}₹${inGroup(a)}`;
}

/** ₹58,00,000 — the full figure, for a consideration or a receipt. */
export const inrFull = (n: number) => `₹${inGroup(n)}`;

/** 2026-08-12 → 12/08/2026. Anything already DD/MM/YYYY passes through. */
export function ddmmyyyy(s: string): string {
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return s;
}

export const num = (n: number, dp = 0) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** "1 parcel" / "6 parcels" — a count with a noun that agrees with it.
 *  Screens were written around a portfolio that happened to be plural, so
 *  every one of them read "1 need repair" and "1 properties". */
export function plural(n: number, one: string, many?: string): string {
  return `${num(n)} ${n === 1 ? one : many ?? `${one}s`}`;
}

/** 15.3133 → "15.3133° N, 80.0729° E"; an unset pin returns "" so the caller
 *  can say so rather than printing 0.0000° N as if it were a place. */
export function coords(lat: number, lon: number): string {
  if (!lat && !lon) return '';
  return `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(4)}° ${lon < 0 ? 'W' : 'E'}`;
}

/** "M. Satyanarayana" → "MS". Stored initials drifted from the names beside
 *  them once records stopped sharing one cast. */
export function initialsOf(name: string): string {
  const parts = (name || '').replace(/[^\p{L}\s.]/gu, ' ').split(/[\s.]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "3.24 ac" / "1,340 sq.ft" — an extent with the unit it is measured in. */
export const extent = (v: number, unit: string) =>
  `${num(v, unit === 'ac' ? 2 : 0)} ${unit}`;

// ── Icons ──────────────────────────────────────────────────────────────

const ICONS: Record<string, typeof MapOutlined> = {
  // features
  bore: SettingsInputComponentOutlined,
  well: OpacityOutlined,
  pond: WavesOutlined,
  pump: SettingsInputComponentOutlined,
  drip: ElectricBoltOutlined,
  power: BoltOutlined,
  fence: FenceOutlined,
  gate: DoorFrontOutlined,
  house: CabinOutlined,
  trees: ParkOutlined,
  crop: AgricultureOutlined,
  road: RouteOutlined,
  grass: GrassOutlined,
  // shelves + papers
  title: DescriptionOutlined,
  revenue: MenuBookOutlined,
  map: MapOutlined,
  identity: BadgeOutlined,
  search: ReceiptLongOutlined,
  old: HistoryEduOutlined,
  photos: ImageOutlined,
  unsorted: HelpOutlineOutlined,
  // record kinds
  parcel: GrassOutlined,
  agri: GrassOutlined,
  flat: ApartmentOutlined,
  shop: StorefrontOutlined,
  open_plot: MapOutlined,
  // states + misc
  clock: AccessTimeOutlined,
  lock: LockOutlined,
  place: PlaceOutlined,
  person: PersonOutlined,
  eye: VisibilityOutlined,
  ok: CheckCircleOutlined,
  warn: ErrorOutlineOutlined,
  missing: CancelOutlined,
  shield: GppGoodOutlined,
  chevron: ChevronRightOutlined,
  video: VideocamOutlined,
  society: ApartmentOutlined,
  parcelwide: MapOutlined,
  tax: ReceiptLongOutlined,
  agent: PersonOutlined,
  feature: HomeOutlined,
};

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const C = ICONS[name] ?? ICONS.feature;
  return <C className={className} sx={{ fontSize: size, flex: 'none' }} aria-hidden />;
}

// ── Text ───────────────────────────────────────────────────────────────

export const Eyebrow = ({ children }: { children: ReactNode }) => <p className="eyebrow">{children}</p>;

export function Crumbs({ trail }: { trail: { label: string; to?: string }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {trail.map((t, i) => (
        <span key={`${t.label}-${i}`} style={{ display: 'contents' }}>
          {i > 0 && <span className="sep" aria-hidden>›</span>}
          {t.to ? <Link to={t.to}>{t.label}</Link> : <span>{t.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function PageHead({
  eyebrow, title, children, actions,
}: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="pagehead">
      <div className="grow">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1>{title}</h1>
        {children}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

// ── Atoms ──────────────────────────────────────────────────────────────

export function Chip({
  children, active, onClick, tone, wash, count,
}: {
  children: ReactNode; active?: boolean; onClick?: () => void;
  tone?: 'alert'; wash?: boolean; count?: number;
}) {
  const cls = ['chip', wash && 'wash', tone === 'alert' && 'alert', !onClick && 'static']
    .filter(Boolean).join(' ');
  const inner = (
    <>
      {tone === 'alert' && <span aria-hidden style={{ fontSize: '0.5rem' }}>●</span>}
      {children}
      {count !== undefined && <span className="n">{count}</span>}
    </>
  );
  if (!onClick) return <span className={cls}>{inner}</span>;
  return (
    <button type="button" className={cls} aria-pressed={!!active} onClick={onClick}>
      {inner}
    </button>
  );
}

export const Tag = ({ children, alert }: { children: ReactNode; alert?: boolean }) => (
  <span className={alert ? 'tag alert' : 'tag'}>{children}</span>
);

/** A status word the system owns — "For sale", "Managed", "agri". */
export const Pill = ({ kind, children }: { kind: string; children: ReactNode }) => (
  <span className={`pill ${kind}`}>{children}</span>
);

export const State = ({ state, children }: { state: string; children: ReactNode }) => (
  <span className={`state ${state}`}>{children}</span>
);

export function Cell({ k, v, unit, note, tone }: {
  k: string; v: ReactNode; unit?: string; note?: ReactNode; tone?: string;
}) {
  return (
    <div>
      <span className="k">{k}</span>
      <span className={`v ${tone === 'up' ? 'up' : tone === 'down' ? 'down' : ''}`}>
        {v}
        {unit && <small> {unit}</small>}
      </span>
      {note && <span className="s">{note}</span>}
    </div>
  );
}

export function KV({ rows }: { rows: { k: string; v: ReactNode; highlight?: boolean }[] }) {
  return (
    <div className="kv">
      {rows.map((r) => (
        <div key={r.k} className={r.highlight ? 'hl' : undefined}>
          <span className="k">{r.k}</span>
          <span className="v">{r.v}</span>
        </div>
      ))}
    </div>
  );
}

export function Card({
  title, link, linkTo, children, className, aside,
}: {
  title?: ReactNode; link?: string; linkTo?: string; children: ReactNode;
  className?: string; aside?: ReactNode;
}) {
  return (
    <section className={`card pad-lg ${className ?? ''}`}>
      {(title || link || aside) && (
        <div className="cardhead">
          {title && <h2>{title}</h2>}
          {aside}
          {link && linkTo && <Link className="link" to={linkTo}>{link} ›</Link>}
        </div>
      )}
      {children}
    </section>
  );
}

export interface MenuItem { label: string; onClick: () => void; danger?: boolean }

/** A kebab menu. The list is position:fixed off the button's rect AND
 *  portalled to the app root: its anchors live inside overflow-clipped
 *  surfaces (a scroll-x table) and hover-transformed cards — a transform
 *  makes an ancestor the containing block for fixed descendants, which would
 *  strand the dropdown in card-space. The portal target is the .w360 root,
 *  not body, so the design tokens still resolve.
 *
 *  Because the list is portalled to the end of the DOM, Tab would walk the
 *  whole page before reaching it. So this implements the menu keyboard
 *  pattern properly: opening moves focus to the first item, Arrow keys cycle,
 *  and closing hands focus back to the kebab that opened it — otherwise a
 *  keyboard user could not edit or delete a record at all.
 *
 *  Clicks stop propagation so a menu inside a Link never navigates. */
export function Menu({ label, items, className }: {
  label: string; items: MenuItem[]; className?: string;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Only a keyboard-opened menu grabs focus; a mouse user's pointer is
  // already where they want it, and stealing focus would scroll the page.
  const takeFocus = useRef(false);

  const close = (toTrigger = false) => {
    setPos(null);
    if (toTrigger) btnRef.current?.focus();
  };

  useEffect(() => {
    if (!pos) return;
    if (takeFocus.current) {
      takeFocus.current = false;
      listRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || listRef.current?.contains(t)) return;
      setPos(null);
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      if (e.key === 'Tab') { setPos(null); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const all = Array.from(
        listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
      if (!all.length) return;
      e.preventDefault();
      const at = all.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      all[(at + step + all.length) % all.length].focus();
    };
    const shut = () => setPos(null);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', keys);
    window.addEventListener('scroll', shut, true);
    window.addEventListener('resize', shut);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', keys);
      window.removeEventListener('scroll', shut, true);
      window.removeEventListener('resize', shut);
    };
  }, [pos]);

  return (
    <div className={`menu ${className ?? ''}`} ref={ref}>
      <button
        ref={btnRef}
        type="button" className="iconbtn" aria-label={label}
        aria-haspopup="menu" aria-expanded={!!pos}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (pos) { setPos(null); return; }
          // detail is 0 for Enter/Space activation, non-zero for a real click.
          takeFocus.current = e.detail === 0;
          const r = e.currentTarget.getBoundingClientRect();
          const up = window.innerHeight - r.bottom < items.length * 40 + 16;
          setPos({ top: up ? r.top - 4 : r.bottom + 4, left: r.right, up });
        }}
      >
        <MoreVertOutlined sx={{ fontSize: 18 }} />
      </button>
      {pos && createPortal(
        <div
          ref={listRef} className="menu-list" role="menu" aria-label={label}
          style={{ top: pos.top, left: pos.left,
                   transform: pos.up ? 'translate(-100%, -100%)' : 'translateX(-100%)' }}
        >
          {items.map((it) => (
            <button
              key={it.label} type="button" role="menuitem"
              className={it.danger ? 'danger' : undefined}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPos(null);
                it.onClick();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>,
        document.querySelector('.w360') ?? document.body,
      )}
    </div>
  );
}

/** A single loading block — the screens never spin, they hold their shape. */
export const Loading = ({ h = '10rem' }: { h?: string }) => (
  <div className="skeleton" style={{ height: h }} role="status" aria-label="Loading" />
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="note" style={{ padding: 'var(--space-lg) 0' }}>{children}</p>
);
