// ===========================================================================
// READING A WHOLE TABLE FOR DATA EXPORT (D-018 / D-065).
//
// Data Export read each table as `select('*').range(a, b)` with NO ORDER, and
// stopped at 200,000 rows without a word. Both are the faults `paging.ts`
// exists to prevent: unordered pages can overlap, so a row is doubled or
// dropped while the file looks complete; and a cap nobody mentions turns
// "the table" into "the first 200,000 rows of it" in a file that says neither.
//
// WHICH ORDER. The picker offers ~140 relations — tables, views and one
// materialised view — and the screen does not know which are which, so the
// key is chosen from the columns the first row actually carries:
//   * `sys_id` — every table except the number counters has it (0244), a
//     random uuid per row, so it is unique across tables too;
//   * else `id` — the synthetic key most tables were created with;
//   * else NOTHING UNIQUE IS KNOWN: about 35 relations have neither (the
//     report views — call_report, consumption_report, kpi_field_inst … — and
//     the eleven counter tables). There the order is every column the first
//     row carries, which is a total order over every row that is not an exact
//     duplicate of another (and an exact duplicate is the same text either
//     way round).
// The remaining columns follow the key as tie-breakers in every case: a view
// that joins one row to several repeats that row's `sys_id`, and the tie-break
// keeps the pages from trading its copies. On a unique key Postgres never
// compares past the first column, so the extra keys cost nothing there.
//
// A COLUMN PostgREST CANNOT ORDER BY is left out of the tie-break: a name with
// punctuation (`Part (code|description)`) does not survive its `order=`
// parameter, and an object value is JSON whose type the screen cannot see.
// Spaces are fine — `listConsumptionReport` orders by 'Line ID'.
//
// No imports: `supabase.ts` reads `import.meta.env`, and this is meant to be
// run by `check:ui` as behaviour, not matched as text.
// ===========================================================================

export const TABLE_EXPORT_CAP = 200000;

const ORDERABLE_NAME = /^[A-Za-z_][A-Za-z0-9_ ]*$/;

/** The ORDER BY for one table's export, chosen from a sample row. */
export function exportOrderKeys(sample: Record<string, unknown> | null | undefined): string[] {
  if (!sample) return [];
  const cols = Object.keys(sample).filter((k) => ORDERABLE_NAME.test(k)
    && !(sample[k] !== null && typeof sample[k] === 'object'));
  const key = cols.includes('sys_id') ? 'sys_id' : cols.includes('id') ? 'id' : null;
  return key ? [key, ...cols.filter((c) => c !== key)] : cols;
}

type Page<T> = PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>;

/** Every row of one table, in a stable order, and whether it hit the cap.
 *  `probe` reads one row (to learn the columns); `page(order, from, to)` reads
 *  one range ordered by `order`. Asks for ONE ROW PAST the cap, so a table of
 *  exactly the cap is not reported as cut short. Throws on any failed page —
 *  a partial table is never handed back as the whole of it. */
export async function readTableForExport<T extends Record<string, unknown>>(
  probe: () => Page<T>,
  page: (order: string[], from: number, to: number) => Page<T>,
  cap = TABLE_EXPORT_CAP,
): Promise<{ rows: T[]; capped: boolean; order: string[] }> {
  const first = await probe();
  if (first.error) throw new Error(first.error.message ?? 'Unknown error');
  const sample = (first.data ?? [])[0];
  if (!sample) return { rows: [], capped: false, order: [] };
  const order = exportOrderKeys(sample);
  const want = cap + 1;
  const out: T[] = [];
  for (let from = 0; from < want; from += 1000) {
    const { data, error } = await page(order, from, Math.min(from + 1000, want) - 1);
    if (error) throw new Error(error.message ?? 'Unknown error');
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < Math.min(1000, want - from)) break;
  }
  const capped = out.length > cap;
  return { rows: capped ? out.slice(0, cap) : out, capped, order };
}
