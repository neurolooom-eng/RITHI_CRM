import { useState } from 'react';
import { useAuth } from '../lib/auth';
import './login.css';

export function Login() {
  const { login, setPassword } = useAuth();
  const [id, setId] = useState('');
  const [password, setPwd] = useState('');
  const [error, setError] = useState('');
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

  const quick = async (u: string, p: string) => {
    setId(u); setPwd(p); setError('');
    setBusy(true);
    const res = await login(u, p);
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Login failed');
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

        {!setMode ? (
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

        <div className="login-demo">
          <div className="muted">Demo accounts — click to sign in:</div>
          <div className="login-demo-row">
            <button className="btn btn-sm" onClick={() => void quick('admin', 'admin123')}>Administrator</button>
            <button className="btn btn-sm" onClick={() => void quick('manager', 'manager123')}>Service Manager</button>
            <button className="btn btn-sm" onClick={() => void quick('engineer', 'engineer123')}>Field Engineer</button>
          </div>
        </div>
      </div>
      <div className="login-foot muted">User Master login (Air Liquide / Gmail ID) · set password on first sign-in · role-based access</div>
    </div>
  );
}
