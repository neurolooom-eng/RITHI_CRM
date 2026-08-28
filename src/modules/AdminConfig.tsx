import { useEffect, useState } from 'react';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { checkConfig, getConfig, getMasters, listMaster, setConfig, setMasters, type ConfigCheck, type MasterEntry, type SheetConfig } from '../lib/sheets';
import { clearMasterCache } from '../lib/masters';
import './fieldcalls.css';

// ===========================================================================
// ADMIN CONFIG — the sheet links used by CallReg are stored in the backend
// (script properties). This screen shows / edits them and verifies each one.
// ===========================================================================

const FIELDS: { key: keyof SheetConfig; label: string }[] = [
  { key: 'register', label: 'Call Register (FIELD / INST / UCN tabs)' },
  { key: 'prodmaster', label: 'Product Master' },
  { key: 'partymaster', label: 'Party Master' },
  { key: 'usermaster', label: 'User Master' },
  { key: 'crn', label: 'Call Registration Request (CRN)' },
  { key: 'sparereq', label: 'Spare Request Register (26_SpareRequest)' },
];

const MASTER_DEFS: { key: string; label: string }[] = [
  { key: 'complaint', label: 'Standard Complaint Master' },
  { key: 'calltype', label: 'Call Type Master' },
];

export function AdminConfig() {
  const [cfg, setCfg] = useState<SheetConfig>({});
  const [checks, setChecks] = useState<Record<string, ConfigCheck>>({});
  const [masters, setMastersState] = useState<Record<string, MasterEntry>>({});
  const [mMsg, setMMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  const load = async () => {
    setBusy(true);
    try {
      setCfg(await getConfig());
      try { setMastersState(await getMasters()); } catch { /* older deployment */ }
      setMsg(null);
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not load config: ${e instanceof Error ? e.message : String(e)}. Redeploy CallReg with the latest script.` });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const setM = (name: string, field: keyof MasterEntry, v: string) =>
    setMastersState((m) => ({ ...m, [name]: { ...(m[name] ?? {}), [field]: v } }));

  const saveMasters = async () => {
    setBusy(true); setMMsg('Saving masters…');
    try {
      const payload: Record<string, MasterEntry> = {};
      MASTER_DEFS.forEach((d) => { if (masters[d.key]) payload[d.key] = masters[d.key]; });
      const ok = await setMasters(payload);
      clearMasterCache();
      setMMsg(ok ? 'Saved. Reopen a call form to see the new lists.' : 'Save failed — redeploy CallReg with the latest script.');
    } catch (e) { setMMsg(`Save failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(false); }
  };

  const testMaster = async (name: string) => {
    setBusy(true); setMMsg(`Testing “${name}”…`);
    try { const v = await listMaster(name); setMMsg(`“${name}”: ${v.length} value${v.length === 1 ? '' : 's'}${v.length ? ` (e.g. ${v.slice(0, 3).join(', ')})` : ''}.`); }
    catch (e) { setMMsg(`“${name}” failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(false); }
  };

  const set = (k: keyof SheetConfig, v: string) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setBusy(true);
    setMsg({ tone: 'info', text: 'Saving…' });
    try {
      setCfg(await setConfig(cfg));
      setMsg({ tone: 'ok', text: 'Saved. Verify to confirm each sheet opens.' });
    } catch (e) {
      setMsg({ tone: 'error', text: `Save failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setMsg({ tone: 'info', text: 'Verifying each sheet…' });
    try {
      setChecks(await checkConfig());
      setMsg({ tone: 'ok', text: 'Verification complete.' });
    } catch (e) {
      setMsg({ tone: 'error', text: `Verify failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const idFromInput = (v: string) => {
    // Accept a full URL or a bare ID.
    const m = String(v).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : v.trim();
  };

  return (
    <div>
      <PageHeader title="Admin Config" subtitle="Backend sheet links used by CallReg — edit and verify." icon="🛠️" />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <SectionCard title="Sheet Links">
        <div className="muted" style={{ marginBottom: 12 }}>
          Paste a Google Sheet URL or its ID. Stored in CallReg (script properties), not in the app or repo.
        </div>
        <div className="stack" style={{ gap: 12 }}>
          {FIELDS.map((f) => {
            const chk = checks[f.key];
            return (
              <div key={f.key} className="cfg-row">
                <label className="cfg-label">{f.label}</label>
                <input
                  className="input"
                  value={cfg[f.key] ?? ''}
                  placeholder="Sheet URL or ID"
                  onChange={(e) => set(f.key, e.target.value)}
                  onBlur={(e) => set(f.key, idFromInput(e.target.value))}
                />
                {chk && (
                  <div className={`cfg-check ${chk.ok ? 'cfg-ok' : 'cfg-bad'}`}>
                    {chk.ok ? `✓ ${chk.name} · ${chk.tabs?.length ?? 0} tabs` : `✗ ${chk.error}`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn" onClick={() => void load()} disabled={busy}>Reload</button>
          <div className="spacer" />
          <button className="btn" onClick={() => void verify()} disabled={busy}>Verify all</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>Save</button>
        </div>
      </SectionCard>

      <SectionCard title="Master Value Lists">
        <div className="muted" style={{ marginBottom: 12 }}>
          Point form dropdowns at their master sheets. Give a Sheet URL/ID, the tab, and the column to read.
          <b> Party</b> and <b>Product</b> masters are wired by default (from the links above).
        </div>
        {mMsg && <div className="sheet-banner sheet-banner-info" style={{ marginBottom: 10 }}><span>{mMsg}</span><button className="btn btn-ghost btn-sm" onClick={() => setMMsg('')}>✕</button></div>}
        <div className="stack" style={{ gap: 14 }}>
          {MASTER_DEFS.map((d) => {
            const m = masters[d.key] ?? {};
            return (
              <div key={d.key} className="cfg-row">
                <label className="cfg-label">{d.label}</label>
                <div className="row wrap" style={{ gap: 8 }}>
                  <input className="input" style={{ flex: '2 1 220px' }} value={m.id ?? ''} placeholder="Sheet URL or ID"
                    onChange={(e) => setM(d.key, 'id', e.target.value)} onBlur={(e) => setM(d.key, 'id', idFromInput(e.target.value))} />
                  <input className="input" style={{ flex: '1 1 120px' }} value={m.tab ?? ''} placeholder="Tab name"
                    onChange={(e) => setM(d.key, 'tab', e.target.value)} />
                  <input className="input" style={{ flex: '1 1 140px' }} value={m.col ?? ''} placeholder="Column header"
                    onChange={(e) => setM(d.key, 'col', e.target.value)} />
                  <button className="btn btn-sm" onClick={() => void testMaster(d.key)} disabled={busy}>Test</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn btn-sm" onClick={() => void testMaster('party')} disabled={busy}>Test Party</button>
          <button className="btn btn-sm" onClick={() => void testMaster('product')} disabled={busy}>Test Product</button>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={() => void saveMasters()} disabled={busy}>Save Masters</button>
        </div>
      </SectionCard>
    </div>
  );
}
