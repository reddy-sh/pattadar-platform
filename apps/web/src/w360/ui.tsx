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
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';

import { useBlobFetch } from '../components/holdingCards';
import { isStorageRef } from '../pages/documents/storage';
import { useMediaStream } from './mediaStream';
import { useVideoPoster } from './videoPoster';

import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import AgricultureOutlined from '@mui/icons-material/AgricultureOutlined';
import ApartmentOutlined from '@mui/icons-material/ApartmentOutlined';
import BoltOutlined from '@mui/icons-material/BoltOutlined';
import CabinOutlined from '@mui/icons-material/CabinOutlined';
import CancelOutlined from '@mui/icons-material/CancelOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import DoorFrontOutlined from '@mui/icons-material/DoorFrontOutlined';
import ElectricBoltOutlined from '@mui/icons-material/ElectricBoltOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import FenceOutlined from '@mui/icons-material/FenceOutlined';
import GppGoodOutlined from '@mui/icons-material/GppGoodOutlined';
import GrassOutlined from '@mui/icons-material/GrassOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import MapOutlined from '@mui/icons-material/MapOutlined';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import OpacityOutlined from '@mui/icons-material/OpacityOutlined';
import ParkOutlined from '@mui/icons-material/ParkOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import PlayArrowOutlined from '@mui/icons-material/PlayArrowOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import RouteOutlined from '@mui/icons-material/RouteOutlined';
import SettingsInputComponentOutlined from '@mui/icons-material/SettingsInputComponentOutlined';
import StorefrontOutlined from '@mui/icons-material/StorefrontOutlined';
import VideocamOutlined from '@mui/icons-material/VideocamOutlined';
import AudiotrackOutlined from '@mui/icons-material/AudiotrackOutlined';
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
  if (a >= 1e5) {
    // Round in lakhs FIRST, then decide the unit. Choosing the unit on the raw
    // number and rounding afterwards printed ₹99,99,500 as "₹100.0 L" — a unit
    // nobody writes, at exactly the threshold where a reader is checking
    // whether a parcel has crossed a crore. One threshold, so two cannot
    // disagree: anything at or above a crore already rounds to 100.00 lakh.
    const l = (a / 1e5).toFixed(2);
    if (Number(l) >= 100) return `${lead}₹${(a / 1e7).toFixed(2)} Cr`;
    return `${lead}₹${l.replace(/0$/, '')} L`;
  }
  return `${lead}₹${inGroup(a)}`;
}

/** A figure, or a dash where there is no figure.
 *
 *  `inr(0)` is "₹0", which on a market value or a rate is a claim: it says
 *  somebody valued this parcel and the answer was nothing. Every screen that
 *  prints a valuation wants this instead. The CSV export deliberately does
 *  not — a spreadsheet column wants the number 0, not an em dash. */
export const inrOr = (n: number, blank = '—') => (n > 0 ? inr(n) : blank);

/** ₹1,00,500 — a figure somebody reconciles, not a magnitude.
 *
 *  A balance, a ledger row or an amount set aside is a number that has to
 *  MATCH something: the movement listed under it, a receipt, a bank line. A
 *  wallet reading "₹1.01 L" over a movement reading ₹1,00,500 is ₹433 of
 *  daylight between two figures on one screen, and that is the "why did my
 *  wallet lose money" call. Above a crore the full digits stop being readable,
 *  so the short form takes over there and nowhere else.
 *
 *  Three screens had each written this out locally before it was lifted here. */
export const inrFullish = (n: number): string => (n >= 1e7 ? inr(n) : `₹${inGroup(n)}`);

/** What to call this record in a sentence — "this parcel", "this flat".
 *
 *  Copy in these screens addresses one specific thing, and a screen that says
 *  "this parcel" over a third-floor flat has stopped being about the reader's
 *  property. Two screens kept identical copies of this, which is the drift
 *  STATUS_WORD had just been rescued from. */
export const nounFor = (kind: string, cls: string): string =>
  (kind === 'parcel' ? 'parcel'
    : cls === 'flat' ? 'flat'
    : cls === 'shop' ? 'shop'
    : cls === 'open_plot' ? 'plot' : 'property');

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

/** [lat,lon,lat,lon,…] → [[lat,lon],…]. The API sends a ring flat for the
 *  same reason `shape` is flat: one list, no per-corner object churn.
 *
 *  It lives here rather than beside the map it feeds because MapCanvas is
 *  behind a lazy import — anything a page reads eagerly from that module drags
 *  Leaflet's 150 kB back into the main bundle. */
