/**
 * Primitives shared by the record-360 screens.
 *
 * These are plain elements over `w360.css`, not MUI components. The screens are
 * dense, hairline-ruled and labelled in small uppercase in ways that fight MUI's defaults at
 * every turn; expressing them as semantic markup + one stylesheet is both
 * smaller and easier to keep faithful to the design.
 *
 * Numbers are formatted the Indian way throughout — lakh/crore short forms and
 * 2,2,3 digit grouping — because that is what the records actually say.
 */
import {
  useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import type {
  CSSProperties, HTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactNode, Ref, RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import CheckRounded from '@mui/icons-material/CheckRounded';
import GridViewOutlined from '@mui/icons-material/GridViewOutlined';
import ViewListOutlined from '@mui/icons-material/ViewListOutlined';
import TableRowsOutlined from '@mui/icons-material/TableRowsOutlined';

import { useBlobFetch } from '../components/holdingCards';
import { isStorageRef } from '../pages/documents/storage';
import { useMediaStream } from './mediaStream';
import { useVideoPoster } from './videoPoster';

import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import ChecklistOutlined from '@mui/icons-material/ChecklistOutlined';
import RemoveOutlined from '@mui/icons-material/RemoveOutlined';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import ExploreOutlined from '@mui/icons-material/ExploreOutlined';
import CurrencyRupeeOutlined from '@mui/icons-material/CurrencyRupeeOutlined';
import GavelOutlined from '@mui/icons-material/GavelOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import SquareFootOutlined from '@mui/icons-material/SquareFootOutlined';
import StickyNote2Outlined from '@mui/icons-material/StickyNote2Outlined';
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
    // Crores from whole lakhs (0.01 Cr is 1 L), not from a / 1e7: 2.385 is
    // 2.38499… in binary, so ₹2,38,50,000 printed ₹2.38 Cr where 238.5 lakh
    // rounds half-up to ₹2.39 Cr.
    if (Number(l) >= 100) return `${lead}₹${(Math.round(a / 1e5) / 100).toFixed(2)} Cr`;
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

/** A stored timestamp as the day it was in India, DD/MM/YYYY. The API writes
 *  UTC, often without a zone ("2026-08-01T19:00:00"); read bare, that is
 *  local time and an evening change lands on the wrong day. A date with no
 *  time is already a day and is never shifted. */
export function istDay(s: string): string {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return ddmmyyyy(s);
  const zoned = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}Z`;
  const d = new Date(zoned);
  return Number.isNaN(d.getTime()) ? ddmmyyyy(s)
    : d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
}

/** What a property is, in words: its classification, else its kind. */
const CLASS_WORD: Record<string, string> = {
  agri: 'Agricultural land', open_plot: 'Open plot', house: 'House',
  flat: 'Flat', apartment: 'Apartment', shop: 'Shop', commercial: 'Commercial building',
  parcel: 'Parcel', property: 'Built property',
};
export const classWord = (key: string): string =>
  CLASS_WORD[key] ?? (key || '').replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());

export const num = (n: number, dp = 0) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** A property's extent as every screen writes it: grouped the Indian way,
 *  acres to two places ("2.40 ac", "1,450 sq.ft"). Properties wrote this
 *  for itself and the Documents pickers printed the raw number beside it. */
export const extentText = (r: { extent: number; extentUnit: string }) =>
  r.extentUnit === 'ac' ? `${num(r.extent, 2)} ac` : `${num(r.extent)} ${r.extentUnit}`;

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
  // Overview cards and tiles
  note: StickyNote2Outlined,
  service: HandshakeOutlined,
  rupee: CurrencyRupeeOutlined,
  checklist: ChecklistOutlined,
  // A check the data cannot answer: a neutral dash, not a tick or a cross.
  dash: RemoveOutlined,
  overview: DashboardOutlined,
  compass: ExploreOutlined,
  status: GavelOutlined,
  measure: SquareFootOutlined,
  activity: HistoryOutlined,
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
      // Named with its verb: the visible label is the caption beside an icon,
      // so without this a screen reader heard "Walking the eastern edge,
      // button" and nothing about what pressing it does.
      <button type="button" className={`videostart ${className ?? ''}`.trim()}
              aria-label={alt.trim()
                ? `Play ${alt.trim()}`
                : (kind === 'audio' ? 'Play this recording' : 'Play this video')}
              onClick={() => setPlay(true)}>
        {kind === 'video' && video.poster && (
          <img className="video-poster" src={video.poster} alt="" aria-hidden />
        )}
        <span className="video-play-label">
          <PlayArrowOutlined sx={{ fontSize: 34 }} aria-hidden />
          <span>{alt.trim() || (kind === 'audio' ? 'Play this recording' : 'Play this video')}</span>
        </span>
      </button>
    );
  }
  if (media && stream.status === 'loading') {
    return (
      <span className={`videostart ${className ?? ''}`.trim()} role="status">
        <VideocamOutlined sx={{ fontSize: 34 }} aria-hidden />
        <span>Opening the {kind === 'audio' ? 'recording' : 'video'}…</span>
      </span>
    );
  }
  if (media && (stream.status === 'error' || playerError)) {
    return (
      <span className={`photo-failed ${className ?? ''}`.trim()} role="alert">
        <ErrorOutlineOutlined sx={{ fontSize: 16 }} aria-hidden />
        <span>{stream.message || (kind === 'audio' ? 'This recording did not play.' : 'This video did not play.')}</span>
        <button type="button" onClick={() => { setPlayerError(false); stream.retry(); }}>Try again</button>
      </span>
    );
  }
  if (media && stream.url) {
    // The player keeps a name when the item has no caption, as the play
    // button before it does; an empty aria-label left it nameless.
    const name = alt.trim() || (kind === 'audio' ? 'This recording' : 'This video');
    return kind === 'audio'
      ? <audio className={className} src={stream.url} controls autoPlay preload="metadata"
               onError={() => setPlayerError(true)} aria-label={name} />
      : <video className={className} src={stream.url} poster={video.poster || undefined}
               controls autoPlay playsInline preload="metadata"
               onError={() => setPlayerError(true)} aria-label={name} />;
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
export function Crumbs({ trail, label = 'Breadcrumb', parentOnNarrow = false }: {
  trail: { label: string; to?: string; props?: HTMLAttributes<HTMLElement> }[];
  label?: string;
  /** Under 600px show only the parent, as "‹ Parent" (a page head's crumbs;
   *  design.md § Page head, "Phone"). A folder path keeps every step. */
  parentOnNarrow?: boolean;
}) {
  return (
    <nav className={parentOnNarrow ? 'crumbs crumbs-parent' : 'crumbs'} aria-label={label}>
      {trail.map((t, i) => (
        <span key={`${t.label}-${i}`}
              data-parent={i === Math.max(0, trail.length - 2) || undefined}>
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

/** One command in a page head (design.md § Page head, "Actions").
 *
 *  Data, not a button: the head decides how it is drawn — an outlined
 *  button on a wide screen, an item in the ⋮ on a phone — so a command keeps
 *  one label and one position on every page. `to` is an in-app route (drawn
 *  as a Link); otherwise `onClick` runs. */
export interface HeadAction {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  to?: string;
  disabled?: boolean;
  /** Reaches the drawn button or link, for a panel that hands focus back to
   *  the control that opened it (Documents' "Add documents"). */
  ref?: Ref<HTMLButtonElement & HTMLAnchorElement>;
  /** Only when the visible label is not the whole name. */
  ariaLabel?: string;
  /** For a control that opens a panel in place (aria-expanded). */
  expanded?: boolean;
  /** For a control that opens a drawer or dialog (aria-haspopup). */
  haspopup?: 'dialog';
  /** A hover tooltip that says more than the label (the button's `title`);
   *  the label stays the accessible name. */
  tip?: string;
}

/** A page head's commands (design.md § Page head, "Actions").
 *
 *  Drawn left to right as: the outlined `secondaries` (the first two; any
 *  more go into the ⋮), the one filled `primary`, then the ⋮ holding
 *  `overflow`, last (Reddy, 13/10/2026). Under 600px the secondaries join the ⋮ and only the
 *  primary stays visible. A detail page has no `primary` (`DetailActions`):
 *  its own add lives in its tab's section head. */
export interface HeadActions {
  primary?: HeadAction;
  secondaries?: HeadAction[];
  overflow?: MenuItem[];
  /** The ⋮'s accessible name. Defaults to "More actions for {title}". */
  overflowLabel?: string;
  /** Named above the ⋮'s items: which thing they act on (`Menu` header). */
  overflowHeader?: ReactNode;
  /** Also reaches the ⋮, for a panel one of its items opened to hand focus
   *  back to (Money's "Add an expense"). */
  overflowRef?: Ref<HTMLButtonElement>;
}

/** A detail page's head commands: no filled primary. */
export type DetailActions = Omit<HeadActions, 'primary'> & { primary?: never };

/** A breadcrumb step, as `Crumbs` takes it. */
export type CrumbStep = { label: string; to?: string; props?: HTMLAttributes<HTMLElement> };

/** The phone breakpoint every page head and toolbar band changes at
 *  (design.md § Page head, "Phone"). */
export const PHONE_PX = 600;

function HeadButton({ a, primary }: { a: HeadAction; primary?: boolean }) {
  const cls = primary ? 'btn primary' : 'btn';
  const body = <>{a.icon}{a.label}</>;
  if (a.to && !a.disabled) {
    return (
      <Link ref={a.ref} className={cls} to={a.to} aria-label={a.ariaLabel} title={a.tip}>{body}</Link>
    );
  }
  return (
    <button ref={a.ref} type="button" className={cls} disabled={a.disabled} title={a.tip}
            aria-label={a.ariaLabel} aria-expanded={a.expanded} aria-haspopup={a.haspopup}
            onClick={a.onClick}>
      {body}
    </button>
  );
}

/** Point a ref at an element, whichever kind of ref it is. */
function setRef<T>(ref: Ref<T> | undefined, el: T | null) {
  if (typeof ref === 'function') ref(el);
  else if (ref) (ref as { current: T | null }).current = el;
}

/** The right side of the title row. See `HeadActions`. PageHead and
 *  SectionHead (RecordHead.tsx) both draw their commands through it; `lead`
 *  is a section head's non-command controls (a search, a year, a segmented
 *  choice), drawn first in the same row. */
export function HeadActionsRow({ actions, title, lead }: {
  actions: HeadActions; title: string; lead?: ReactNode;
}) {
  const phone = useNarrow(PHONE_PX);
  const nav = useNavigate();
  const { primary, secondaries = [], overflow = [], overflowLabel, overflowHeader, overflowRef } = actions;
  const asItem = (a: HeadAction): MenuItem => ({
    label: a.label, icon: a.icon, disabled: a.disabled,
    onClick: () => { if (a.to) nav(a.to); else a.onClick?.(); },
  });
  // At most two outlined secondaries, none on a phone; the rest join the ⋮.
  const shown = phone ? [] : secondaries.slice(0, 2);
  const moved = secondaries.slice(shown.length);
  const menu = [...moved.map(asItem), ...overflow];
  // A moved command's ref follows it to the ⋮, so a panel it opened hands
  // focus back to the ⋮ rather than to <body>.
  const triggerRef = (el: HTMLButtonElement | null) => {
    setRef(overflowRef, el);
    for (const a of moved) setRef(a.ref, el as (HTMLButtonElement & HTMLAnchorElement) | null);
  };
  if (!lead && !primary && !shown.length && !menu.length) return null;
  return (
    <div className="actions">
      {lead}
      {/* Keyed by position: a command whose label flips on press ("New
          scope" / "Cancel new scope") stays the same button and keeps focus. */}
      {shown.map((a, i) => <HeadButton key={i} a={a} />)}
      {primary && <HeadButton a={primary} primary />}
      {/* The ⋮ is the last thing on the row, after the filled primary
          (Reddy, 13/10/2026): "more actions" reads as the end of the list. */}
      {menu.length > 0 && (
        <Menu label={overflowLabel ?? (title ? `More actions for ${title}` : 'More actions')} items={menu}
              header={overflowHeader} triggerClassName="iconbtn pagehead-more"
              triggerRef={overflowRef || moved.some((a) => a.ref) ? triggerRef : undefined} />
      )}
    </div>
  );
}

/** Every /app page's head (design.md § Page head). One component, so no page
 *  builds its own and every head sits at the same place.
 *
 *  Slots, top to bottom:
 *    `crumbs`   wayfinding, detail pages only; ends at this page.
 *    `eyebrow`  a nested page WITHOUT crumbs names its parent. Never on a
 *               top-level page (V2), never with crumbs.
 *    title row  `glyph`, the h1, the ⓘ (`info`: standing guidance, never a
 *               fact), `switcher`, `pill` on the left; `actions` on the right,
 *               centred on the h1 line.
 *    `summary`  one `.note` line 6px under the h1: figures on a collection,
 *               never guidance.
 *    `meta`     a detail page's facts row (kind · place · holder).
 *    `tabs`     a detail page's tab strip, the last row of the head.
 *
 *  `docTitle` names the browser tab "{docTitle} · Pattadar"; a page whose
 *  `title` is not plain text (Home's greeting, a record's name with markup)
 *  must pass it, and the type says so. */
export function PageHead({
  eyebrow, crumbs, title, info, glyph, switcher, pill, summary, meta, tabs, actions, docTitle,
}: {
  info?: ReactNode;
  glyph?: ReactNode;
  switcher?: ReactNode;
  pill?: ReactNode;
  summary?: ReactNode;
  meta?: ReactNode;
  tabs?: ReactNode;
} & (
  /** The browser tab's name; required when `title` is not plain text. */
  | { title: string; docTitle?: string }
  | { title: ReactNode; docTitle: string }
) & (
  /** A detail page: wayfinding, and no filled primary in its head. */
  | { crumbs: CrumbStep[]; eyebrow?: never; actions?: DetailActions }
  | { crumbs?: never; eyebrow?: ReactNode; actions?: HeadActions }
)) {
  const tabName = docTitle ?? (typeof title === 'string' ? title : undefined);
  useDocumentTitle(tabName);
  const named = typeof title === 'string' ? title : (docTitle ?? '');
  const detail = !!crumbs?.length;
  return (
    <header className="pagehead" data-kind={detail ? 'detail' : 'top'}>
      {detail && <Crumbs trail={crumbs!} parentOnNarrow />}
      {!detail && eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <div className="pagehead-row">
        <div className="pagehead-title">
          {glyph}
          <h1>{title}</h1>
          {info && <InfoTip label={named || 'this page'}>{info}</InfoTip>}
          {switcher}
          {pill}
        </div>
        {actions && <HeadActionsRow actions={actions} title={named} />}
      </div>
      {summary && <p className="pagehead-summary note num">{summary}</p>}
      {meta && <div className="pagehead-meta">{meta}</div>}
      {tabs && <div className="pagehead-tabs">{tabs}</div>}
    </header>
  );
}

/** A place line (design.md § Page head, slot 4): where in a place hierarchy
 *  the list below is — always on Cadastral maps, on Documents inside a folder
 *  or while filtering. The first row of the toolbar band; the current place
 *  is the `<strong>`. */
export const PlaceLine = ({ children, label }: { children: ReactNode; label?: string }) => (
  <div className="placeline" aria-label={label}>{children}</div>
);

/** The product name every browser tab ends with. */
export const APP_NAME = 'Pattadar';

/** Name the browser tab "{title} · Pattadar" while a screen is shown.
 *
 *  Every /app tab used to read "Pattadar", so tabs, history and bookmarks
 *  could not be told apart, and the assistant, which reads the tab's name as
 *  the page the owner is on, could not tell either (naming standard V1).
 *  PageHead, RecordHead and HoldingHead call it; an empty title leaves the
 *  tab alone. Leaving the screen puts back what was there before. */
export function useDocumentTitle(title: string | undefined | null) {
  const name = (title ?? '').trim();
  useEffect(() => {
    if (!name) return undefined;
    const previous = document.title;
    document.title = `${name} · ${APP_NAME}`;
    return () => { document.title = previous; };
  }, [name]);
}

/** The page's own name, without the " · Pattadar" every tab ends with. */
export function pageName(tabTitle: string = document.title): string {
  const suffix = ` · ${APP_NAME}`;
  return tabTitle.endsWith(suffix) ? tabTitle.slice(0, -suffix.length) : tabTitle;
}

/** An ⓘ that explains the thing beside it (Material 3 plain tooltip).
 *
 *  Shown on hover and on keyboard focus, and opened by a tap so it works on a
 *  phone, which has no hover; a tap elsewhere (blur) or Escape closes it. A
 *  tap is not a toggle: the browser's emulated mouseenter and the focus open
 *  it first, so a toggling click shut it again at once. The text is always
 *  in the DOM and linked by aria-describedby, so a screen reader hears it on
 *  focus without the tooltip having to be open. */
export function InfoTip({ label, tag, children }: {
  label: string; children: ReactNode;
  /** A short visible word in place of the ⓘ (the Overview's source tag,
   *  "Deed"). The button is then named by `label` itself — the whole text the
   *  tip shows — so a screen reader hears it once, not the short word. */
  tag?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className={`infotip${tag ? ' tagged' : ''}`} data-open={open || undefined}
          onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className={tag ? 'infotip-tag' : 'infotip-btn'} aria-label={tag ? label : `About ${label}`}
              aria-describedby={tag ? undefined : id} aria-expanded={open}
              onClick={() => setOpen(true)}
              onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
        {tag ? <span aria-hidden>{tag}</span> : <InfoOutlined sx={{ fontSize: 18 }} aria-hidden />}
      </button>
      <span role="tooltip" id={id} className="infotip-body" aria-hidden={tag ? true : undefined}>{children}</span>
    </span>
  );
}

/** An ⓘ that opens the Pattadar University guide for the thing beside it, in
 *  a new tab — InfoTip's look, for an explanation too long for a tooltip. */
export const InfoLink = ({ label, href }: { label: string; href: string }) => (
  <a className="infotip-btn" href={href} target="_blank" rel="noopener noreferrer" draggable={false}
     aria-label={`About ${label}, in Pattadar University (opens in a new tab)`} title={`About ${label}`}>
    <InfoOutlined sx={{ fontSize: 18 }} aria-hidden />
  </a>
);

/** A status as a chip (Material 3 assist chip, non-interactive). `state` is
 *  the server's good | warn | bad | unknown, the same key `State` reads. */
export const StatusChip = ({ state, children }: { state: string; children: ReactNode }) => (
  <span className={`schip ${state || 'unknown'}`}>{children}</span>
);

export interface FacetFilterOption {
  key: string;
  label: string;
  /** Left out where there is nothing to count (one property is one property). */
  count?: number;
}

export interface FacetFilterGroup {
  key: string;
  label: string;
  options: FacetFilterOption[];
  /** Listed only once something is typed in the popover's search. For a group
   *  too long to read down (Cadastral maps' 900 villages), which is found by
   *  name rather than browsed. Its chosen options still show as chips. */
  searchOnly?: boolean;
}

export interface FacetFilterChip {
  id: string;
  group: string;
  label: string;
  removeLabel: string;
  onRemove: () => void;
}

/** What a page may ask of a `FacetFilter` it holds a `ref` to. */
export interface FacetFilterHandle {
  /** Put the popover away, as a press outside it does, leaving focus where it
   *  is. Does nothing while the popover is shut. */
  close: () => void;
}

/** The single faceted-filter surface used by list pages.
 *
 * Pages own only their filter values and domain labels. Opening, dismissal,
 * active chips, counts and keyboard focus live here so a filter never changes
 * its interaction model because the list underneath happens to be different.
 * The one thing a page may ask, through the optional `ref`, is that an open
 * popover close: a page whose own temporary surface opens in the same place
 * (Cadastral maps' village matches, in this filter's `search` slot) closes
 * it so the two never cover each other. A page that passes no `ref` gets
 * exactly the filter every other page has. */
export function FacetFilter({
  groups, selected, onToggle, onClear, tally, search, sort, view, extraChips = [],
  groupLabel, missingOptionLabel, busy = false, ariaLabel = 'Narrow the list',
  searchPlaceholder, fold, ref, lead,
}: {
  groups: FacetFilterGroup[];
  selected: Record<string, readonly string[]>;
  onToggle: (groupKey: string, optionKey: string) => void;
  onClear: () => void;
  /** Optional: a list with a table footer carries its count there instead. */
  tally?: ReactNode;
  /** The page's own search: a `BandSearch`. */
  search?: ReactNode;
  /** A `SortCycle`. */
  sort?: ReactNode;
  /** A `ViewToggle` (Grid / List / Table / Map), or a `Segmented` scope such
   *  as Services' Open / All. */
  view?: ReactNode;
  extraChips?: FacetFilterChip[];
  groupLabel?: (groupKey: string, group?: FacetFilterGroup) => string;
  missingOptionLabel?: (groupKey: string, optionKey: string) => string;
  busy?: boolean;
  ariaLabel?: string;
  /** Optional search inside a long chooser (for example 56 mandals). The
   *  query filters option labels across groups; screens keep no second search
   *  implementation of their own. */
  searchPlaceholder?: string;
  /** Optional: a second, looser way the search may match, for names spelt
   *  more than one way (Cadastral maps passes `villageKey`, so Chintagunta
   *  finds CHINTHAGUNTA). A label matches if either way does. */
  fold?: (text: string) => string;
  /** Optional: lets the page close the popover (`FacetFilterHandle`). */
  ref?: RefObject<FacetFilterHandle | null>;
  /** Optional: a scope the whole list is read for, before "+ Filter" — a
   *  ledger's `YearSelect`. */
  lead?: ReactNode;
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
  const foldedQuery = query && fold ? fold(query) : '';
  const matches = (label: string) => label.toLocaleLowerCase('en-IN').includes(query)
    || (!!foldedQuery && fold!(label).includes(foldedQuery));
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      options: query
        ? group.options.filter((option) => matches(option.label))
        : group.searchOnly ? [] : group.options,
    }))
    .filter((group) => group.options.length > 0);
  const close = () => {
    setOpen(false);
    setOptionQuery('');
  };
  useImperativeHandle(ref, () => ({ close }));

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
      className="filterbar band" ref={rootRef} aria-busy={busy}
      style={{ opacity: busy ? 0.6 : 1, transition: 'opacity var(--dur-fast) var(--ease-out)' }}
    >
      {lead}
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
      <BandTools tally={tally} search={search} sort={sort} view={view} />

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
                    {option.count !== undefined && <span className="n">{option.count}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {/* Said of a search that matched nothing. With nothing typed yet, a
              popover with a search has had nothing to miss, so its search row
              stands alone. One without a search keeps the line. */}
          {visibleGroups.length === 0 && (query.length > 0 || !searchPlaceholder) && (
            <p className="fpop-empty">No filter options match that search.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** The sort chip at the end of a filter row: "Sort: Newest first", and a
 *  press moves to the next order. It sits in the band's `sort` slot.
 *
 *  Properties and Documents had each written this button out by hand, and the
 *  Holdings list would have been the third copy. The page owns the
 *  orders and which one is next; this owns how the chip looks and reads.
 *  With no `ariaLabel` the accessible name is the visible text. */
export function SortCycle({ label, onNext, ariaLabel }: {
  label: string; onNext: () => void; ariaLabel?: string;
}) {
  // No chevron: the chip is not a dropdown, and "⌄" promised a list that a
  // press never opened (founder, 07/10/2026). The new order is said once,
  // politely, after a press — not on first draw, where it is just the label.
  const [said, setSaid] = useState('');
  const pressed = useRef(false);
  useEffect(() => {
    if (!pressed.current) return;
    pressed.current = false;
    setSaid(`Sorted by ${label}`);
  }, [label]);
  return (
    <>
      <button type="button" className="sortcycle" aria-label={ariaLabel}
              onClick={() => { pressed.current = true; onNext(); }}>
        <span className="sortcycle-t">Sort: {label}</span>
      </button>
      <span className="sr-only" aria-live="polite">{said}</span>
    </>
  );
}

/** A ledger's financial year, at the left of its band (the property's and the
 *  holding's Expenses). A 44px target on a phone, as every band control is. */
export function YearSelect({ years, value, onChange }: {
  years: readonly string[]; value: string; onChange: (year: string) => void;
}) {
  return (
    <select className="yearselect" value={value} aria-label="Financial year"
            onChange={(e) => onChange(e.target.value)}>
      {years.map((y) => <option key={y}>{y}</option>)}
    </select>
  );
}

/** The right side of the toolbar band, always in one order (design.md §
 *  Page head, slot 5): the tally, then the page's own search, then sort,
 *  then the view toggle. */
function BandTools({ tally, search, sort, view }: {
  tally?: ReactNode; search?: ReactNode; sort?: ReactNode; view?: ReactNode;
}) {
  const tools = !!(search || sort || view);
  return (
    <>
      {tally !== undefined && tally !== null && tally !== ''
        && <span className="tally" role="status">{tally}</span>}
      {tools && (
        <>
          <span className="vrule" aria-hidden />
          <span className="band-tools">{search}{sort}{view}</span>
        </>
      )}
    </>
  );
}

/** The toolbar band for a collection with nothing to filter by (design.md §
 *  Page head, slot 5). A list that has facets uses `FacetFilter`, which is
 *  this band with "+ Filter" and its chips on the left. Hairlines above and
 *  below, 24px under the head and 24px above the content. */
export function ToolbarBand({ left, tally, search, sort, view, busy = false, label }: {
  left?: ReactNode; tally?: ReactNode; search?: ReactNode; sort?: ReactNode; view?: ReactNode;
  busy?: boolean;
  /** Names the band for assistive tech when it holds more than a sort. */
  label?: string;
}) {
  return (
    <div className="filterbar band" role={label ? 'toolbar' : undefined} aria-label={label}
         aria-busy={busy} style={{ opacity: busy ? 0.6 : 1, transition: 'opacity var(--dur-fast) var(--ease-out)' }}>
      {left}
      <span className="grow" />
      <BandTools tally={tally} search={search} sort={sort} view={view} />
    </div>
  );
}

/** A page's own search, in the toolbar band (design.md § Page head, slot 5).
 *
 *  On a wide screen it is a field. Under 600px it is a search icon that opens
 *  a full-width field on its own row of the band; Escape or leaving an empty
 *  field puts the icon back. A search with text in it stays open. `children`
 *  rides inside the field's box, for a page whose search drops a list of
 *  matches under it (Cadastral maps' villages). */
export function BandSearch({ value, onChange, placeholder, label, inputRef, onKeyDown, children }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** The field's accessible name, and the phone icon's. */
  label: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  children?: ReactNode;
}) {
  const phone = useNarrow(PHONE_PX);
  const [open, setOpen] = useState(false);
  const own = useRef<HTMLInputElement>(null);
  const field = inputRef ?? own;
  const opener = useRef<HTMLButtonElement>(null);
  const shut = useRef(false);
  const expanded = !phone || open || value !== '';
  useEffect(() => {
    if (phone && open) field.current?.focus();
  }, [phone, open, field]);
  useEffect(() => {
    if (!expanded && shut.current) { shut.current = false; opener.current?.focus(); }
  }, [expanded]);
  if (!expanded) {
    return (
      <button ref={opener} type="button" className="iconbtn bandsearch-open" aria-label={label}
              onClick={() => setOpen(true)}>
        <SearchOutlined sx={{ fontSize: 20 }} aria-hidden />
      </button>
    );
  }
  return (
    <span className="search bandsearch" data-phone={phone || undefined}>
      <SearchOutlined sx={{ fontSize: 17 }} aria-hidden />
      <input ref={field} value={value} placeholder={placeholder} aria-label={label}
             onChange={(e) => onChange(e.target.value)}
             onBlur={() => { if (phone && !value) setOpen(false); }}
             onKeyDown={(e) => {
               if (phone && e.key === 'Escape' && !value) { shut.current = true; setOpen(false); }
               onKeyDown?.(e);
             }} />
      {phone && (
        <button type="button" className="iconbtn" aria-label="Close search"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(''); shut.current = true; setOpen(false); }}>
          <CloseOutlined sx={{ fontSize: 18 }} aria-hidden />
        </button>
      )}
      {children}
    </span>
  );
}

/** One choice of a `Segmented` control. */
export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Drawn only where the control goes icon-only (a phone's view toggle). */
  icon?: ReactNode;
  disabled?: boolean;
}

/** A segmented control: a few mutually exclusive views of one thing, in a
 *  wash, never the amber fill that means "act" (design.md § App-surface
 *  rules). Buttons with `aria-pressed`, the WAI-ARIA toggle-button pattern
 *  every page copy used. `iconOnlyOnPhone` draws only the icons under 600px,
 *  each keeping its word as its accessible name. */
export function Segmented<T extends string>({ label, options, value, onChange, iconOnlyOnPhone = false, className }: {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  iconOnlyOnPhone?: boolean;
  className?: string;
}) {
  const cls = ['segmented', iconOnlyOnPhone && 'icon-phone', className].filter(Boolean).join(' ');
  return (
    <div className={cls} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} disabled={o.disabled}
                aria-label={iconOnlyOnPhone ? o.label : undefined}
                title={iconOnlyOnPhone ? o.label : undefined}
                onClick={() => onChange(o.value)}>
          {iconOnlyOnPhone && o.icon && <span className="seg-icon" aria-hidden>{o.icon}</span>}
          <span className="seg-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The shapes a collection can be drawn in, in the one order every view
 *  toggle shows them. */
export type ViewKind = 'grid' | 'list' | 'table' | 'map';
const VIEW_ORDER: readonly ViewKind[] = ['grid', 'list', 'table', 'map'];
const VIEW_OPTION: Record<ViewKind, SegmentOption<ViewKind>> = {
  grid: { value: 'grid', label: 'Grid', icon: <GridViewOutlined sx={{ fontSize: 18 }} /> },
  list: { value: 'list', label: 'List', icon: <ViewListOutlined sx={{ fontSize: 18 }} /> },
  table: { value: 'table', label: 'Table', icon: <TableRowsOutlined sx={{ fontSize: 18 }} /> },
  map: { value: 'map', label: 'Map', icon: <MapOutlined sx={{ fontSize: 18 }} /> },
};

/** The view toggle at the end of the toolbar band (design.md § Page head,
 *  slot 5): Grid · List · Table · Map, in that order whatever order `views`
 *  lists them. Icon and word on a wide screen ("three unlabelled glyphs gave
 *  no clue that a map existed"), icons alone under 600px. A rows-and-columns
 *  view is "Table" (founder, 10/10/2026); "List" is only a view that is not. */
export function ViewToggle<T extends ViewKind>({ views, value, onChange, label = 'View' }: {
  views: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  const options = VIEW_ORDER.filter((v): v is T => views.includes(v as T))
    .map((v) => VIEW_OPTION[v] as SegmentOption<T>);
  return <Segmented label={label} options={options} value={value} onChange={onChange} iconOnlyOnPhone className="icons" />;
}

// ── Tables ─────────────────────────────────────────────────────────────
//
// The table standard (founder, 10/10/2026: "apply the same standards across
// the platform"). A data table — one whose rows can pass 20 — pages with
// `usePaged` + `TablePager`, sorts with `Th` + `sortBy`, selects with
// `SelectAllBox`, and sums its summable columns in a plain <tfoot> whose
// label is a <th scope="row">: "Total · N things", or "N selected" when rows
// are ticked. There is no footer component; what a footer adds differs.

export const PAGE_SIZES = [5, 10, 20, 50] as const;
export const PAGE_DEFAULT = 20;

export type SortState<K extends string> = { key: K; dir: 1 | -1 } | null;

/** `rows` in `sort`'s order, or as they came when there is no sort. */
export function sortBy<R, K extends string>(
  rows: readonly R[], sort: SortState<K>, get: Record<K, (r: R) => string | number>,
): R[] {
  if (!sort) return [...rows];
  const val = get[sort.key];
  return [...rows].sort((x, y) => {
    const a = val(x), b = val(y);
    return (a < b ? -1 : a > b ? 1 : 0) * sort.dir;
  });
}

/** A sortable column heading: up, down, off. Module scope so a re-render
 *  does not remount the button a keyboard user just pressed. */
export function Th<K extends string>({ k, label, right, sort, setSort, className }: {
  k: K; label: string; right?: boolean; className?: string;
  sort: SortState<K>; setSort: (s: SortState<K>) => void;
}) {
  const dir = sort?.key === k ? sort.dir : 0;
  const Arrow = dir === 1 ? ArrowUpwardRounded : ArrowDownwardRounded;
  return (
    <th className={[right && 'right', className].filter(Boolean).join(' ') || undefined}
        aria-sort={dir === 0 ? undefined : dir === 1 ? 'ascending' : 'descending'}>
      <button type="button" className="sortbtn"
              onClick={() => setSort(dir === 0 ? { key: k, dir: 1 }
                : dir === 1 ? { key: k, dir: -1 } : null)}>
        {label}
        <span className="arrow" aria-hidden>{dir !== 0 && <Arrow sx={{ fontSize: 12 }} />}</span>
      </button>
    </th>
  );
}

/** The header tick box. It covers every row the filter lets through (as the
 *  footer does), says so in its name, and shows "some" as indeterminate. */
export function SelectAllBox({ total, picked, onToggle, noun = ['row', 'rows'] }: {
  total: number; picked: number; onToggle: () => void; noun?: readonly [string, string];
}) {
  const all = total > 0 && picked >= total;
  return (
    <input type="checkbox" checked={all} onChange={onToggle} disabled={total === 0}
           ref={(el) => { if (el) el.indeterminate = picked > 0 && !all; }}
           aria-label={`Select all ${plural(total, noun[0], noun[1])}`} />
  );
}

export interface Paged<T> {
  shown: T[]; page: number; pages: number; size: number; total: number;
  setPage: (n: number) => void; setSize: (n: number) => void;
}

/** One page of `rows`. The page is clamped (a shrinking list lands on its
 *  last page) and returns to 1 when `resetKey` changes — pass the sort and
 *  whatever narrows the list, never the data itself, so a refresh keeps the
 *  reader's place. `storeKey` remembers the chosen size per table. */
export function usePaged<T>(rows: readonly T[], { size: initial = PAGE_DEFAULT, resetKey, storeKey }: {
  size?: number; resetKey?: string; storeKey?: string;
} = {}): Paged<T> {
  const [size, setSizeState] = useState(() => {
    try {
      const n = Number(storeKey ? localStorage.getItem(storeKey) : NaN);
      return (PAGE_SIZES as readonly number[]).includes(n) ? n : initial;
    } catch { return initial; }
  });
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages);
  const shown = useMemo(() => rows.slice((cur - 1) * size, cur * size), [rows, cur, size]);
  const setSize = (n: number) => {
    setSizeState(n); setPage(1);
    try { if (storeKey) localStorage.setItem(storeKey, String(n)); } catch { /* private window */ }
  };
  return { shown, page: cur, pages, size, total: rows.length, setPage, setSize };
}

/** Under a data table: rows-per-page (when `onSize` is given), "a–b of N"
 *  announced politely, and Previous/Next. Nothing when it would page nothing.
 *  Previous/Next are aria-disabled, not disabled, so the button a keyboard
 *  user is on keeps focus at either end. */
export function TablePager({ page, pages, size, total, setPage, onSize, label, sizes = PAGE_SIZES }: {
  page: number; pages: number; size: number; total: number;
  setPage: (n: number) => void; onSize?: (n: number) => void;
  label: string; sizes?: readonly number[];
}) {
  if (total <= (onSize ? sizes[0] : size)) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const turn = (n: number) => { if (n >= 1 && n <= pages) setPage(n); };
  return (
    <nav className="tablepager" aria-label={label}>
      {onSize && <>
        <span className="note" aria-hidden>Per page</span>
        <Segmented label="Per page" value={String(size)}
                   options={sizes.map((n) => ({ value: String(n), label: String(n) }))}
                   onChange={(v) => onSize(Number(v))} />
      </>}
      <span className="note num" aria-live="polite">{`${num(from)}–${num(to)} of ${num(total)}`}</span>
      {pages > 1 && <>
        <button type="button" className="btn sm" aria-disabled={page === 1}
                onClick={() => turn(page - 1)}>Previous</button>
        <button type="button" className="btn sm" aria-disabled={page === pages}
                onClick={() => turn(page + 1)}>Next</button>
      </>}
    </nav>
  );
}

/** Ticked rows of a data table. Every data table has them (founder,
 *  10/10/2026): ticking is how a reader gets a spreadsheet's status-bar sum
 *  out of the footer, whether or not the table has anything to do in bulk.
 *  `rows` is what the filter lets through; a change of `resetKey` (whatever
 *  narrows the list) drops the selection rather than act on hidden rows. */
export function useRowSelection<T>(rows: readonly T[], idOf: (r: T) => string, resetKey = '') {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => { setSelected(new Set()); }, [resetKey]);
  const picked = useMemo(() => rows.filter((r) => selected.has(idOf(r))), [rows, selected, idOf]);
  const toggle = useCallback((id: string) => setSelected((was) => {
    const next = new Set(was);
    if (!next.delete(id)) next.add(id);
    return next;
  }), []);
  const toggleAll = () => setSelected(picked.length === rows.length ? new Set() : new Set(rows.map(idOf)));
  const clear = () => setSelected(new Set());
  return { selected, picked, toggle, toggleAll, clear };
}

/** A row's tick box. The whole cell is the target: a near miss on the box
 *  ticks it rather than opening the row. */
export function SelectCell({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return (
    <td className="selcol" onClick={(e) => { if (!(e.target instanceof HTMLInputElement)) onToggle(); }}>
      <input type="checkbox" checked={checked} aria-label={label} onChange={onToggle} />
    </td>
  );
}

/** The floating bar that exists only while rows are ticked: how many, what
 *  can be done with them, and Clear. Every label in it counts the selection. */
export function SelectionBar({ count, noun, label, onClear, children }: {
  count: number; noun: readonly [string, string]; label: string;
  onClear: () => void; children?: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="selbar">
      <div className="bulkbar" role="group" aria-label={label}>
        <span className="count" role="status">{plural(count, noun[0], noun[1])} selected</span>
        {children && <><span className="vrule" aria-hidden /><span className="acts">{children}</span></>}
        <button type="button" className="clearall" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────

/** A tab's status: a glyph drawn beside the label, and a word that is the
 *  glyph's tooltip and the end of the tab's accessible name (aria-label),
 *  so a status never rests on a glyph or a colour alone for assistive tech.
 *  The word is not drawn (Reddy, 03/10/2026: "Safeguard" plus the glyph). */
export interface TabStripStatus { glyph: string; word: string; state: 'good' | 'warn' | 'bad' }

export interface TabStripTab<T extends string> {
  id: T;
  label: string;
  /** A count beside the label, printed as RecordTabs prints it: zero is
   *  shown, dimmed. */
  n?: number;
  status?: TabStripStatus;
}

/**
 * An in-page tab list: `aria-selected`, one tab stop for the whole strip, and
 * Arrow/Home/End moving between them. The stylesheet keys on
 * `[aria-selected='true']`, which is only a valid attribute inside
 * `role="tablist"` — so declaring the role means also honouring the keyboard
 * contract that comes with it, rather than borrowing the styling and leaving a
 * keyboard user to Tab through every tab to reach the panel.
 *
 * Families & groups and Tools had each written this out locally; route tabs
 * (a tab per address) are RecordTabs / HoldingTabs instead.
 */
export function TabStrip<T extends string>({
  tabs, value, onChange, label, idBase,
}: {
  tabs: TabStripTab<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  idBase: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const at = tabs.findIndex((t) => t.id === value);
    let to = -1;
    if (e.key === 'ArrowRight') to = (at + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') to = (at - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = tabs.length - 1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to].id);
    refs.current[tabs[to].id]?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`${idBase}-tab-${t.id}`}
          aria-controls={`${idBase}-panel-${t.id}`}
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          ref={(el) => { refs.current[t.id] = el; }}
          onClick={() => onChange(t.id)}
          aria-label={t.status
            ? `${t.label}${t.n !== undefined ? ` ${num(t.n)}` : ''}, ${t.status.word}`
            : undefined}
        >
          {t.label}
          {t.n !== undefined && <span className={t.n > 0 ? 'n' : 'n zero'}>{num(t.n)}</span>}
          {t.status && (
            <span className={`tabstatus ${t.status.state}`}>
              {/* Only the glyph is drawn; the word is its tooltip and, through
                  the button's aria-label, the end of the tab's accessible
                  name ("Safeguard, needs action"). */}
              <span className="glyph" aria-hidden title={t.status.word}>{t.status.glyph}</span>
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** The panel a TabStrip tab controls. */
export function TabPanel({ idBase, id, children }: { idBase: string; id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel-${id}`} aria-labelledby={`${idBase}-tab-${id}`}>
      {children}
    </div>
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
  managed: 'Managed', watch: 'Watching', archived: 'Archived',
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
  title: 'Title deeds', revenue: 'Revenue records', map: 'Map', search: 'EC & tax receipts',
  identity: 'Identity', old: 'Old records', photos: 'Photos & video', unsorted: 'Not sorted yet',
};

