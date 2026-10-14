import { useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { getSupabaseCreds, pingSupabase, setSupabaseCreds, supabaseConfigured } from '../lib/supabase';
import { recordAudit } from '../lib/audit';

// Settings panel to connect the app to Supabase (Postgres) — the new data
// backend replacing the Google Sheet. Paste the Project URL + anon (public)
// key from Supabase → Project Settings → API, then Test.
// `readOnly` — a login that may SEE how the app is connected but not change it
// (admin.view / Technical Support). Test is a write too: it stores the pair it
// is testing, so it goes with Save rather than staying as a harmless-looking
// button that quietly repoints the browser at another project.
export function DbConnection({ readOnly = false }: { readOnly?: boolean }) {
  const creds = getSupabaseCreds();
  const [url, setUrl] = useState(creds.url);
  const [anon, setAnon] = useState(creds.anon);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    supabaseConfigured() ? { tone: 'ok', text: 'Supabase is configured. Test to confirm connectivity.' } : null,
  );
  const [testing, setTesting] = useState(false);

  // A CHANGE OF DATABASE IS RECORDED, IN THE DATABASE BEING LEFT, BEFORE IT
  // TAKES EFFECT (D-067, FRS-214.4) — afterwards this browser writes somewhere
  // else, and the project it stopped writing to is the one whose records go
  // quiet. The ADDRESS is recorded, old and new; the key never is, only
  // whether it changed. A change that cannot be recorded is not made silently:
  // it asks first, because a browser pointed at a dead project must still be
  // able to come back.
  //
  // Answers null when the change was NOT made, else the reason it was not
  // recorded ('' when it was) so the result line can carry it.
  const switchTo = async (via: 'save' | 'test'): Promise<string | null> => {
    const was = getSupabaseCreds();
    const next = { url: url.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, ''), anon: anon.trim() };
    if (was.url === next.url && was.anon === next.anon) { setSupabaseCreds(url, anon); return ''; }
    const err = await recordAudit({
      action: 'settings.database', target: next.url,
      meta: { setting: 'Database connection', old_url: was.url, new_url: next.url, key_changed: was.anon !== next.anon, via },
    });
    if (err && !confirm(`This change could not be recorded in the database being left:\n\n${err}\n\nSwitch this browser to ${next.url} anyway?`)) {
      setStatus({ tone: 'error', text: `Not changed — the change could not be recorded: ${err}` });
      return null;
    }
    setSupabaseCreds(url, anon);
    return err ?? '';
  };

  const save = async () => {
    const unrecorded = await switchTo('save');
    if (unrecorded === null) return;
    setStatus(unrecorded
      ? { tone: 'error', text: `Saved, but the change was NOT recorded in the audit log: ${unrecorded}` }
      : { tone: 'ok', text: 'Saved. Test to confirm, then Refresh a data screen.' });
  };
  const test = async () => {
    const unrecorded = await switchTo('test');
    if (unrecorded === null) return;
    const flag = unrecorded ? ` ⚑ The change was NOT recorded in the audit log: ${unrecorded}` : '';
    setTesting(true);
    setStatus({ tone: 'info', text: 'Contacting Supabase…' });
    const r = await pingSupabase();
    setTesting(false);
    if (r.ok) setStatus({ tone: flag ? 'error' : 'ok', text: `Connected — ${r.count ?? 0} calls in the database.${flag}` });
    else setStatus({ tone: 'error', text: `Could not connect: ${r.error}. Check the Project URL, the anon key, and that 0001_init.sql has been run.${flag}` });
  };

  return (
    <SectionCard title="Database Connection (Supabase)">
      <div className="muted" style={{ marginBottom: 12 }}>
        Paste your <b>Project URL</b> and <b>anon public key</b> from Supabase →
        Project Settings → API. The anon key is public by design — access is
        enforced by Row-Level Security. Setup steps: <code>docs/SUPABASE_MIGRATION.md</code>.
      </div>
      <div className="sheet-conn-row">
        <input className="input" type="url" placeholder="https://xxxxxxxx.supabase.co" value={url} disabled={readOnly} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div className="sheet-conn-row" style={{ marginTop: 10 }}>
        <input className="input" placeholder="anon public key (eyJhbGciOi…)" value={anon} disabled={readOnly} onChange={(e) => setAnon(e.target.value)} />
        {!readOnly && (
          <>
            <button className="btn" onClick={() => void test()} disabled={testing || !url.trim() || !anon.trim()}>{testing ? 'Testing…' : 'Test'}</button>
            <button className="btn btn-primary" onClick={() => void save()} disabled={!url.trim() || !anon.trim()}>Save</button>
          </>
        )}
      </div>
      {status && <div className={`sheet-conn-status sheet-banner-${status.tone}`}>{status.text}</div>}
    </SectionCard>
  );
}
