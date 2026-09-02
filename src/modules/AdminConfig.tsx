import { PageHeader } from '../components/ui/ui';
import { SlaRulesCard } from './SlaRulesCard';
import { DataImport } from './DataImport';

// ===========================================================================
// ADMIN CONFIG — what the app itself is configured with.
//
// This screen used to carry the CallReg SHEET LINKS and the MASTER VALUE LIST
// sources: which Google Sheet, tab and column each dropdown read from. Both are
// gone. The data lives in Supabase now, and every value list is maintained on
// its own screen under Master — so those panels pointed at sheets nothing reads
// any more, which is worse than absent: a stale setting invites someone to
// "fix" a dropdown by editing a link that has no effect.
//
// The sheet URL the bridge still uses (Drive uploads, and reads when Supabase
// is not connected) is in Settings, where the connection itself is set.
// ===========================================================================

export function AdminConfig() {
  return (
    <div>
      <PageHeader
        title="Admin Config"
        subtitle="Bulk data loads and the service-level targets."
        icon="🛠️"
      />

      <DataImport />
      <div style={{ height: 16 }} />
      <SlaRulesCard />
    </div>
  );
}
