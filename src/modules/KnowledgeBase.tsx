import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Drawer, SearchBox } from '../components/ui/ui';
import { RichEditor } from '../components/ui/RichEditor';
import { useAuth } from '../lib/auth';
import { actionForPath } from '../lib/rbac';
import { fmtLongDate } from '../lib/format';
import { sanitizeHtml, htmlToText } from '../lib/sanitizeHtml';
import {
  kbList, kbAdd, kbUpdate, kbDelete, supabaseConfigured,
  type KbArticle, type KbAttachment,
} from '../lib/supabase';
import './knowledgebase.css';

// ===========================================================================
// KNOWLEDGE BASE — "How to use RITHI CRM" (static guide) plus FIELD SOLUTIONS,
// team-written articles (rich text with images & tables) that help the team
// solve field issues. Always available to every role; anyone signed in can
// contribute an article, and the author (or an admin) can edit or delete it.
// ===========================================================================

const B = ({ children }: { children: ReactNode }) => <span className="kb-btn">{children}</span>;
const K = ({ children }: { children: ReactNode }) => <span className="kb-key">{children}</span>;
const Hint = ({ children }: { children: ReactNode }) => <span className="kb-hint">{children}</span>;

// `go` are real navigation targets for the task — rendered as "Open …" buttons,
// each shown only if the signed-in role may open that module (or `always`, for
// a personal screen like the profile). Some tasks (find the Build ID, refresh)
// have no module to open, so they carry none.
interface GoTo { to: string; label: string; always?: boolean }
interface Sec { id: string; n: string; title: string; who: string; lead: ReactNode; steps: ReactNode[]; go?: GoTo[]; note?: { tone: 'tip' | 'warn' | 'good'; icon: string; body: ReactNode } }

