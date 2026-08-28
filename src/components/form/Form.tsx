import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
        <div className="sf-section" key={section || '_'}>
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
      const opts = resolveOptions(field);
      const cur = String(value ?? '');
      // Show a prefilled value (e.g. mapped from Product Master) even if it is
      // not one of the configured options.
      const hasCur = cur === '' || opts.some((o) => String(o.value) === cur);
      return (
        <select
          className={`select ${error ? 'input-error' : ''}`}
          value={cur}
          onChange={(e) => onChange(e.target.value)}
          {...common}
        >
          <option value="">— Select —</option>
          {!hasCur && <option value={cur}>{cur} (from sheet)</option>}
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
    default:
      return (
        <input
          type={field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
          className={cls}
          value={String(value ?? '')}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          {...common}
        />
      );
  }
}
