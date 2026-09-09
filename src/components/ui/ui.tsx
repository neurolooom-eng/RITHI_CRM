import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { setModuleCount } from '../../lib/counts';
import './ui.css';
import { timeAgo } from '../../lib/format';

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
  count,
  countMore,
  moreAvailable,
  onLoadMore,
  loadingMore,
  onRefresh,
  refreshing,
  syncedAt,
  status,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  icon?: ReactNode;
  // How many records this screen is showing. Renders a badge next to the title
  // and feeds the same number to the sidebar nav (keyed by the current route).
  count?: number;
  // THE COUNT IS A LOWER BOUND — shown as "1,000+" rather than a wrong exact
  // total. True when the number came from the rows LOADED and more are still
  // coming. FALSE when the database counted the whole set: 3,850 is then the
  // answer, and "3,850+" would be wrong in the other direction.
  countMore?: boolean;
  // MORE ROWS EXIST BEHIND "Load more" — which is not the same question. The
  // Daily Call Review knows its exact total (it counts every page) and still
  // has only the first 500 on screen: an exact count AND a Load more button.
  // Defaults to `countMore`, so a screen where the two coincide says it once.
  moreAvailable?: boolean;
  // LOAD MORE BELONGS TO THE COUNT, not to the bottom of the table. "800+"
  // raises the question and the button beside it is the answer; at the foot of
  // a scrolling register it was somewhere you had to arrive at. Passing this
  // means NOT passing onLoadMore to the table, so there is one of them.
  onLoadMore?: () => void | Promise<void>;
  loadingMore?: boolean;
  // REFRESH AND THE SYNC AGE BELONG BESIDE LOAD MORE, not in the table's
  // toolbar (the user's rule, 2026-09-06). They answer the same question the
  // count does — "is what I am looking at current, and is there more of it?" —
  // and the toolbar is for acting on the rows, not for describing them. Every
  // register was carrying its own copy in its own order; this is the one
  // place, so they cannot drift apart again.
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  // An ISO timestamp. Rendered as "⟳ 4 min ago", with the full time on hover.
  // ISO string or epoch milliseconds — registers hold it both ways.
  syncedAt?: string | number | null;
  // Standing facts about the screen — what you can see, when it last synced,
  // what it is reading from. They belong under the title with the other things
  // that describe the screen, not in the toolbar among the controls, where
  // three of them crowded out the ones people actually press.
  status?: ReactNode;
}) {
  const { pathname } = useLocation();
  useEffect(() => {
    if (typeof count === 'number') setModuleCount(pathname, count, countMore);
  }, [pathname, count, countMore]);
  return (
    <div className="page-header">
      <div className="page-header-main">
        {icon && <span className="page-header-icon">{icon}</span>}
        <div>
          <h1 className="page-title">
            {title}
            {typeof count === 'number' && <span className="page-title-count">{count.toLocaleString()}{countMore ? '+' : ''}</span>}
            {onLoadMore && (moreAvailable ?? countMore) && (
              <button className="btn btn-sm page-title-more" onClick={() => void onLoadMore()} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : '↓ Load more'}
              </button>
            )}
            {onRefresh && (
              <button className="btn btn-sm page-title-more" onClick={() => void onRefresh()} disabled={refreshing}
                      title="Read the register again">
                {refreshing ? '…' : '↻ Refresh'}
              </button>
            )}
            {syncedAt && (
              <span className="page-title-sync" title={`Last synced ${new Date(syncedAt).toLocaleString()}`}>
                ⟳ {timeAgo(syncedAt)}
              </span>
            )}
          </h1>
          {subtitle && <div className="page-subtitle">{subtitle}</div>}
          {status && <div className="page-status">{status}</div>}
        </div>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}

