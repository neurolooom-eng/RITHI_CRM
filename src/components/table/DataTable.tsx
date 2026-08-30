import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../../lib/auth';
import { getView, setView, sheetsConfigured, type TableView } from '../../lib/sheets';
import './table.css';

// Cache of shared (admin-set) views per table key, so we fetch each once.
const globalViewCache: Record<string, TableView | null | undefined> = {};

// ===========================================================================
// TABLE SYSTEM — shared across every module.
// Defaults (per spec):
//   • Text-wrap every cell in every column (wrap = true by default)
//   • Column rearrange via drag-and-drop on the header
//   • Adjustable overall table width
//   • Per-column width adjuster (drag the right edge of a header cell)
//   • Sticky header row
//   • Configurable number of rows shown before the body scrolls
// Per-table overrides are accepted through props but the defaults above apply
// unless a caller opts out.
// ===========================================================================

export interface Column<T> {
  key: string;
  header: string;
  width?: number; // initial px width
  render?: (row: T) => ReactNode;
  accessor?: (row: T) => string | number; // for sorting / default text
  align?: 'left' | 'center' | 'right';
  wrap?: boolean; // override the table-level wrap default
  sortable?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  // ---- system defaults (overridable) ----
  wrapCells?: boolean; // default true → text wrap every cell
  reorderable?: boolean; // default true → drag to rearrange columns
  resizable?: boolean; // default true → per-column width adjuster
  stickyHeader?: boolean; // default true
  rowsBeforeScroll?: number; // default 10 → rows visible before body scrolls
  tableWidth?: number | 'auto'; // overall table width control
  // ---- behaviour ----
  onRowClick?: (row: T) => void;
  emptyText?: string;
  toolbar?: ReactNode;
  onLoadMore?: () => void | Promise<void>; // renders a Load more in the footer
  moreAvailable?: boolean;                  // whether another page may exist
  loadingMore?: boolean;
  storageKey?: string; // persists column order/width per table
  dense?: boolean;
  // Full field list for the Columns picker (so any schema field can be added).
  // If omitted, the field list is derived from the data rows' keys.
  // `render` lets a module make one of those fields readable — a jsonb column
  // is honest as JSON but nobody can read it, so the owner can supply a
  // summary instead.
  allFields?: { key: string; header?: string; render?: (row: T) => ReactNode }[];
}

// A cell value straight from the data may not be a primitive: a jsonb column
// (spare_request_lines.approval_data, user_directory.extra, reports.data …)
// arrives as an object, and React refuses to render one — it throws error #31
// and unmounts the WHOLE app, so a single such column blanks the page. Show it
// as compact JSON instead, and an empty object as nothing.
//
// Only raw values go through this. A column's own render() may legitimately
// return elements or arrays of them, and is left untouched.
const rawCell = (v: unknown): ReactNode => {
  if (v !== null && typeof v === 'object') {
    try {
      const text = JSON.stringify(v);
      return text === '{}' || text === '[]' ? '' : text;
    } catch { return ''; }   // circular, or otherwise unserialisable
  }
  return v as ReactNode;
};

const INTERNAL_KEYS = new Set(['id', 'createdAt', 'updatedAt', 'ownerId', '_seedOrder', '_synced', '_pending']);

interface TableFilter {
  key: string;
  op: string; // contains | notcontains | eq | neq | gt | lt | between
  value: string;
  value2?: string;
}
const humanize = (k: string) =>
  k.replace(/([A-Z])/g, ' $1').replace(/[_]+/g, ' ').replace(/^./, (c) => c.toUpperCase()).trim();

const ROW_HEIGHT_DEFAULT = 44;
const ROW_HEIGHT_DENSE = 34;

