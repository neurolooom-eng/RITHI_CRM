import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/ui';
import { listMasterLists, supabaseConfigured, type MasterList } from '../lib/supabase';
import { MASTER_LISTS, fallbackList } from './masterLists';
import { MasterListTable } from './MasterListTable';

// ===========================================================================
// One master's own screen (/masters/<key>) — the list as its own table.
// The database registry supplies the label, the entry name and any extra
// columns; until it is there (0021 unapplied), the built-in definition does.
// ===========================================================================

export function MasterListPage() {
  const { key = '' } = useParams();
  const def = MASTER_LISTS.find((l) => l.key === key);
  const [list, setList] = useState<MasterList>(() => fallbackList(key));

  useEffect(() => {
    setList(fallbackList(key));
    if (!supabaseConfigured()) return;
    let cancelled = false;
    void listMasterLists()
      .then((all) => { const found = all.find((l) => l.key === key); if (found && !cancelled) setList(found); })
      .catch(() => { /* no registry yet — the built-in definition stands */ });
    return () => { cancelled = true; };
  }, [key]);

  // An unknown key is not a screen — send it back to the overview.
  if (!def) return <Navigate to="/masters" replace />;

  return (
    <div>
      <PageHeader title={list.label} subtitle="Master value list — add and remove entries here." icon={def.icon} />
      <MasterListTable list={list} />
    </div>
  );
}
