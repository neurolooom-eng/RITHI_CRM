import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { PageHeader, EmptyState } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { useAccessScope } from '../lib/access';
import { supabaseConfigured } from '../lib/supabase';
import {
  spareRequestSection, rmApprovalSection, dispatchSection, handStockSection,
  materialReturnsSection, stockTransferSection, reviewSection, commercialInstallSection,
  type WorkloadSection,
} from '../lib/workload';
import './workload.css';

// ===========================================================================
// MY WORKLOAD — what is waiting, and one click to the list.
//
// The user, 2026-09-15: "Remove such cards in Main Views. Move those to a
// Separate KPI Cards Page where ever applicable. It should be interactive —
// Say if i click on Pending, it should give me the List."
//
// EVERY SECTION LOADS ON ITS OWN. Seven registers behind one page would
// otherwise mean one slow query holds up six fast ones, and the reader stares
// at nothing while the largest table is counted. Each arrives when it arrives.
//
// A SECTION THE READER CANNOT OPEN IS NOT SHOWN AT ALL. Counting a queue for
// somebody who may not read it would be a number they cannot act on and, worse,
// a leak: "Spares waiting 240" tells you the size of a queue the register would
// refuse to show you. The permission is checked BEFORE the load, so the request
// is never made.
// ===========================================================================

export function Workload() {
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const scope = useAccessScope();
  const [sections, setSections] = useState<WorkloadSection[]>([]);
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState<string[]>([]);
  const [at, setAt] = useState('');

  const email = String(user?.email ?? '').trim().toLowerCase();

  // The register's own test for "may this person approve that engineer's
  // request?", so ⚡ Awaiting me counts the same thing here as there.
  const mayRmApprove = useMemo(() => {
    const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
    const self = norm(scope.selfName);
    const team = new Set(scope.reports.map(norm));
    return (engineer: unknown) => {
      const who = norm(engineer);
      if (!who) return true;
      if (self && who === self) return false;
      return team.size ? team.has(who) : true;
    };
  }, [scope]);

  const load = useMemo(() => () => {
    if (!supabaseConfigured()) return;
    const jobs: { needs: string; run: () => Promise<WorkloadSection> }[] = [
      { needs: 'mod:/spare-requests', run: () => spareRequestSection(can, email, mayRmApprove) },
      { needs: 'mod:/spare-rm-approval', run: rmApprovalSection },
      { needs: 'mod:/spare-dispatch', run: dispatchSection },
      { needs: 'mod:/daily-review', run: reviewSection },
      // WHAT COMMERCIAL IS WAITING ON (the user, 2026-09-22). Shown to
      // whoever can open the Call Request register, which is this page's
      // standing rule -- a count over a list somebody cannot read is both
      // useless and a leak.
      { needs: 'mod:/request-registration', run: commercialInstallSection },
      { needs: 'mod:/handstock', run: handStockSection },
      { needs: 'mod:/mrn', run: materialReturnsSection },
      { needs: 'mod:/stock-transfer', run: stockTransferSection },
    ].filter((j) => can(j.needs));
    setSections([]); setErr([]); setBusy(jobs.length); setAt(new Date().toISOString());
    jobs.forEach((j) => {
      j.run()
        // ORDERED BY THE LIST ABOVE, not by which finished first — a page whose
        // sections rearrange themselves between refreshes cannot be learned.
        .then((s) => setSections((cur) => [...cur, s].sort(
          (a, b) => jobs.findIndex((x) => x.needs === a.needs) - jobs.findIndex((x) => x.needs === b.needs))))
        // ONE SECTION FAILING IS NOT THE PAGE FAILING. It says which, and the
        // other six still arrive.
        .catch((e) => setErr((cur) => [...cur, `${j.needs.replace('mod:', '')}: ${e instanceof Error ? e.message : String(e)}`]))
        .finally(() => setBusy((n) => n - 1));
    });
  }, [can, email, mayRmApprove]);

  // ONCE THE SCOPE HAS ARRIVED, not on the first render. `mayRmApprove` reads
  // the reporting team from useAccessScope(), which starts EMPTY and fills in a
  // moment later -- so the first (and only) load counted "Awaiting me" against
  // nobody's team, and a Reporting Manager saw a different number here from
  // the ⚡ chip on Spare Requests. `scope.ready` goes false -> true once on every
  // path through the hook (loadUserMaster() cannot reject; it resolves []).
  // Not `load` in the deps: it is rebuilt whenever the auth context re-renders.
  useEffect(() => { if (scope.ready) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scope.ready]);

  const total = sections.reduce((n, s) => n + s.cards.length, 0);

  return (
    <div>
      <PageHeader
        title="My Workload" icon="⚡"
        subtitle="What is waiting, across every register you can open. Click a card to open the list behind it."
        onRefresh={load} refreshing={busy > 0} syncedAt={at}
        count={total || undefined}
      />

      {!supabaseConfigured() && (
        <div className="sheet-banner sheet-banner-info">
          <span>Connect the database in Settings to load your workload.</span>
        </div>
      )}
      {err.map((e) => (
        <div key={e} className="sheet-banner sheet-banner-error"><span>{e}</span></div>
      ))}

      {sections.map((s) => (
        <section key={s.key} className="wl-section">
          <div className="wl-head">
            <h3>{s.title}</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(s.path)}>
              Open the register ›
            </button>
          </div>
          <KpiGrid min={190}>
            {s.cards.map((c) => (
              <KpiCard
                key={c.label}
                label={c.label}
                // EVERY COUNT IS OVER WHAT LOADED. Where rows are still waiting
                // the number is a lower bound and says so, which is the rule
                // this project applies everywhere and would be easiest to drop
                // on a screen made of counts.
                value={`${c.value.toLocaleString()}${s.more ? '+' : ''}`}
                sub={c.sub}
                icon={c.icon}
                tone={c.tone}
                // A CARD WITH NO LIST BEHIND IT OPENS NOTHING and does not look
                // as though it would: there is no list of an ageing of 4 days.
                onOpen={c.to ? () => navigate(c.to!.path, { state: c.to!.state }) : undefined}
                opens={c.to?.opens}
              />
            ))}
          </KpiGrid>
        </section>
      ))}

      {busy > 0 && <div className="muted wl-busy">Counting {busy} more register{busy === 1 ? '' : 's'}…</div>}

      {busy === 0 && !sections.length && supabaseConfigured() && !err.length && (
        <EmptyState
          title="Nothing to show yet"
          hint="This page gathers the queues from the registers you can open — and none of them is open to your role."
        />
      )}
    </div>
  );
}
