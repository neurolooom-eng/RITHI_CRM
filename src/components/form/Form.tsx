import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { SelectPicker } from '../ui/SelectPicker';
import './form.css';

// ===========================================================================
// FORM SYSTEM — shared across every module.
// A schema (array of FieldDef) drives rendering, validation and value
// collection. Defaults: 2-column responsive grid, inline validation on submit,
// required-field markers, section grouping. Field types cover the needs of the
// service modules (text, number, date, select, textarea, checkbox, currency).
// ===========================================================================

export type FieldType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'time'
  | 'select'
  | 'textarea'
  | 'checkbox'
  | 'email'
  | 'tel';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: FieldOption[] | (() => FieldOption[]);
  span?: 1 | 2; // grid columns
  section?: string;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  rows?: number;
  readOnly?: boolean;
  // Free-text field with autocomplete suggestions (e.g. from a Master sheet).
  datalist?: string[];
  // MAY A VALUE BE COMMITTED THAT IS NOT ON THE LIST? Off by default, and the
  // default is the point: these options come from masters, so a typed-in value
  // is a master entry that does not exist. It is a per-FIELD decision (the
  // user's rule, 2026-09-09: "fallback or no fallback depends on the field") --
  // a free-text note can take anything, a Standard Complaint cannot.
  allowFreeText?: boolean;
  // Something INTERACTIVE under the field — a suggestion the person can accept,
  // which `help` cannot be because it is only a string. Given the form's current
  // values and its setter, so a field can offer to fill itself from what has
  // been typed elsewhere on the form without the form growing a special case
  // for that one field.
  below?: (ctx: { values: FormValues; set: (name: string, value: unknown) => void }) => ReactNode;
  validate?: (value: unknown, values: Record<string, unknown>) => string | null;
}

export type FormValues = Record<string, unknown>;

interface FormProps {
  fields: FieldDef[];
  initial?: FormValues;
  onSubmit: (values: FormValues) => void;
  onCancel?: () => void;
  submitLabel?: string;
  readOnly?: boolean;
  columns?: 1 | 2 | 3;
  footer?: ReactNode;
  // When set, users can reorder the form's sections and the order persists.
  sectionOrderKey?: string;
  // Sections that must not be skimmed past. Rendered by INVERTING against the
  // page rather than tinting it — a pale wash of the accent colour is what this
  // project reached for first and it did not read on screen at all (the user's
  // standing preference: "I would always prefer a Contrast Projection when I
  // say Highlight"). Used for the vigilance questions on a call, which are a
  // regulatory record and the one part of the form nobody may overlook.
  emphasisSections?: string[];
}

const resolveOptions = (f: FieldDef): FieldOption[] =>
  typeof f.options === 'function' ? f.options() : (f.options ?? []);

function defaultFor(f: FieldDef): unknown {
  if (f.defaultValue !== undefined) return f.defaultValue;
  if (f.type === 'checkbox') return false;
  if (f.type === 'number' || f.type === 'currency') return '';
  return '';
}

