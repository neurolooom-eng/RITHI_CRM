-- ===========================================================================
-- WHO IS HOLDING A LOCK? (2026-10-05) -- READ-ONLY.
--
-- Spare Requests reported "Load failed: canceling statement due to lock
-- timeout". A plain SELECT only waits when another session holds a STRONG lock
-- (an ALTER, a DROP/CREATE, a hand-run bundle left open) on a table it reads,
-- and it only gives up early when a lock_timeout applies to the reader. This
-- answers both, in ONE grid:
--   * kind = 'setting'   -- every lock_timeout / statement_timeout set on a
--                           role or the database (pg_db_role_setting);
--   * kind = 'holder'    -- every session holding a lock that blocks somebody,
--                           with how long it has held it and what it ran;
--   * kind = 'waiting'   -- every session waiting for a lock, and on what;
--   * kind = 'idle-in-tx'-- sessions idle inside an open transaction (a SQL
--                           editor tab that ran BEGIN and never COMMIT).
-- Run it in the SQL editor, or Actions -> Apply database migrations ->
-- mode: probe -> _who_holds_locks.sql.
-- ===========================================================================
with s as (
  select 'setting'::text as kind,
         coalesce(r.rolname, '(every role)') || ' @ ' || coalesce(d.datname, '(every database)') as who,
         x.cfg as detail, null::interval as for_how_long, ''::text as query
    from pg_db_role_setting rs
    left join pg_roles r on r.oid = rs.setrole
    left join pg_database d on d.oid = rs.setdatabase
    cross join lateral unnest(rs.setconfig) as x(cfg)
   where x.cfg ~* '^(lock_timeout|statement_timeout|idle_in_transaction_session_timeout)='
), w as (
  select a.pid, a.usename, a.application_name, a.state, a.query_start, a.xact_start, a.query,
         pg_blocking_pids(a.pid) as blockers
    from pg_stat_activity a
   where cardinality(pg_blocking_pids(a.pid)) > 0
), h as (
  select distinct b.pid
    from w cross join lateral unnest(w.blockers) as b(pid)
)
select * from s
union all
select 'holder', a.pid || ' ' || coalesce(a.usename, '') || ' ' || coalesce(a.application_name, ''),
       'state=' || coalesce(a.state, '') || ' locks=' || coalesce((
         select string_agg(distinct l.mode || ' on ' || coalesce(l.relation::regclass::text, l.locktype), ', ')
           from pg_locks l where l.pid = a.pid and l.granted and l.mode in ('AccessExclusiveLock', 'ExclusiveLock', 'ShareRowExclusiveLock', 'ShareLock')), ''),
       now() - a.xact_start, left(a.query, 300)
  from pg_stat_activity a join h on h.pid = a.pid
union all
select 'waiting', w.pid || ' ' || coalesce(w.usename, '') || ' ' || coalesce(w.application_name, ''),
       'blocked by ' || array_to_string(w.blockers, ','), now() - w.query_start, left(w.query, 300)
  from w
union all
select 'idle-in-tx', a.pid || ' ' || coalesce(a.usename, '') || ' ' || coalesce(a.application_name, ''),
       'idle in transaction', now() - a.xact_start, left(a.query, 300)
  from pg_stat_activity a
 where a.state like 'idle in transaction%'
order by 1, 4 desc nulls last;
