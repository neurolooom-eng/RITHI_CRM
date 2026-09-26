import { useEffect, useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { archiveConfigured, archiveLoads, getArchiveCreds, pingArchive, setArchiveCreds, type ArchiveLoad } from '../lib/archive';
import { formatDayTime } from '../lib/dates';

// ===========================================================================
// SETTINGS → ARCHIVE (MACHINE HISTORY).
//
// The 2016 history lives in a second Supabase project, and this is where a
// device is told how to read it. Machine History reads it alongside the
// registers; without this card it shows the registers only and says so. It looks like the Database Connection card
// above it and it is NOT the same thing, in one way that matters enough to be
// printed on the card itself:
//
//   THE LIVE ANON KEY IS PUBLIC BY DESIGN. It identifies the project and grants
//   nothing, because every policy tests the signed-in user — which is why it is
//   baked into the build and nobody types it.
//
//   THE ARCHIVE KEY IS NOT. Your users exist in the LIVE project's auth, so a
//   token signed there cannot be verified by the archive: `auth.uid()` is null
//   for everybody, and no policy written there can tell one reader from
//   another. The key IS the credential.
//
// Hence no baked-in default and no copy in the repository: it is pasted here,
// on the devices that should have it, and stored per device. ProdHistory_02.sql
// argues the whole trade-off and names the two better transports.
//
// WHAT IS LOADED, not just whether it answers. "Connected" and "has the history
// in it" are different questions, and a Machine History screen that is empty
// because nothing was ever loaded looks exactly like one that is empty because
// the machine is new. The table below answers the second question from the
// archive's own `history_loads` view.
// ===========================================================================

export function ArchiveConnection({ readOnly = false }: { readOnly?: boolean }) {
  const creds = getArchiveCreds();
  const [url, setUrl] = useState(creds.url);
  const [key, setKey] = useState(creds.key);
  const [testing, setTesting] = useState(false);
  const [loads, setLoads] = useState<ArchiveLoad[] | null>(null);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    archiveConfigured()
      ? { tone: 'ok', text: 'An archive key is saved on this device. Test to confirm it still reads.' }
      : { tone: 'info', text: 'No archive key on this device — Machine History will show the registers only.' },
  );

  const refreshLoads = () => {
    if (!archiveConfigured()) { setLoads(null); return; }
    void archiveLoads().then(setLoads).catch(() => setLoads(null));
  };
  useEffect(refreshLoads, []);

  const save = () => {
    setArchiveCreds(url, key);
    setStatus({ tone: 'ok', text: 'Saved on this device. Test to confirm, then open Machine History.' });
    refreshLoads();
  };

  const test = async () => {
    setArchiveCreds(url, key);
    setTesting(true);
    setStatus({ tone: 'info', text: 'Contacting the archive…' });
    const r = await pingArchive();
    setTesting(false);
    if (r.ok) {
      setStatus({ tone: 'ok', text: `Connected — ${r.rows ?? 0} archived calls readable.` });
      refreshLoads();
    } else {
      setStatus({
        tone: 'error',
        text: `Could not read the archive: ${r.error}. Check the project URL and key, and that `
          + 'ProdHistory_01 and ProdHistory_02 have been run on that project.',
      });
    }
  };

  return (
    <SectionCard title="Archive (Machine History)">
      <div className="muted" style={{ marginBottom: 12 }}>
        The service history from <b>2016 to the cut-over</b> lives in its own Supabase project and is
        read-only. Paste that project&apos;s <b>URL</b> and <b>publishable key</b>.
        {' '}
        <b>This key is not like the live one.</b> The live key is public by design because Row-Level
        Security decides what each signed-in user may see; the archive cannot identify your users at
        all, so its key is what grants the read. Put it on the devices that should have the history
        and nowhere else — it is stored on this device only, and there is deliberately no default.
      </div>
      <div className="sheet-conn-row">
        <input
          className="input" type="url" placeholder="https://xxxxxxxx.supabase.co"
          value={url} disabled={readOnly} onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="sheet-conn-row" style={{ marginTop: 10 }}>
        <input
          className="input" placeholder="archive publishable key"
          value={key} disabled={readOnly} onChange={(e) => setKey(e.target.value)}
        />
        {!readOnly && (
          <>
            <button className="btn" onClick={() => void test()} disabled={testing || !url.trim() || !key.trim()}>
              {testing ? 'Testing…' : 'Test'}
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!url.trim() || !key.trim()}>Save</button>
          </>
        )}
      </div>
      {status && <div className={`sheet-conn-status sheet-banner-${status.tone}`}>{status.text}</div>}

      {loads && loads.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="field-label">What is loaded</div>
          <ul className="muted" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {loads.map((l) => (
              <li key={`${l.target}-${l.source_system}`}>
                {l.target}: <b>{l.rows.toLocaleString()}</b> rows
                {l.source_system ? ` — ${l.source_system}` : ' — no source label'}
                {/* WHEN the batch went in, through formatDayTime like every other
                    timestamp this application shows (the user's standing rule).
                    Never the raw value: the archive stores UTC, so printing the
                    front of it puts the wrong time on the row and, before
                    05:30 IST, the wrong day. It is the LATEST load under this
                    label — a re-run of the same export moves it, which is the
                    question somebody deciding whether to load again is asking. */}
                {l.loaded_at ? ` — loaded ${formatDayTime(l.loaded_at)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {loads && loads.length === 0 && (
        <div className="muted" style={{ marginTop: 14 }}>
          The archive answers but holds no rows yet — run <code>ProdHistory_03.sql</code> and load the
          exports before expecting history on the screen.
        </div>
      )}
    </SectionCard>
  );
}
