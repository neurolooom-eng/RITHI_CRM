import { useState } from 'react';
import { db } from '../lib/db';
import { useCollection } from '../lib/hooks';

// ===========================================================================
// Template placeholder. The user said they have official templates for quotes,
// invoices, reports, etc. and want a placeholder to slot them in later.
// This stores a raw template (HTML/markup or notes) per templateKey in the
// "templates" collection so it can be edited now and rendered later. For the
// POC it shows an editable region clearly marked as a placeholder.
// ===========================================================================

const COLLECTION = 'templates';

interface TemplateRec {
  id: string;
  key: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  [k: string]: unknown;
}

export function TemplatePlaceholder({
  templateKey,
  title,
  description,
}: {
  templateKey: string;
  title: string;
  description?: string;
}) {
  const all = useCollection<TemplateRec>(COLLECTION);
  const existing = all.find((t) => t.key === templateKey);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => {
    setDraft(existing?.content ?? '');
    setEditing(true);
  };

  const save = () => {
    if (existing) {
      db.update(COLLECTION, existing.id, { content: draft });
    } else {
      db.insert(COLLECTION, { key: templateKey, content: draft });
    }
    setEditing(false);
  };

  return (
    <div className="tpl-placeholder">
      <div className="tpl-head">
        <div>
          <span className="badge badge-warning">TEMPLATE PLACEHOLDER</span>
          <span className="tpl-title">{title}</span>
        </div>
        <button className="btn btn-sm" onClick={editing ? () => setEditing(false) : startEdit}>
          {editing ? 'Close' : existing ? 'Edit Template' : 'Add Template'}
        </button>
      </div>
      {description && <div className="tpl-desc muted">{description}</div>}
      {editing ? (
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          <textarea
            className="textarea"
            style={{ minHeight: 120, fontFamily: 'monospace', fontSize: 12 }}
            placeholder="Paste your template markup / HTML / merge-field layout here…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="row">
            <span className="muted" style={{ fontSize: 11.5 }}>
              Key: <code>{templateKey}</code>
            </span>
            <div className="spacer" />
            <button className="btn btn-sm btn-primary" onClick={save}>Save Template</button>
          </div>
        </div>
      ) : existing?.content ? (
        <pre className="tpl-content">{existing.content}</pre>
      ) : (
        <div className="tpl-empty muted">
          No template uploaded yet — the POC renders a default layout below. Click “Add Template” to
          store your official format (key: <code>{templateKey}</code>).
        </div>
      )}
    </div>
  );
}
