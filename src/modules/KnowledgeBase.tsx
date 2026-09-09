import { useEffect, useMemo, useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader, Drawer, SearchBox } from '../components/ui/ui';
import { HOWTO_CATEGORY } from './HowToUse';
import { RichEditor } from '../components/ui/RichEditor';
import { useAuth } from '../lib/auth';
import { fmtLongDate } from '../lib/format';
import { sanitizeHtml, htmlToText } from '../lib/sanitizeHtml';
import {
  kbList, kbAdd, kbUpdate, kbDelete, supabaseConfigured,
  type KbArticle, type KbAttachment,
} from '../lib/supabase';
import './knowledgebase.css';

// ===========================================================================
// FIELD SOLUTIONS — team-written articles (rich text with images & tables) that
// help the team solve field issues. Always available to every role; anyone
// signed in can contribute an article, and the author (or an admin) can edit
// or delete it.
//
// THE GUIDE HAS MOVED OUT (2026-09-09). "How to use RITHI CRM" used to be the
// bottom half of this page; it is now its own topic at /knowledge-base/how-to,
// because a page somebody is told to read should be a place rather than a
// position below something else.
//
// AND SO HAVE THE HOW-TO ARTICLES. An article filed under the How-To category
// is instructions, so it is listed on that page and NOT here — the two lists
// read one shared constant (HOWTO_CATEGORY) so an article cannot land on both
// or on neither. Writing one still happens here, where the editor is: the
// category is what decides where it is READ, not where it is typed.
// ===========================================================================
const CATEGORIES = ['Field Issue', 'How-To', 'Product Tip', 'Spares', 'Other'];
const emptyForm = { title: '', category: 'Field Issue', product: '', tags: '', body: '', attachments: [] as KbAttachment[] };

export function KnowledgeBase() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const onDb = supabaseConfigured();
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

  // Arrived from a call's Supporting Documents panel, which links to one
  // article by id — open it as soon as the list has loaded.
  const wanted = (location.state as { openArticle?: number } | null)?.openArticle;
  useEffect(() => {
    if (!wanted || !articles.length) return;
    const a = articles.find((x) => x.id === wanted);
    if (a) { setView(a); navigate('.', { replace: true, state: null }); }
  }, [wanted, articles, navigate]);

  const canEdit = (a: KbArticle) => isAdmin || (!!user?.id && a.created_by === user.id);

  // AN ARTICLE FILED AS How-To IS READ ON THE OTHER PAGE. It is still written
  // here, still editable here, and still opens here when something links to it
  // by id — what the category decides is where it is BROWSED, so somebody
  // looking for instructions finds all of them in one place. Filtering before
  // the search, not after: a How-To article must not surface here on a search
  // either, or the two lists disagree the moment anybody types.
  const solutions = useMemo(
    () => articles.filter((a) => a.category !== HOWTO_CATEGORY), [articles]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return solutions;
    return solutions.filter((a) => `${a.title} ${a.category} ${a.product} ${a.tags} ${htmlToText(a.body)} ${a.author_name}`.toLowerCase().includes(q));
  }, [solutions, search]);

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
    setEdit(null);
    // SAY WHERE IT WENT when it is not going to appear here. An article filed
    // as How-To is read on the How to Use page, so publishing one from this
    // screen and watching the list not change reads as the save having failed
    // — the one way this split can cost somebody their work, because the
    // natural response is to write it again. The message names the page and
    // offers to open it.
    const wentElsewhere = f.category === HOWTO_CATEGORY;
    setMsg(wentElsewhere
      ? { tone: 'info', text: `${edit.id == null ? 'Published' : 'Updated'} — filed under ${HOWTO_CATEGORY}, so it is listed on How to Use RITHI CRM rather than here.` }
      : { tone: 'ok', text: edit.id == null ? 'Article published.' : 'Article updated.' });
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
      <PageHeader
        onRefresh={() => void load()}
        refreshing={busy} title="Field Solutions" subtitle="Answers and fixes written by the team. How-to articles live under How to Use RITHI CRM." icon="🧠" />

      <div className="kb-fs-head">
        <div>
          <p className="kb-intro" style={{ margin: '2px 0 0' }}>Search before you start, and add what you learn. An article filed under <b>{HOWTO_CATEGORY}</b> is read on <b>How to Use RITHI CRM</b> instead of here.</p>
        </div>
        {onDb && user && <button className="btn btn-primary" onClick={openNew}>＋ Add article</button>}
      </div>

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          {/* A message that says where something went should be able to take
              you there — otherwise it is a riddle. */}
          {msg.tone === 'info' && (
            <button className="btn btn-sm" onClick={() => navigate('/knowledge-base/how-to')}>Open How to Use →</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {onDb ? (
        <>
          <div className="kb-fs-tools">
            <SearchBox value={search} onChange={setSearch} placeholder="Search field solutions…" />
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

      {/* THE GUIDE IS NO LONGER BELOW THIS. It is its own topic — "How to Use
          RITHI CRM" under the Knowledge Base heading — because it was the thing
          a new starter needs first sitting under a wall of articles. A link
          rather than nothing, so anyone who knew where it was still finds it. */}
      <div className="kb-go" style={{ marginTop: 26 }}>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/knowledge-base/how-to')}>
          Open How to Use RITHI CRM →
        </button>
      </div>

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
                <SelectPicker value={edit.form.category} onChange={(v) => setF('category', v)}
                  options={[...CATEGORIES]} />
                {edit.form.category === HOWTO_CATEGORY && (
                  <span className="kb-hint">Read on <b>How to Use RITHI CRM</b>, not here — this category is for instructions.</span>
                )}</div>
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
