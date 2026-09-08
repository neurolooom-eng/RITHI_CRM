import { useCallback, useEffect, useState } from 'react';
import { PageHeader, SectionCard } from '../components/ui/ui';
import {
  supabaseConfigured, listTrackerItems, addTrackerItem, saveTrackerItem, deleteTrackerItem,
  type TrackerItem,
} from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { timeAgo } from '../lib/format';
import { logAudit } from '../lib/audit';
import './dccr.css';
import './tracker.css';

// ===========================================================================
// TRACKER — the shared activity list.
//
// The user, 2026-09-08: "add a tracker page under admin to track activities.
// something very similar to backlog.. shared between me and a few other. all who
// have access should be able add, edit".
//
// EVERY FIELD IS EDITED IN PLACE. This is a list a handful of people keep
// together, several times a day; a modal per edit would make changing a status
// a four-click errand and the list would go back to being a spreadsheet. Each
// field saves when it loses focus.
//
// SAVED ON BLUR, NOT ON EVERY KEYSTROKE. A shared list is worth a round trip per
// FINISHED thought, not per letter -- typing a sentence should not be forty
// writes other people watch arrive.
//
// WHO TOUCHED IT LAST IS SHOWN ON EVERY ROW. On a list one person keeps that is
// clutter; on a shared one it is the first thing you look for when something
// says something different from yesterday.
//
// CLOSED ITEMS ARE HIDDEN, NOT DELETED. "Done" and "Dropped" drop out of the
// default view and come back with one tick. A shared list people delete from is
// one nobody trusts -- the thing you remember agreeing is simply gone, and there
// is no way to tell whether it was finished or abandoned.
// ===========================================================================

const STATUSES = ['Open', 'In progress', 'Blocked', 'Done', 'Dropped'] as const;

// The status is the thing people scan for, so it carries colour. These are the
// project's own state tones, not new ones: a reader should not have to learn a
// second colour language for a second list.
const TONE: Record<string, string> = {
  'Open': 'trk-open',
  'In progress': 'trk-doing',
  'Blocked': 'trk-blocked',
  'Done': 'trk-done',
  'Dropped': 'trk-dropped',
};

