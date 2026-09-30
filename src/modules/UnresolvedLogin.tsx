import { useAuth } from '../lib/auth';
import './login.css';
import { RITHI_LOGO } from '../lib/brand';

// ===========================================================================
// SIGNED IN, BUT NOT SET UP (D-074, FRS-210.5).
//
// The person authenticated with Supabase, and there is no profile for the
// login and no User Master row to build one from. They used to be let into the
// whole app as an Engineer; now they hold nothing, in the app and in the
// database (0300), and this is the only page they see. It says what is wrong,
// who can fix it, and lets them sign out.
// ===========================================================================
export function UnresolvedLogin() {
  const { user, logout } = useAuth();
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
        <div className="sheet-banner sheet-banner-error">
          <span>
            <b>This login is not set up in RITHI.</b> You signed in as{' '}
            <b>{user?.email || 'an address the session did not carry'}</b>, but there is no profile
            and no User Master entry for it, so it has no permission to see or change anything.
            Ask an administrator to add you to the <b>User Master</b>, then sign in again.
          </span>
        </div>
        <button className="btn btn-primary login-btn" type="button" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
