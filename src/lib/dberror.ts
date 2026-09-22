// ===========================================================================
// "IS THIS TABLE MISSING?" — asked properly, in one place.
//
// A dozen screens carry a line of the shape
//
//     /spare_stock_out_lines|does not exist|schema cache/i.test(err)
//         ? 'Run migration 0027 in the Supabase SQL editor'
//         : `Load failed: ${err}`
//
// and the middle alternative is the bug: **`does not exist` is not a question
// about the table.** Postgres says it about a missing COLUMN, a missing
// FUNCTION and a missing ROLE in exactly the same words, so any of those turns
// into an instruction to go and run a migration.
//
// Reported from use (2026-09-16): Stock Out showed *"Stock outs need migration
// 0027_spare_dispatch.sql — run it in the Supabase SQL editor"* on a project
// where 0027 had been applied for months. The real fault was a paged read
// ordering by `id` on a view that calls that column `line_id`; PostgREST
// answered `column spare_stock_out_lines.id does not exist`, and the screen
// read it as an absent table.
//
// THAT IS THE EXPENSIVE KIND OF WRONG, and this project has a name for it: a
// message that is ACTED ON. It does not merely fail to explain — it sends
// somebody to re-run a bundle that is already in, and teaches them that the
// instruction may mean nothing. The same reasoning is written against
// `_status.sql`, where a NO that means nothing is held to be worse than no row
// at all.
//
// So the test asks what it means: is the RELATION absent? A missing column, a
// missing function and a permission refusal are all NOT that, and each gets
// its own message — which is the one the reader can act on.
// ===========================================================================

/** The error text, however it arrived — an Error, a PostgREST body, a string. */
export function errText(e: unknown): string {
  if (e == null) return '';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  const o = e as { message?: unknown; error?: unknown; details?: unknown };
  return String(o.message ?? o.error ?? o.details ?? e);
}

/** THE TABLE ITSELF IS NOT THERE — so a migration really is the answer.
 *
 *  Two ways PostgREST says it, and they are both about the RELATION:
 *
 *    relation "public.foo" does not exist                     (Postgres 42P01)
 *    Could not find the table 'public.foo' in the schema cache  (PGRST205)
 *
 *  Pass the table names the screen reads. Naming them matters: an error about
 *  some OTHER table is not this screen's migration to run, and a hint that
 *  fires on any missing relation anywhere is the same over-firing in a
 *  smaller size. */
export function isMissingTable(e: unknown, ...tables: string[]): boolean {
  const m = errText(e);
  if (!m) return false;
  // A COLUMN is not a table, and it is the case that caused this to be
  // written. Postgres: `column foo.bar does not exist`; PostgREST's schema
  // cache: `Could not find the 'bar' column of 'foo' in the schema cache`.
  // Checked FIRST, because those messages also carry the table's name and
  // would otherwise satisfy every test below.
  if (/\bcolumn\b/i.test(m)) return false;
  // Likewise a function or a type. `function part_code(text) does not exist`
  // is a missing migration too, but a DIFFERENT one, and telling somebody to
  // re-run the register's bundle for it wastes the trip.
  if (/\bfunction\b|\boperator\b|\btype\b/i.test(m)) return false;

  const aboutRelation = /relation\s+"?[\w.]*"?\s+does not exist/i.test(m)
    || /could not find the table\b/i.test(m)
    || /\bin the schema cache\b/i.test(m);
  if (!aboutRelation) return false;

  // ...AND IT IS ONE OF OURS. Matched on the bare name, since the message may
  // carry it schema-qualified and quoted.
  return tables.length === 0 || tables.some((t) => new RegExp(`\\b${t}\\b`, 'i').test(m));
}

/** THE FUNCTION IS NOT THERE — and unlike a bare `does not exist`, this one
 *  can be said safely, because PostgREST NAMES WHAT IT LOOKED FOR:
 *
 *    Could not find the function public.foo without parameters in the
 *    schema cache                                               (PGRST202)
 *    function public.foo(jsonb, unknown) does not exist          (42883)
 *
 *  `isMissingTable` deliberately answers false for both — a missing function is
 *  a different migration from a missing table, and sending somebody to the
 *  register's bundle for it wastes the trip. That was right and it left the
 *  other half unanswered: a screen whose only read is an RPC got
 *  `Load failed: Could not find the function public.exportable_tables…` and no
 *  indication that a file exists which creates it. Reported from use
 *  (2026-09-22) on the Data Export screen, the day it shipped.
 *
 *  THE NAME IS REQUIRED, for the same reason it is on the table test: an error
 *  about somebody else's function is not this screen's bundle to run. */
