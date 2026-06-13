import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './table.css';

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
  storageKey?: string; // persists column order/width per table
  dense?: boolean;
}

const ROW_HEIGHT_DEFAULT = 44;
const ROW_HEIGHT_DENSE = 34;

interface Persisted {
  order: string[];
  widths: Record<string, number>;
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
  storageKey,
  dense = false,
}: DataTableProps<T>) {
  const persistKey = storageKey ? `rithi.table.${storageKey}` : null;

  const [order, setOrder] = useState<string[]>(() => columns.map((c) => c.key));
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(columns.map((c) => [c.key, c.width ?? 160])),
  );
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  // restore persisted layout once
  useEffect(() => {
    if (!persistKey) return;
    const raw = localStorage.getItem(persistKey);
    if (!raw) return;
    try {
      const p: Persisted = JSON.parse(raw);
      const valid = p.order.filter((k) => columns.some((c) => c.key === k));
      const missing = columns.map((c) => c.key).filter((k) => !valid.includes(k));
      setOrder([...valid, ...missing]);
      setWidths((w) => ({ ...w, ...p.widths }));
    } catch {
      /* ignore corrupt layout */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  // keep order in sync if column set changes
  useEffect(() => {
    setOrder((prev) => {
      const known = prev.filter((k) => columns.some((c) => c.key === k));
      const added = columns.map((c) => c.key).filter((k) => !known.includes(k));
      return [...known, ...added];
    });
    setWidths((prev) => {
      const next = { ...prev };
      columns.forEach((c) => {
        if (next[c.key] == null) next[c.key] = c.width ?? 160;
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.map((c) => c.key).join('|')]);

  const persist = (nextOrder: string[], nextWidths: Record<string, number>) => {
    if (persistKey)
      localStorage.setItem(persistKey, JSON.stringify({ order: nextOrder, widths: nextWidths }));
  };

  const colMap = useMemo(() => Object.fromEntries(columns.map((c) => [c.key, c])), [columns]);
  const orderedCols = order.map((k) => colMap[k]).filter(Boolean) as Column<T>[];

  // ---- sorting ----
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = colMap[sort.key];
    if (!col) return rows;
    const get = (r: T) =>
      col.accessor ? col.accessor(r) : ((r as Record<string, unknown>)[col.key] as string | number);
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, colMap]);

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
  const totalWidth = orderedCols.reduce((s, c) => s + (widths[c.key] ?? 160), 0);

  return (
    <div className="dt-wrap">
      {toolbar && <div className="dt-toolbar">{toolbar}</div>}
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
            {orderedCols.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] }} />
            ))}
          </colgroup>
          <thead className={stickyHeader ? 'dt-sticky' : ''}>
            <tr>
              {orderedCols.map((c) => {
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
                <td colSpan={orderedCols.length} className="dt-empty">
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
                {orderedCols.map((c) => {
                  const wrap = c.wrap ?? wrapCells;
                  const content = c.render
                    ? c.render(row)
                    : c.accessor
                      ? c.accessor(row)
                      : ((row as Record<string, unknown>)[c.key] as ReactNode);
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
        <span className="muted">{sortedRows.length} row{sortedRows.length === 1 ? '' : 's'}</span>
        {persistKey && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              localStorage.removeItem(persistKey);
              setOrder(columns.map((c) => c.key));
              setWidths(Object.fromEntries(columns.map((c) => [c.key, c.width ?? 160])));
            }}
            title="Reset column order & widths"
          >
            Reset layout
          </button>
        )}
      </div>
    </div>
  );
}
