import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { AdminLayout } from '@/layouts/AdminLayout';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Controls';
import { EmptyState, Skeleton } from '@/components/ui/Display';
import LoginPage from '@/pages/LoginPage';

// Découpage par écran : chaque module est chargé à la demande.
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const MissionsListPage = lazy(() => import('@/pages/missions/MissionsListPage'));
const MissionFormPage = lazy(() => import('@/pages/missions/MissionFormPage'));
const MissionDetailPage = lazy(() => import('@/pages/missions/MissionDetailPage'));
const ReferencesPage = lazy(() => import('@/pages/references/ReferencesPage'));
const DriversPage = lazy(() => import('@/pages/drivers/DriversPages').then((m) => ({ default: m.DriversPage })));
const DriverDetailPage = lazy(() => import('@/pages/drivers/DriversPages').then((m) => ({ default: m.DriverDetailPage })));
const ClientsPage = lazy(() => import('@/pages/referentials/ClientsVehiclesPages').then((m) => ({ default: m.ClientsPage })));
const ClientDetailPage = lazy(() => import('@/pages/referentials/ClientsVehiclesPages').then((m) => ({ default: m.ClientDetailPage })));
const VehiclesPage = lazy(() => import('@/pages/referentials/ClientsVehiclesPages').then((m) => ({ default: m.VehiclesPage })));
const VehicleDetailPage = lazy(() => import('@/pages/referentials/ClientsVehiclesPages').then((m) => ({ default: m.VehicleDetailPage })));
const DocumentsPage = lazy(() => import('@/pages/TrackingPages').then((m) => ({ default: m.DocumentsPage })));
const HistoryPage = lazy(() => import('@/pages/TrackingPages').then((m) => ({ default: m.HistoryPage })));
const NotificationsPage = lazy(() => import('@/pages/TrackingPages').then((m) => ({ default: m.NotificationsPage })));
const UsersPage = lazy(() => import('@/pages/AdminPages').then((m) => ({ default: m.UsersPage })));
const ProfilePage = lazy(() => import('@/pages/AdminPages').then((m) => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import('@/pages/AdminPages').then((m) => ({ default: m.SettingsPage })));

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="mt-6 h-72" />
    </div>
  );
}

function NotFound() {
  const navigate = useNavigate();
  return <EmptyState title="Page introuvable" description="L'adresse demandée n'existe pas." action={<Button onClick={() => navigate('/dashboard')}>Retour au tableau de bord</Button>} />;
}

function Forbidden() {
  const { logout } = useAuth();
  return (
    <div className="grid min-h-screen place-items-center bg-bg px-6">
      <EmptyState icon={<ShieldX className="h-5 w-5 text-stop" />} title="Accès réservé aux administrateurs"
        description="Votre compte n'a pas accès à l'administration. Les chauffeurs utilisent l'application mobile."
        action={<Button variant="secondary" onClick={() => logout()}>Se déconnecter</Button>} />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forbidden" element={<Forbidden />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          {[
            ['/dashboard', <DashboardPage />],
            ['/missions', <MissionsListPage />],
            ['/missions/new', <MissionFormPage />],
            ['/missions/:id', <MissionDetailPage />],
            ['/missions/:id/edit', <MissionFormPage />],
            ['/references', <ReferencesPage />],
            ['/drivers', <DriversPage />],
            ['/drivers/:id', <DriverDetailPage />],
            ['/clients', <ClientsPage />],
            ['/clients/:id', <ClientDetailPage />],
            ['/vehicles', <VehiclesPage />],
            ['/vehicles/:id', <VehicleDetailPage />],
            ['/documents', <DocumentsPage />],
            ['/history', <HistoryPage />],
            ['/notifications', <NotificationsPage />],
            ['/users', <UsersPage />],
            ['/profile', <ProfilePage />],
            ['/settings', <SettingsPage />],
            ['*', <NotFound />],
          ].map(([path, element]) => (
            <Route key={path as string} path={path as string} element={<Suspense fallback={<PageFallback />}>{element}</Suspense>} />
          ))}
        </Route>
      </Route>
    </Routes>
  );
}