export function pairs(flat: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
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
  // A filed scan whose shelf nobody has decided yet is still plainly a
  // document; the 'Unsorted' chip beside it already carries the doubt,
  // and a column of question marks reads as broken rather than untriaged.
  paper: InsertDriveFileOutlined,
  // The owner's own folders in Documents.
  folder: FolderOutlined,
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
  audio: AudiotrackOutlined,
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

/**
 * A stored photo, or the icon that stands in for one.
 *
 * Most photos on these screens have no bytes behind them — seeded rows carry an
 * empty fileRef, and legacy rows sometimes carry a filename where a node id
 * should be. Both must land on the caller's placeholder rather than a broken
 * image, so `fallback` is required, not a nicety.
 *
 * The source cannot be a plain `src`: the storage gateway wants a Bearer token
 * on every read, so the bytes arrive through an authenticated fetch and are
 * handed to the <img> as an object URL.
 */
export function PhotoImg(
  { fileRef, alt, thumb, fallback, kind, className }:
  { fileRef: string; alt: string; thumb?: number; fallback: ReactNode;
    kind?: 'photo' | 'video' | 'audio'; className?: string },
) {
  const [play, setPlay] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  useEffect(() => { setPlay(false); setPlayerError(false); }, [fileRef]);
  const stored = isStorageRef(fileRef);
  const media = kind === 'video' || kind === 'audio';
  // Images keep the existing authenticated blob/thumbnail/HEIC path. Native
  // media uses an exact-file HttpOnly stream session and Range requests; it is
  // never fetched into an application Blob. Video poster extraction creates
  // the stream session lazily on render and reuses its pinned URL for playback.
  const photo = useBlobFetch(stored && !media ? fileRef : undefined, thumb);
  const video = useVideoPoster(fileRef, stored && kind === 'video');
  const playback = useMediaStream(fileRef, stored && media && play);
  const stream = play ? playback : (kind === 'video' ? video : playback);

  if (!media && photo.status === 'error') {
    return (
      <span className={`photo-failed ${className ?? ''}`.trim()} role="alert">
        <ErrorOutlineOutlined sx={{ fontSize: 16 }} aria-hidden />
        <span>{photo.httpStatus === 403 ? 'You do not have access to this file' : 'This did not load'}</span>
        <button type="button" onClick={photo.retry}>Try again</button>
      </span>
    );
  }
  if (media && stored && !play) {
    return (
      <button type="button" className={`videostart ${className ?? ''}`.trim()}
              onClick={() => setPlay(true)}>
        {kind === 'video' && video.poster && (
          <img className="video-poster" src={video.poster} alt="" aria-hidden />
        )}
        <span className="video-play-label">
          <PlayArrowOutlined sx={{ fontSize: 34 }} aria-hidden />
          <span>{alt.trim() || (kind === 'audio' ? 'Play this recording' : 'Play this clip')}</span>
        </span>
      </button>
    );
  }
  if (media && stream.status === 'loading') {
    return (
      <span className={`videostart ${className ?? ''}`.trim()} role="status">
        <VideocamOutlined sx={{ fontSize: 34 }} aria-hidden />
        <span>Opening the {kind === 'audio' ? 'recording' : 'clip'}…</span>
      </span>
    );
  }
  if (media && (stream.status === 'error' || playerError)) {
    return (
      <span className={`photo-failed ${className ?? ''}`.trim()} role="alert">
        <ErrorOutlineOutlined sx={{ fontSize: 16 }} aria-hidden />
        <span>{stream.message || 'This recording did not open; its codec may not be supported.'}</span>
        <button type="button" onClick={() => { setPlayerError(false); stream.retry(); }}>Try again</button>
      </span>
    );
  }
  if (media && stream.url) {
    return kind === 'audio'
      ? <audio className={className} src={stream.url} controls autoPlay preload="metadata"
               onError={() => setPlayerError(true)} aria-label={alt} />
      : <video className={className} src={stream.url} poster={video.poster || undefined}
               controls autoPlay playsInline preload="metadata"
               onError={() => setPlayerError(true)} aria-label={alt} />;
  }
  if (!photo.url) return <>{fallback}</>;
  return <img className={className} src={photo.url} alt={alt} />;
}

/** A streamed video poster for the gallery strip. It is a span because the
 * strip's outer element is already the interactive button. */
export function VideoThumb({ fileRef, fallback }: { fileRef: string; fallback: ReactNode }) {
  const root = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  useEffect(() => { setFrameReady(false); }, [fileRef]);
  useEffect(() => {
    const node = root.current;
    if (!node || visible) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '96px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);
  const video = useVideoPoster(fileRef, visible && isStorageRef(fileRef));
  return (
    <span ref={root} className="video-thumb" aria-hidden>
      {video.poster ? (
        <img src={video.poster} alt="" />
      ) : (
        <>
          {video.url && (
            <video className={`video-thumb-frame${frameReady ? ' ready' : ''}`}
                   src={video.url} muted playsInline preload="auto" tabIndex={-1}
                   onLoadedData={(event) => {
                     const node = event.currentTarget;
                     if (node.videoWidth > 0 && node.videoHeight > 0) setFrameReady(true);
                   }}
                   onError={() => setFrameReady(false)} />
          )}
          {!frameReady && fallback}
        </>
      )}
      <span className="video-thumb-play"><PlayArrowOutlined sx={{ fontSize: 13 }} /></span>
    </span>
  );
}

// ── Text ───────────────────────────────────────────────────────────────

export const Eyebrow = ({ children }: { children: ReactNode }) => <p className="eyebrow">{children}</p>;

/** A breadcrumb trail. `props` reaches the crumb's own element — Documents
 *  makes each folder crumb a drop target, the way a file manager's path bar
 *  is — and the last crumb is marked as the current place. */
export function Crumbs({ trail, label = 'Breadcrumb' }: {
  trail: { label: string; to?: string; props?: HTMLAttributes<HTMLElement> }[];
  label?: string;
}) {
  return (
    <nav className="crumbs" aria-label={label}>
      {trail.map((t, i) => (
        <span key={`${t.label}-${i}`} style={{ display: 'contents' }}>
          {i > 0 && <span className="sep" aria-hidden>›</span>}
          {t.to
            ? <Link to={t.to} {...t.props}
                    aria-current={i === trail.length - 1 ? 'page' : undefined}>{t.label}</Link>
            : <span {...t.props} aria-current={i === trail.length - 1 ? 'page' : undefined}>{t.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** A page's title, and only its title (Material 3 top-level page header).
 *
 *  `eyebrow` stays for nested screens where it names the parent; a top-level
 *  page should not repeat its own rail label above its title. Standing
 *  guidance — payment terms, what a screen records — goes in `info`, behind
 *  an ⓘ next to the title, instead of a permanent sentence under it. */
export function PageHead({
  eyebrow, title, info, children, actions,
}: {
  eyebrow?: ReactNode; title: ReactNode; info?: ReactNode;
  children?: ReactNode; actions?: ReactNode;
}) {
  return (
    <header className="pagehead">
      <div className="grow">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <div className="pagehead-title">
          <h1>{title}</h1>
          {info && <InfoTip label={typeof title === 'string' ? title : 'this page'}>{info}</InfoTip>}
        </div>
        {children}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

/** An ⓘ that explains the thing beside it (Material 3 plain tooltip).
 *
 *  Shown on hover and on keyboard focus, and toggled by a tap so it works on a
 *  phone, which has no hover. Escape closes it. The text is always in the DOM
 *  and linked by aria-describedby, so a screen reader hears it on focus
 *  without the tooltip having to be open. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="infotip" data-open={open || undefined}
          onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="infotip-btn" aria-label={`About ${label}`}
              aria-describedby={id} aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
        <InfoOutlined sx={{ fontSize: 18 }} aria-hidden />
      </button>
      <span role="tooltip" id={id} className="infotip-body">{children}</span>
    </span>
  );
}

/** A status as a chip (Material 3 assist chip, non-interactive). `state` is
 *  the server's good | warn | bad | unknown, the same key `State` reads. */
export const StatusChip = ({ state, children }: { state: string; children: ReactNode }) => (
  <span className={`schip ${state || 'unknown'}`}>{children}</span>
);

export interface FacetFilterOption {
  key: string;
  label: string;
  count: number;
}

export interface FacetFilterGroup {
  key: string;
  label: string;
  options: FacetFilterOption[];
}

export interface FacetFilterChip {
  id: string;
  group: string;
  label: string;
  removeLabel: string;
  onRemove: () => void;
}

/** The single faceted-filter surface used by list pages.
 *
 * Pages own only their filter values and domain labels. Opening, dismissal,
 * active chips, counts and keyboard focus live here so a filter never changes
 * its interaction model because the list underneath happens to be different. */
export function FacetFilter({
  groups, selected, onToggle, onClear, tally, trailing, extraChips = [],
  groupLabel, missingOptionLabel, busy = false, ariaLabel = 'Narrow the list',
  searchPlaceholder,
}: {
  groups: FacetFilterGroup[];
  selected: Record<string, readonly string[]>;
  onToggle: (groupKey: string, optionKey: string) => void;
  onClear: () => void;
  /** Optional: a list with a table footer carries its count there instead. */
  tally?: ReactNode;
  trailing?: ReactNode;
  extraChips?: FacetFilterChip[];
  groupLabel?: (groupKey: string, group?: FacetFilterGroup) => string;
  missingOptionLabel?: (groupKey: string, optionKey: string) => string;
  busy?: boolean;
  ariaLabel?: string;
  /** Optional search inside a long chooser (for example 56 mandals). The
   *  query filters option labels across groups; screens keep no second search
   *  implementation of their own. */
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [optionQuery, setOptionQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wordFor = (key: string, group?: FacetFilterGroup) =>
    groupLabel?.(key, group) ?? group?.label ?? statusWord(key);
  const chips: FacetFilterChip[] = [
    ...Object.entries(selected).flatMap(([groupKey, values]) => {
      const group = groups.find((item) => item.key === groupKey);
      const groupWord = wordFor(groupKey, group);
      return values.map((optionKey) => {
        const label = group?.options.find((option) => option.key === optionKey)?.label
          ?? missingOptionLabel?.(groupKey, optionKey)
          ?? statusWord(optionKey);
        return {
          id: `${groupKey}:${optionKey}`,
          group: groupWord,
          label,
          removeLabel: `Remove filter ${groupWord} ${label}`,
          onRemove: () => onToggle(groupKey, optionKey),
        };
      });
    }),
    ...extraChips,
  ];
  const query = optionQuery.trim().toLocaleLowerCase('en-IN');
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      options: query
        ? group.options.filter((option) => option.label.toLocaleLowerCase('en-IN').includes(query))
        : group.options,
    }))
    .filter((group) => group.options.length > 0);
  const close = () => {
    setOpen(false);
    setOptionQuery('');
  };

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
      triggerRef.current?.focus();
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', keys);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', keys);
    };
  }, [open]);

  return (
    <div
      className="filterbar" ref={rootRef} aria-busy={busy}
      style={{ opacity: busy ? 0.6 : 1, transition: 'opacity var(--dur-fast) var(--ease-out)' }}
    >
      <button
        ref={triggerRef} type="button" className="addfilter"
        aria-expanded={open} aria-haspopup="true"
        onClick={() => { if (open) close(); else setOpen(true); }}
      >
        + Filter
      </button>

      {chips.map((chip) => (
        <span className="fchip" key={chip.id}>
          <span className="grp">{chip.group}</span>
          <span className="val">{chip.label}</span>
          <button type="button" aria-label={chip.removeLabel} onClick={chip.onRemove}>×</button>
        </span>
      ))}

      {chips.length > 0 && (
        <button type="button" className="clearall" onClick={onClear}>Clear all</button>
      )}

      <span className="grow" />
      {tally !== undefined && <span className="tally" role="status">{tally}</span>}
      {trailing && <><span className="vrule" aria-hidden />{trailing}</>}

      {open && (
        <div className={`fpop${searchPlaceholder ? ' searchable' : ''}`} role="group" aria-label={ariaLabel}>
          {searchPlaceholder && (
            <div className="fpop-head">
              <SearchOutlined sx={{ fontSize: 20 }} aria-hidden />
              <input
                autoFocus value={optionQuery} onChange={(event) => setOptionQuery(event.target.value)}
                placeholder={searchPlaceholder} aria-label={searchPlaceholder}
              />
              <button type="button" className="fpop-close" aria-label="Close filters" onClick={() => {
                close();
                triggerRef.current?.focus();
              }}>
                <CloseOutlined sx={{ fontSize: 20 }} />
              </button>
            </div>
          )}
          {visibleGroups.map((group) => (
            <div className="fgrp" key={group.key}>
              <span className="eyebrow">{wordFor(group.key, group)}</span>
              {group.options.map((option) => {
                const on = (selected[group.key] ?? []).includes(option.key);
                return (
                  <button
                    key={option.key} type="button" className="opt" aria-pressed={on}
                    onClick={() => onToggle(group.key, option.key)}
                  >
                    <span className="box" aria-hidden>{on ? '✓' : ''}</span>
                    <span className="lbl">{option.label}</span>
                    <span className="n">{option.count}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {visibleGroups.length === 0 && (
            <p className="fpop-empty">No filter options match that search.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** The sort chip at the end of a filter row: "Sort: Newest first ⌄", and a
 *  press moves to the next order. It sits in `FacetFilter`'s `trailing` slot.
 *
 *  Properties and Documents had each written this button out by hand, and the
 *  Holdings list would have been the third copy. The page owns the
 *  orders and which one is next; this owns how the chip looks and reads.
 *  With no `ariaLabel` the accessible name is the visible text. */
export function SortCycle({ label, onNext, ariaLabel }: {
  label: string; onNext: () => void; ariaLabel?: string;
}) {
  return (
    <button type="button" className="sortcycle" aria-label={ariaLabel} onClick={onNext}>
      Sort: {label} ⌄
    </button>
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

/** A tag. With `onClick` it is a button — Documents uses that to filter the
 *  list to everything carrying the same tag — and `label` names what the
 *  press does for a screen reader. */
export const Tag = ({ children, alert, onClick, label }: {
  children: ReactNode; alert?: boolean; onClick?: () => void; label?: string;
}) => onClick
  ? <button type="button" className={alert ? 'tag alert act' : 'tag act'} onClick={onClick}
            aria-label={label}>{children}</button>
  : <span className={alert ? 'tag alert' : 'tag'}>{children}</span>;

/** The words the system has for a record's status and stake.
 *
 *  This map was copied into three screens, and the copies had drifted: none of
 *  them carried `archived`, so an archived record painted a coloured capsule
 *  with nothing written in it. One map, and a total function over it — an
 *  unknown value from the server is humanised rather than dropped, because a
 *  blank pill is the one outcome that tells the reader nothing at all. */
export const STATUS_WORD: Record<string, string> = {
  owned: 'Owned', for_sale: 'For sale', disputed: 'Disputed',
  managed: 'Managed', watch: 'Watch', archived: 'Archived',
};

export function statusWord(key: string): string {
  if (!key) return '';
  return STATUS_WORD[key]
    ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** The eight shelves of the vault, as `vault` in web360.py spells them.
 *
 *  A fourth copy of this map was about to be written. Three screens name the
 *  same eight shelves — the wall, the shelf list and the reader's "move this
 *  paper to" menu — and a shelf renamed in one of them and not the others is a
 *  paper the owner can no longer find. */
export const SHELF_WORD: Record<string, string> = {
  title: 'Title', revenue: 'Revenue record', map: 'Map', search: 'Search & tax',
  identity: 'Identity', old: 'Old record', photos: 'Photos & video', unsorted: 'Unsorted',
};

/** One cell of a CSV, safe to hand to a spreadsheet.
 *
 *  Four screens export a CSV and each had written this out. The guard is not
 *  cosmetic: Excel and Sheets EXECUTE a cell that opens with =, + , - or @, and
 *  a record's title, a seller's name and a tag are all free text the owner
 *  typed — so `=HYPERLINK(...)` in a parcel's title would run on whoever opened
 *  the export. A leading apostrophe makes it read as text. `\r` counts as a
 *  line break inside a cell for strict readers, so it forces quoting too. */
export function csvCell(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows as a CSV file, downloaded.
 *
 *  The Money tab's Cost sheet and the Expenses ledger's Export each carried a
 *  copy of this, and one of them said it would drift. Every cell goes through
 *  csvCell; the BOM makes Excel read the ₹ column as UTF-8 rather than
 *  mojibake. The anchor is put in the document and the object URL revoked a
 *  beat later: starting a download is a queued task, and releasing the URL in
 *  the same tick can cancel the file before it is written — the "dead button"
 *  both exports once had.
 *
 *  Silent on success: the browser's own download is the answer (design.md §
 *  Microinteractions stance). It throws when the browser refuses, so the
 *  caller can say so. */
export function downloadCsv(name: string, rows: unknown[][]): void {
  const blob = new Blob(['\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\n')],
    { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A status word the system owns — "For sale", "Managed", "agri". */
export const Pill = ({ kind, children }: { kind: string; children: ReactNode }) => (
  <span className={`pill ${kind}`}>{children}</span>
);

export const State = ({ state, children }: { state: string; children: ReactNode }) => (
  <span className={`state ${state}`}>{children}</span>
);

export function Cell({ k, v, unit, note, tone, to }: {
  k: string; v: ReactNode; unit?: string; note?: ReactNode; tone?: string; to?: string;
}) {
  const content = (
    <>
      <span className="k">{k}</span>
      <span className={`v ${tone === 'up' ? 'up' : tone === 'down' ? 'down' : ''}`}>
        {v}
        {unit && <small> {unit}</small>}
      </span>
      {note && <span className="s">{note}</span>}
    </>
  );
  return to
    ? <Link className="strip-link" to={to}>{content}</Link>
    : <div>{content}</div>;
}

export function KV(
  { rows, as, className }: {
    rows: { k: string; v: ReactNode; highlight?: boolean }[];
    /** `'dl'` renders a real description list — `<dl>/<dt>/<dd>` — instead of
     *  divs and spans. Same `.kv` CSS either way: `.kv dt, .kv .k` and
     *  `.kv dd, .kv .v` are already written as pairs, so nothing restyles.
     *
     *  It matters where the pairs ARE the content rather than a summary
     *  beside it — a screen reader is told "list, 3 items" and can move
     *  term by term, instead of walking a run of anonymous spans. */
    as?: 'dl';
    className?: string;
  },
) {
  const cls = ['kv', className].filter(Boolean).join(' ');
  if (as === 'dl') {
    return (
      <dl className={cls}>
        {rows.map((r) => (
          <div key={r.k} className={r.highlight ? 'hl' : undefined}>
            <dt>{r.k}</dt>
            <dd>{r.v}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <div className={cls}>
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
  title, link, linkTo, children, className, aside, busy,
}: {
  title?: ReactNode; link?: string; linkTo?: string; children: ReactNode;
  className?: string; aside?: ReactNode;
  /** The card is showing the last good answer while a new one is fetched.
   *  Screens were wrapping cards in a bare div just to carry this, because a
   *  panel that refreshes in place has to say so — otherwise changing a rate
   *  looks like nothing happened until the numbers silently change. */
  busy?: boolean;
}) {
  return (
    <section className={`card pad-lg ${className ?? ''}`} aria-busy={busy || undefined}>
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

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** Marks one choice in an exclusive menu. Supplying either boolean renders
   *  radio-menu semantics; omit it for ordinary action items. */
  selected?: boolean;
  /** Optional glyph, drawn before the label. A menu of four one-off actions
   *  reads much faster with them; a menu of "Edit / Delete" does not need
   *  them, so they stay optional and the existing callers are untouched. */
  icon?: ReactNode;
  /** Renders the item as a real link. An item that goes somewhere OUT of the
   *  app — a maps hand-off — must be middle-clickable and copyable, and a
   *  button calling window.open is neither (and is what a popup blocker
   *  stops). `onClick` is ignored when this is set. */
  href?: string;
  /** Draws a hairline ABOVE this item, separating it from the group before
   *  it. The rule rides on the item rather than being a node of its own, so
   *  the arrow-key roving in `Menu` has nothing extra to skip over. */
  rule?: boolean;
}

/** Where a portalled list sits beside its trigger: `left` is the trigger's
 *  RIGHT edge, `start` its left edge, and `up` opens the list above it. */
interface ListAnchor { top: number; left: number; start: number; up: boolean }

function anchorFor(r: DOMRect, height: number): ListAnchor {
  const up = window.innerHeight - r.bottom < height;
  return { top: up ? r.top - 4 : r.bottom + 4, left: r.right, start: r.left, up };
}

const sameAnchor = (a: ListAnchor | null, b: ListAnchor) =>
  !!a && a.top === b.top && a.left === b.left && a.start === b.start && a.up === b.up;

/** Keep a portalled list inside the window.
 *
 *  `Menu` and `MultiSelect` open their list LEFTWARD from the trigger's right
 *  edge, over the page the trigger belongs to. A trigger near the left edge —
 *  the combined view's ⋮ once its head wraps on a phone — opened the list off
 *  the screen, and both of its items were cut off. So a list that would cross
 *  the left edge opens rightward from the trigger's left edge instead.
 *  Measured, not guessed: `.menu-list` is `width: max-content`, so its width is
 *  its own labels, and a layout effect reads it before the first paint. */
function useListStyle(
  listRef: RefObject<HTMLDivElement | null>, pos: ListAnchor | null,
): CSSProperties | undefined {
  const [rightward, setRightward] = useState(false);
  useLayoutEffect(() => {
    const width = listRef.current?.offsetWidth ?? 0;
    setRightward(!!pos && pos.left - width < 8);
  }, [listRef, pos]);
  if (!pos) return undefined;
  return rightward
    ? { top: pos.top, left: Math.max(8, pos.start), transform: pos.up ? 'translateY(-100%)' : undefined }
    : { top: pos.top, left: pos.left, transform: pos.up ? 'translate(-100%, -100%)' : 'translateX(-100%)' };
}

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
export function Menu({ label, items, className, header, trigger, triggerClassName }: {
  label: string; items: MenuItem[]; className?: string;
  /** Named above the items — "which record will this act on". A menu opened
   *  from a grid of forty cards is otherwise a column of verbs with no
   *  subject, and one of them is Delete. */
  header?: ReactNode;
  /** What the trigger wears. Defaults to the kebab every card row uses. The
   *  topbar account control wears the avatar instead: the same portalled,
   *  arrow-navigable, focus-returning machinery behind a different face,
   *  rather than a second hand-rolled menu growing inside Shell.tsx. */
  trigger?: ReactNode;
  /** Class for the trigger when it is not an `iconbtn` — see `trigger`. */
  triggerClassName?: string;
}) {
  const [pos, setPos] = useState<ListAnchor | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listStyle = useListStyle(listRef, pos);
  // Only a keyboard-opened menu grabs focus; a mouse user's pointer is
  // already where they want it, and stealing focus would scroll the page.
  const takeFocus = useRef(false);

  /** How tall the list will be, used to decide whether it opens downwards.
   *  Both the opening click and the scroll-follow ask, and they used to each
   *  carry their own copy of `items.length * 40 + 16` — which stopped being
   *  true the moment a menu grew a header and hairline rules, and a menu that
   *  guesses short flips the wrong way at the bottom of a long grid. */
  const menuH = items.length * 40 + 16
    + (header ? 26 : 0)
    + items.filter((it) => it.rule).length * 6;

  const close = (toTrigger = false) => {
    setPos(null);
    if (toTrigger) btnRef.current?.focus();
  };

  useEffect(() => {
    if (!pos) return;
    if (takeFocus.current) {
      takeFocus.current = false;
      listRef.current?.querySelector<HTMLElement>(
        '[role="menuitem"], [role="menuitemradio"]',
      )?.focus();
    }
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || listRef.current?.contains(t)) return;
      setPos(null);
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      // Hand focus back to the kebab rather than just closing. Unmounting the
      // portalled list while one of its items held focus reset activeElement to
      // <body>, so the next Tab restarted from the top of the document — a
      // keyboard user had to walk the whole rail and list to get back. No
      // preventDefault: the browser's own Tab then continues from the kebab,
      // which is the WAI-ARIA menu-button behaviour.
      if (e.key === 'Tab') { close(true); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const all = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"], [role="menuitemradio"]',
        ) ?? []);
      if (!all.length) return;
      e.preventDefault();
      const at = all.indexOf(document.activeElement as HTMLElement);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      all[(at + step + all.length) % all.length].focus();
    };
    // The list is position:fixed, so it has to be told when its trigger moves.
    // It used to just close on any scroll — which sounds harmless and is not:
    // clicking a kebab low on the page makes the browser scroll it into view,
    // and the menu shut about 20ms after opening. It looked like a dead
    // control. Follow the trigger instead, and close only once it is actually
    // gone from the viewport.
    const follow = () => {
      const b = btnRef.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      const gone = r.bottom < 0 || r.top > window.innerHeight
        || r.right < 0 || r.left > window.innerWidth;
      if (gone) { setPos(null); return; }
      const next = anchorFor(r, menuH);
      // Unchanged: do not re-render.
      setPos((cur) => (sameAnchor(cur, next) ? cur : next));
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', keys);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', keys);
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [pos, items.length]);

  return (
    <div className={`menu ${className ?? ''}`} ref={ref}>
      <button
        ref={btnRef}
        type="button" className={triggerClassName ?? 'iconbtn'} aria-label={label}
        aria-haspopup="menu" aria-expanded={!!pos}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (pos) { setPos(null); return; }
          // detail is 0 for Enter/Space activation, non-zero for a real click.
          takeFocus.current = e.detail === 0;
          setPos(anchorFor(e.currentTarget.getBoundingClientRect(), menuH));
        }}
      >
        {trigger ?? <MoreVertOutlined sx={{ fontSize: 18 }} />}
      </button>
      {pos && createPortal(
        /* `role="menu"` sits on the inner list, not this box. A header is not a
           menuitem, and a non-menuitem child of role="menu" is the same ARIA
           violation Shell.tsx documents fixing for its role="listbox". */
        <div ref={listRef} className="menu-list" style={listStyle}>
          {header && <div className="menuhead">{header}</div>}
          <div role="menu" aria-label={label}>
          {items.map((it) => {
            const cls = [it.danger && 'danger', it.rule && 'ruled'].filter(Boolean).join(' ') || undefined;
            const role = it.selected === undefined ? 'menuitem' : 'menuitemradio';
            return it.href ? (
              <a
                key={it.label} role={role} aria-checked={it.selected} href={it.href}
                target="_blank" rel="noreferrer"
                className={cls}
                onClick={(e) => { e.stopPropagation(); setPos(null); }}
              >
                {it.icon}
                {it.label}
              </a>
            ) : (
              <button
                key={it.label} type="button" role={role} aria-checked={it.selected}
                className={cls}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  close(true);
                  it.onClick();
                }}
              >
                {it.icon}
                {it.label}
              </button>
            );
          })}
          </div>
        </div>,
        document.querySelector('.w360') ?? document.body,
      )}
    </div>
  );
}

/** A checkbox dropdown that STAYS OPEN as you tick — the multi-select `Menu`
 *  cannot be, because a menu closes on the item it fired.
 *
 *  Same portalled, position:fixed, focus-trapping machinery as `Menu` (a
 *  transform-clipping ancestor would otherwise strand a plain absolute list),
 *  but the items are `menuitemcheckbox` and a tick does not dismiss it. It sits
 *  where a section's actions sit, so "which boundaries are on the map" reads as
 *  an action on the view rather than a rail of checkboxes competing with the
 *  data beside them. Closes on Escape, Tab, or a click away. */
export function MultiSelect({ label, summary, options, selected, onToggle, onAll }: {
  /** What the choice is about — "Which boundaries to show". It names the open
   *  list, and it is read BEFORE the summary in the trigger's name. The trigger
   *  used to be named by this alone, so a screen reader and a voice command
   *  heard a name that did not contain the words on the button (WCAG 2.5.3). */
  label: string;
  /** What the trigger shows — "1 of 2 boundaries". */
  summary: ReactNode;
  options: { id: string; label: ReactNode; disabled?: boolean }[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Ticks or clears every enabled option at once. */
  onAll: (on: boolean) => void;
}) {
  const [pos, setPos] = useState<ListAnchor | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listStyle = useListStyle(listRef, pos);
  const nameId = useId();
  const enabled = options.filter((o) => !o.disabled);
  const allOn = enabled.length > 0 && enabled.every((o) => selected.has(o.id));
  const someOn = enabled.some((o) => selected.has(o.id));
  // Header row + one row per option, roughly, so it can decide to open upward.
  const menuH = (options.length + 1) * 40 + 16;

  const place = () => {
    const b = btnRef.current;
    return b ? anchorFor(b.getBoundingClientRect(), menuH) : null;
  };

  useEffect(() => {
    if (!pos) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setPos(null);
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setPos(null); btnRef.current?.focus(); return; }
      if (e.key === 'Tab') { setPos(null); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const all = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role]') ?? []);
      if (!all.length) return;
      e.preventDefault();
      const at = all.indexOf(document.activeElement as HTMLElement);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      all[(at + step + all.length) % all.length].focus();
    };
    const follow = () => {
      const next = place();
      if (!next) return;
      const b = btnRef.current!.getBoundingClientRect();
      if (b.bottom < 0 || b.top > window.innerHeight) { setPos(null); return; }
      setPos((cur) => (sameAnchor(cur, next) ? cur : next));
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', keys);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', keys);
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [pos]);

  return (
    <div className="menu">
      {/* Named "label, then what it shows": the words on the button stay in
          its name, and the label says what they are a choice of. */}
      <span id={`${nameId}-label`} hidden>{label}</span>
      <button ref={btnRef} type="button" className="btn" aria-haspopup="true"
              aria-expanded={!!pos} aria-labelledby={`${nameId}-label ${nameId}-value`}
              onClick={() => setPos(pos ? null : place())}>
        <span id={`${nameId}-value`}>{summary}</span>
        <span aria-hidden style={{ opacity: 0.7 }}>⌄</span>
      </button>
      {pos && createPortal(
        <div ref={listRef} className="menu-list multi"
             role="group" aria-label={label} style={listStyle}>
          <button type="button" role="menuitemcheckbox" aria-checked={allOn ? true : someOn ? 'mixed' : false}
                  className="multi-all"
                  onClick={() => onAll(!allOn)}>
            <span className="multi-box" data-state={allOn ? 'on' : someOn ? 'mixed' : 'off'} aria-hidden />
            All {enabled.length}
          </button>
          {options.map((o) => (
            <button key={o.id} type="button" role="menuitemcheckbox"
                    aria-checked={selected.has(o.id)} disabled={o.disabled}
                    onClick={() => onToggle(o.id)}>
              <span className="multi-box" data-state={selected.has(o.id) ? 'on' : 'off'} aria-hidden />
              {o.label}
            </button>
          ))}
        </div>,
        document.querySelector('.w360') ?? document.body,
      )}
    </div>
  );
}

/** The browser's own full screen, for one element: the photo stage's theater
 *  view and the combined map's stage.
 *
 *  Truly full-window, past the app chrome, and Esc exits it the way people
 *  already expect. `on` tracks the BROWSER's state rather than our intent, so
 *  Esc or the operating system's own control keeps a toggle's label honest.
 *  `supported` is false where a page cannot ask for it (Safari on an iPhone
 *  allows full screen for video only), and a control that would do nothing is
 *  not drawn. Lifted here when the map became the second screen to need it
 *  (design.md § App-surface rules, "One component per concern"). */
export function useFullscreen<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  const supported = typeof document !== 'undefined'
    && document.fullscreenEnabled === true
    && typeof document.documentElement.requestFullscreen === 'function';
  useEffect(() => {
    const sync = () => setOn(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen?.().catch(() => {});
  }, []);
  return { ref, on, toggle, supported };
}

/** A single loading block — the screens never spin, they hold their shape.
 *
 *  The block is decorative and the sentence under it is the real content of the
 *  status region. It used to be a bare `role="status"` div carrying only an
 *  `aria-label`: an empty live region announces nothing whatever you label it,
 *  and a 70vh slab with no words was exactly the screen that read as broken.
 *  Real DOM text fixes both at once — it is announced, and it is legible.
 *
 *  `what` names the thing being fetched and should match the noun the same
 *  screen gives `Failed what=`, so the waiting word and the failure word agree. */
export const Loading = ({ h = '10rem', what }: { h?: string; what?: string }) => (
  <div role="status" aria-busy="true" style={{ display: 'grid', gap: 'var(--space-sm)' }}>
    <div className="skeleton" style={{ height: h }} aria-hidden />
    <p className="note">Loading{what ? ` ${what}` : ''}…</p>
  </div>
);

/**
 * Nothing here — said in words.
 *
 * The screens used to have three states and two renderings: loading drew a
 * skeleton, and *empty* and *failed* both drew the same skeleton, forever.
 * W09 was the plainest case — a recipient with no shared kits watched a 60vh
 * grey block pulse for as long as they cared to wait, because the kit query is
 * `enabled: !!id` and there was no id to enable it with.
 *
 * Called with only `children` this is still the one-line note it always was,
 * so existing callers are untouched. Given a `title` it becomes a real empty
 * state: a marker, a sentence naming what is absent, and — where the user can
 * actually do something about it — the thing to do.
 */
export function Empty({
  icon, title, children, action, boxed, h,
}: {
  icon?: string; title?: ReactNode; children?: ReactNode;
  action?: ReactNode; boxed?: boolean; h?: string;
}) {
  if (!title && !icon && !action && !boxed) {
    return <p className="note" style={{ padding: 'var(--space-lg) 0' }}>{children}</p>;
  }
  return (
    <div className={boxed ? 'blank boxed' : 'blank'} style={h ? { minHeight: h } : undefined}>
      {icon && <span className="blank-i"><Icon name={icon} size={24} /></span>}
      {title && <p className="blank-t">{title}</p>}
      {children && <p className="note">{children}</p>}
      {action && <div className="row tight blank-do">{action}</div>}
    </div>
  );
}

/**
 * A read that did not come back.
 *
 * `main.tsx` configures react-query with `retry: 1`, so a query that fails
 * twice settles into `isLoading: false, data: undefined` and stays there. Every
 * screen written as `if (isLoading || !data) return <Loading/>` therefore drew
 * a skeleton that could never resolve — an outage rendered as an eternity.
 *
 * Retry invalidates the whole `w360` key rather than taking a `refetch` from
 * the caller: a screen is usually several queries deep and a stale sibling is
 * the next thing to break, so one button repairs the page rather than one row.
 * `onRetry` is still accepted for the cases that own a narrower remedy.
 *
 * The reason is printed verbatim. It is mono, small and grey because it is for
 * whoever is being asked "what does it say?" down a phone line, not for the
 * owner — but a failure with no reason at all is the thing that cannot be
 * supported at all.
 */
export function Failed({
  what, error, onRetry, boxed, h,
}: {
  what: string; error?: unknown; onRetry?: () => void; boxed?: boolean; h?: string;
}) {
  const qc = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const why = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  // A retry that refetches in silence looks like a dead button, and a dead
  // button on an error screen is the point at which someone gives up. The
  // label changes, the button refuses a second click, and if the read fails
  // again the screen is still here saying so — which is itself the answer.
  const again = async () => {
    setRetrying(true);
    try {
      if (onRetry) await onRetry();
      else await qc.invalidateQueries({ queryKey: ['w360'] });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      className={boxed ? 'blank boxed bad' : 'blank bad'}
      style={h ? { minHeight: h } : undefined}
      role="alert"
    >
      <span className="blank-i"><ErrorOutlineOutlined sx={{ fontSize: 24 }} /></span>
      <p className="blank-t">{what} did not load</p>
      <p className="note">Check your connection and try again.</p>
      {why && <p className="blank-why">{why}</p>}
      <div className="row tight blank-do">
        <button type="button" className="btn sm" disabled={retrying} onClick={() => void again()}>
          <RefreshOutlined sx={{ fontSize: 15 }} /> {retrying ? 'Trying…' : 'Try again'}
        </button>
      </div>
    </div>
  );
}

/** The stage pips. It lived inside Orders.tsx as inline styles, which meant
 *  the ticket page could not have the same one without copying them. The
 *  word is not decoration: four amber dashes say nothing to a screen reader,
 *  which is why the aria-label counts them out loud.
 *
 *  `pipsOnly` is for a row that already says its status once, in a
 *  StatusChip after the title: the word under the pips was the same status a
 *  second time. The stage's name then goes into the accessible name instead,
 *  so nothing a sighted reader gets from the pips is kept from anyone else. */
export function Rail({ stage, steps, word, pipsOnly }:
  { stage: number; steps: string[]; word?: string; pipsOnly?: boolean }) {
  const at = Math.min(Math.max(stage, 0), steps.length - 1);
  const count = `Stage ${at + 1} of ${steps.length}`;
  if (pipsOnly) {
    return (
      <span className="rail" role="img" aria-label={`${count}: ${steps[at]}`}>
        {steps.map((s, i) => (
          <i key={s} title={s} className={i <= at ? 'on' : undefined} />
        ))}
      </span>
    );
  }
  return (
    <span className="rail" aria-label={count}>
      {steps.map((s, i) => (
        <i key={s} title={s} className={i <= at ? 'on' : undefined} />
      ))}
      <span className="w">{word || steps[at]}</span>
    </span>
  );
}

/** The four stages a work_request's `stage` integer indexes. Mirrors
 *  _STAGES in services/api/src/web360.py. */
export const ORDER_STAGES = ['Placed', 'Assigned', 'On site', 'Delivered'];

/** True while the viewport is at most `px` wide.
 *
 *  For the few places CSS cannot do the job — collapsing a scroller into a
 *  button, or moving an action from a header into its overflow menu. One
 *  listener, matchMedia rather than a resize handler. It lived privately in
 *  OrderService.tsx; the Location tab needs the same answer, so it is here. */
export function useNarrow(px: number): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${px}px)`).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [px]);
  return narrow;
}

/** What a refused move on an order says, wherever it is refused. The same
 *  order refused on its own page and in a property's Services list must not
 *  sound like two different problems, so the sentence lives here rather than
 *  as a private copy in each screen. (The desk's own screens say "job": that
 *  is the associate's word for the same work, and Desk.tsx keeps it.) */
export const ORDER_MOVE_FAILED =
  'That did not go through. Nothing on this order has changed — reload the page and try again.';
