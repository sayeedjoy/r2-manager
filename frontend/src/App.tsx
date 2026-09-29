import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAuth } from "@/components/auth/require-auth";
import { HomePage } from "@/pages/home";
import { BrowserPage } from "@/pages/browser";
import { AccountPage } from "@/pages/account";
import { AdminUsersPage } from "@/pages/admin/users";
import { AdminSettingsPage } from "@/pages/admin/settings";
import { AdminEmailPage } from "@/pages/admin/email";
import { AdminAuditPage } from "@/pages/admin/audit";
import { AdminHealthPage } from "@/pages/admin/health";
import { NotFoundPage } from "@/pages/not-found";
import { LoginPage } from "@/pages/auth/login";
import { SetupPage } from "@/pages/auth/setup";
import { ForgotPasswordPage } from "@/pages/auth/forgot-password";
import { ResetPasswordPage } from "@/pages/auth/reset-password";
import { UploadQueuePanel } from "@/features/upload/upload-queue-panel";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Signed-out screens sit outside RequireAuth and AppShell, so they make no management API calls. */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="/b/:bucket/*" element={<BrowserPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
          <Route path="/admin/email" element={<AdminEmailPage />} />
          <Route path="/admin/audit" element={<AdminAuditPage />} />
          <Route path="/admin/health" element={<AdminHealthPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <UploadQueuePanel />
    </BrowserRouter>
  );
}

export default App;
