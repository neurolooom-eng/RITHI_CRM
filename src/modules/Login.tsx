import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { takeRecoveryError, supabaseConfigured, resetSupabaseCreds } from '../lib/supabase';
import { PasswordInput } from '../components/ui/PasswordInput';
import './login.css';
import { RITHI_LOGO } from '../lib/brand';

export function Login() {
  const { login } = useAuth();
  const [id, setId] = useState('');
  const [password, setPwd] = useState('');
  // A dead reset link (expired / already used) drops the user back here with a
  // reason to show.
  const [error, setError] = useState(() => takeRecoveryError());
  const [busy, setBusy] = useState(false);
  // ONE WAY IN (D-074). Without a Supabase connection there is nothing to sign
  // in to — the local demo accounts are gone — and Settings is behind the
  // sign-in, so the way back has to be offered HERE.
  const connected = supabaseConfigured();
  const reconnect = () => { resetSupabaseCreds(); window.location.reload(); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await login(id, password);
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Login failed');
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

        {!connected && (
          <div className="field-err" style={{ marginBottom: 10 }}>
            This browser has been pointed at a database connection that is not the RITHI
            database, so nobody can sign in.{' '}
            <button className="btn btn-sm" type="button" onClick={reconnect}>Reconnect to the RITHI database</button>
          </div>
        )}
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
          <button className="btn btn-primary login-btn" type="submit" disabled={busy || !connected}>{busy ? 'Signing in…' : 'Sign In'}</button>
          {/* ONE REMEDY, the same one the reset screen gives (FRS-210.9): an
              administrator sets passwords here, so pointing at a button that
              emails a link would send people to a dead end. */}
          <div className="login-note muted">
            Forgotten your password? Ask an administrator to reset it for you.
          </div>
        </form>
      </div>
      <div className="login-foot muted">Sign in with your Air Liquide / Gmail ID · role-based access</div>
    </div>
  );
}