// ===========================================================================
// A DRAWER YOU CAN WIDEN — drag its left edge (user's ask, 2026-09-09).
//
// A call drawer holds tables it cannot fit: Visit history, Spares requested and
// Spares consumed each scroll sideways at 640px, so reading a DC number means
// scrolling a strip inside a panel inside a page. The screens differ in what
// they hold, and so does the reader's monitor, so the right width is not one
// number somebody picks here.
//
// THE WIDTH IS REMEMBERED, per drawer rather than globally: `storeKey` names it
// (defaulting to the title, which is stable per screen), so widening the Field
// Call drawer does not also widen a small confirmation elsewhere. It survives a
// reload because re-dragging it on every call is the thing that would make the
// feature not worth having.
//
// localStorage CAN THROW — a private window, a browser set to block site data,
// a thumbnail capture — so every read and write is wrapped and the drawer
// simply opens at its default width when it cannot remember. It is a
// convenience, not state anything depends on.
//
// BOUNDS ARE THE SCREEN'S, not a constant: never wider than 96% of the window
// (a drawer that covers the page is a page), never below 360px (narrower than
// that and the head's title and close button collide). Both are re-checked on
// resize, so a remembered 1400px does not open off-screen on a laptop.
// ===========================================================================
const DRAWER_MIN = 360;
const drawerMax = () => Math.max(DRAWER_MIN, Math.round(window.innerWidth * 0.96));
const drawerKey = (k: string) => `drawer.width.${k}`;

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = 640,
  storeKey,
  resizable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
  /** Which remembered width this drawer uses. Defaults to the title. */
  storeKey?: string;
  resizable?: boolean;
}) {
  const key = drawerKey(storeKey ?? title);
  const [w, setW] = useState<number>(width);
  const dragging = useRef(false);

  // Read the remembered width when this drawer opens, not on every render.
  useEffect(() => {
    if (!open) return;
    let saved = 0;
    try { saved = Number(window.localStorage.getItem(key) ?? 0); } catch { saved = 0; }
    const want = Number.isFinite(saved) && saved > 0 ? saved : width;
    setW(Math.min(Math.max(want, DRAWER_MIN), drawerMax()));
  }, [open, key, width]);

  // A remembered width must not open off-screen on a smaller window.
  useEffect(() => {
    if (!open) return;
    const fit = () => setW((cur) => Math.min(Math.max(cur, DRAWER_MIN), drawerMax()));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // THE DRAG. Measured from the RIGHT edge of the window, because the drawer is
  // pinned there — so the width is simply how far the pointer is from it, and
  // the panel tracks the cursor exactly rather than drifting.
  useEffect(() => {
    if (!open || !resizable) return;
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      setW(Math.min(Math.max(window.innerWidth - e.clientX, DRAWER_MIN), drawerMax()));
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove('drawer-resizing');
      // Written on RELEASE, not on every mousemove: a hundred writes a second
      // is how localStorage becomes the slow part of a drag.
      setW((cur) => { try { window.localStorage.setItem(key, String(cur)); } catch { /* fine */ } return cur; });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [open, resizable, key]);

  if (!open) return null;
  return (
    <div className="drawer-overlay" onMouseDown={onClose}>
      <div className="drawer" style={{ width: w }} onMouseDown={(e) => e.stopPropagation()}>
        {resizable && (
          <div
            className="drawer-grip"
            role="separator"
            aria-orientation="vertical"
            aria-label="Drag to resize, or use the arrow keys"
            tabIndex={0}
            title="Drag to resize · double-click to reset"
            onMouseDown={(e) => {
              e.preventDefault();
              dragging.current = true;
              document.body.classList.add('drawer-resizing');
            }}
            // Reachable without a mouse, and a reset for a width dragged somewhere silly.
            onDoubleClick={() => {
              setW(width);
              try { window.localStorage.removeItem(key); } catch { /* fine */ }
            }}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 100 : 20;
              const d = e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0;
              if (!d) return;
              e.preventDefault();
              setW((cur) => {
                const next = Math.min(Math.max(cur + d, DRAWER_MIN), drawerMax());
                try { window.localStorage.setItem(key, String(next)); } catch { /* fine */ }
                return next;
              });
            }}
          />
        )}
        <div className="drawer-head">
          <h2 className="drawer-title">{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 460,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2 className="drawer-title">{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

export function SearchBox({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="searchbox">
      <span className="searchbox-icon">⌕</span>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty-state card card-pad">
      <div className="empty-state-title">{title}</div>
      {hint && <div className="muted">{hint}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card">
      <div className="section-card-head">
        <h3 className="section-card-title">{title}</h3>
        {actions}
      </div>
      <div className="section-card-body">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A row of counted chips that narrows the list below it — the same shape as the
// spare register's stage chips, for any other facet a register is worked by.
//
// "Engineer wise" is the case it was built for: a manager wants to see the
// names, with how much each is carrying, and to click one. With 88 engineers
// that is a wall of chips, so the busiest come first and the rest hide behind
// one more click — a strip nobody can scan is not a filter, it is wallpaper.
// ---------------------------------------------------------------------------
export function FacetChips({
  options, value, onChange, allLabel = 'All', max = 12, blankLabel = '— none —', more = false,
}: {
  options: { key: string; count: number }[];
  value: string;
  onChange: (next: string) => void;
  allLabel?: string;
  max?: number;
  blankLabel?: string;
  // THE ROWS ARE STILL COMING. Every count here is over what has LOADED, so
  // when more is waiting behind Load more each one is a lower bound — shown as
  // "90+", never a bare 90. A number that looks exact and is not is worse than
  // no number: somebody reads "MAYANK GUPTA 90" and believes it.
  more?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (options.length <= 1) return null;   // nothing to choose between
  // Busiest first, then alphabetical: the name carrying 40 spares is the one
  // being looked for. The chosen one is always shown, wherever it sorts.
  const sorted = [...options].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const shown = expanded ? sorted : sorted.slice(0, max);
  if (value && !shown.some((o) => o.key === value)) {
    const pick = sorted.find((o) => o.key === value);
    if (pick) shown.push(pick);
  }
  const hidden = sorted.length - shown.length;
  const total = options.reduce((n, o) => n + o.count, 0);
  return (
    <div className="stage-chips">
      <button className={`chip ${value === '' ? 'chip-on' : ''}`} onClick={() => onChange('')}>
        {allLabel} <b>{total}{more ? '+' : ''}</b>
      </button>
      {shown.map((o) => (
        <button
          key={o.key}
          className={`chip ${value === o.key ? 'chip-on' : ''}`}
          onClick={() => onChange(value === o.key ? '' : o.key)}
        >
          {o.key || blankLabel} <b>{o.count}{more ? '+' : ''}</b>
        </button>
      ))}
      {hidden > 0 && (
        <button className="chip" onClick={() => setExpanded(true)}>＋{hidden} more</button>
      )}
      {expanded && sorted.length > max && (
        <button className="chip" onClick={() => setExpanded(false)}>Show fewer</button>
      )}
    </div>
  );
}
