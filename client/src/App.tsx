import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { RequireAuth } from '@/components/layout/require-auth';
import { AppLayout } from '@/components/layout/app-layout';
import { LoginPage } from '@/features/auth/login-page';
import { SetupPage } from '@/features/auth/setup-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { UsersPage } from '@/features/users/users-page';
import { RolesPage } from '@/features/roles/roles-page';
import { AuditPage } from '@/features/audit/audit-page';
import { SettingsPage } from '@/features/settings/settings-page';
import { ProfilePage } from '@/features/profile/profile-page';
import { ChangePasswordPage } from '@/features/profile/change-password-page';
import { NotFoundPage } from '@/features/not-found-page';

export function App() {
  const initialize = useAuth((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="change-password" element={<ChangePasswordPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