export function Tracker() {
  const live = supabaseConfigured();
  const { can } = useAuth();
  // ONE permission. Seeing the page IS the right to change it — the user's own
  // rule, and the database policy says exactly the same thing.
  const mayEdit = can('mod:/tracker');

  const [items, setItems] = useState<TrackerItem[]>([]);
  const [showClosed, setShowClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    if (!live) return;
    setBusy(true);
    listTrackerItems()
      .then(setItems)
      .catch((e) => setMsg(`Could not load the tracker: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setBusy(false));
  }, [live]);
  useEffect(load, [load]);

  // Change it on screen at once, then write it. The list is small and shared:
  // a field that waits for the server before it moves feels broken, and a
  // failure is reported rather than swallowed.
  const patch = (id: number, p: Partial<TrackerItem>) => {
    setItems((rows) => rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
    void saveTrackerItem(id, p).then((res) => {
      if (!res.ok) { setMsg(`Could not save: ${res.error}`); load(); return; }
      load();   // pick up who/when, which the DATABASE stamped, not us
    });
  };

  const add = () => {
    const nextOrder = items.length ? Math.max(...items.map((i) => i.sort_order)) + 10 : 10;
    void addTrackerItem({ sort_order: nextOrder }).then((res) => {
      if (!res.ok) { setMsg(`Could not add: ${res.error}`); return; }
      logAudit({ action: 'tracker.add', target: `#${res.id}` });
      load();
    });
  };

  const remove = (it: TrackerItem) => {
    if (!confirm(`Delete "${it.title}"?\n\nMarking it Done or Dropped keeps it on the list — deleting removes it for everybody.`)) return;
    void deleteTrackerItem(it.id).then((res) => {
      if (!res.ok) { setMsg(`Could not delete: ${res.error}`); return; }
      logAudit({ action: 'tracker.delete', target: it.title });
      load();
    });
  };

  const shown = items.filter((i) => showClosed || !i.is_closed);
  const openCount = items.filter((i) => !i.is_closed).length;

  return (
    <div>
      <PageHeader
        title="Tracker" icon="🧭"
        subtitle="What is being worked on, who it is with, and where it has got to. Everyone who can see this page can add and edit."
        count={openCount} countMore={false}
        onRefresh={load} refreshing={busy}
      />

      {!live && (
        <div className="sheet-banner sheet-banner-error">
          <span>Not connected to the database — the tracker is shared, so it needs it.</span>
        </div>
      )}
      {msg && (
        <div className="sheet-banner sheet-banner-error">
          <span>{msg}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg('')}>✕</button>
        </div>
      )}

      <SectionCard title="Activities">
        <div className="row" style={{ gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={!live || !mayEdit} onClick={add}>
            + Add an item
          </button>
          <label className="muted" style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            Show Done and Dropped ({items.length - openCount})
          </label>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Every field saves when you click away. Nothing here is private — the whole list is shared.
          </span>
        </div>

        {!shown.length && (
          <p className="muted" style={{ fontSize: 13 }}>
            {busy ? 'Loading…'
              : items.length ? 'Everything is Done or Dropped. Tick the box above to see it.'
              : 'Nothing on the tracker yet. “Add an item” starts the list.'}
          </p>
        )}

        {shown.map((it) => (
          <div key={it.id} className={`trk-row${it.is_closed ? ' is-closed' : ''}`}>
            <div className="trk-main">
              <input
                className="input trk-title"
                value={it.title}
                disabled={!mayEdit}
                onChange={(e) => setItems((rows) => rows.map((r) => (r.id === it.id ? { ...r, title: e.target.value } : r)))}
                onBlur={(e) => patch(it.id, { title: e.target.value })}
                placeholder="What is it?"
              />
              <textarea
                className="input trk-detail"
                value={it.detail}
                rows={2}
                disabled={!mayEdit}
                onChange={(e) => setItems((rows) => rows.map((r) => (r.id === it.id ? { ...r, detail: e.target.value } : r)))}
                onBlur={(e) => patch(it.id, { detail: e.target.value })}
                placeholder="Detail — what has happened, what is next, what is blocking it."
              />
            </div>

            <div className="trk-meta">
              <select
                className={`select trk-status ${TONE[it.status] ?? ''}`}
                value={it.status}
                disabled={!mayEdit}
                onChange={(e) => patch(it.id, { status: e.target.value })}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                className="input" placeholder="With whom" value={it.owner} disabled={!mayEdit}
                onChange={(e) => setItems((rows) => rows.map((r) => (r.id === it.id ? { ...r, owner: e.target.value } : r)))}
                onBlur={(e) => patch(it.id, { owner: e.target.value })}
              />
              <input
                className="input" placeholder="Area" value={it.area} disabled={!mayEdit}
                onChange={(e) => setItems((rows) => rows.map((r) => (r.id === it.id ? { ...r, area: e.target.value } : r)))}
                onBlur={(e) => patch(it.id, { area: e.target.value })}
              />
              <input
                className="input" type="date" value={it.due_date ?? ''} disabled={!mayEdit}
                onChange={(e) => patch(it.id, { due_date: e.target.value || null })}
              />
              <button className="btn btn-ghost btn-sm" disabled={!mayEdit} onClick={() => remove(it)}>
                Delete
              </button>
            </div>

            {/* On a shared list this is the first thing you look for when a row
                says something different from yesterday. */}
            <div className="trk-who muted">
              {it.updated_by_name
                ? <>Last changed by <b>{it.updated_by_name}</b> {timeAgo(it.updated_at)}</>
                : <>Last changed {timeAgo(it.updated_at)}</>}
              {it.created_by_name && <> · raised by {it.created_by_name}</>}
            </div>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}