export function isMissingFunction(e: unknown, ...fns: string[]): boolean {
  const m = errText(e);
  if (!m) return false;
  const aboutFunction = /could not find the function\b/i.test(m)
    || /\bfunction\s+[\w."]+\s*\([^)]*\)\s+does not exist/i.test(m);
  if (!aboutFunction) return false;
  return fns.length === 0 || fns.some((f) => new RegExp(`\\b${f}\\b`, 'i').test(m));
}

/** The database refused the read. Not a missing anything — a permission, and
 *  the fix is a grant rather than a migration. `errMsg()` in `supabase.ts`
 *  already rewrites this one for the reader; this recognises it so a screen
 *  does not offer a migration instead. */
export function isRefused(e: unknown): boolean {
  const m = errText(e);
  return /row-level security|permission denied|does not have permission|42501/i.test(m);
}

/** What to put on screen. ONE shape for every register that has a migration
 *  behind it, so the three cases cannot drift apart screen by screen:
 *
 *    the table is missing   → the migration, named, with its bundle
 *    the read was refused   → say so; a migration will not help
 *    anything else          → the error itself, verbatim
 *
 *  Verbatim matters on the third: the fault that prompted all this was
 *  readable in the original message (`column … does not exist`) and was hidden
 *  by a hint that overwrote it. */
export function loadFailure(
  e: unknown,
  opts: { tables: string[]; functions?: string[]; hint: string },
): string {
  if (isMissingTable(e, ...opts.tables)) return opts.hint;
  if (opts.functions?.length && isMissingFunction(e, ...opts.functions)) return opts.hint;
  if (isRefused(e)) return 'Your role does not have permission to read this.';
  return `Load failed: ${errText(e)}`;
}

// ===========================================================================
// WHAT AN EMPTY REGISTER-BACKED LIST IS ALLOWED TO CLAIM.
//
// Product Database 2.0 came back empty and the screen said "No machine appears
// in the warranty sale register, the contract register or the additional
// entries yet" — the strong claim, and the one thing an empty list cannot
// support. That view lists a machine only where a register row records BOTH a
// model and a serial (a machine is its model PLUS its serial; a serial-only key
// merges the eleven machines numbered 219 into one row), so an empty list is
// equally consistent with thousands of rows carrying a serial and no model.
// The two need OPPOSITE actions — load the registers, or fix the model column —
// so the screen asks the registers and reports what it measured.
//
// THE VERDICT LIVES HERE, NOT IN THE SCREEN, for the `paging.ts` reason: the
// module that fetches the counts reads `import.meta.env` and no node script can
// import it, so a decision left beside the fetch cannot be tested as behaviour.
// This one is pure, and `check:dberror` mutation-tests every branch.
//
// IT MAY ONLY CONCLUDE FROM AN EQUALITY. The counts are NULL-or-EMPTY, which is
// a LOWER bound on blank — a whitespace-only cell is blank to the view and
// counted as present here. `noModel === rows` therefore still PROVES no row in
// that register can be listed, while `noModel < rows` proves nothing in either
// direction and gets the numbers alone. The bound runs the safe way, and the
// verdict never leans on the side it can be wrong about.
// ===========================================================================

/** One register's counts. `rows === null` means it could not be counted at all. */
export type RegisterCount = {
  rows: number | null;
  noSerial: number | null;
  noModel: number | null;
  error?: string;
};

export type EmptyVerdict =
  /** The counts have not come back yet. */
  | 'counting'
  /** Not one register could be counted — so nothing at all may be said. */
  | 'uncountable'
  /** Every register that could be counted holds no rows. */
  | 'registers-empty'
  /** Every counted row records no serial, so no machine can be identified. */
  | 'no-serial'
  /** Every counted row records no model, so there is nothing to key on. */
  | 'no-model'
  /** Rows with both DO exist, so the emptiness is something else. */
  | 'elsewhere';

export function emptyRegisterVerdict(counts: RegisterCount[] | null): EmptyVerdict {
  if (counts === null) return 'counting';
  const counted = counts.filter((c) => c.rows !== null);
  if (counted.length === 0) return 'uncountable';
  const withRows = counted.filter((c) => (c.rows ?? 0) > 0);
  if (withRows.length === 0) return 'registers-empty';
  // Serial before model: where both are wholly blank both sentences are true,
  // and the serial is the more fundamental of the two to have lost.
  if (withRows.every((c) => c.noSerial === c.rows)) return 'no-serial';
  if (withRows.every((c) => c.noModel === c.rows)) return 'no-model';
  return 'elsewhere';
}
