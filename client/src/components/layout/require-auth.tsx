import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { FullScreenLoader } from './full-screen-loader';

export function RequireAuth() {
  const status = useAuth((state) => state.status);
  const user = useAuth((state) => state.user);
  const location = useLocation();

  if (status === 'loading') return <FullScreenLoader label="در حال بررسی نشست کاربر..." />;
  if (status === 'needs-setup') return <Navigate to="/setup" replace />;
  if (status === 'anon') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (user?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}
