import { useId, useState } from 'react';

// ===========================================================================
// FREE-TEXT TAGS, SEVERAL PER RECORD (the User Master's Tags, 0408, the user,
// 2026-10-10). Type a tag and press Enter or a comma to add it; × removes one.
// Tags already in use elsewhere are SUGGESTED (a datalist) and never imposed --
// the user chose free text over a master list. A tag already on the record in
// another case is not added twice, which is the database's rule too (0408).
// ===========================================================================

/** Trimmed, blanks dropped, one per spelling case-blind, first spelling kept -- 0408's rule. */
export function tidyTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = String(raw ?? '').trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

/** Case-blind: does this record carry the tag? */
export const hasTag = (tags: readonly string[] | null | undefined, tag: string): boolean =>
  (tags ?? []).some((t) => String(t).trim().toLowerCase() === tag.trim().toLowerCase());

export function TagChips({ tags }: { tags: readonly string[] }) {
  if (!tags.length) return null;
  return (
    <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
      {tags.map((t) => <span key={t} className="badge badge-neutral">{t}</span>)}
    </span>
  );
}

export function TagInput({ value, onChange, suggestions = [], placeholder = 'Type a tag, Enter to add' }: {
  value: readonly string[];
  onChange: (tags: string[]) => void;
  suggestions?: readonly string[];
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const listId = useId();
  const add = (raw: string) => {
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) onChange(tidyTags([...value, ...parts]));
    setText('');
  };
  return (
    <div className="row" style={{ gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
      {value.map((t) => (
        <span key={t} className="badge badge-neutral" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          {t}
          <button type="button" className="linklike" aria-label={`Remove tag ${t}`}
            onClick={() => onChange(value.filter((x) => x !== t))}>×</button>
        </span>
      ))}
      <input className="input" style={{ flex: 1, minWidth: 140 }} list={listId} placeholder={placeholder}
        value={text}
        onChange={(e) => { const v = e.target.value; if (v.includes(',')) add(v); else setText(v); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(text); }
          else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => { if (text.trim()) add(text); }} />
      <datalist id={listId}>
        {suggestions.filter((s) => !hasTag(value, s)).map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}
