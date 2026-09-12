// ===========================================================================
// STOCK OUT — the flat list of everything Stores has actually issued.
//
// The user, 2026-09-12: "Add a Separate Page as Stock Out - the same FlatList
// under Pending Dispatch."
//
// WHY A PAGE OF ITS OWN. The list was a tab on Pending Dispatch, which is the
// QUEUE — what has not gone yet. Two different questions share that screen:
// "what is Stores still holding?" and "what went out, to whom, when, against
// which call?". The second is asked by people who never work the queue —
// Commercial chasing a DC, a Reporting Manager checking what an engineer was
// sent — and asking them to open the queue and find a tab is why it kept being
// missed.
//
// THE SAME COMPONENT, NOT A COPY. `StockOuts` is imported from SpareDispatch
// rather than reproduced: one definition of the columns, the ageing colours and
// the CSV, so the tab and the page cannot drift into two registers of one fact.
// ===========================================================================
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/ui';
import { StockOuts } from './SpareDispatch';

const MIGRATION_HINT =
  'Stock outs need migration 0027_spare_dispatch.sql — run it in the Supabase SQL editor (apply bundle: Spare_1.sql).';

export function StockOut() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  // Stable, or the effect inside StockOuts that reports the count would see a
  // new function every render and loop — the fault the Call Request search had.
  const onCount = useCallback((n: number) => setCount(n), []);

  return (
    <div>
      <PageHeader
        title="Stock Out"
        subtitle="Every spare Stores has issued — one row per part, with the DC it went on and the call it was for."
        icon="📄"
        count={count}
        // The list loads in one request, not in pages, so this is the whole
        // number rather than a lower bound.
        countMore={false}
      />

      {msg && (
        <div className="sheet-banner sheet-banner-error">
          <span>{msg}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <StockOuts
        onMigrationError={() => setMsg(MIGRATION_HINT)}
        onPrint={(so) => navigate(`/dc/${encodeURIComponent(so)}`)}
        onDeclare={(so) => navigate(`/declaration/${encodeURIComponent(so)}`)}
        onCount={onCount}
      />
    </div>
  );
}
