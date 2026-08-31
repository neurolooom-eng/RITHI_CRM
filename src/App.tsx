import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MODULES, actionForPath } from './lib/rbac';
import { AuthProvider, useAuth } from './lib/auth';
import { ThemeProvider } from './theme/ThemeProvider';
import { clearDemoData } from './lib/seed';
import { Layout } from './components/layout/Layout';
import { Login } from './modules/Login';
import { ResetPassword } from './modules/ResetPassword';
import { CrudModule } from './modules/CrudModule';
import { FieldCalls, InstallationCalls, PMCalls } from './modules/FieldCalls';
import { ProductMaster } from './modules/ProductMaster';
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
import { SpareDispatch } from './modules/SpareDispatch';
import { DeliveryChallan } from './modules/DeliveryChallan';
import { Declaration } from './modules/Declaration';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SpareConsumption } from './modules/SpareConsumption';
import { HandStock } from './modules/HandStock';
import { MaterialReturns } from './modules/MaterialReturns';
import { StockTransfer } from './modules/StockTransfer';
import { Dashboard } from './modules/Dashboard';
import { DailyCallReview } from './modules/DailyCallReview';
import { FieldFailureReport } from './modules/FieldFailureReport';
import { KpiAnalytics } from './modules/KpiAnalytics';
// User Access folded into User Master; /users now redirects there.
import { Settings } from './modules/Settings';
import { Profile } from './modules/Profile';
import { VersionHistory } from './modules/VersionHistory';
import { KnowledgeBase } from './modules/KnowledgeBase';
import { AdminConfig } from './modules/AdminConfig';
import { productConfig } from './modules/schemas';
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

  // The challan and the declaration print on their own: no sidebar, no header,
  // nothing that would land on the paper. Their rows are RLS-scoped, so a stock
  // out the user may not see simply is not found.
  if (location.pathname.startsWith('/dc/') || location.pathname.startsWith('/declaration/')) {
    return (
      <ErrorBoundary where="printable document">
        <Routes>
          <Route path="/dc/:stockOut" element={<DeliveryChallan />} />
          <Route path="/declaration/:stockOut" element={<Declaration />} />
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
        <Route path="/daily-review" element={<DailyCallReview />} />
        <Route path="/parties" element={<PartyMaster />} />
        <Route path="/products" element={<CrudModule config={productConfig} />} />
        <Route path="/parts" element={<PartMaster />} />
        <Route path="/masters" element={<AllMasters />} />
        <Route path="/masters/:key" element={<MasterListPage />} />
        <Route path="/warranties" element={<WarrantyRegister />} />
        <Route path="/contracts" element={<ContractRegister />} />
        <Route path="/field-calls" element={<FieldCalls />} />
        <Route path="/installations" element={<InstallationCalls />} />
        {/* Call updation is not a separate view — it's call reporting, done via
            the "Update Call" action on each Field / Installation call. */}
        <Route path="/call-updation" element={<Navigate to="/field-calls" replace />} />
        <Route path="/request-registration" element={<RequestCallRegistration />} />
        <Route path="/pending-registrations" element={<PendingRegistrations />} />
        <Route path="/product-master" element={<ProductMaster />} />
        <Route path="/user-master" element={<UserMasterView />} />
        <Route path="/pm-calls" element={<PMCalls />} />
        <Route path="/pending-calls" element={<PendingCalls />} />
        <Route path="/reports" element={<Reports />} />
        {/* Breakdown calls are the same as the Field Call Register */}
        <Route path="/breakdowns" element={<Navigate to="/field-calls" replace />} />
        <Route path="/spare-requests" element={<SpareRequests />} />
        <Route path="/spare-dispatch" element={<SpareDispatch />} />
        <Route path="/spare-consumption" element={<SpareConsumption />} />
        <Route path="/handstock" element={<HandStock />} />
        <Route path="/mrn" element={<MaterialReturns />} />
        <Route path="/stock-transfer" element={<StockTransfer />} />
        <Route path="/feedback" element={<CustomerFeedback />} />
        <Route path="/failure-report" element={<FieldFailureReport />} />
        <Route path="/kpi" element={<KpiAnalytics />} />
        <Route path="/users" element={<Navigate to="/user-master" replace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/version-history" element={<VersionHistory />} />
        <Route path="/knowledge-base" element={<KnowledgeBase />} />
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
          </ErrorBoundary>
        </HashRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
