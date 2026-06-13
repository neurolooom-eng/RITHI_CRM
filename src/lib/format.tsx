import type { ReactNode } from 'react';
import { db, type BaseRecord } from './db';
import type { FieldOption } from '../components/form/Form';

export const fmtCurrency = (n: unknown): string => {
  const v = Number(n);
  if (Number.isNaN(v)) return '—';
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

export const fmtDate = (s: unknown): string => {
  if (!s) return '—';
  const d = new Date(String(s));
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (s: unknown): string => {
  if (!s) return '—';
  const d = new Date(String(s));
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

// Generate the next sequential human code for a collection, e.g. PTY-0001.
export function nextCode(collection: string, prefix: string): string {
  const rows = db.list(collection);
  let max = 0;
  rows.forEach((r) => {
    const code = String((r as Record<string, unknown>).code ?? '');
    const m = code.match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

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

export function csvExport(filename: string, columns: { key: string; header: string }[], rows: Record<string, unknown>[]) {
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
