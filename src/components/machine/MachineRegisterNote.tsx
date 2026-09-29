import { useEffect, useState } from 'react';
import { onMachineRegister, refreshMachineRegister, type MachineRegisterStatus } from '../../lib/machinestore';
import { timeAgo } from '../../lib/format';
import { formatDayTime } from '../../lib/dates';
import { supabaseConfigured } from '../../lib/supabase';

// ONE LINE SAYING WHAT THIS DEVICE HOLDS. The searches on these screens answer
// from the copy on the phone or laptop, so the reader is owed its age -- a
// search over a copy that is two days old is still the right thing to show in
// a place with no signal, and wrong to present as live.
export function MachineRegisterNote() {
  const [s, setS] = useState<MachineRegisterStatus | null>(null);
  useEffect(() => onMachineRegister(setS), []);
  if (!s || !supabaseConfigured()) return null;
  const at = s.at ? new Date(s.at).toISOString() : '';
  const text = s.downloading
    ? `Downloading the machine register to this device… ${s.progress.toLocaleString()} machines so far.`
      + (s.machines ? ` Searching the copy from ${timeAgo(at)} until it finishes.` : '')
    : s.machines
      ? `Searching ${s.machines.toLocaleString()} machines on this device — downloaded ${timeAgo(at)} (${formatDayTime(at)}).`
        + (s.error ? ` The last refresh could not finish (${s.error}); it will carry on when the signal returns.` : '')
      : s.error
        ? `The machine register is not on this device yet — the download stopped (${s.error}). Searching the server meanwhile; it will carry on when the signal returns.`
        : 'Searching the server — the machine register is not on this device yet.';
  return (
    <div className="muted" style={{ fontSize: 12, margin: '4px 0 8px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span>{text}</span>
      {!s.downloading && (
        <button className="btn btn-ghost btn-sm" onClick={() => void refreshMachineRegister({ force: true })}>
          Download again
        </button>
      )}
    </div>
  );
}
