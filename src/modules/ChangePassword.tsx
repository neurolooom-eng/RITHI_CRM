import { useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { PasswordInput } from '../components/ui/PasswordInput';
import { useAuth } from '../lib/auth';
import { sbUpdatePassword, sbVerifyPassword, supabaseConfigured } from '../lib/supabase';

// ===========================================================================
// CHANGE PASSWORD — for the signed-in user. The current password is checked
// first (Supabase's updateUser doesn't ask for it), then the new one is set.
// ===========================================================================

export function ChangePassword() {
  const { realUser } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  // Only database logins have a password Supabase can change.
  if (!supabaseConfigured() || !realUser || realUser.authSource !== 'supabase') return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) { setMsg({ tone: 'error', text: 'New password must be at least 8 characters.' }); return; }
    if (next !== confirm) { setMsg({ tone: 'error', text: 'New passwords do not match.' }); return; }
    if (next === current) { setMsg({ tone: 'error', text: 'The new password must differ from the current one.' }); return; }
    setBusy(true);
    const ok = await sbVerifyPassword(realUser.email, current);
    if (!ok) { setBusy(false); setMsg({ tone: 'error', text: 'Current password is incorrect.' }); return; }
    const res = await sbUpdatePassword(next);
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not change the password.' }); return; }
    setCurrent(''); setNext(''); setConfirm('');
    setMsg({ tone: 'ok', text: 'Password changed. Use it the next time you sign in.' });
  };

  return (
    <SectionCard title="Password">
      <form onSubmit={submit} style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
        <div className="sf-field">
          <label className="field-label">Current password</label>
          <PasswordInput value={current} onChange={setCurrent} autoComplete="current-password" />
        </div>
        <div className="sf-field">
          <label className="field-label">New password</label>
          <PasswordInput value={next} onChange={setNext} placeholder="min 8 characters" autoComplete="new-password" />
        </div>
        <div className="sf-field">
          <label className="field-label">Confirm new password</label>
          <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>
        {msg && <div className={msg.tone === 'ok' ? 'muted' : 'field-err'}>{msg.text}</div>}
        <div><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button></div>
      </form>
    </SectionCard>
  );
}
