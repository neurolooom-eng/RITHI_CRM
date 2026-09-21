// TWO DROPDOWNS ON ONE FORM — the shape every screen in this application has.
//
// The user, 2026-09-21: "In general, the drop-down is not disappearing once
// selected .. ideally once selected and moved on to the next field it should
// hide Automatically." A regex cannot see this and neither can a type-checker:
// it is about what is ON SCREEN after a tap. So this mounts two real PickLists
// and the check drives them in a real browser, tapping rather than clicking.
import { useState, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PickList } from '../../src/components/ui/PickList';

function Harness() {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  return (
    <div>
      {/* SPACED APART ON PURPOSE. `.picklist-menu` is absolutely positioned and
          up to 280px tall, so two pickers close together have the first one's
          menu lying over the second's box -- which is correct behaviour and
          makes "tap the other one" unreachable in a test. The gap is the
          harness making the case reachable, not a change to the component. */}
      <div id="one" style={{ marginBottom: 320 }}>
        <PickList value={a} options={['ORION-G', 'VEGA', 'MONNAL T75']} onPick={setA}
                  placeholder="— pick a product —" searchThreshold={0} />
      </div>
      <div id="two">
        <PickList value={b} options={['0001', '0002', '0003']} onPick={setB}
                  placeholder="— pick a serial —" searchThreshold={0} />
      </div>
      <div id="elsewhere" style={{ height: 80, marginTop: 320 }}>tap here to dismiss</div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
