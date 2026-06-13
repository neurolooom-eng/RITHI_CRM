import { useState } from 'react';
import { useAuth } from '../lib/auth';
import './login.css';

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = login(username, password);
    if (!res.ok) setError(res.error ?? 'Login failed');
  };

  const quick = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError('');
    const res = login(u, p);
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

        <form onSubmit={submit} className="login-form">
          <div className="sf-field">
            <label className="field-label">Username</label>
            <input className="input" value={username} autoFocus onChange={(e) => setUsername(e.target.value)} placeholder="admin" />
          </div>
          <div className="sf-field">
            <label className="field-label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {error && <div className="field-err">{error}</div>}
          <button className="btn btn-primary login-btn" type="submit">Sign In</button>
        </form>

        <div className="login-demo">
          <div className="muted">Demo accounts — click to sign in:</div>
          <div className="login-demo-row">
            <button className="btn btn-sm" onClick={() => quick('admin', 'admin123')}>Administrator</button>
            <button className="btn btn-sm" onClick={() => quick('manager', 'manager123')}>Service Manager</button>
            <button className="btn btn-sm" onClick={() => quick('engineer', 'engineer123')}>Field Engineer</button>
          </div>
        </div>
      </div>
      <div className="login-foot muted">Password-protected access · user-specific data · role-based permissions</div>
    </div>
  );
}
