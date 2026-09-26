// ---------------------------------------------------------------------------
// THE SYSTEM COLUMNS (0244): sys_id, sys_created_by, sys_created_on,
// sys_updated_by, sys_updated_on -- on every table except the number counters,
// written by the DATABASE on every insert and update, never by this app.
//
// They arrive on every `select('*')`, so a screen that builds its columns from
// whatever keys a row carries would suddenly grow five -- two of them raw login
// ids. Such screens leave them out through this ONE test; Data Export keeps
// them, because a table export is meant to be the whole row.
// ---------------------------------------------------------------------------
export const SYS_COLUMNS = ['sys_id', 'sys_created_by', 'sys_created_on', 'sys_updated_by', 'sys_updated_on'] as const;

const SYS = new Set<string>(SYS_COLUMNS);

/** True for the five database-written system columns, and nothing else. */
export const isSysColumn = (k: string): boolean => SYS.has(k);
