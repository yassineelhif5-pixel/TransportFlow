import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { BrandMark } from '@/components/BrandMark';

/** Protège les routes d'administration : non connecté → /login, rôle ≠ ADMIN → /forbidden. */
export function ProtectedRoute() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center bg-bg" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-4">
          <BrandMark className="h-10 w-10 animate-pulse2" />
          <span className="text-sm text-muted">Ouverture de votre session…</span>
        </div>
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (user?.role !== 'ADMIN') return <Navigate to="/forbidden" replace />;

  if (user.mustChangePassword && location.pathname !== '/profile') {
    return <Navigate to="/profile" replace state={{ forcePasswordChange: true }} />;
  }

  return <Outlet />;
}
