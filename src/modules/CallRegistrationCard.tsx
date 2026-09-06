import { useEffect, useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import {
  supabaseConfigured, listRegistrantDesks, getDefaultRegistrantEmail, setDefaultRegistrantEmail,
  type RegistrantDesk,
} from '../lib/supabase';

// ===========================================================================
// ADMIN CONFIG → WHOSE DESK A CALL IS REGISTERED TO.
//
// Every call carries two names since 0114: the Hotline DESK it belongs to
// (`created_by`), and the person who actually typed it in (`actual_created_by`,
// taken from the signed-in session and not settable by anything). This card
// sets the first one's default.
//
// Why it needs setting at all: the database falls back to the single
// hotline-role profile, which is right today because there is exactly one
// (SIVARANI). The moment there are two, "the Hotline engineer" stops being a
// fact the database can work out, and it files calls to whoever registered
// them instead of guessing — so somebody has to say which desk. That is this.
// ===========================================================================
export function CallRegistrationCard() {
  const { isAdmin } = useAuth();
  const onDb = supabaseConfigured();
  const [desks, setDesks] = useState<RegistrantDesk[]>([]);
  const [pinned, setPinned] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  const load = async () => {
    if (!onDb) { setMsg({ tone: 'info', text: 'Connect the database to set this.' }); return; }
    try {
      const [d, p] = await Promise.all([listRegistrantDesks(), getDefaultRegistrantEmail()]);
      setDesks(d); setPinned(p);
      if (!d.length) setMsg({ tone: 'info', text: 'No Hotline desk found — give the Hotline engineer the "hotline" role under Users, then Refresh.' });
    } catch (e) {
      setMsg({
        tone: 'error',
        text: /registrant_desks|does not exist|schema cache/i.test(String(e))
          ? 'Run supabase/apply/call_requests.sql in the Supabase SQL editor, then Refresh.'
          : `Load failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const save = async (email: string) => {
    setBusy(true);
    const res = await setDefaultRegistrantEmail(email);
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: `Save failed: ${res.error}` }); return; }
    setPinned(email);
    setMsg({ tone: 'ok', text: email ? `New calls will be filed to ${email}.` : 'Cleared — the database will use the single Hotline profile.' });
    void load();
  };

  const resolved = desks.find((d) => d.is_default);

  return (
    <SectionCard title="Call Registration — the Hotline desk">
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        A call is filed to the Hotline desk whoever types it in, because the Hotline engineer is the only
        person trained on the three vigilance questions. The person who actually registered it is recorded
        separately on every call, and cannot be set by anyone — that is the pair a review compares.
      </p>
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`} style={{ marginBottom: 10 }}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13 }}>Calls are filed to</label>
        <select
          className="input"
          style={{ minWidth: 260 }}
          value={pinned}
          disabled={!onDb || !isAdmin || busy}
          onChange={(e) => void save(e.target.value)}
        >
          <option value="">Whichever profile has the Hotline role (if there is exactly one)</option>
          {desks.map((d) => <option key={d.id} value={d.email}>{d.name} — {d.email}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={busy}>Refresh</button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 10 }}>
        {resolved
          ? <>Right now, a new call is filed to <b>{resolved.name}</b> ({resolved.email}).</>
          : <>Right now no desk resolves, so a new call is filed to whoever registers it.</>}
        {!isAdmin && <> Only an administrator can change this.</>}
      </p>
    </SectionCard>
  );
}