export function SchemaForm({
  fields,
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  readOnly = false,
  columns = 2,
  footer,
  sectionOrderKey,
  emphasisSections,
}: FormProps) {
  const initValues = (): FormValues => {
    const v: FormValues = {};
    fields.forEach((f) => {
      v[f.name] = initial?.[f.name] ?? defaultFor(f);
    });
    return v;
  };
  const [values, setValues] = useState<FormValues>(initValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setValues(initValues());
    setErrors({});
    setTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  // Whether any field differs from its initial/default value.
  const dirty = useMemo(
    () => fields.some((f) => String(values[f.name] ?? '') !== String((initial?.[f.name] ?? defaultFor(f)) ?? '')),
    [values, fields, initial],
  );

  const reset = () => {
    setValues(initValues());
    setErrors({});
    setTouched(false);
  };

  const handleCancel = () => {
    if (dirty && !readOnly && !confirm('Discard unsaved changes?')) return;
    onCancel?.();
  };

  const sections = useMemo(() => {
    const map = new Map<string, FieldDef[]>();
    fields.forEach((f) => {
      const key = f.section ?? '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    });
    return [...map.entries()];
  }, [fields]);

  // Optional user-defined section order (persisted).
  const storeKey = sectionOrderKey ? `rithi.formSections.${sectionOrderKey}` : null;
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    try { return storeKey ? JSON.parse(localStorage.getItem(storeKey) || '[]') : []; } catch { return []; }
  });
  const orderedSections = useMemo(() => {
    if (!storeKey) return sections;
    const byKey = new Map(sections);
    const ordered = sectionOrder.filter((k) => byKey.has(k)).map((k) => [k, byKey.get(k)!] as [string, FieldDef[]]);
    const rest = sections.filter(([k]) => !sectionOrder.includes(k));
    return [...ordered, ...rest];
  }, [sections, sectionOrder, storeKey]);
  const moveSection = (key: string, dir: -1 | 1) => {
    const cur = orderedSections.map(([k]) => k);
    const i = cur.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cur.length) return;
    const next = [...cur];
    next.splice(j, 0, next.splice(i, 1)[0]);
    setSectionOrder(next);
    if (storeKey) { try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* ignore */ } }
  };

  const setValue = (name: string, value: unknown) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (touched) setErrors((e) => ({ ...e, [name]: validateField(name, value) ?? '' }));
  };

  const validateField = (name: string, value: unknown): string | null => {
    const f = fields.find((x) => x.name === name);
    if (!f) return null;
    if (f.required) {
      const empty = value === '' || value == null || (f.type === 'checkbox' && value === false);
      if (empty) return `${f.label} is required`;
    }
    if (f.validate) return f.validate(value, values);
    if ((f.type === 'number' || f.type === 'currency') && value !== '') {
      const n = Number(value);
      if (Number.isNaN(n)) return 'Must be a number';
      if (f.min != null && n < f.min) return `Min ${f.min}`;
      if (f.max != null && n > f.max) return `Max ${f.max}`;
    }
    if (f.type === 'email' && value) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) return 'Invalid email';
    }
    return null;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const errs: Record<string, string> = {};
    fields.forEach((f) => {
      const msg = validateField(f.name, values[f.name]);
      if (msg) errs[f.name] = msg;
    });
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    // normalize numeric fields
    const out: FormValues = { ...values };
    fields.forEach((f) => {
      if ((f.type === 'number' || f.type === 'currency') && out[f.name] !== '') {
        out[f.name] = Number(out[f.name]);
      }
    });
    onSubmit(out);
  };

  const gridStyle = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };

  return (
    <form className="sf" onSubmit={submit}>
      {orderedSections.map(([section, secFields], si) => (
        <div
          className={`sf-section${emphasisSections?.includes(section) ? ' sf-section-vital' : ''}`}
          key={section || '_'}
        >
          {section && (
            <div className="sf-section-title">
              <span>{section}</span>
              {storeKey && orderedSections.length > 1 && (
                <span className="sf-section-move">
                  <button type="button" className="btn btn-ghost btn-sm" disabled={si === 0} title="Move section up" onClick={() => moveSection(section, -1)}>↑</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={si === orderedSections.length - 1} title="Move section down" onClick={() => moveSection(section, 1)}>↓</button>
                </span>
              )}
            </div>
          )}
          <div className="sf-grid" style={gridStyle}>
            {secFields.map((f) => {
              const span = Math.min(f.span ?? 1, columns);
              const err = errors[f.name];
              const ro = readOnly || f.readOnly;
              return (
                <div
                  className="sf-field"
                  key={f.name}
                  style={{ gridColumn: `span ${span} / span ${span}` }}
                >
                  {f.type !== 'checkbox' && (
                    <label className="field-label">
                      {f.label}
                      {f.required && <span className="field-req">*</span>}
                    </label>
                  )}
                  <FieldControl
                    field={f}
                    value={values[f.name]}
                    onChange={(v) => setValue(f.name, v)}
                    error={!!err}
                    readOnly={ro}
                  />
                  {f.help && !err && <div className="field-help">{f.help}</div>}
                  {err && <div className="field-err">{err}</div>}
                  {f.below?.({ values, set: setValue })}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="sf-actions">
        {footer}
        <div className="spacer" />
        {!readOnly && dirty && (
          <button type="button" className="btn" onClick={reset} title="Revert edits to the saved values">
            Reset
          </button>
        )}
        {onCancel && (
          <button type="button" className="btn" onClick={handleCancel}>
            {readOnly ? 'Close' : dirty ? 'Discard changes' : 'Cancel'}
          </button>
        )}
        {!readOnly && (
          <button type="submit" className="btn btn-primary">
            {submitLabel}
          </button>
        )}
      </div>
    </form>
  );
}

function FieldControl({
  field,
  value,
  onChange,
  error,
  readOnly,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  error: boolean;
  readOnly?: boolean;
}) {
  const cls = `input ${error ? 'input-error' : ''}`;
  const common = { disabled: readOnly };

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          className={`textarea ${error ? 'input-error' : ''}`}
          value={String(value ?? '')}
          placeholder={field.placeholder}
          rows={field.rows ?? 3}
          onChange={(e) => onChange(e.target.value)}
          {...common}
        />
      );
    case 'select': {
      // TYPE, SEARCH, SELECT — THE DEFAULT FOR EVERY DROPDOWN IN THE APP
      // (the user's rule, 2026-09-09). This one case covers the Field Call,
      // Installation and PM registers and Pending Registrations, because every
      // one of those forms is built from FieldDefs and rendered here. Changing
      // the engine is what makes "in all modules" true and keeps it true for
      // the next form somebody adds.
      //
      // SelectPicker drops the search box under eight options, so a Yes/No is
      // still two things you click. And free text is OFF unless the field asks
      // for it: an option list comes from a master, and a typed value is a
      // master entry that does not exist.
      const opts = resolveOptions(field);
      const cur = String(value ?? '');
      // A prefilled value (e.g. mapped from Product Master) stays selectable
      // even when it is not one of the configured options, or opening a record
      // would silently blank it.
      const hasCur = cur === '' || opts.some((o) => String(o.value) === cur);
      return (
        <SelectPicker
          value={cur}
          onChange={onChange}
          disabled={common.disabled}
          className={error ? 'input-error' : undefined}
          allowFreeText={field.allowFreeText === true}
          options={[
            ...(hasCur ? [] : [{ value: cur, label: `${cur} (from sheet)` }]),
            ...opts.map((o) => ({ value: String(o.value), label: o.label })),
          ]}
        />
      );
    }
    case 'checkbox':
      return (
        <label className="sf-checkbox">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            {...common}
          />
          <span>
            {field.label}
            {field.required && <span className="field-req">*</span>}
          </span>
        </label>
      );
    case 'number':
    case 'currency':
      return (
        <div className={field.type === 'currency' ? 'sf-currency' : ''}>
          {field.type === 'currency' && <span className="sf-currency-sym">₹</span>}
          <input
            type="number"
            className={cls}
            value={value === '' || value == null ? '' : Number(value)}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            step="any"
            onChange={(e) => onChange(e.target.value === '' ? '' : e.target.value)}
            {...common}
          />
        </div>
      );
    case 'date':
      return (
        <input
          type="date"
          className={cls}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          {...common}
        />
      );
    case 'datetime':
      return (
        <input
          type="datetime-local"
          className={cls}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          {...common}
        />
      );
    case 'time':
      return (
        <input
          type="time"
          className={cls}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          {...common}
        />
      );
    default: {
      const listId = field.datalist && field.datalist.length ? `dl-${field.name}` : undefined;
      return (
        <>
          <input
            type={field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
            className={cls}
            value={String(value ?? '')}
            placeholder={field.placeholder}
            list={listId}
            onChange={(e) => onChange(e.target.value)}
            {...common}
          />
          {listId && (
            <datalist id={listId}>
              {field.datalist!.slice(0, 1000).map((v) => <option key={v} value={v} />)}
            </datalist>
          )}
        </>
      );
    }
  }
}
