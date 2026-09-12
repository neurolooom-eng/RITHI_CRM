import { useState, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PickList } from '../../src/components/ui/PickList';

declare global { interface Window { CALLS: number } }
window.CALLS = 0;

function Harness() {
  // Exactly the shape the call-request form uses: results kept in state, and
  // the handler written inline so it is a NEW function on every render.
  const [hits, setHits] = useState<string[]>([]);
  return (
    <PickList
      value=""
      options={hits}
      onPick={() => {}}
      onSearch={async (q) => {
        window.CALLS += 1;
        const rows = [`${q}-A`, `${q}-B`];
        setHits(rows);
        return rows;
      }}
      placeholder="type here"
    />
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
