import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { takeRecoveryError } from '../lib/supabase';
import { PasswordInput } from '../components/ui/PasswordInput';
import './login.css';
import { RITHI_LOGO } from '../lib/brand';

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
          <img className="login-logo" src={RITHI_LOGO} alt="RITHI CRM" />
          <div>
            <h1>RITHI CRM</h1>
            <div className="muted">Field Service · Medical Domain</div>
          </div>
        </div>

        {!setMode ? (
          <form onSubmit={submit} className="login-form">
            <div className="sf-field">
              <label className="field-label">Air Liquide / Gmail ID</label>
              <input className="input" value={id} autoFocus onChange={(e) => setId(e.target.value)} placeholder="you@airliquide.com or gmail" />
            </div>
            <div className="sf-field">
              <label className="field-label">Password</label>
              <PasswordInput value={password} onChange={setPwd} placeholder="••••••••" />
            </div>
            {error && <div className="field-err">{error}</div>}
            <button className="btn btn-primary login-btn" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
            {/* No self-service reset: an administrator sets passwords here, so
                pointing at a button that emails a link would send people to a
                dead end. Say who to ask instead. */}
            <div className="login-note muted">
              Forgotten your password? Ask an administrator to reset it for you.
            </div>
          </form>
        ) : (
          <form onSubmit={submitSetPassword} className="login-form">
            <div className="muted" style={{ marginBottom: 6 }}>
              First sign-in for <b>{id}</b> — set a password.
            </div>
            <div className="sf-field">
              <label className="field-label">New password</label>
              <PasswordInput value={newPw} autoFocus onChange={setNewPw} placeholder="min 5 characters" />
            </div>
            <div className="sf-field">
              <label className="field-label">Confirm password</label>
              <PasswordInput value={confirmPw} onChange={setConfirmPw} placeholder="re-enter password" />
            </div>
            {error && <div className="field-err">{error}</div>}
            <button className="btn btn-primary login-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Set Password & Sign In'}</button>
            <button className="btn login-btn" type="button" onClick={() => { setSetMode(false); setError(''); }} disabled={busy}>Back</button>
          </form>
        )}

      </div>
      <div className="login-foot muted">Sign in with your Air Liquide / Gmail ID · role-based access</div>
    </div>
  );
}
