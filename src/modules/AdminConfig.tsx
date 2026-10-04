import { PageHeader } from '../components/ui/ui';
import { CallRegistrationCard } from './CallRegistrationCard';
import { AuditModeCard } from './AuditModeCard';
import { FrequentFailureCard } from './FrequentFailureCard';
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
//
// THE SLA TARGETS MOVED to Admin -> SLA / Objective Configuration (the user,
// 2026-10-04), beside the Product Failure rule, the other target the service
// is measured against.
// ===========================================================================

export function AdminConfig() {
  return (
    <div>
      <PageHeader
        title="Admin Config"
        subtitle="Bulk data loads, the Call Registration desk, the frequent-failure rule, and the two switches with their own permissions (Audit Mode, the Data Import panel). The SLA targets are on SLA / Objective Configuration."
        icon="🛠️"
      />

      <DataImport />
      <div style={{ height: 16 }} />
      <CallRegistrationCard />
      <div style={{ height: 16 }} />
      <FrequentFailureCard />
      <div style={{ height: 16 }} />
      <AuditModeCard />
    </div>
  );
}
