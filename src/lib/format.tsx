import type { ReactNode } from 'react';
import { db, type BaseRecord } from './db';
import { parseAnyDate } from './dates';
import type { FieldOption } from '../components/form/Form';

export const fmtCurrency = (n: unknown): string => {
  const v = Number(n);
  if (Number.isNaN(v)) return '—';
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

// ---------------------------------------------------------------------------
// GLOBAL date formats — the single source of truth for how dates render across
// the whole app. Change them here and every screen follows.
//   Short date  → dd-mmm-yyyy            (e.g. 29-Aug-2026)
//   Long date   → dd-mmm-yyyy hh:mm:ss   (e.g. 29-Aug-2026 08:49:32)
// ---------------------------------------------------------------------------
export const DATE_FORMATS = { short: 'dd-mmm-yyyy', long: 'dd-mmm-yyyy hh:mm:ss' } as const;
const _MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _pad = (n: number) => String(n).padStart(2, '0');
// Day-first for anything that is not ISO — the same reading every import uses,
// so a date shown on a visit's report is the day the export meant (dates.ts).
const _parse = (s: unknown): Date | null => parseAnyDate(s);

// Short date — dd-mmm-yyyy.
export function formatShortDate(s: unknown, empty = ''): string {
  const d = _parse(s); if (!d) return s ? String(s) : empty;
  return `${_pad(d.getDate())}-${_MON[d.getMonth()]}-${d.getFullYear()}`;
}
// Long date — dd-mmm-yyyy hh:mm:ss.
export function formatLongDate(s: unknown, empty = ''): string {
  const d = _parse(s); if (!d) return s ? String(s) : empty;
  return `${_pad(d.getDate())}-${_MON[d.getMonth()]}-${d.getFullYear()} ${_pad(d.getHours())}:${_pad(d.getMinutes())}:${_pad(d.getSeconds())}`;
}
// Long (with time) when the value carries a time, else short.
const HAS_TIME = /[T ]\d{1,2}:\d{2}/;
export function formatSmartDate(s: unknown, empty = ''): string {
  return HAS_TIME.test(String(s ?? '')) ? formatLongDate(s, empty) : formatShortDate(s, empty);
}

// App-wide aliases (kept for existing call-sites). fmtDate/fmtDateTime show '—'
// when empty (cards/tables); the fmtLong* variants show blank (dense tables).
export const fmtDate = (s: unknown): string => formatShortDate(s, '—');
export const fmtDateTime = (s: unknown): string => formatLongDate(s, '—');
export const fmtLongDate = (s: unknown): string => formatShortDate(s, '');
export const fmtLongDateTime = (s: unknown): string => formatLongDate(s, '');
export const fmtLongSmart = (s: unknown): string => formatSmartDate(s, '');

export const todayISO = () => new Date().toISOString().slice(0, 10);

// Request UID: WA-<yyyymmdd>-<short unique>. Used to stamp every spare request
// with a human-scannable, unique reference (WA = Web App origin).
export function makeRequestUID(prefix = 'WA'): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  const t = d.getTime().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${ymd}-${t}${rand}`;
}

// Relative "x ago" for cache-age messaging.
export function timeAgo(iso: unknown): string {
  if (!iso) return 'never';
  const t = new Date(String(iso)).getTime();
  if (Number.isNaN(t)) return 'never';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);


// Build select options from another collection.
export function optionsFrom(
  collection: string,
  labelKey: string,
  opts?: { codeKey?: string; filter?: (r: BaseRecord) => boolean },
): () => FieldOption[] {
  return () => {
    let rows = db.list(collection);
    if (opts?.filter) rows = rows.filter(opts.filter);
    return rows.map((r) => {
      const label = String(r[labelKey] ?? r.id);
      const code = opts?.codeKey ? String(r[opts.codeKey] ?? '') : '';
      return { value: r.id, label: code ? `${code} · ${label}` : label };
    });
  };
}

// User Master names for assigning an engineer, populated once from Supabase
// (see setEngineerNamesCache). This keeps the demo `users` collection out of the
// assignment dropdowns when a database is connected.
let _engineerNames: string[] = [];
export function setEngineerNamesCache(names: string[]): void {
  const seen = new Set<string>();
  _engineerNames = names
    .map((n) => String(n ?? '').trim())
    .filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
}

// Options for assigning a call to an engineer. Prefers the live User Master
// names (cache above); falls back to the local users collection only offline.
// Value is the person's full name so existing call records keep matching.
export function engineerOptions(): FieldOption[] {
  if (_engineerNames.length) return _engineerNames.map((n) => ({ value: n, label: n }));
  return db
    .list('users')
    .filter((u) => ['engineer', 'manager', 'admin'].includes(String(u.role)) && u.active !== false)
    .map((u) => ({ value: String(u.fullName), label: `${u.fullName} · ${u.role}` }));
}

export function lookup(collection: string, id: unknown, key: string): string {
  if (!id) return '—';
  const r = db.get(collection, String(id));
  return r ? String(r[key] ?? '—') : '—';
}

// Status pill renderer driven by a tone map.
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';
export function statusBadge(value: unknown, toneMap: Record<string, Tone>): ReactNode {
  const v = String(value ?? '');
  if (!v) return <span className="muted">—</span>;
  const tone = toneMap[v] ?? 'neutral';
  return <span className={`badge badge-${tone}`}>{v}</span>;
}

// Central export gate — set from auth (can('export.data')). Engineers (and any
// role without the permission) cannot download data from ANY screen.
let _canExport = true;
export function setCanExport(v: boolean): void { _canExport = v; }
export function canExportData(): boolean { return _canExport; }

export function csvExport(filename: string, columns: { key: string; header: string }[], rows: Record<string, unknown>[]) {
  if (!_canExport) { try { alert('Exporting / downloading data is not permitted for your role.'); } catch { /* ignore */ } return; }
  const esc = (s: unknown) => {
    const v = s == null ? '' : String(s);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const head = columns.map((c) => esc(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(',')).join('\n');
  const blob = new Blob([head + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
