import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ThemeProvider } from './theme/ThemeProvider';
import { clearDemoData } from './lib/seed';
import { Layout } from './components/layout/Layout';
import { Login } from './modules/Login';
import { CrudModule } from './modules/CrudModule';
import { FieldCalls, InstallationCalls } from './modules/FieldCalls';
import { ProductMaster } from './modules/ProductMaster';
import { UserMasterView } from './modules/UserMasterView';
import { PendingRegistrations } from './modules/PendingRegistrations';
import { RequestCallRegistration } from './modules/RequestCallRegistration';
import { SpareRequests } from './modules/SpareRequests';
import { Dashboard } from './modules/Dashboard';
import { DailyCallReview } from './modules/DailyCallReview';
import { FieldFailureReport } from './modules/FieldFailureReport';
import { KpiAnalytics } from './modules/KpiAnalytics';
import { UsersAdmin } from './modules/UsersAdmin';
import { Settings } from './modules/Settings';
import { VersionHistory } from './modules/VersionHistory';
import { AdminConfig } from './modules/AdminConfig';
import {
  partyConfig,
  productConfig,
  partConfig,
  warrantyConfig,
  contractConfig,
  pmConfig,
  spareConsumptionConfig,
  feedbackConfig,
} from './modules/schemas';

function Shell() {
  const { user } = useAuth();
  useEffect(() => {
    if (user) clearDemoData(); // live data only — no dummy records
  }, [user]);

  if (!user) return <Login />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/daily-review" element={<DailyCallReview />} />
        <Route path="/parties" element={<CrudModule config={partyConfig} />} />
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
        <Route path="/pm-calls" element={<CrudModule config={pmConfig} />} />
        {/* Breakdown calls are the same as the Field Call Register */}
        <Route path="/breakdowns" element={<Navigate to="/field-calls" replace />} />
        <Route path="/spare-requests" element={<SpareRequests />} />
        <Route path="/spare-consumption" element={<CrudModule config={spareConsumptionConfig} />} />
        <Route path="/feedback" element={<CrudModule config={feedbackConfig} />} />
        <Route path="/failure-report" element={<FieldFailureReport />} />
        <Route path="/kpi" element={<KpiAnalytics />} />
        <Route path="/users" element={<UsersAdmin />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/version-history" element={<VersionHistory />} />
        <Route path="/admin-config" element={<AdminConfig />} />
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