const SECTIONS: Sec[] = [
  {
    id: 'request', n: '1', title: 'Request a call', who: 'Any engineer',
    lead: <>When a customer reports a problem, raise a <b>call registration request</b>. The Hotline turns it into a live call with a UCN. You can put more than one machine on one request.</>,
    steps: [
      <>Open <b>Service Calls → Request Registration</b> from the left menu.</>,
      <>Tap <B>＋ New Request</B> at the top right.</>,
      <>Pick the <b>Party</b> (customer), then <b>Product</b> and <b>Serial No</b> — filtered to what that customer owns.<Hint>Choosing the serial auto-fills the machine details.</Hint></>,
      <>Choose the <b>Standard Complaint</b> and type the <b>Reported Problem</b> in the customer’s words.</>,
      <>More than one machine? Tap <b>Add another</b> and repeat — all share one request.</>,
      <>Tap <b>Submit</b>. It appears under <b>Pending Registrations</b> until the Hotline registers it.</>,
    ],
    go: [{ to: '/request-registration', label: 'Request Registration' }, { to: '/pending-registrations', label: 'Pending Registrations' }],
    note: { tone: 'tip', icon: '📌', body: <>A request without a UCN stays in <b>Pending Registrations</b>. Once registered, it becomes a call with a UCN in the <b>Field Call Register</b>.</> },
  },
  {
    id: 'install', n: '2', title: 'Register an installation', who: 'Commercial / Hotline · engineer reports',
    lead: <>An installation is a call of type <b>Installation</b>. It’s created like any call, then you record the install and — importantly — the <b>Warranty Start Date</b>.</>,
    steps: [
      <>Raise it as a request (step 1) choosing <b>Installation</b>, or open <b>Service Calls → Installation Calls</b> and use <B>＋ New Installation</B>.<Hint>New installations are usually triggered by the Commercial team, who are notified first.</Hint></>,
      <>Once it’s a live call, do the installation on site.</>,
      <>Open the call and tap <B>📝 Update</B>, then fill the installation details.</>,
      <>Set the <b>Warranty Start Date</b> — this starts the machine’s warranty and is required on an installation.</>,
      <>Set the <b>Call Status</b> to <b>Solved - Report Completed</b> when the install and report are done.</>,
    ],
    go: [{ to: '/installations', label: 'Installation Calls' }],
    note: { tone: 'tip', icon: '🛡️', body: <>The Warranty Start Date you enter here is what the Warranty Register and every future call read for that machine — get it right.</> },
  },
  {
    id: 'update', n: '3', title: 'Update a call after your visit', who: 'Any engineer',
    lead: <>After you attend a machine, record what you did. The <b>Call Status</b> you choose is what moves the call forward — or closes it.</>,
    steps: [
      <>Open <b>Service Calls → Field Call Register</b> (or Installation / PM).</>,
      <>Find your call. Engineers see <B>🔵 Open only</B> by default — switch to <B>⚪ All calls</B> to see closed ones.<Hint>Search by UCN, party, product or serial if the list is long.</Hint></>,
      <>On the call’s row, tap <B>📝 Update</B>.</>,
      <>Set the <b>Call Status</b>.<Hint><b>Unsolved</b> = still broken · <b>Solved - Report Pending</b> = fixed, report to finish · <b>Solved - Report Completed</b> = done.</Hint></>,
      <>Fill <b>Complaint Observation</b>, <b>Job Done</b>, <b>Hour Meter Reading</b>, <b>Software Version</b>; set <b>Add Consumption?</b> if you fitted spares.</>,
      <>Tap <b>Save</b>. Every visit is kept, so the call’s history builds up.</>,
    ],
    go: [{ to: '/field-calls', label: 'Field Call Register' }, { to: '/installations', label: 'Installation Calls' }, { to: '/pm-calls', label: 'PM Calls' }],
    note: { tone: 'warn', icon: '⚠️', body: <>A call marked <b>Solved - Report Completed</b> becomes read-only. Finish the report before you set it.</> },
  },
  {
    id: 'spare', n: '4', title: 'Raise a spare request', who: 'Any engineer',
    lead: <>Need a part? Raise a spare request — from the call it’s for (best, so it’s linked) or from the Spare Requests screen.</>,
    steps: [
      <><b>From a call:</b> on the call’s row tap <B>📦 Spare</B> — the call and machine fill in for you.<Hint>Or open <b>Spares → Spare Requests</b> and tap <B>＋ New Spare Request</B>.</Hint></>,
      <>Pick the <b>Part</b> and set the <b>Quantity</b>.</>,
      <>Add a line for each different part — they travel together on one request.</>,
      <>Tap <b>Submit</b>. It enters the chain: <b>RM → Commercial → NSM → Stores → Dispatch</b>.</>,
    ],
    go: [{ to: '/spare-requests', label: 'Spare Requests' }],
  },
  {
    id: 'approve', n: '5', title: 'Approve a spare request', who: 'Reporting Manager & approvers',
    lead: <>If you approve spares (RM, Commercial, NSM or Stores), you decide each part on its own — a request can go forward partly approved.</>,
    steps: [
      <>Open <b>Spares → Spare Requests</b>. Lines waiting on you show at your stage.</>,
      <>Read the line — part, quantity, and the call and customer it’s for.</>,
      <>Tap <B>✔ Approve</B> to pass it on, or <B>✖ Reject</B> to stop it.<Hint>Rejecting asks for a reason so the engineer knows why.</Hint></>,
      <>Decide each part separately — approve the good ones, reject the rest.</>,
    ],
    go: [{ to: '/spare-requests', label: 'Spare Requests' }],
    note: { tone: 'tip', icon: '💡', body: <>A Reporting Manager sees and approves only their <b>own team’s</b> spares. Only <b>Spare Coordinator</b> and <b>Hotline</b> can <B>⊘ Drop</B> a spare at any stage.</> },
  },
  {
    id: 'sparestatus', n: '6', title: 'View spare status', who: 'Any engineer',
    lead: <>Track a spare you raised from raise to receipt — every request shows exactly where it is in the chain.</>,
    steps: [
      <>Open <b>Spares → Spare Requests</b>.</>,
      <>Find your request; the <b>Stage</b> column shows where it is — <b>RM Approval → Commercial → NSM → Stores → Dispatched → Received</b> (or <b>Rejected / Dropped</b>).</>,
      <>Tap the item to open its detail — the full approval trail, DC number, courier and dates.</>,
      <>When Stores dispatches it, tap <B>Received</B> once it reaches you to close it off.<Hint>The tiles at the top count how many are at each stage.</Hint></>,
    ],
    go: [{ to: '/spare-requests', label: 'Spare Requests' }],
  },
  {
    id: 'feedback', n: '7', title: 'Customer feedback', who: 'Any engineer',
    lead: <>Feedback is captured on the call report, at the customer’s end. It’s then visible in the Customer Feedback screen.</>,
    steps: [
      <>While updating a call (step 3), fill the <b>Customer Feedback</b> questions with the customer — ratings and yes/no on the service and product.</>,
      <>The questions shown depend on the call type (Installation / PM / Field).</>,
      <>Saved feedback appears under <b>Quality &amp; Analytics → Customer Feedback</b>, one column per question.</>,
    ],
    go: [{ to: '/feedback', label: 'Customer Feedback' }],
    note: { tone: 'tip', icon: '⭐', body: <>Feedback is scoped like your calls — you see feedback for your own calls; managers and office roles see more.</> },
  },
  {
    id: 'password', n: '8', title: 'Reset your password', who: 'Any engineer',
    lead: <>Reset it from sign-in if you’re locked out, or change it any time from your profile. The 👁️ button reveals what you typed.</>,
    steps: [
      <><b>Locked out?</b> On the sign-in screen tap <B>Forgot password?</B>.</>,
      <>Enter your Air Liquide / Gmail address — a reset link is emailed to you.</>,
      <>Open the link, type a new password (tap <b>👁️</b> to check it), confirm, and you’re back in.</>,
      <><b>Already signed in?</b> User menu (your name, top-right) → <b>My Profile</b> → <b>Password</b>.</>,
    ],
    go: [{ to: '/profile', label: 'My Profile', always: true }],
    note: { tone: 'tip', icon: '🔑', body: <>First time signing in? Use the starting password your admin gave you — the app then asks you to set your own.</> },
  },
  {
    id: 'build', n: '9', title: 'Find the Build ID (for support)', who: 'When something looks wrong',
    lead: <>The <b>Build ID</b> tells support exactly which version you’re on. It lives in the <b>footer</b> at the very bottom of every page.</>,
    steps: [
      <>Scroll to the very bottom of any screen.</>,
      <>Read the footer: <b>RITHI CRM</b>, the version, <b>build&nbsp;#</b> and <b>ID</b>.</>,
      <>Send support the <b>version</b> and <b>ID</b> — e.g. <K>v0.8.43 · build #131 · ID a1b2c3d4</K>.<Hint>On a narrow phone the ID may be hidden — turn sideways, or note the version and build #.</Hint></>,
      <>Say what you were doing and what happened. A screenshot helps.</>,
    ],
  },
  {
    id: 'sync', n: '10', title: 'Refresh, Sync & Force update', who: 'Keeping your data fresh',
    lead: <>The app loads instantly from a copy on your device, then syncs the latest. Three controls, gentlest to strongest.</>,
    steps: [
      <><B>↻ Refresh</B> — on a screen’s toolbar. Pulls that screen’s latest rows now. Use it first if a list looks behind.</>,
      <><B>⟳ synced 3m ago</B> — a <i>status</i>, not a button. Shows how long since this screen synced; it also auto-syncs about every 30 minutes.</>,
      <><B>⟳ Force update</B> — in the footer. Clears the on-device cache and reloads the newest version. Use after an update, or if the app looks stuck.<Hint>The app’s version of <K>Ctrl/⌘ + Shift + R</K>.</Hint></>,
    ],
    note: { tone: 'good', icon: '✅', body: <><b>Rule of thumb:</b> list looks old → <B>↻ Refresh</B>. Whole app looks old → <B>⟳ Force update</B>. Still wrong → note the <b>Build ID</b> and tell support.</> },
  },
];

