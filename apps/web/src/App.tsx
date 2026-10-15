import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { isConfigured } from "./lib/supabase";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import {
  ConnectionErrorPage,
  ForgotPasswordPage,
  ForceChangePasswordPage,
  InactivePage,
  LoginPage,
  NotConfiguredPage,
  SetPasswordPage,
} from "./pages/AuthPages";
import { DashboardPage } from "./pages/DashboardPage";
import { CustomersPage } from "./pages/CustomersPage";
import { CustomerDetailPage } from "./pages/CustomerDetailPage";
import { CustomerFormPage } from "./pages/CustomerFormPage";
import { IssuesPage } from "./pages/IssuesPage";
import { IssueDetailPage } from "./pages/IssueDetailPage";
import { UsersPage } from "./pages/UsersPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, profileError, retryProfile } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (profileError) return <ConnectionErrorPage error={profileError} onRetry={retryProfile} />;
  if (!profile?.is_active) return <InactivePage />;
  if (profile.must_change_password) return <ForceChangePasswordPage />;
  return <>{children}</>;
}

export function App() {
  if (!isConfigured) return <NotConfiguredPage />;
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/new" element={<CustomerFormPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="customers/:id/edit" element={<CustomerFormPage />} />
        <Route path="issues" element={<IssuesPage />} />
        <Route path="issues/:issueNo" element={<IssueDetailPage />} />
        <Route path="settings/users" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
