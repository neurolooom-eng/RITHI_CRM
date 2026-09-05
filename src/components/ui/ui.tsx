import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { setModuleCount } from '../../lib/counts';
import './ui.css';

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
          </h1>
          {subtitle && <div className="page-subtitle">{subtitle}</div>}
          {status && <div className="page-status">{status}</div>}
        </div>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = 640,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="drawer-overlay" onMouseDown={onClose}>
      <div className="drawer" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
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
