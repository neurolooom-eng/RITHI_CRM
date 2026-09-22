import { useState } from 'react';
import { formatDay } from '../../lib/dates';

// ===========================================================================
// A DATE THAT READS dd-MMM-yyyy AND IS STILL A DATE.
//
//   The user, 2026-09-22: "Date fields should follow the Long date -
//   Dd-mmm-yyyy -- all date fields in Warranty Sale".
//
// A NATIVE `<input type="date">` RENDERS IN THE BROWSER'S LOCALE and cannot be
// told otherwise — which is how the Field Call drawer came to show `2026-09-12`
// beside `09/11/2026` on two machines in one office. There is no attribute for
// this; the only way to control what the box says is to stop it being a date
// input.
//
// AND THE OBVIOUS FIX IS THE DANGEROUS ONE. A text box holding `20-Apr-2026`
// that is saved as typed puts a FORMATTED STRING in a date column — the fault
// this project's date rules are written against, because it is not visible
// until something tries to sort, filter or subtract it.
//
// SO THE BOX SWAPS. At rest it is text and reads `20-Apr-2026`; the moment it
// takes focus it becomes the native date input, with the browser's own picker
// and the browser's own validation, and it hands back an ISO date exactly as
// before. NOTHING IS PARSED AT ANY POINT — the value that leaves this component
// is the one the date input produced, so the formatted string cannot reach the
// database however it is typed.
//
// The cost is one frame of the locale format while somebody is actually editing
// the field, which is the moment they are least confused about which box they
// are in.
// ===========================================================================

export function LongDateInput({
  value, onChange, disabled, id,
}: { value: string; onChange: (iso: string) => void; disabled?: boolean; id?: string }) {
  const [editing, setEditing] = useState(false);

  if (editing && !disabled) {
    return (
      <input
        id={id}
        className="input"
        type="date"
        value={value}
        // AUTOFOCUS, because this input did not exist a moment ago: without it
        // the click that opened it lands on nothing and the field looks dead.
        autoFocus
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
      />
    );
  }
  return (
    <input
      id={id}
      className="input"
      type="text"
      // READ-ONLY RATHER THAN DISABLED: it must still take focus, or the field
      // cannot be reached from the keyboard at all.
      readOnly
      disabled={disabled}
      value={formatDay(value)}
      placeholder="dd-mmm-yyyy"
      onFocus={() => setEditing(true)}
      onClick={() => setEditing(true)}
    />
  );
}

/** The same value where it cannot be edited — a derived date, or a field the
 *  reader may not change. Formatted the same way, so a register does not read
 *  in two formats depending on who is looking at it. */
export const LongDateText = ({ value }: { value: string }) => (
  <input className="input" type="text" value={formatDay(value)} readOnly disabled />
);
