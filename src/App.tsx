import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MODULES, moduleAction } from './lib/rbac';
import { AuthProvider, useAuth } from './lib/auth';
import { ThemeProvider } from './theme/ThemeProvider';
import { clearDemoData } from './lib/seed';
import { Layout } from './components/layout/Layout';
import { Login } from './modules/Login';
import { CrudModule } from './modules/CrudModule';
import { FieldCalls, InstallationCalls, PMCalls } from './modules/FieldCalls';
import { ProductMaster } from './modules/ProductMaster';
import { PartyMaster } from './modules/PartyMaster';
import { Reports } from './modules/Reports';
import { RolePermissions } from './modules/RolePermissions';
import { UserMasterView } from './modules/UserMasterView';
import { PendingRegistrations } from './modules/PendingRegistrations';
import { PendingCalls } from './modules/PendingCalls';
import { RequestCallRegistration } from './modules/RequestCallRegistration';
import { SpareRequests } from './modules/SpareRequests';
import { SpareConsumption } from './modules/SpareConsumption';
import { Dashboard } from './modules/Dashboard';
import { DailyCallReview } from './modules/DailyCallReview';
import { FieldFailureReport } from './modules/FieldFailureReport';
import { KpiAnalytics } from './modules/KpiAnalytics';
import { UserAccess } from './modules/UserAccess';
import { Settings } from './modules/Settings';
import { VersionHistory } from './modules/VersionHistory';
import { AdminConfig } from './modules/AdminConfig';
import {
  productConfig,
  partConfig,
  warrantyConfig,
  contractConfig,
  feedbackConfig,
} from './modules/schemas';

function Shell() {
  const { user, booting, can } = useAuth();
  const location = useLocation();
  useEffect(() => {
    if (user) clearDemoData(); // live data only — no dummy records
  }, [user]);

  // While a persisted Supabase session is being restored, don't flash the login.
  if (booting) return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: 'var(--muted, #888)' }}>Loading…</div>;
  if (!user) return <Login />;

  // RBAC route guard: a known module the role can't open is blocked (nav hides
  // it too). Unknown paths fall through to the routes / not-found.
  const known = MODULES.some((m) => m.path === location.pathname);
  if (known && !can(moduleAction(location.pathname))) {
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
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/daily-review" element={<DailyCallReview />} />
        <Route path="/parties" element={<PartyMaster />} />
        <Route path="/products" element={<CrudModule config={productConfig} />} />
        <Route path="/parts" element={<CrudModule config={partConfig} />} />
        <Route path="/warranties" element={<CrudModule config={warrantyConfig} />} />
        <Route path="/contracts" element={<CrudModule config={contractConfig} />} />
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
        <Route path="/spare-consumption" element={<SpareConsumption />} />
        <Route path="/feedback" element={<CrudModule config={feedbackConfig} />} />
        <Route path="/failure-report" element={<FieldFailureReport />} />
        <Route path="/kpi" element={<KpiAnalytics />} />
        <Route path="/users" element={<UserAccess />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/version-history" element={<VersionHistory />} />
        <Route path="/admin-config" element={<AdminConfig />} />
        <Route path="/roles" element={<RolePermissions />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <HashRouter>
          <Shell />
        </HashRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
