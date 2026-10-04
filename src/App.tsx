import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MODULES, actionForPath } from './lib/rbac';
import { AuthProvider, useAuth } from './lib/auth';
import { ThemeProvider } from './theme/ThemeProvider';
import { clearDemoData } from './lib/seed';
import { Layout } from './components/layout/Layout';
import { ExportChooser } from './components/ui/ExportChooser';
import { Login } from './modules/Login';
import { UnresolvedLogin } from './modules/UnresolvedLogin';
import { ResetPassword } from './modules/ResetPassword';
import { FieldCalls, InstallationCalls, PMCalls } from './modules/FieldCalls';
import { ProductMaster } from './modules/ProductMaster';
import { ProductDatabase2 } from './modules/ProductDatabase2';
import { ProductLines } from './modules/ProductLines';
import { Lookup } from './modules/Lookup';
import { PartyMaster } from './modules/PartyMaster';
import { PartMaster } from './modules/PartMaster';
import { AllMasters } from './modules/AllMasters';
import { MasterListPage } from './modules/MasterListPage';
import { Reports } from './modules/Reports';
import { RolePermissions } from './modules/RolePermissions';
import { AuditLog } from './modules/AuditLog';
import { UserMasterView } from './modules/UserMasterView';
import { PendingRegistrations } from './modules/PendingRegistrations';
import { PendingCalls } from './modules/PendingCalls';
import { RequestCallRegistration } from './modules/RequestCallRegistration';
import { SpareRequests } from './modules/SpareRequests';
import { SpareRmApproval } from './modules/SpareRmApproval';
import { SpareDispatch } from './modules/SpareDispatch';
import { StockOut } from './modules/StockOut';
import { FieldFailureReportPrint } from './modules/FieldFailureReportPrint';
import { IndoorPdtPrint } from './modules/IndoorPdtPrint';
import { IndoorRegisterPrint } from './modules/IndoorRegisterPrint';
import { IndoorDcPrint } from './modules/IndoorDcPrint';
import { IndoorDcApprovals } from './modules/IndoorDcPanel';
import { MtnPrint } from './modules/MtnPrint';
import { MrnPrint } from './modules/MrnPrint';
import { DeliveryChallan } from './modules/DeliveryChallan';
import { Declaration } from './modules/Declaration';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SpareConsumption } from './modules/SpareConsumption';
import { HandStock } from './modules/HandStock';
import { MaterialReturns } from './modules/MaterialReturns';
import { StockTransfer } from './modules/StockTransfer';
import { Dashboard } from './modules/Dashboard';
import { DailyCallReview } from './modules/DailyCallReview';
import { CallReview } from './modules/CallReview';
import { FieldFailureReport } from './modules/FieldFailureReport';
import { KpiAnalytics } from './modules/KpiAnalytics';
import { Objective } from './modules/Objective';
import { MachineHistory } from './modules/MachineHistory';
import { PartSearch } from './modules/PartSearch';
import { SolvedWithoutReport } from './modules/SolvedWithoutReport';
import { DeviceCacheStatus } from './modules/DeviceCacheStatus';
import { HandStockReport } from './modules/HandStockReport';
import { FeedbackWithoutReport } from './modules/FeedbackWithoutReport';
import { InstallCallsUnmapped } from './modules/InstallCallsUnmapped';
import { ReportsHub } from './modules/ReportsHub';
import { SpareInsights } from './modules/SpareInsights';
import { Workload } from './modules/Workload';
import { ProductFailureAnalysis } from './modules/ProductFailureAnalysis';
import { IndoorService } from './modules/IndoorService';
import { Tracker } from './modules/Tracker';
// User Access folded into User Master; /users now redirects there.
import { Settings } from './modules/Settings';
import { Profile } from './modules/Profile';
import { VersionHistory } from './modules/VersionHistory';
import { HowRithiFunctions } from './modules/HowRithiFunctions';
import { HowToUse } from './modules/HowToUse';
import { KnowledgeBase } from './modules/KnowledgeBase';
import { ServiceManuals, QmsDocuments, ServiceNotes } from './modules/DocumentLibrary';
import { Training } from './modules/Training';
import { ReportMapping } from './modules/ReportMapping';
import DataExport from './modules/DataExport';
import { BulkUploads } from './modules/BulkUploads';
import { OwnershipTransfer } from './modules/OwnershipTransfer';
import { PmBulkUpload } from './modules/PmBulkUpload';
import { SoftwareValidation } from './modules/SoftwareValidation';
import { AdminConfig } from './modules/AdminConfig';
import { WarrantyRegister, ContractRegister } from './modules/CoverRegister';
import { CustomerFeedback } from './modules/CustomerFeedback';

