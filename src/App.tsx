import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ThemeProvider } from './theme/ThemeProvider';
import { seedDemoData } from './lib/seed';
import { Layout } from './components/layout/Layout';
import { Login } from './modules/Login';
import { CrudModule } from './modules/CrudModule';
import { BillingModule } from './modules/BillingModule';
import { Dashboard } from './modules/Dashboard';
import { DailyCallReview } from './modules/DailyCallReview';
import { FieldFailureReport } from './modules/FieldFailureReport';
import { KpiAnalytics } from './modules/KpiAnalytics';
import { UsersAdmin } from './modules/UsersAdmin';
import { Settings } from './modules/Settings';
import {
  partyConfig,
  productConfig,
  partConfig,
  warrantyConfig,
  contractConfig,
  installationConfig,
  pmConfig,
  breakdownConfig,
  spareRequestConfig,
  spareConsumptionConfig,
  feedbackConfig,
} from './modules/schemas';

function Shell() {
  const { user } = useAuth();
  useEffect(() => {
    if (user) seedDemoData();
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
        <Route path="/installations" element={<CrudModule config={installationConfig} />} />
        <Route path="/pm-calls" element={<CrudModule config={pmConfig} />} />
        <Route path="/breakdowns" element={<CrudModule config={breakdownConfig} />} />
        <Route path="/spare-requests" element={<CrudModule config={spareRequestConfig} />} />
        <Route path="/spare-consumption" element={<CrudModule config={spareConsumptionConfig} />} />
        <Route path="/quotes" element={<BillingModule kind="quote" />} />
        <Route path="/invoices" element={<BillingModule kind="invoice" />} />
        <Route path="/feedback" element={<CrudModule config={feedbackConfig} />} />
        <Route path="/failure-report" element={<FieldFailureReport />} />
        <Route path="/kpi" element={<KpiAnalytics />} />
        <Route path="/users" element={<UsersAdmin />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
