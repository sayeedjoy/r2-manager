import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { HomePage } from "@/pages/home";
import { BrowserPage } from "@/pages/browser";
import { InboxPage } from "@/pages/inbox";
import { AdminUsersPage } from "@/pages/admin/users";
import { AdminSettingsPage } from "@/pages/admin/settings";
import { AdminAuditPage } from "@/pages/admin/audit";
import { AdminHealthPage } from "@/pages/admin/health";
import { NotFoundPage } from "@/pages/not-found";
import { SignedOutPage } from "@/pages/signed-out";
import { UploadQueuePanel } from "@/features/upload/upload-queue-panel";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/signed-out" element={<SignedOutPage />} />
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="/b/:bucket/*" element={<BrowserPage />} />
          <Route path="/mail" element={<InboxPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
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
