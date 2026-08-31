import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { sbSendPasswordReset, takeRecoveryError, supabaseConfigured } from '../lib/supabase';
import './login.css';

export function Login() {
  const { login, setPassword } = useAuth();
  const [id, setId] = useState('');
  const [password, setPwd] = useState('');
  // A dead reset link (expired / already used) drops the user back here with a
  // reason to show.
  const [error, setError] = useState(() => takeRecoveryError());
  const [busy, setBusy] = useState(false);

  // First-login "set password" mode (User Master users).
  const [setMode, setSetMode] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  // "Forgot password" — email a reset link (database logins).
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState('');

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSent('');
    if (!id.trim()) { setError('Enter your email first.'); return; }
    setBusy(true);
    const res = await sbSendPasswordReset(id);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'Could not send the reset link.'); return; }
    setSent(`If ${id.trim()} has an account, a reset link is on its way. Open it on this device — the link signs you in just long enough to set a new password.`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await login(id, password);
    setBusy(false);
    if (res.needsPassword) {
      setSetMode(true);
      setError('');
      return;
    }
    if (!res.ok) setError(res.error ?? 'Login failed');
  };

  const submitSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPw.length < 5) { setError('Password must be at least 5 characters.'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const res = await setPassword(id, newPw);
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Could not set password');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">⚕️</div>
          <div>
            <h1>RITHI CRM</h1>
            <div className="muted">Field Service · Medical Domain</div>
          </div>
        </div>

        {forgot ? (
          <form onSubmit={submitForgot} className="login-form">
            <div className="muted" style={{ marginBottom: 6 }}>
              Enter your login email and we’ll send a password-reset link.
            </div>
            <div className="sf-field">
              <label className="field-label">Email</label>
              <input className="input" value={id} autoFocus onChange={(e) => setId(e.target.value)} placeholder="you@airliquide.com" />
            </div>
            {error && <div className="field-err">{error}</div>}
            {sent && <div className="muted">{sent}</div>}
            <button className="btn btn-primary login-btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
            <button className="btn login-btn" type="button" onClick={() => { setForgot(false); setError(''); setSent(''); }} disabled={busy}>Back to sign in</button>
          </form>
        ) : !setMode ? (
          <form onSubmit={submit} className="login-form">
            <div className="sf-field">
              <label className="field-label">Air Liquide / Gmail ID</label>
              <input className="input" value={id} autoFocus onChange={(e) => setId(e.target.value)} placeholder="you@airliquide.com or gmail" />
            </div>
            <div className="sf-field">
              <label className="field-label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPwd(e.target.value)} placeholder="••••••••" />
            </div>
            {error && <div className="field-err">{error}</div>}
            <button className="btn btn-primary login-btn" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
            {supabaseConfigured() && (
              <button className="btn btn-ghost btn-sm login-link" type="button" disabled={busy}
                onClick={() => { setForgot(true); setError(''); setSent(''); }}>
                Forgot password?
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={submitSetPassword} className="login-form">
            <div className="muted" style={{ marginBottom: 6 }}>
              First sign-in for <b>{id}</b> — set a password.
            </div>
            <div className="sf-field">
              <label className="field-label">New password</label>
              <input className="input" type="password" value={newPw} autoFocus onChange={(e) => setNewPw(e.target.value)} placeholder="min 5 characters" />
            </div>
            <div className="sf-field">
              <label className="field-label">Confirm password</label>
              <input className="input" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="re-enter password" />
            </div>
            {error && <div className="field-err">{error}</div>}
            <button className="btn btn-primary login-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Set Password & Sign In'}</button>
            <button className="btn login-btn" type="button" onClick={() => { setSetMode(false); setError(''); }} disabled={busy}>Back</button>
          </form>
        )}

      </div>
      <div className="login-foot muted">Sign in with your Air Liquide / Gmail ID · first-time users set a password from their invite or reset-link email · role-based access</div>
    </div>
  );
}
