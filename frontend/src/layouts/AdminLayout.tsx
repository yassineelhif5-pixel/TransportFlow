import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import {
  Bell, Building2, ChevronsLeft, ChevronsRight, FileStack, Hash, History, LayoutDashboard, ListChecks, LogOut, PlusCircle,
  Settings, Truck, UserCog, Users,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { BrandMark, BrandName } from '@/components/BrandMark';
import { initials } from '@/utils/format';
import { Header } from './Header';

interface NavItem { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }
interface NavGroup { title?: string; items: NavItem[] }

const NAV: NavGroup[] = [
  { items: [{ to: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard }] },
  {
    title: 'Missions',
    items: [
      { to: '/missions', label: 'Toutes les missions', icon: ListChecks, end: true },
      { to: '/missions/new', label: 'Nouvelle mission', icon: PlusCircle },
    ],
  },
  {
    title: 'Référentiels',
    items: [
      { to: '/references', label: 'Références', icon: Hash },
      { to: '/clients', label: 'Clients', icon: Building2 },
      { to: '/drivers', label: 'Chauffeurs', icon: Users },
      { to: '/vehicles', label: 'Véhicules', icon: Truck },
    ],
  },
  {
    title: 'Suivi',
    items: [
      { to: '/documents', label: 'Documents', icon: FileStack },
      { to: '/history', label: 'Historique', icon: History },
      { to: '/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/users', label: 'Utilisateurs', icon: UserCog },
      { to: '/settings', label: 'Paramètres', icon: Settings },
    ],
  },
];

function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onCloseMobile: () => void }) {
  const { user, logout } = useAuth();
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-navy-950/60 backdrop-blur-[1px] lg:hidden" onClick={onCloseMobile} aria-hidden />}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/[0.06] bg-navy text-white transition-[width,transform] duration-200',
          collapsed ? 'lg:w-[76px]' : 'lg:w-[256px]',
          'w-[272px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        aria-label="Navigation principale"
      >
        <div className={clsx('flex h-16 items-center gap-3 px-5', collapsed && 'lg:justify-center lg:px-0')}>
          <BrandMark className="h-9 w-9" />
          <BrandName className={clsx('text-[1.0625rem]', collapsed && 'lg:hidden')} />
        </div>

        <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4 pt-2">
          {NAV.map((group, gi) => (
            <div key={gi} className={clsx(gi > 0 && 'mt-5')}>
              {group.title && (
                <p className={clsx('mb-1.5 px-3 text-xs text-white/40', collapsed && 'lg:sr-only')}>{group.title}</p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onCloseMobile}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        clsx(
                          'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                          collapsed && 'lg:justify-center lg:px-0',
                          isActive ? 'bg-white/[0.08] font-medium text-white' : 'text-white/65 hover:bg-white/[0.04] hover:text-white',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span className="absolute left-0 top-2 h-6 w-[3px] rounded-r bg-cyan shadow-[0_0_12px_rgba(44,170,191,.9)]" aria-hidden />}
                          <item.icon className={clsx('h-[18px] w-[18px] shrink-0', isActive ? 'text-cyan' : 'text-white/55 group-hover:text-white/80')} />
                          <span className={clsx(collapsed && 'lg:sr-only')}>{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          <div className={clsx('flex items-center gap-3 rounded-xl p-2', collapsed && 'lg:flex-col lg:gap-2')}>
            <NavLink to="/profile" onClick={onCloseMobile} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-cyan text-xs font-semibold" title="Mon profil">
              {initials(user?.fullName)}
            </NavLink>
            <NavLink to="/profile" onClick={onCloseMobile} className={clsx('min-w-0 flex-1', collapsed && 'lg:hidden')}>
              <p className="truncate text-sm font-medium">{user?.firstName ?? 'Admin'}</p>
              <p className="truncate text-xs text-white/50">Administrateur</p>
            </NavLink>
            <button type="button" onClick={() => logout()} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/55 hover:bg-white/[0.06] hover:text-white" aria-label="Déconnexion" title="Déconnexion">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="mt-1 hidden h-8 w-full items-center justify-center gap-2 rounded-lg text-xs text-white/45 hover:bg-white/[0.04] hover:text-white/80 lg:flex"
            aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Replier</>}
          </button>
        </div>
      </aside>
    </>
  );
}

/** Gabarit de l'administration : sidebar rétractable (drawer sur tablette/mobile) + en-tête. */
export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('tf.sidebar') === 'collapsed'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    try { localStorage.setItem('tf.sidebar', collapsed ? 'collapsed' : 'open'); } catch { /* ignore */ }
  }, [collapsed]);

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">Aller au contenu</a>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className={clsx('transition-[padding] duration-200', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[256px]')}>
        <Header onOpenMenu={() => setMobileOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-[1480px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
