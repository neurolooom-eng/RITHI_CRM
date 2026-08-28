import { useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { getSupabaseCreds, pingSupabase, setSupabaseCreds, supabaseConfigured } from '../lib/supabase';

// Settings panel to connect the app to Supabase (Postgres) — the new data
// backend replacing the Google Sheet. Paste the Project URL + anon (public)
// key from Supabase → Project Settings → API, then Test.
export function DbConnection() {
  const creds = getSupabaseCreds();
  const [url, setUrl] = useState(creds.url);
  const [anon, setAnon] = useState(creds.anon);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    supabaseConfigured() ? { tone: 'ok', text: 'Supabase is configured. Test to confirm connectivity.' } : null,
  );
  const [testing, setTesting] = useState(false);

  const save = () => {
    setSupabaseCreds(url, anon);
    setStatus({ tone: 'ok', text: 'Saved. Test to confirm, then Refresh a data screen.' });
  };
  const test = async () => {
    setSupabaseCreds(url, anon);
    setTesting(true);
    setStatus({ tone: 'info', text: 'Contacting Supabase…' });
    const r = await pingSupabase();
    setTesting(false);
    if (r.ok) setStatus({ tone: 'ok', text: `Connected — ${r.count ?? 0} calls in the database.` });
    else setStatus({ tone: 'error', text: `Could not connect: ${r.error}. Check the Project URL, the anon key, and that 0001_init.sql has been run.` });
  };

  return (
    <SectionCard title="Database Connection (Supabase)">
      <div className="muted" style={{ marginBottom: 12 }}>
        Paste your <b>Project URL</b> and <b>anon public key</b> from Supabase →
        Project Settings → API. The anon key is public by design — access is
        enforced by Row-Level Security. Setup steps: <code>docs/SUPABASE_MIGRATION.md</code>.
      </div>
      <div className="sheet-conn-row">
        <input className="input" type="url" placeholder="https://xxxxxxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div className="sheet-conn-row" style={{ marginTop: 10 }}>
        <input className="input" placeholder="anon public key (eyJhbGciOi…)" value={anon} onChange={(e) => setAnon(e.target.value)} />
        <button className="btn" onClick={() => void test()} disabled={testing || !url.trim() || !anon.trim()}>{testing ? 'Testing…' : 'Test'}</button>
        <button className="btn btn-primary" onClick={save} disabled={!url.trim() || !anon.trim()}>Save</button>
      </div>
      {status && <div className={`sheet-conn-status sheet-banner-${status.tone}`}>{status.text}</div>}
    </SectionCard>
  );
}
