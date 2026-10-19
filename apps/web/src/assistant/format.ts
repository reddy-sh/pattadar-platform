/** Pure helpers for the assistant drawer: formatting, ids, SSE framing, panel width. */
import type { RequestCost, ViewCell } from './types';

export const ASSISTANT_BASE = '/api/gateway/assistant/api';
export const PANEL_WIDTH = 520;
export const PANEL_MIN_WIDTH = 380;
export const PANEL_WIDTH_KEY = 'pattadar.assistant.width';
export const VIEW_PREVIEW_ROWS = 10;

export function savedPanelWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(PANEL_WIDTH_KEY));
    return Number.isFinite(stored) && stored >= PANEL_MIN_WIDTH ? stored : PANEL_WIDTH;
  } catch {
    return PANEL_WIDTH;
  }
}

export function clampPanelWidth(width: number): number {
  return Math.round(Math.min(Math.max(width, PANEL_MIN_WIDTH), window.innerWidth));
}

export const MODEL_KEY = 'pattadar.assistant.model';

export function savedModel(): string {
  try {
    return window.localStorage.getItem(MODEL_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Shown whenever an answer drew on the historical public-record corpus. */
export const PUBLIC_RECORDS_DISCLAIMER =
  'Public records are historical reference data only. They may contain errors and may not be accurate or complete, '
  + 'and a name match does not prove identity, ownership or current title. Pattadar is not responsible for any decision '
  + 'made on this information — verify with official IGRS / Sub-Registrar records.';

export function usd(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

export function kTokens(value: number | undefined): string {
  const n = value ?? 0;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function modelLabel(id: string | undefined): string {
  if (!id) return '';
  const match = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id) ?? /^claude-([a-z]+)-(\d+)$/.exec(id);
  if (!match) return id;
  const family = match[1].charAt(0).toUpperCase() + match[1].slice(1);
  return `${family} ${match[3] ? `${match[2]}.${match[3]}` : match[2]}`;
}

export function costLine(cost: RequestCost): string {
  const parts = [cost.model ? `${modelLabel(cost.model)} · ${usd(cost.cost_usd)}` : usd(cost.cost_usd)];
  if (cost.cache_read_tokens) parts.push(`${kTokens(cost.cache_read_tokens)} cached`);
  if (cost.cache_write_tokens) parts.push(`${kTokens(cost.cache_write_tokens)} cache write`);
  if (cost.output_tokens) parts.push(`${kTokens(cost.output_tokens)} out`);
  return parts.join(' · ');
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function isNumeric(value: ViewCell): boolean {
  return typeof value === 'number';
}

/** Free-text columns that would stretch the table to several screens on one line. */
export const WRAPPED_COLUMNS = new Set(['location', 'boundaries', 'counterparty', 'sellers', 'buyers']);

export function isConfidence(key: string): boolean {
  return key === 'score' || key === 'similarity';
}

/** Bands for name similarity. A high band still is not proof of identity. */
export function confidenceLevel(score: number): { label: 'High' | 'Medium' | 'Low'; color: 'success.main' | 'warning.main' | 'text.secondary' } {
  if (score >= 0.9) return { label: 'High', color: 'success.main' };
  if (score >= 0.7) return { label: 'Medium', color: 'warning.main' };
  return { label: 'Low', color: 'text.secondary' };
}

export function formatCell(key: string, value: ViewCell): string {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'side') return value === 'claimant' ? 'Buyer' : value === 'executant' ? 'Seller' : String(value);
  if (isConfidence(key) && typeof value === 'number') return `${Math.round(value * 100)}% · ${confidenceLevel(value).label}`;
  if (key === 'reg_date' && typeof value === 'string') return value.slice(0, 10);
  if (typeof value === 'number') {
    return /value|rate/.test(key) ? `₹${value.toLocaleString('en-IN')}` : value.toLocaleString('en-IN');
  }
  return value;
}

/** Parse CRLF or LF SSE framing incrementally. */
export function makeSseParser(onEvent: (payload: string) => void): (chunk: string) => void {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk.replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) onEvent(data);
      boundary = buffer.indexOf('\n\n');
    }
  };
}

export function displayToolName(name: string): string {
  const shortName = name.split('__').at(-1) ?? name;
  return shortName.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