interface Persisted {
  order: string[];
  widths: Record<string, number>;
  hidden?: string[];
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  wrapCells = true,
  reorderable = true,
  resizable = true,
  stickyHeader = true,
  rowsBeforeScroll = 10,
  tableWidth = 'auto',
  onRowClick,
  emptyText = 'No records yet.',
  toolbar,
  onLoadMore,
  moreAvailable,
  loadingMore,
  storageKey,
  dense = false,
  allFields,
}: DataTableProps<T>) {
  const persistKey = storageKey ? `rithi.table.${storageKey}` : null;
  const { can } = useAuth();

  // Base (curated) columns + every other schema/data field as an addable column
  // (hidden by default). This makes the ⚙ Columns picker list all fields.
  const baseKeys = useMemo(() => new Set(columns.map((c) => c.key)), [columns]);
  const extraKeys = useMemo(() => {
    const source =
      allFields?.map((f) => f.key) ??
      (() => {
        const ks = new Set<string>();
        rows.slice(0, 50).forEach((r) => Object.keys(r as Record<string, unknown>).forEach((k) => ks.add(k)));
        return [...ks];
      })();
    const seen = new Set<string>();
    const out: string[] = [];
    source.forEach((k) => {
      if (!baseKeys.has(k) && !INTERNAL_KEYS.has(k) && !k.startsWith('_') && !seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    });
    return out;
  }, [allFields, rows, baseKeys]);
  const labelFor = (k: string) => allFields?.find((f) => f.key === k)?.header ?? humanize(k);
  const renderFor = (k: string) => allFields?.find((f) => f.key === k)?.render;
  const mergedColumns = useMemo<Column<T>[]>(() => {
    const extra: Column<T>[] = extraKeys.map((k) => {
      const own = renderFor(k);
      return {
        key: k,
        header: labelFor(k),
        width: 140,
        render: own ?? ((r: T) => rawCell((r as Record<string, unknown>)[k] ?? '')),
      };
    });
    return [...columns, ...extra];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, extraKeys]);
  const defaultHidden = useMemo(() => new Set(extraKeys), [extraKeys]);
  const viewActiveRef = useRef(false);

  const [order, setOrder] = useState<string[]>(() => columns.map((c) => c.key));
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(columns.map((c) => [c.key, c.width ?? 160])),
  );
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [colPanel, setColPanel] = useState(false);
  const [viewMsg, setViewMsg] = useState('');

  // ---- user-defined filters over the full field list ----
  const filtersKey = persistKey ? `${persistKey}.filters` : null;
  const [filters, setFilters] = useState<TableFilter[]>(() => {
    try { return filtersKey ? JSON.parse(localStorage.getItem(filtersKey) || '[]') : []; } catch { return []; }
  });
  const [filterPanel, setFilterPanel] = useState(false);
  const saveFilters = (fs: TableFilter[]) => {
    setFilters(fs);
    if (filtersKey) { try { localStorage.setItem(filtersKey, JSON.stringify(fs)); } catch { /* ignore */ } }
  };

  const fieldMeta = useMemo(() => {
    const meta: Record<string, { type: 'text' | 'number' | 'enum'; values?: string[] }> = {};
    const sample = rows.slice(0, 300);
    mergedColumns.forEach((c) => {
      if (c.key.startsWith('_')) return;
      const vals = sample.map((r) => (r as Record<string, unknown>)[c.key]).filter((v) => v != null && v !== '');
      if (vals.length === 0) { meta[c.key] = { type: 'text' }; return; }
      const allNum = vals.every((v) => !isNaN(Number(v)));
      const distinct = new Set(vals.map((v) => String(v)));
      if (allNum && distinct.size > 8) meta[c.key] = { type: 'number' };
      else if (distinct.size <= 20) meta[c.key] = { type: 'enum', values: [...distinct].sort() };
      else meta[c.key] = { type: 'text' };
    });
    return meta;
  }, [mergedColumns, rows]);

  const opsFor = (key: string): [string, string][] => {
    const t = fieldMeta[key]?.type;
    if (t === 'number') return [['eq', '='], ['neq', '≠'], ['gt', '>'], ['lt', '<'], ['between', 'between']];
    if (t === 'enum') return [['eq', 'is'], ['neq', 'is not']];
    return [['contains', 'contains'], ['notcontains', 'not contains'], ['eq', 'equals']];
  };

  const matchFilter = (f: TableFilter, row: T) => {
    const raw = (row as Record<string, unknown>)[f.key];
    const s = String(raw ?? '').toLowerCase();
    const v = String(f.value ?? '').toLowerCase();
    if (fieldMeta[f.key]?.type === 'number') {
      const n = Number(raw), a = Number(f.value), b = Number(f.value2);
      switch (f.op) {
        case 'eq': return n === a;
        case 'neq': return n !== a;
        case 'gt': return n > a;
        case 'lt': return n < a;
        case 'between': return n >= a && n <= b;
        default: return s.includes(v);
      }
    }
    switch (f.op) {
      case 'eq': return s === v;
      case 'neq': return s !== v;
      case 'notcontains': return !s.includes(v);
      default: return s.includes(v);
    }
  };
  const activeFilters = filters.filter((f) => (f.op === 'between' ? f.value !== '' || (f.value2 ?? '') !== '' : f.value !== ''));
  const filteredRows = useMemo(
    () => (activeFilters.length ? rows.filter((r) => activeFilters.every((f) => matchFilter(f, r))) : rows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, filters, fieldMeta],
  );

  const applyView = (v: TableView | null | undefined) => {
    if (!v) return;
    if (v.order) {
      const valid = v.order.filter((k) => columns.some((c) => c.key === k));
      const missing = columns.map((c) => c.key).filter((k) => !valid.includes(k));
      setOrder([...valid, ...missing]);
    }
    if (v.widths) setWidths((w) => ({ ...w, ...v.widths }));
    if (Array.isArray(v.hidden)) setHidden(new Set(v.hidden));
  };

  // Restore this user's saved layout; else fall back to the shared default.
  useEffect(() => {
    if (!persistKey) return;
    const raw = localStorage.getItem(persistKey);
    if (raw) {
      try {
        const p: Persisted = JSON.parse(raw);
        setWidths((w) => ({ ...w, ...p.widths }));
        if (p.order) applyView({ order: p.order });
        setHidden(new Set(Array.isArray(p.hidden) ? p.hidden : [...defaultHidden]));
        viewActiveRef.current = true;
      } catch { /* ignore corrupt layout */ }
      return;
    }
    // No personal view — load the shared "default for everyone" if present.
    if (!storageKey || !sheetsConfigured()) return;
    if (globalViewCache[storageKey] !== undefined) {
      const cached = globalViewCache[storageKey];
      if (cached) { applyView(cached); viewActiveRef.current = true; }
      return;
    }
    let cancelled = false;
    void getView(storageKey).then((v) => {
      globalViewCache[storageKey] = v;
      if (!cancelled && v) { applyView(v); viewActiveRef.current = true; }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  // keep order/widths/hidden in sync when the column set (incl. schema fields) changes
  useEffect(() => {
    const allKeys = mergedColumns.map((c) => c.key);
    setOrder((prev) => {
      const known = prev.filter((k) => allKeys.includes(k));
      const added = allKeys.filter((k) => !known.includes(k));
      return [...known, ...added];
    });
    setWidths((prev) => {
      const next = { ...prev };
      mergedColumns.forEach((c) => {
        if (next[c.key] == null) next[c.key] = c.width ?? 160;
      });
      return next;
    });
    // Extra (schema) fields are hidden by default until a saved view says otherwise.
    if (!viewActiveRef.current) {
      setHidden((prev) => {
        const next = new Set(prev);
        allKeys.forEach((k) => { if (!baseKeys.has(k)) next.add(k); });
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedColumns.map((c) => c.key).join('|')]);

  const persist = (nextOrder: string[], nextWidths: Record<string, number>, nextHidden: Set<string> = hidden) => {
    viewActiveRef.current = true; // user has an explicit view now
    if (persistKey)
      localStorage.setItem(persistKey, JSON.stringify({ order: nextOrder, widths: nextWidths, hidden: [...nextHidden] }));
  };

  const colMap = useMemo(() => Object.fromEntries(mergedColumns.map((c) => [c.key, c])), [mergedColumns]);
  const orderedCols = order.map((k) => colMap[k]).filter(Boolean) as Column<T>[];
  const visibleCols = orderedCols.filter((c) => !hidden.has(c.key));

  const toggleHidden = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      persist(order, widths, next);
      return next;
    });
  };

  const moveCol = (key: string, dir: -1 | 1) => {
    const idx = order.indexOf(key);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    next.splice(j, 0, next.splice(idx, 1)[0]);
    setOrder(next);
    persist(next, widths);
  };

  const resetLayout = () => {
    if (persistKey) localStorage.removeItem(persistKey);
    setOrder(mergedColumns.map((c) => c.key));
    setWidths(Object.fromEntries(mergedColumns.map((c) => [c.key, c.width ?? 160])));
    setHidden(new Set(defaultHidden));
    viewActiveRef.current = false;
    setViewMsg('Reset to default.');
  };

  const saveForEveryone = async () => {
    if (!storageKey) return;
    setViewMsg('Saving…');
    const view: TableView = { order, widths, hidden: [...hidden] };
    const ok = await setView(storageKey, view);
    globalViewCache[storageKey] = ok ? view : globalViewCache[storageKey];
    setViewMsg(ok ? 'Saved as default for everyone.' : 'Save failed — check the sheet connection.');
  };

  // ---- sorting ----
  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;
    const col = colMap[sort.key];
    if (!col) return filteredRows;
    const get = (r: T) =>
      col.accessor ? col.accessor(r) : ((r as Record<string, unknown>)[col.key] as string | number);
    return [...filteredRows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [filteredRows, sort, colMap]);

  const toggleSort = (col: Column<T>) => {
    if (col.sortable === false) return;
    setSort((s) =>
      s?.key === col.key
        ? s.dir === 'asc'
          ? { key: col.key, dir: 'desc' }
          : null
        : { key: col.key, dir: 'asc' },
    );
  };

  // ---- column reorder (drag) ----
  const onDrop = (target: string) => {
    if (!dragKey || dragKey === target) return;
    const next = [...order];
    const from = next.indexOf(dragKey);
    const to = next.indexOf(target);
    next.splice(to, 0, next.splice(from, 1)[0]);
    setOrder(next);
    persist(next, widths);
    setDragKey(null);
    setOverKey(null);
  };

  // ---- column resize ----
  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const startResize = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    e.preventDefault();
    resizeRef.current = { key, startX: e.clientX, startW: widths[key] ?? 160 };
    window.addEventListener('mousemove', onResizing);
    window.addEventListener('mouseup', stopResize);
  };
  const onResizing = (e: MouseEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const w = Math.max(70, r.startW + (e.clientX - r.startX));
    setWidths((prev) => ({ ...prev, [r.key]: w }));
  };
  const stopResize = () => {
    window.removeEventListener('mousemove', onResizing);
    window.removeEventListener('mouseup', stopResize);
    if (resizeRef.current) {
      setWidths((w) => {
        persist(order, w);
        return w;
      });
    }
    resizeRef.current = null;
  };

  const rowH = dense ? ROW_HEIGHT_DENSE : ROW_HEIGHT_DEFAULT;
  const maxBodyHeight = rowsBeforeScroll > 0 ? rowsBeforeScroll * rowH + 2 : undefined;
  const totalWidth = visibleCols.reduce((s, c) => s + (widths[c.key] ?? 160), 0);

  // Filters control (rendered at the top, above the table). Panel opens downward.
  const filtersControl = persistKey ? (
    <div className="dt-cols">
      <button className="btn btn-ghost btn-sm" onClick={() => { setFilterPanel((o) => !o); setColPanel(false); }} title="Filter rows by any field">
        ⚑ Filters{activeFilters.length ? ` (${activeFilters.length})` : ''}
      </button>
      {filterPanel && (
        <>
          <div className="dt-cols-backdrop" onClick={() => setFilterPanel(false)} />
          <div className="dt-cols-panel dt-filter-panel dt-panel-down">
            <div className="dt-cols-head">Filters</div>
            <div className="dt-filter-list">
              {filters.length === 0 && <div className="muted" style={{ padding: '2px 4px 8px' }}>No filters. Add one below.</div>}
              {filters.map((f, i) => {
                const meta = fieldMeta[f.key];
                return (
                  <div className="dt-filter-row" key={i}>
                    <select className="select" value={f.key} onChange={(e) => { const key = e.target.value; const ops = opsFor(key); saveFilters(filters.map((x, j) => j === i ? { ...x, key, op: ops[0][0] } : x)); }}>
                      {orderedCols.filter((c) => !c.key.startsWith('_')).map((c) => <option key={c.key} value={c.key}>{c.header || c.key}</option>)}
                    </select>
                    <select className="select" value={f.op} onChange={(e) => saveFilters(filters.map((x, j) => j === i ? { ...x, op: e.target.value } : x))}>
                      {opsFor(f.key).map(([op, lbl]) => <option key={op} value={op}>{lbl}</option>)}
                    </select>
                    {meta?.type === 'enum' ? (
                      <select className="select" value={f.value} onChange={(e) => saveFilters(filters.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}>
                        <option value="">—</option>
                        {meta.values?.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : f.op === 'between' ? (
                      <span className="dt-filter-between">
                        <input className="input" value={f.value} onChange={(e) => saveFilters(filters.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                        <input className="input" value={f.value2 ?? ''} onChange={(e) => saveFilters(filters.map((x, j) => j === i ? { ...x, value2: e.target.value } : x))} />
                      </span>
                    ) : (
                      <input className="input" value={f.value} onChange={(e) => saveFilters(filters.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                    )}
                    <button className="btn btn-ghost btn-sm" title="Remove" onClick={() => saveFilters(filters.filter((_, j) => j !== i))}>✕</button>
                  </div>
                );
              })}
            </div>
            <div className="dt-cols-actions">
              <button className="btn btn-sm" onClick={() => { const k = orderedCols.find((c) => !c.key.startsWith('_'))?.key ?? ''; saveFilters([...filters, { key: k, op: opsFor(k)[0][0], value: '' }]); }}>+ Add filter</button>
              <div className="spacer" />
              {filters.length > 0 && <button className="btn btn-sm" onClick={() => saveFilters([])}>Clear all</button>}
            </div>
          </div>
        </>
      )}
    </div>
  ) : null;

  return (
    <div className="dt-wrap">
      {(toolbar || filtersControl) && (
        <div className="dt-toolbar">
          {toolbar}
          {filtersControl && (
            <>
              <div className="spacer" />
              {filtersControl}
            </>
          )}
        </div>
      )}
      <div
        className="dt-scroll"
        style={{
          maxHeight: maxBodyHeight,
          width: tableWidth === 'auto' ? '100%' : tableWidth,
        }}
      >
        <table
          className={`dt ${dense ? 'dt-dense' : ''}`}
          style={{ width: tableWidth === 'auto' ? Math.max(totalWidth, 100) : totalWidth }}
        >
          <colgroup>
            {visibleCols.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] }} />
            ))}
          </colgroup>
          <thead className={stickyHeader ? 'dt-sticky' : ''}>
            <tr>
              {visibleCols.map((c) => {
                const isSorted = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={`${overKey === c.key ? 'dt-over' : ''} ${
                      dragKey === c.key ? 'dt-dragging' : ''
                    }`}
                    style={{ textAlign: c.align ?? 'left' }}
                    draggable={reorderable}
                    onDragStart={() => reorderable && setDragKey(c.key)}
                    onDragOver={(e) => {
                      if (!reorderable) return;
                      e.preventDefault();
                      setOverKey(c.key);
                    }}
                    onDragLeave={() => setOverKey((k) => (k === c.key ? null : k))}
                    onDrop={() => onDrop(c.key)}
                  >
                    <span
                      className={`dt-th-label ${c.sortable === false ? '' : 'dt-sortable'}`}
                      onClick={() => toggleSort(c)}
                    >
                      {c.header}
                      {isSorted && <span className="dt-sort">{sort!.dir === 'asc' ? '▲' : '▼'}</span>}
                    </span>
                    {resizable && (
                      <span className="dt-resizer" onMouseDown={(e) => startResize(e, c.key)} />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, visibleCols.length)} className="dt-empty">
                  {emptyText}
                </td>
              </tr>
            )}
            {sortedRows.map((row) => (
              <tr
                key={getRowId(row)}
                className={onRowClick ? 'dt-clickable' : ''}
                onClick={() => onRowClick?.(row)}
              >
                {visibleCols.map((c) => {
                  const wrap = c.wrap ?? wrapCells;
                  const content = c.render
                    ? c.render(row)
                    : c.accessor
                      ? c.accessor(row)
                      : rawCell((row as Record<string, unknown>)[c.key]);
                  return (
                    <td
                      key={c.key}
                      className={wrap ? 'dt-wrap-cell' : 'dt-nowrap-cell'}
                      style={{ textAlign: c.align ?? 'left' }}
                    >
                      {content as ReactNode}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dt-footer">
        <span className="muted">{sortedRows.length} row{sortedRows.length === 1 ? '' : 's'}{moreAvailable ? '+' : ''}</span>
        {onLoadMore && moreAvailable && (
          <button className="btn btn-sm dt-loadmore" onClick={() => void onLoadMore()} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : '↓ Load more'}
          </button>
        )}
        {viewMsg && <span className="muted dt-viewmsg">{viewMsg}</span>}
        <div className="spacer" />
        {persistKey && (
          <div className="dt-cols">
            <button className="btn btn-ghost btn-sm" onClick={() => { setColPanel((o) => !o); setViewMsg(''); }} title="Show / hide & reorder columns">
              ⚙ Columns{hidden.size ? ` (${visibleCols.length}/${orderedCols.length})` : ''}
            </button>
            {colPanel && (
              <>
                <div className="dt-cols-backdrop" onClick={() => setColPanel(false)} />
                <div className="dt-cols-panel">
                  <div className="dt-cols-head">Columns</div>
                  <div className="dt-cols-list">
                    {orderedCols.map((c, i) => (
                      <div className="dt-cols-row" key={c.key}>
                        <label className="dt-cols-check">
                          <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggleHidden(c.key)} />
                          <span>{c.header || c.key}</span>
                        </label>
                        <span className="dt-cols-move">
                          <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => moveCol(c.key, -1)} title="Move up">↑</button>
                          <button className="btn btn-ghost btn-sm" disabled={i === orderedCols.length - 1} onClick={() => moveCol(c.key, 1)} title="Move down">↓</button>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="dt-cols-actions">
                    <button className="btn btn-sm" onClick={resetLayout}>Reset</button>
                    <div className="spacer" />
                    {can('manage-users') && (
                      <button className="btn btn-sm btn-primary" onClick={() => void saveForEveryone()} title="Save this layout as the default for all users">
                        Save for everyone
                      </button>
                    )}
                  </div>
                  <div className="dt-cols-note muted">Your changes are saved for you automatically.</div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