const CATEGORIES = ['Field Issue', 'How-To', 'Product Tip', 'Spares', 'Other'];
const emptyForm = { title: '', category: 'Field Issue', product: '', tags: '', body: '', attachments: [] as KbAttachment[] };

export function KnowledgeBase() {
  const { user, isAdmin, can } = useAuth();
  const navigate = useNavigate();
  const onDb = supabaseConfigured();
  // A task's "Open …" targets the signed-in role may actually reach (admins see
  // all); `always` targets (a personal screen) are shown to everyone.
  const openable = (go?: GoTo[]) => (go ?? []).filter((g) => g.always || isAdmin || can(actionForPath(g.to)));
  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<KbArticle | null>(null);
  const [edit, setEdit] = useState<{ id: number | null; form: typeof emptyForm } | null>(null);

  const load = async () => {
    if (!onDb) return;
    setBusy(true);
    try { setArticles(await kbList()); setMsg(null); }
    catch (e) { setMsg({ tone: 'error', text: /kb_articles|does not exist|schema cache/i.test(String(e)) ? 'Knowledge Base needs migration 0042_knowledge_base.sql — run it in the Supabase SQL editor.' : `Load failed: ${e instanceof Error ? e.message : String(e)}` }); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const canEdit = (a: KbArticle) => isAdmin || (!!user?.id && a.created_by === user.id);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((a) => `${a.title} ${a.category} ${a.product} ${a.tags} ${htmlToText(a.body)} ${a.author_name}`.toLowerCase().includes(q));
  }, [articles, search]);

  const openNew = () => setEdit({ id: null, form: { ...emptyForm } });
  const openEdit = (a: KbArticle) => { setView(null); setEdit({ id: a.id, form: { title: a.title, category: a.category || 'Other', product: a.product, tags: a.tags, body: a.body, attachments: a.attachments ?? [] } }); };

  const save = async () => {
    if (!edit) return;
    const f = edit.form;
    if (!f.title.trim()) { setMsg({ tone: 'error', text: 'Give the article a title.' }); return; }
    setBusy(true);
    const payload = {
      title: f.title.trim(), body: sanitizeHtml(f.body), category: f.category,
      product: f.product.trim(), tags: f.tags.trim(),
      attachments: f.attachments.filter((a) => a.url.trim()),
      author_name: user?.fullName ?? '', author_email: user?.email ?? '',
    };
    const res = edit.id == null ? await kbAdd(payload) : await kbUpdate(edit.id, payload);
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Save failed.' }); return; }
    setEdit(null); setMsg({ tone: 'ok', text: edit.id == null ? 'Article published.' : 'Article updated.' });
    void load();
  };

  const remove = async (a: KbArticle) => {
    if (!confirm(`Delete “${a.title}”? This cannot be undone.`)) return;
    setBusy(true); const res = await kbDelete(a.id); setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Delete failed.' }); return; }
    setView(null); void load();
  };

  const setF = (k: keyof typeof emptyForm, v: unknown) => setEdit((e) => e && ({ ...e, form: { ...e.form, [k]: v } }));

  return (
    <div>
      <PageHeader title="Knowledge Base" subtitle="How to use RITHI CRM, plus field solutions written by the team." icon="📚" />

      {/* ---------- Field Solutions (team articles) ---------- */}
      <div className="kb-fs-head">
        <div>
          <h2 className="kb-h2">🧠 Field Solutions</h2>
          <p className="kb-intro" style={{ margin: '2px 0 0' }}>Answers and fixes written by the team — search before you start, and add what you learn.</p>
        </div>
        {onDb && user && <button className="btn btn-primary" onClick={openNew}>＋ Add article</button>}
      </div>

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {onDb ? (
        <>
          <div className="kb-fs-tools">
            <SearchBox value={search} onChange={setSearch} placeholder="Search field solutions…" />
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <span className="kb-count">{visible.length} article{visible.length === 1 ? '' : 's'}</span>
          </div>
          {visible.length === 0 ? (
            <div className="kb-empty">{busy ? 'Loading…' : search ? 'No articles match your search.' : 'No field solutions yet — be the first to add one with ＋ Add article.'}</div>
          ) : (
            <div className="kb-cards">
              {visible.map((a) => (
                <button key={a.id} className="kb-card" onClick={() => setView(a)}>
                  <div className="kb-card-top">
                    {a.category && <span className="kb-cat">{a.category}</span>}
                    {a.product && <span className="kb-prod">🩺 {a.product}</span>}
                  </div>
                  <div className="kb-card-title">{a.title}</div>
                  <div className="kb-card-prev">{htmlToText(a.body).slice(0, 160) || '—'}</div>
                  <div className="kb-card-meta">{a.author_name || 'Someone'} · {fmtLongDate(a.updated_at)}{a.attachments?.length ? ` · 📎 ${a.attachments.length}` : ''}</div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="kb-empty">Connect the database in Settings to read and add field solutions.</div>
      )}

      {/* ---------- Static guide ---------- */}
      <h2 className="kb-h2" style={{ marginTop: 34 }}>📖 How to use RITHI CRM</h2>
      <p className="kb-intro">Everything you do day to day — each task shows the exact button to tap. Jump to a task:</p>
      <div className="kb-jump">
        {SECTIONS.map((s) => <a key={s.id} href={`#kb-${s.id}`}><span className="kb-jn">{s.n}</span>{s.title}</a>)}
      </div>
      {SECTIONS.map((s) => (
        <section className="kb-sec" id={`kb-${s.id}`} key={s.id}>
          <div className="kb-sec-head"><span className="kb-num">{s.n}</span><h2>{s.title}</h2></div>
          <div className="kb-who">{s.who}</div>
          <p className="kb-lead">{s.lead}</p>
          <ol className="kb-steps">{s.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
          {s.note && <div className={`kb-note ${s.note.tone}`}><span className="kb-ic">{s.note.icon}</span><div>{s.note.body}</div></div>}
          {openable(s.go).length > 0 && (
            <div className="kb-go">
              {openable(s.go).map((g) => (
                <button key={g.to} className="btn btn-primary btn-sm" onClick={() => navigate(g.to)}>Open {g.label} →</button>
              ))}
            </div>
          )}
        </section>
      ))}

      {/* ---------- Article viewer ---------- */}
      {view && (
        <Drawer open onClose={() => setView(null)} title={view.title} width={720}>
          <div className="kb-view">
            <div className="kb-view-meta">
              {view.category && <span className="kb-cat">{view.category}</span>}
              {view.product && <span className="kb-prod">🩺 {view.product}</span>}
              <span className="kb-view-by">{view.author_name || 'Someone'} · {fmtLongDate(view.updated_at)}</span>
            </div>
            {view.tags && <div className="kb-tags">{view.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => <span key={t} className="kb-tag">#{t}</span>)}</div>}
            <div className="kb-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(view.body) }} />
            {view.attachments?.length > 0 && (
              <div className="kb-att">
                <div className="kb-att-h">📎 Attachments</div>
                {view.attachments.map((a, i) => (
                  <a key={i} className="kb-att-link" href={a.url} target="_blank" rel="noopener noreferrer">{a.name || a.url}</a>
                ))}
              </div>
            )}
            {canEdit(view) && (
              <div className="kb-view-actions">
                <button className="btn btn-sm" onClick={() => openEdit(view)}>✏️ Edit</button>
                <button className="btn btn-sm btn-ghost" onClick={() => void remove(view)}>🗑 Delete</button>
              </div>
            )}
          </div>
        </Drawer>
      )}

      {/* ---------- Add / edit ---------- */}
      {edit && (
        <Drawer open onClose={() => setEdit(null)} title={edit.id == null ? 'Add field solution' : 'Edit article'} width={760}>
          <div className="kb-form">
            <div className="field"><label className="field-label">Title</label>
              <input className="input" value={edit.form.title} onChange={(e) => setF('title', e.target.value)} placeholder="e.g. Ventilator won’t power on after a spike" autoFocus /></div>
            <div className="kb-form-row">
              <div className="field"><label className="field-label">Category</label>
                <select className="select" value={edit.form.category} onChange={(e) => setF('category', e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div className="field"><label className="field-label">Product / model (optional)</label>
                <input className="input" value={edit.form.product} onChange={(e) => setF('product', e.target.value)} placeholder="Ventilator XT" /></div>
            </div>
            <div className="field"><label className="field-label">Tags (comma-separated, optional)</label>
              <input className="input" value={edit.form.tags} onChange={(e) => setF('tags', e.target.value)} placeholder="power, relay, board" /></div>
            <div className="field"><label className="field-label">Article</label>
              <RichEditor value={edit.form.body} onChange={(html) => setF('body', html)} placeholder="Describe the issue and the fix. Add images and tables with the toolbar." /></div>

            <div className="field">
              <label className="field-label">Attachment links (Drive / Pages / any URL, optional)</label>
              {edit.form.attachments.map((a, i) => (
                <div className="kb-att-row" key={i}>
                  <input className="input" placeholder="Label" value={a.name} onChange={(e) => setF('attachments', edit.form.attachments.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  <input className="input" placeholder="https://…" value={a.url} onChange={(e) => setF('attachments', edit.form.attachments.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
                  <button className="btn btn-ghost btn-sm" title="Remove" onClick={() => setF('attachments', edit.form.attachments.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button className="btn btn-sm" onClick={() => setF('attachments', [...edit.form.attachments, { name: '', url: '' }])}>＋ Add link</button>
            </div>

            <div className="kb-form-actions">
              <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : edit.id == null ? 'Publish' : 'Save changes'}</button>
              <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