function Shell() {
  const { user, booting, can, recovering } = useAuth();
  const location = useLocation();
  useEffect(() => {
    if (user) clearDemoData(); // live data only — no dummy records
  }, [user]);

  // While a persisted Supabase session is being restored, don't flash the login.
  if (booting) return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: 'var(--muted, #888)' }}>Loading…</div>;
  // Arrived on a password-reset link: choose the new password before anything
  // else (the recovery session is signed in, so this comes before the app).
  if (recovering) return <ResetPassword />;
  if (!user) return <Login />;
  // A LOGIN NOBODY HAS SET UP SEES ONE PAGE, and it says so (D-074,
  // FRS-210.5). It stays signed in -- it did authenticate -- but it holds no
  // permission here or in the database (0300), so the app would be a menu of
  // locked doors; this tells them the one thing they can act on.
  if (user.unresolved) return <UnresolvedLogin />;

  // The challan and the declaration print on their own: no sidebar, no header,
  // nothing that would land on the paper. Their rows are RLS-scoped, so a stock
  // out the user may not see simply is not found.
  if (location.pathname.startsWith('/dc/') || location.pathname.startsWith('/declaration/')
      || location.pathname.startsWith('/ffr/')
      || location.pathname.startsWith('/indoor-pdt/') || location.pathname.startsWith('/indoor-register/')
      || location.pathname.startsWith('/indoor-dc/')
      || location.pathname.startsWith('/mtn/') || location.pathname.startsWith('/mrn-print/')) {
    // THE PRINTED REPORT ANSWERS TO THE REGISTER'S OWN KEY (D-026). It used to
    // be reachable by URL by anybody signed in, so a role without the Field
    // Failure Register read every report row-level security let it see. The
    // register and the desk inside it are the only places that link here.
    if (location.pathname.startsWith('/ffr/') && !can(actionForPath('/failure-report'))) {
      return (
        <div style={{ padding: 32 }} className="muted">
          🔒 You don’t have access to the Field Failure Register. Ask an administrator to grant it in <b>Roles &amp; Permissions</b>.
        </div>
      );
    }
    // THE TWO INDOOR SERVICE RECORDS (R/SER/QC/007, R/SER/07) answer to the
    // Indoor Service Register's own key, as the FFR answers to its register's
    // (D-026). The register print also asks export.data, on its own page.
    // THE INDOOR DC IS NOT AMONG THEM since 0327: the person the User Master
    // names as its AUTHORISED BY reads it whatever their role, and row-level
    // security shows a reader nothing else -- a DC they may not see is simply
    // not found.
    if ((location.pathname.startsWith('/indoor-pdt/') || location.pathname.startsWith('/indoor-register/'))
        && !can(actionForPath('/indoor'))) {
      return (
        <div style={{ padding: 32 }} className="muted">
          🔒 You don’t have access to the Indoor Service Register. Ask an administrator to grant it in <b>Roles &amp; Permissions</b>.
        </div>
      );
    }
    // THE TWO STORES RECORDS (MTN R/SER/STR/003, MRN R/SER/STR/002) answer to
    // the key of the screen that prints them, as the indoor records do.
    if (location.pathname.startsWith('/mtn/') && !can(actionForPath('/stock-transfer'))) {
      return (
        <div style={{ padding: 32 }} className="muted">
          🔒 You don’t have access to Stock Transfer. Ask an administrator to grant it in <b>Roles &amp; Permissions</b>.
        </div>
      );
    }
    if (location.pathname.startsWith('/mrn-print/') && !can(actionForPath('/mrn'))) {
      return (
        <div style={{ padding: 32 }} className="muted">
          🔒 You don’t have access to Material Returns (MRN). Ask an administrator to grant it in <b>Roles &amp; Permissions</b>.
        </div>
      );
    }
    return (
      <ErrorBoundary where="printable document">
        <Routes>
          <Route path="/dc/:stockOut" element={<DeliveryChallan />} />
          <Route path="/declaration/:stockOut" element={<Declaration />} />
          {/* The Field Failure Report prints the same way — its own route, no
              chrome, one Print button. Its row is RLS-scoped, so a report the
              reader may not see is simply not found. */}
          <Route path="/ffr/:ffrNo" element={<FieldFailureReportPrint />} />
          <Route path="/indoor-pdt/:jobId" element={<IndoorPdtPrint />} />
          <Route path="/indoor-register/:sheet" element={<IndoorRegisterPrint />} />
          {/* Indoor_DC (0321), and the two stores records. */}
          <Route path="/indoor-dc/:dcNo" element={<IndoorDcPrint />} />
          <Route path="/mtn/:uid" element={<MtnPrint />} />
          <Route path="/mrn-print/:uid" element={<MrnPrint />} />
        </Routes>
      </ErrorBoundary>
    );
  }

  // RBAC route guard: a known module the role can't open is blocked (nav hides
  // it too). Unknown paths fall through to the routes / not-found.
  // Every /masters/<key> screen is the All Masters module (see actionForPath).
  const known = MODULES.some((m) => m.path === location.pathname)
    || location.pathname.startsWith('/masters/');
  if (known && !can(actionForPath(location.pathname))) {
    return (
      <Layout>
        <div style={{ padding: 32 }} className="muted">
          🔒 You don’t have access to this module. Ask an administrator to grant it in <b>Roles &amp; Permissions</b>.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* One screen failing must not blank the whole app — without this a
          render error unmounts everything and the page just goes white. */}
      <ErrorBoundary where={location.pathname}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        {/* NOT A MODULE (0327): the Indoor DCs naming the reader as AUTHORISED
            BY, opened from My Workload by someone whose role cannot open
            Indoor Service. Row-level security is what limits it. */}
        <Route path="/indoor-dc-approvals" element={<IndoorDcApprovals />} />
        <Route path="/daily-review" element={<DailyCallReview />} />
        <Route path="/call-review" element={<CallReview />} />
        <Route path="/parties" element={<PartyMaster />} />
        <Route path="/parts" element={<PartMaster />} />
        <Route path="/masters" element={<AllMasters />} />
        <Route path="/masters/:key" element={<MasterListPage />} />
        <Route path="/report-mapping" element={<ReportMapping />} />
        <Route path="/data-export" element={<DataExport />} />
        <Route path="/bulk-uploads" element={<BulkUploads />} />
        <Route path="/ownership-transfer" element={<OwnershipTransfer />} />
        <Route path="/service-manuals" element={<ServiceManuals />} />
        <Route path="/service-manuals/notes" element={<ServiceNotes />} />
        <Route path="/qms" element={<QmsDocuments />} />
        <Route path="/training" element={<Training />} />
        <Route path="/warranties" element={<WarrantyRegister />} />
        <Route path="/contracts" element={<ContractRegister />} />
        <Route path="/field-calls" element={<FieldCalls />} />
        <Route path="/installations" element={<InstallationCalls />} />
        {/* Call updation is not a separate view — it's call reporting, done via
            the "Update Call" action on each Field / Installation call. */}
        <Route path="/call-updation" element={<Navigate to="/field-calls" replace />} />
        <Route path="/request-registration" element={<RequestCallRegistration />} />
        <Route path="/pending-registrations" element={<PendingRegistrations />} />
        <Route path="/product-database" element={<ProductMaster />} />
        <Route path="/product-database-2" element={<ProductDatabase2 />} />
        <Route path="/product-master" element={<ProductLines />} />
        <Route path="/lookup" element={<Lookup />} />
        <Route path="/user-master" element={<UserMasterView />} />
        <Route path="/pm-calls" element={<PMCalls />} />
        <Route path="/pending-calls" element={<PendingCalls />} />
        <Route path="/reports" element={<Reports />} />
        {/* Breakdown calls are the same as the Field Call Register */}
        <Route path="/breakdowns" element={<Navigate to="/field-calls" replace />} />
        <Route path="/spare-requests" element={<SpareRequests />} />
        <Route path="/spare-rm-approval" element={<SpareRmApproval />} />
        <Route path="/spare-dispatch" element={<SpareDispatch />} />
        <Route path="/stock-out" element={<StockOut />} />
        <Route path="/spare-consumption" element={<SpareConsumption />} />
        <Route path="/handstock" element={<HandStock />} />
        <Route path="/mrn" element={<MaterialReturns />} />
        <Route path="/stock-transfer" element={<StockTransfer />} />
        <Route path="/feedback" element={<CustomerFeedback />} />
        <Route path="/failure-report" element={<FieldFailureReport />} />
        <Route path="/kpi" element={<KpiAnalytics />} />
        <Route path="/objective" element={<Objective />} />
        <Route path="/workload" element={<Workload />} />
        <Route path="/product-failure" element={<ProductFailureAnalysis />} />
        {/* The address it shipped at yesterday. A renamed screen must not turn
            somebody's bookmark into a blank page. */}
        <Route path="/dccr-insights" element={<Navigate to="/product-failure" replace />} />
        <Route path="/spare-insights" element={<SpareInsights />} />
        <Route path="/machine-history" element={<MachineHistory />} />
        <Route path="/part-search" element={<PartSearch />} />
        <Route path="/exports" element={<ReportsHub />} />
        {/* One page, one tab per report — so the menu can name each report
            instead of hiding it behind a tab strip. */}
        <Route path="/exports/:tab" element={<ReportsHub />} />
        <Route path="/indoor" element={<IndoorService />} />
        <Route path="/missing-visit-reports" element={<SolvedWithoutReport />} />
        <Route path="/device-cache" element={<DeviceCacheStatus />} />
        <Route path="/handstock-report" element={<HandStockReport />} />
        <Route path="/feedback-without-report" element={<FeedbackWithoutReport />} />
        <Route path="/install-calls-unmapped" element={<InstallCallsUnmapped />} />
        <Route path="/tracker" element={<Tracker />} />
        <Route path="/users" element={<Navigate to="/user-master" replace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/version-history" element={<VersionHistory />} />
        <Route path="/knowledge-base/how-to" element={<HowToUse />} />
        {/* HOW RITHI FUNCTIONS — the third Knowledge Base topic. Not a module
            and not permission-gated, like the other two help pages: a page
            explaining how the system works is of most use to whoever has just
            been refused something by it. */}
        <Route path="/knowledge-base/how-it-works" element={<HowRithiFunctions />} />
        <Route path="/knowledge-base" element={<KnowledgeBase />} />
        <Route path="/pm-bulk-upload" element={<PmBulkUpload />} />
        <Route path="/software-validation" element={<SoftwareValidation />} />
        <Route path="/admin-config" element={<AdminConfig />} />
        <Route path="/roles" element={<RolePermissions />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
    </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <HashRouter>
          <ErrorBoundary>
            <Shell />
            <ExportChooser />
          </ErrorBoundary>
        </HashRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
