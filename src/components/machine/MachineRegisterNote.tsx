import { useEffect, useState } from 'react';
import { onMachineRegister, onPartyRegister, refreshMachineRegister, type MachineRegisterStatus } from '../../lib/machinestore';
import { timeAgo } from '../../lib/format';
import { formatDayTime } from '../../lib/dates';
import { supabaseConfigured } from '../../lib/supabase';

// ONE LINE SAYING WHAT THIS DEVICE HOLDS. The searches on these screens answer
// from the copies on the phone or laptop -- the machine register and the Party
// Master -- so the reader is owed their age: a search over a copy two days old
// is still the right thing in a place with no signal, and wrong to present as
// live.
function describe(what: string, s: MachineRegisterStatus): string {
  const at = s.at ? new Date(s.at).toISOString() : '';
  if (s.downloading)
    return `Downloading ${what} to this device… ${s.progress.toLocaleString()} so far`
      + (s.machines ? ` (searching the copy from ${timeAgo(at)} until it finishes).` : '.')
      // THE REASON IT IS WAITING, in the server's words, while it retries --
      // "0 so far" alone was indistinguishable from a slow start.
      + (s.error ? ` Last request failed: ${s.error}.` : '');
  if (s.machines)
    return `${s.machines.toLocaleString()} ${what} on this device, downloaded ${timeAgo(at)} (${formatDayTime(at)}).`
      + (s.error ? ` The last refresh could not finish (${s.error}); it carries on when the signal returns.` : '');
  if (s.error) return `${what[0].toUpperCase()}${what.slice(1)} not on this device yet — the download stopped (${s.error}). Searching the server meanwhile.`;
  return `${what[0].toUpperCase()}${what.slice(1)} not on this device yet — searching the server.`;
}

export function MachineRegisterNote() {
  const [m, setM] = useState<MachineRegisterStatus | null>(null);
  const [p, setP] = useState<MachineRegisterStatus | null>(null);
  useEffect(() => onMachineRegister(setM), []);
  useEffect(() => onPartyRegister(setP), []);
  if (!m || !p || !supabaseConfigured()) return null;
  return (
    <div className="muted" style={{ fontSize: 12, margin: '4px 0 8px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span>{describe('machines', m)} {describe('customers', p)}</span>
      {!m.downloading && !p.downloading && (
        <button className="btn btn-ghost btn-sm" onClick={() => void refreshMachineRegister({ force: true })}>
          Download again
        </button>
      )}
    </div>
  );
}
