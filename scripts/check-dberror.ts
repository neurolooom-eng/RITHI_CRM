// ===========================================================================
// "IS THIS TABLE MISSING?" — the question, and the answers it must not give.
//
// A screen that offers a migration on any error containing "does not exist"
// sends somebody to re-run a bundle already applied. It happened: Stock Out
// told the user to run 0027 because a paged read ordered by a column the view
// calls something else, and PostgREST said `column … does not exist`.
//
// So the cases below are mostly NEGATIVE. A predicate like this is easy to get
// right on the case you wrote it for and wrong on everything else, and it is
// the everything else that reaches a user.
// ===========================================================================
import { isMissingTable, isMissingFunction, isRefused, loadFailure, errText,
         emptyRegisterVerdict, type RegisterCount } from '../src/lib/dberror';

let fail = 0;
const eq = (what: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail += 1; console.log(`  ✗ ${what}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
  else console.log(`  ✓ ${what}`);
};

console.log('\n-- a missing TABLE, which a migration really does fix --');
{
  // The two shapes PostgREST actually returns.
  eq('Postgres 42P01',
    isMissingTable('relation "public.spare_stock_out_lines" does not exist', 'spare_stock_out_lines'), true);
  eq('PostgREST schema cache (PGRST205)',
    isMissingTable("Could not find the table 'public.spare_stock_out_lines' in the schema cache", 'spare_stock_out_lines'), true);
  eq('...as an Error rather than a string',
    isMissingTable(new Error('relation "public.handstock_balance" does not exist'), 'handstock_balance'), true);
  eq('...as a PostgREST body object',
    isMissingTable({ message: 'relation "public.sla_rules" does not exist', code: '42P01' }, 'sla_rules'), true);
  eq('any of the names the screen reads will do',
    isMissingTable('relation "public.spare_dispatches" does not exist',
      'spare_stock_out_lines', 'spare_dispatches'), true);
}

console.log('\n-- THE CASE THAT CAUSED THIS: a missing COLUMN is not a missing table --');
{
  // Reported 2026-09-16. `listStockOutLines` ordered by `id`; the view renames
  // that column `line_id`. The register came back empty AND told the reader to
  // run a migration applied months earlier.
  eq('column … does not exist (42703)',
    isMissingTable('column spare_stock_out_lines.id does not exist', 'spare_stock_out_lines'), false);
  eq('PostgREST schema cache, column form (PGRST204)',
    isMissingTable("Could not find the 'id' column of 'spare_stock_out_lines' in the schema cache",
      'spare_stock_out_lines'), false);
  // The old test, written out, so the difference is on the record rather than
  // in a commit message.
  eq('...where the OLD regex said yes',
    /spare_stock_out_lines|does not exist|schema cache/i.test('column spare_stock_out_lines.id does not exist'), true);
}

console.log('\n-- and neither is a function, an operator, or a refusal --');
{
  eq('a missing function is a different migration',
    isMissingTable('function public.part_code(text) does not exist', 'spare_stock_out_lines'), false);
  eq('a missing operator is not a migration at all',
    isMissingTable('operator does not exist: text = integer', 'spare_stock_out_lines'), false);
  eq('row-level security is a GRANT, not a migration',
    isMissingTable('new row violates row-level security policy for table "spare_dispatches"',
      'spare_dispatches'), false);
  eq('...and is recognised as a refusal',
    isRefused('new row violates row-level security policy'), true);
  eq('permission denied likewise', isRefused('permission denied for table spare_dispatches'), true);
  eq('a missing table is NOT a refusal',
    isRefused('relation "public.x" does not exist'), false);
}

console.log('\n-- a MISSING FUNCTION can be named, because PostgREST names it --');
{
  // The exact body the Data Export screen came back with on 2026-09-22.
  const pgrst202 = 'Could not find the function public.exportable_tables without parameters in the schema cache';
  eq('PGRST202 is a missing function', isMissingFunction(pgrst202, 'exportable_tables'), true);
  eq('42883 is too',
    isMissingFunction('function public.imported_ts(jsonb, unknown) does not exist', 'imported_ts'), true);
  eq('somebody ELSE\u2019s function is not this screen\u2019s bundle',
    isMissingFunction(pgrst202, 'due_export_schedules'), false);
  // The two tests must not overlap: each names a DIFFERENT file to run, so a
  // message answering both would hand out whichever hint was asked first.
  eq('a missing TABLE is not a missing function',
    isMissingFunction('relation "public.export_schedules" does not exist', 'export_schedules'), false);
  eq('...and a missing FUNCTION is still not a missing table',
    isMissingTable(pgrst202, 'exportable_tables'), false);
  eq('a missing COLUMN is neither',
    isMissingFunction('column products.serial does not exist', 'products'), false);
  eq('an unrelated failure is neither', isMissingFunction('Failed to fetch', 'x'), false);
  eq('nothing in, nothing claimed', isMissingFunction(null, 'x'), false);

  // ...and the screen's message reaches the reader.
  eq('loadFailure names the bundle for a missing function',
    loadFailure(pgrst202, { tables: ['export_schedules'], functions: ['exportable_tables'],
                            hint: 'Run data_export.sql' }), 'Run data_export.sql');
  eq('...but only when the screen declared it',
    loadFailure(pgrst202, { tables: ['export_schedules'], hint: 'Run data_export.sql' }),
    `Load failed: ${pgrst202}`);
}

console.log('\n-- a missing table that is not THIS screen’s is not this screen’s hint --');
{
  // A hint that fires on any absent relation anywhere is the same over-firing
  // in a smaller size: it names the wrong bundle.
  eq('another table entirely',
    isMissingTable('relation "public.kb_articles" does not exist', 'spare_stock_out_lines'), false);
  eq('...unless the screen actually reads it',
    isMissingTable('relation "public.kb_articles" does not exist', 'kb_articles'), true);
}

console.log('\n-- nothing in, nothing claimed --');
{
  eq('empty', isMissingTable('', 'x'), false);
  eq('null', isMissingTable(null, 'x'), false);
  eq('undefined', isMissingTable(undefined, 'x'), false);
  eq('an unrelated network failure', isMissingTable('Failed to fetch', 'x'), false);
  eq('...and it is not read as a refusal either', isRefused('Failed to fetch'), false);
}

console.log('\n-- what the reader is told --');
{
  const opts = { tables: ['spare_stock_out_lines'], hint: 'Run 0027 (bundle: Spare_1.sql).' };
  eq('a missing table gets the migration',
    loadFailure('relation "public.spare_stock_out_lines" does not exist', opts), opts.hint);
  eq('a refusal gets a grant, not a migration',
    loadFailure('permission denied for table spare_stock_out_lines', opts),
    'Your role does not have permission to read this.');
  // VERBATIM, and that is the point: the fault that started this was readable
  // in the original message and was hidden by a hint that overwrote it.
  eq('anything else gets the error itself, unaltered',
    loadFailure('column spare_stock_out_lines.id does not exist', opts),
    'Load failed: column spare_stock_out_lines.id does not exist');
}

// ===========================================================================
// WHAT AN EMPTY LIST MAY CLAIM. Product Database 2.0 said "No machine appears
// in the warranty sale register, the contract register or the additional
// entries yet" over registers holding thousands of rows — it lists a machine
// only where a row records BOTH a model and a serial, and could say neither
// which of those was missing nor that anything was there at all.
//
// The cases that matter are the ones where the verdict must REFUSE to conclude:
// a count it could not take is not a zero, and a blank count SHORT of the total
// proves nothing, because the counts are NULL-or-EMPTY and a whitespace-only
// cell is blank to the view and present here.
// ===========================================================================
console.log('\n-- an empty register-backed list only claims what it measured --');
{
  const reg = (rows: number | null, noSerial: number | null, noModel: number | null,
               error?: string): RegisterCount => ({ rows, noSerial, noModel, ...(error ? { error } : {}) });

  eq('no counts yet', emptyRegisterVerdict(null), 'counting');

  // NOT "registers-empty". A register nobody may count is a register nobody
  // knows anything about, and a zero there would read as "it is empty".
  eq('nothing could be counted',
    emptyRegisterVerdict([reg(null, null, null, 'permission denied'),
                          reg(null, null, null, 'permission denied'),
                          reg(null, null, null, 'permission denied')]), 'uncountable');
  eq('...and one countable register is enough to judge on',
    emptyRegisterVerdict([reg(null, null, null, 'permission denied'),
                          reg(4182, 0, 4182), reg(null, null, null, 'nope')]), 'no-model');

  eq('every register is genuinely empty',
    emptyRegisterVerdict([reg(0, 0, 0), reg(0, 0, 0), reg(0, 0, 0)]), 'registers-empty');

  // The reported case: rows in quantity, every one of them without a model.
  eq('every row lacks a model',
    emptyRegisterVerdict([reg(19253, 0, 19253), reg(4182, 0, 4182), reg(0, 0, 0)]), 'no-model');
  eq('every row lacks a serial',
    emptyRegisterVerdict([reg(19253, 19253, 0), reg(4182, 4182, 0), reg(0, 0, 0)]), 'no-serial');
  eq('both wholly blank — the serial is the more fundamental to have lost',
    emptyRegisterVerdict([reg(19253, 19253, 19253)]), 'no-serial');

  // THE REFUSALS. One row short of the total is not "every row", and the bound
  // runs the safe way only while the verdict insists on the equality.
  eq('one register short of every row keeps the claim off the screen',
    emptyRegisterVerdict([reg(19253, 0, 19253), reg(4182, 0, 4181)]), 'elsewhere');
  eq('a single row with both recorded is enough to refuse',
    emptyRegisterVerdict([reg(1, 0, 0)]), 'elsewhere');
  // An EMPTY register must not veto a verdict the ones with rows support — it
  // has no rows to disagree with.
  eq('an empty register neither proves nor blocks',
    emptyRegisterVerdict([reg(0, 0, 0), reg(7, 0, 7)]), 'no-model');
}

console.log('\n-- errText reads every shape an error arrives in --');
{
  eq('string', errText('boom'), 'boom');
  eq('Error', errText(new Error('boom')), 'boom');
  eq('PostgREST body', errText({ message: 'boom' }), 'boom');
  eq('...or its details', errText({ details: 'boom' }), 'boom');
  eq('null', errText(null), '');
}

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);
