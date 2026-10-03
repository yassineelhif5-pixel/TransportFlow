import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Bell, Building2, CheckCheck, Hash, Menu, Moon, Search, Sun, Truck, User } from 'lucide-react';
import { notificationsApi, searchApi } from '@/api/endpoints';
import { useDebounce } from '@/hooks/useApi';
import type { NotificationDto, SearchResult } from '@/types';
import { formatRelative } from '@/utils/format';
import { StatusBadge } from '@/components/ui/Display';

function useOutside(ref: React.RefObject<HTMLElement>, onOutside: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOutside(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOutside]);
}

// ------------------------------------------------------------------ Recherche globale

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounce(q, 250);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useOutside(wrapRef, useCallback(() => setOpen(false), []));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (debounced.trim().length < 2) { setResults([]); return; }
    const controller = new AbortController();
    setLoading(true);
    searchApi.search(debounced.trim(), controller.signal)
      .then((r) => { setResults(r); setActive(0); })
      .catch(() => undefined)
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [debounced]);

  const go = (r: SearchResult) => {
    setOpen(false);
    setQ('');
    const path = r.type === 'mission' ? `/missions/${r.id}` : r.type === 'client' ? `/clients/${r.id}` : r.type === 'driver' ? `/drivers/${r.id}` : `/references?highlight=${encodeURIComponent(r.title)}`;
    navigate(path);
  };

  const icon = { mission: Truck, reference: Hash, client: Building2, driver: User };
  const groupLabel = { mission: 'Missions', reference: 'Références sans mission', client: 'Clients', driver: 'Chauffeurs' };

  return (
    <div ref={wrapRef} className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter' && results[active]) go(results[active]);
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Rechercher une référence, un client, un chauffeur…"
        aria-label="Recherche globale"
        role="combobox"
        aria-expanded={open && q.length >= 2}
        aria-controls="global-search-results"
        className="h-10 w-full rounded-xl border border-line bg-raised/60 pl-9 pr-14 text-sm placeholder:text-subtle focus:border-cyan focus:bg-surface focus:outline-none focus:ring-4 focus:ring-cyan/15 [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-2xs text-subtle sm:block">Ctrl K</kbd>

      {open && q.trim().length >= 2 && (
        <div id="global-search-results" role="listbox" className="absolute left-0 right-0 top-12 z-40 max-h-[70vh] animate-fade-in overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-lift">
          {loading && results.length === 0 && <p className="px-3 py-4 text-sm text-muted">Recherche…</p>}
          {!loading && results.length === 0 && <p className="px-3 py-4 text-sm text-muted">Aucun résultat pour « {q} ».</p>}
          {(['mission', 'reference', 'client', 'driver'] as const).map((type) => {
            const group = results.filter((r) => r.type === type);
            if (!group.length) return null;
            const Icon = icon[type];
            return (
              <div key={type} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-xs text-subtle">{groupLabel[type]}</p>
                {group.map((r) => {
                  const idx = results.indexOf(r);
                  return (
                    <button
                      key={`${r.type}-${r.id}`}
                      type="button"
                      role="option"
                      aria-selected={idx === active}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(r)}
                      className={clsx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', idx === active ? 'bg-raised' : '')}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-subtle" />
                      <span className="min-w-0 flex-1">
                        <span className="ref-code block truncate text-sm">{r.title}</span>
                        <span className="block truncate text-xs text-muted">{[r.subtitle, r.meta].filter(Boolean).join(' — ')}</span>
                      </span>
                      {r.statusCode && <StatusBadge code={r.statusCode} label={r.statusLabel ?? undefined} />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Cloche de notifications

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationDto[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, useCallback(() => setOpen(false), []));

  const refreshCount = useCallback(() => {
    notificationsApi.unreadCount().then(setCount).catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 30_000); // rafraîchissement périodique
    const onFocus = () => refreshCount();
    window.addEventListener('focus', onFocus);
    window.addEventListener('tf:notifications', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); window.removeEventListener('tf:notifications', onFocus); };
  }, [refreshCount]);

  useEffect(() => {
    if (open) notificationsApi.list({ pageSize: 8 }).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [open]);

  const openItem = async (n: NotificationDto) => {
    if (!n.isRead) { await notificationsApi.markRead(n.id).catch(() => undefined); refreshCount(); }
    setOpen(false);
    if (n.entityName === 'Mission' && n.entityId) navigate(`/missions/${n.entityId}`);
    else navigate('/notifications');
  };

  const readAll = async () => {
    await notificationsApi.markAllRead().catch(() => undefined);
    setCount(0);
    setItems((all) => all?.map((n) => ({ ...n, isRead: true })) ?? null);
  };

  const dot = { INFO: 'bg-brand', SUCCESS: 'bg-go', WARNING: 'bg-warn', DANGER: 'bg-stop' };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-muted transition-colors hover:bg-raised hover:text-ink"
        aria-label={`Notifications${count ? ` (${count} non lues)` : ''}`}
        aria-expanded={open}
      >
        <Bell className="h-[19px] w-[19px]" />
        {count > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-stop px-1 text-[0.625rem] font-bold leading-none text-white ring-2 ring-surface">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-[min(380px,calc(100vw-2rem))] animate-fade-in rounded-xl border border-line bg-surface shadow-lift">
          <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {count > 0 && (
              <button type="button" onClick={readAll} className="inline-flex items-center gap-1 text-xs text-cyan hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Tout marquer comme lu
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {items === null && <li className="px-4 py-6 text-sm text-muted">Chargement…</li>}
            {items?.length === 0 && <li className="px-4 py-6 text-sm text-muted">Aucune notification.</li>}
            {items?.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => openItem(n)} className={clsx('flex w-full gap-3 px-4 py-3 text-left hover:bg-raised/60', !n.isRead && 'bg-brand/[0.04]')}>
                  <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.isRead ? 'bg-line' : dot[n.type])} />
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block text-sm', !n.isRead && 'font-medium')}>{n.title}</span>
                    <span className="block text-[0.8125rem] text-muted">{n.message}</span>
                    <span className="mt-0.5 block text-xs text-subtle">{formatRelative(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-line/70 px-4 py-2.5 text-center text-sm text-cyan hover:bg-raised/50">
            Voir toutes les notifications
          </Link>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Thème

function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'));
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0F1C2D' : '#F4F7FA');
    try { localStorage.setItem('tf.theme', theme); } catch { /* ignore */ }
  }, [theme]);
  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      className="grid h-10 w-10 place-items-center rounded-xl text-muted transition-colors hover:bg-raised hover:text-ink"
      aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
      title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
    >
      {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}

export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button type="button" onClick={onOpenMenu} className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-raised hover:text-ink lg:hidden" aria-label="Ouvrir le menu">
          <Menu className="h-5 w-5" />
        </button>
        <GlobalSearch />
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
