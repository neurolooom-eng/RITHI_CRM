import { PickList } from './PickList';

// ===========================================================================
// EVERY DROPDOWN, ONE CONTROL.
//
// The user, 2026-09-09: "Make all DorpDowns as a PickerList , FallBack is
// dependent on the Module and Form."
//
// This is a drop-in for `<select>`: same value/onChange shape, options as
// strings or {value,label}, so converting a screen is a mechanical edit rather
// than a redesign of each form. It renders a PickList, which means the one
// rule holds everywhere — TYPING FILTERS, IT NEVER SELECTS. That rule is why
// PickList exists: a native select picks on the first keystroke, and with Auto
// Save on the Daily Call Review that wrote a Root Cause nobody chose.
//
// A SHORT LIST DOES NOT GET A SEARCH BOX. PickList suppresses it under eight
// options, so "Yes / No" stays two items you click, not a field you type into
// to reach two items you could already see. Same control, same behaviour on
// screen — it just does not pretend a two-item list needs searching.
//
// THE FALLBACK IS THE FORM'S DECISION, not this component's, which is the
// second half of the ask. `allowFreeText` lets a form accept a value that is
// not on the list; it defaults to OFF, because these lists come from masters
// and a typed value is usually a master entry that does not exist. Where it
// belongs on: a Standard Complaint typed by hand still reads as a fault. Where
// it must stay off: a PART, because a hand-typed code is one that dispatch,
// hand stock and consumption will all fail to match.
// ===========================================================================

export interface SelectPickerOption { value: string; label?: string; disabled?: boolean; }

export interface SelectPickerProps {
  value: string;
  onChange: (value: string) => void;
  options: (string | SelectPickerOption)[];
  /** What the closed box reads when nothing is chosen. */
  placeholder?: string;
  disabled?: boolean;
  /** May the reader commit something that is not on the list? Off by default. */
  allowFreeText?: boolean;
  /** Shown under the list when a search finds nothing — say where values come from. */
  emptyHint?: string;
  /** Type-to-search appears at or above this many options (default 8). */
  searchThreshold?: number;
  id?: string;
  className?: string;
}

export function SelectPicker({
  value, onChange, options, placeholder = '— select —', disabled,
  allowFreeText = false, emptyHint, searchThreshold, id, className,
}: SelectPickerProps) {
  const norm = options
    .map((o) => (typeof o === 'string'
      ? { value: o, label: o, disabled: false }
      : { value: o.value, label: o.label ?? o.value, disabled: !!o.disabled }))
    // A `<select>` usually carries an empty first option as its placeholder;
    // PickList has its own "— none —", so dropping it here avoids two of them.
    .filter((o) => o.value !== '');

  const labels = new Map(norm.map((o) => [o.value, o.label]));
  const off = new Set(norm.filter((o) => o.disabled).map((o) => o.value));

  return (
    <div className={className}>
      <PickList
        id={id}
        value={value}
        options={norm.map((o) => o.value)}
        onPick={onChange}
        disabled={disabled}
        emptyLabel={placeholder}
        emptyHint={emptyHint}
        allowFreeText={allowFreeText}
        searchThreshold={searchThreshold}
        // The row reads its LABEL; what is stored is always the value, so a
        // dropdown whose text differs from its value keeps working.
        labelFor={(v) => labels.get(v) ?? v}
        isDisabled={off.size ? (v) => off.has(v) : undefined}
      />
    </div>
  );
}
