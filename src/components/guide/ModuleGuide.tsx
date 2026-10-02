import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { NAV } from '../layout/Layout';
import { MODULE_GUIDE } from '../../lib/moduleGuide';
import { FLOWS } from '../../lib/flows';
import { actionForPath } from '../../lib/rbac';
import { useAuth } from '../../lib/auth';
import './moduleguide.css';

// ===========================================================================
// HOW EVERY MODULE WORKS — one page, every screen in the menu, in menu order
// (the user, 2026-10-02: "Update how RITHI works for all modules").
//
// THE MENU IS THE LIST, NOT THIS FILE: the page walks NAV and looks each item
// up in MODULE_GUIDE (src/lib/moduleGuide.ts), so a screen added to the menu
// without an entry shows here as "not written yet" rather than silently
// missing -- and `check:ui` fails the build on it, the same rule as the
// requirements: a new screen is not done until it is explained.
//
// The flows a screen takes part in are DERIVED from the data flows (a step
// whose route is the screen), so the two pages cannot disagree.
// ===========================================================================

export function ModuleGuide({ onOpenFlow }: { onOpenFlow: (flowId: string) => void }) {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const byRoute = useMemo(() => new Map(MODULE_GUIDE.map((e) => [e.route, e])), []);
  const flowsByRoute = useMemo(() => {
    const m = new Map<string, { id: string; title: string }[]>();
    for (const f of FLOWS) for (const s of f.steps) {
      if (!s.route) continue;
      const list = m.get(s.route) ?? [];
      if (!list.some((x) => x.id === f.id)) list.push({ id: f.id, title: f.title });
      m.set(s.route, list);
    }
    return m;
  }, []);

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const groups = NAV.map((g) => ({
    title: g.title,
    items: g.items.filter((it) => {
      if (!words.length) return true;
      const e = byRoute.get(it.to);
      const hay = [g.title, it.label, e?.purpose, ...(e?.does ?? []), ...(e?.rules ?? []), ...(e?.records ?? [])].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    }),
  })).filter((g) => g.items.length);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="mg">
      <div className="mg-bar">
        <input className="input mg-search" placeholder="Find a screen — by name, what it does, or a record…"
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a screen" />
        <span className="fl-muted">{total} screen{total === 1 ? '' : 's'}</span>
      </div>
      <nav className="mg-jump" aria-label="Menu groups">
        {groups.map((g) => <a key={g.title} href={`#mg-${slug(g.title)}`} className="chip">{g.title}</a>)}
      </nav>

      {groups.map((g) => (
        <section key={g.title} className="mg-group" id={`mg-${slug(g.title)}`}>
          <h2 className="mg-group-h">{g.title}</h2>
          {g.items.map((it) => {
            const e = byRoute.get(it.to);
            const mayOpen = !!it.alwaysOpen || can(actionForPath(it.to));
            const flows = flowsByRoute.get(it.to) ?? [];
            return (
              <article key={it.to} className="mg-item">
                <header className="mg-item-h">
                  <span className="mg-icon" aria-hidden>{it.icon}</span>
                  <h3>{it.label}</h3>
                  {mayOpen
                    ? <Link className="btn btn-sm" to={it.to}>Open →</Link>
                    : <span className="badge badge-neutral" title="Your role does not open this screen. Roles & Permissions decides who does.">Not on your role</span>}
                </header>
                {e ? (
                  <>
                    <p className="mg-purpose">{e.purpose}</p>
                    <div className="mg-cols">
                      <div>
                        <h4>What you do here</h4>
                        <ul>{e.does.map((d, i) => <li key={i}>{d}</li>)}</ul>
                      </div>
                      <div>
                        <h4>What it refuses / watch for</h4>
                        <ul className="mg-rules">{e.rules.map((d, i) => <li key={i}>{d}</li>)}</ul>
                      </div>
                    </div>
                    <p className="mg-meta">
                      {!!e.records.length && <>Records: {e.records.map((r, i) => <code key={r}>{i ? ', ' : ''}{r}</code>)}</>}
                      {!!e.records.length && <span className="mg-dot"> · </span>}
                      Page key <code>{it.alwaysOpen ? 'none — open to everyone' : actionForPath(it.to)}</code>
                    </p>
                    {!!flows.length && (
                      <p className="mg-flows">
                        Part of: {flows.map((f) => (
                          <button key={f.id} className="chip" onClick={() => onOpenFlow(f.id)} title="Open this data flow">▶ {f.title}</button>
                        ))}
                      </p>
                    )}
                  </>
                ) : <p className="fl-muted">Not written yet.</p>}
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
