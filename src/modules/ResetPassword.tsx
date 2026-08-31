import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { recoveryIsInvite } from '../lib/supabase';
import './login.css';

// ===========================================================================
// SET A NEW PASSWORD — shown when the user arrives on a password-reset link or
// an invite link (a first-time, admin-created account). The link's tokens are
// exchanged for a short session at boot (auth.tsx), so all that's left is
// choosing the password.
// ===========================================================================

export function ResetPassword() {
  const { finishRecovery, cancelRecovery } = useAuth();
  const invite = recoveryIsInvite();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pw.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (pw !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const res = await finishRecovery(pw);
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Could not set the password.');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">{invite ? '👋' : '🔑'}</div>
          <div>
            <h1>{invite ? 'Welcome — set your password' : 'Set a new password'}</h1>
            <div className="muted">{invite ? 'First sign-in · RITHI CRM' : 'Password reset · RITHI CRM'}</div>
          </div>
        </div>
        <form onSubmit={submit} className="login-form">
          <div className="sf-field">
            <label className="field-label">New password</label>
            <input className="input" type="password" value={pw} autoFocus onChange={(e) => setPw(e.target.value)} placeholder="min 8 characters" />
          </div>
          <div className="sf-field">
            <label className="field-label">Confirm password</label>
            <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="re-enter password" />
          </div>
          {error && <div className="field-err">{error}</div>}
          <button className="btn btn-primary login-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save password & continue'}</button>
          <button className="btn login-btn" type="button" onClick={cancelRecovery} disabled={busy}>Cancel</button>
        </form>
      </div>
      <div className="login-foot muted">This link works once. If it has expired, {invite ? 'ask an admin to re-invite you.' : 'request a new one from the sign-in screen.'}</div>
    </div>
  );
}