/** What the app calls several properties that make one piece of ground.
 *
 *  A holding says WHICH properties make one farm; a family or group says WHO
 *  holds them. "Held by" and "holds" belong to groups only, so a holding is
 *  never "held": it is "part of {name}" and "one piece of ground" (memo
 *  06/10/2026). Its properties may have different holders.
 *
 *  The rail, the list's head, its crumbs, its CSV filename
 *  (`holdings-YYYY-MM-DD.csv`) and the Documents section all print this noun.
 *  "Holding" was approved by Reddy on 03/10/2026, superseding "Combined view"
 *  (design.md § App vocabulary). Web files, identifiers and routes say holding
 *  (`/holdings`); GraphQL fields,
 *  query keys and tables keep `combined`. Never "your holdings" to
 *  mean all of an owner's land, and never "Holdings" for the Properties list.
 *  It has no eyebrow: Holdings is a top-level page (V2; founder, 09/10/2026). */
export const HOLDING_WORD = {
  one: 'Holding',
  many: 'Holdings',
} as const;

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

export function Cell({ k, v, unit, note, tone, to, icon }: {
  k: string; v: ReactNode; unit?: string; note?: ReactNode; tone?: string; to?: string;
  /** An ICONS name drawn before the label. */
  icon?: string;
}) {
  const content = (
    <>
      <span className="k">{icon && <Icon name={icon} size={13} className="k-icon" />}{k}</span>
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
  title, icon, info, link, linkTo, children, className, aside, busy, flush, style, ref, labelledBy, tabIndex,
}: {
  title?: ReactNode; link?: string; linkTo?: string; children: ReactNode;
  /** An ICONS name drawn before the title (decorative; not in its name). */
  icon?: string;
  className?: string; aside?: ReactNode;
  /** No padding: a table or file list that runs edge to edge inside the
   *  card's border (Properties' and Documents' list views). */
  flush?: boolean;
  style?: CSSProperties;
  /** An ⓘ (InfoTip) drawn BESIDE the heading, not inside it — inside, the
   *  button became part of the heading's accessible name ("Cost About cost")
   *  and put an interactive control in a heading. PageHead and SectionHead
   *  place theirs the same way. */
  info?: ReactNode;
  /** The card is showing the last good answer while a new one is fetched.
   *  Screens were wrapping cards in a bare div just to carry this, because a
   *  panel that refreshes in place has to say so — otherwise changing a rate
   *  looks like nothing happened until the numbers silently change. */
  busy?: boolean;
  /** An untitled card that is still a landmark: the id of a (visually
   *  hidden) heading inside it, and a ref + tabIndex={-1} so focus can be
   *  put on it after the control that had focus is gone (Ticket's Next step). */
  labelledBy?: string; ref?: Ref<HTMLElement>; tabIndex?: number;
}) {
  return (
    <section ref={ref} className={`card ${flush ? 'flush' : 'pad-lg'} ${className ?? ''}`} style={style}
             aria-busy={busy || undefined} aria-labelledby={labelledBy} tabIndex={tabIndex}>
      {(title || link || aside) && (
        <div className="cardhead">
          {title && (info
            ? <span className="pagehead-title"><h2>{icon && <Icon name={icon} size={20} className="h-icon" />}{title}</h2>{info}</span>
            : <h2>{icon && <Icon name={icon} size={20} className="h-icon" />}{title}</h2>)}
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
  /** Drawn but not actionable — a page-head secondary that is disabled on a
   *  wide screen stays disabled when a phone moves it into the ⋮. */
  disabled?: boolean;
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
 *  a holding's ⋮ once its head wraps on a phone — opened the list off
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
export function Menu({ label, items, className, header, trigger, triggerClassName, triggerRef }: {
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
  /** Also reaches the trigger: a page head points a command it moved into
   *  this menu at it, so focus comes back here. */
  triggerRef?: Ref<HTMLButtonElement>;
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
        '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled)',
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
          '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled)',
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
        ref={(el) => { btnRef.current = el; setRef(triggerRef, el); }}
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
                className={cls} disabled={it.disabled}
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
/** Pick several items from a list too long to show, by typing (WAI-ARIA
 *  combobox with a listbox). What is picked sits in front of the field as the
 *  band's removable chips; at most `max` matches are listed at a time, so the
 *  same control serves 2 states or 700 districts. `single` keeps one pick.
 *  The Service catalogue uses it for the states and districts a service is
 *  offered in, and for choosing another place to price. */
export function ChipPicker({ label, options, selected, onChange, placeholder, single = false, max = 8, empty }: {
  /** Names the field and its list: "States". */
  label: string;
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  single?: boolean;
  max?: number;
  /** Said where the chips would be while nothing is picked: "All districts". */
  empty?: ReactNode;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const base = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const names = new Map(options.map((o) => [o.id, o.label]));
  const needle = text.trim().toLowerCase();
  const matches = options
    .filter((o) => !selected.includes(o.id))
    .filter((o) => !needle || o.label.toLowerCase().includes(needle))
    .slice(0, max);
  const more = options.filter((o) => !selected.includes(o.id)
    && (!needle || o.label.toLowerCase().includes(needle))).length - matches.length;
  const pick = (id: string) => {
    onChange(single ? [id] : [...selected, id]);
    setText(''); setActive(0);
    if (single) setOpen(false);
    inputRef.current?.focus();
  };
  const drop = (id: string) => { onChange(selected.filter((s) => s !== id)); inputRef.current?.focus(); };
  const listId = `${base}-list`;
  const showList = open && matches.length > 0;
  return (
    <div className="chippick">
      {selected.length === 0 && empty && <span className="note">{empty}</span>}
      {selected.map((id) => (
        <span className="fchip" key={id}>
          <span className="val">{names.get(id) ?? id}</span>
          <button type="button" aria-label={`Remove ${names.get(id) ?? id}`} onClick={() => drop(id)}>×</button>
        </span>
      ))}
      <div className="chippick-field">
        <input
          ref={inputRef} type="text" value={text} placeholder={placeholder} aria-label={label}
          role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={showList ? `${base}-o${active}` : undefined}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, matches.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter' && showList) { e.preventDefault(); pick(matches[active].id); }
            else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
            else if (e.key === 'Backspace' && !text && selected.length) drop(selected[selected.length - 1]);
          }}
        />
        {showList && (
          <ul id={listId} role="listbox" aria-label={label} className="chippick-list">
            {matches.map((o, i) => (
              <li key={o.id} id={`${base}-o${i}`} role="option" aria-selected={i === active}
                  onMouseDown={(e) => { e.preventDefault(); pick(o.id); }}
                  onMouseEnter={() => setActive(i)}>
                {o.label}
              </li>
            ))}
            {more > 0 && <li className="note" aria-hidden>{num(more)} more; type to narrow the list</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

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
/** A write that did not go through, said under the form that asked for it
 *  (design.md § Errors: "{Thing} could not be {done}. {Next step}."). Draws
 *  nothing while there is nothing to say. Not `Failed`: that is a read's
 *  blank state, with a retry. */
export const FormError = ({ children }: { children?: ReactNode }) => (
  children ? <p className="note bad" role="alert">{children}</p> : null
);

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
 * The reason is printed verbatim. It is small and grey because it is for
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

/** One step of an order's progress. `done` carries ✓ and its date; `current`
 *  is filled and bold with a caption; `todo` is quiet with no date; `stopped`
 *  is the terminal "Cancelled" that replaces every step not reached. */
export interface TrackerStep {
  label: string;
  state: 'done' | 'current' | 'todo' | 'stopped';
  date?: string;
  caption?: ReactNode;
  /** Tints the caption only, never the step: stalled and overdue are warn,
   *  a failed payment is bad. */
  tone?: 'warn' | 'bad';
  /** A step that was reached and then undone (work sent back): drawn struck
   *  through. */
  undone?: boolean;
  /** Where the order stands when that is a finished step (Accepted). */
  here?: boolean;
  /** A finished step a flow can go back to: its label becomes a button. */
  onClick?: () => void;
}

/** Where an order stands, as steps (service order spec §2): horizontal at
 *  600px and up, a vertical stepper under it. An `<ol>` with the current
 *  step marked `aria-current="step"`. The page decides the steps from the
 *  order's status and events; this only draws them, so the Orders list's
 *  four `Rail` pips stay what they are. */
export function OrderTracker({ steps, label = 'Order progress' }: { steps: TrackerStep[]; label?: string }) {
  return (
    <ol className="tracker" aria-label={label}>
      {steps.map((s, i) => (
        <li key={`${s.label}-${i}`} className={`tracker-step ${s.state}${s.undone ? ' undone' : ''}`}
            aria-current={s.state === 'current' || s.here ? 'step' : undefined}>
          <span className="tracker-dot" aria-hidden>
            {s.state === 'done' && <CheckRounded sx={{ fontSize: 14 }} />}
          </span>
          <span className="tracker-text">
            <span className="tracker-label">
              {s.onClick
                ? <button type="button" className="link" onClick={s.onClick}>{s.label}</button>
                : s.label}
              {s.state === 'done' && <span className="sr-only"> (done)</span>}
            </span>
            {s.date && s.state !== 'current' && <span className="tracker-date num">{s.date}</span>}
            {s.caption && <span className={`tracker-caption${s.tone ? ` ${s.tone}` : ''}`}>{s.caption}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

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
