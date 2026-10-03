import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AlertTriangle, Inbox, RefreshCw, X } from 'lucide-react';
import { Button } from './Controls';
import type { MissionStatusCode, VehicleStatus } from '@/types';
import { STATUS_META, VEHICLE_STATUS, type Tone } from '@/utils/format';

// ------------------------------------------------------------------ Card

export function Card({ className, children, as: Tag = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' }) {
  return <Tag className={clsx('card', className)}>{children}</Tag>;
}

export function CardHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={clsx('flex flex-wrap items-start justify-between gap-3 border-b border-line/70 px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[0.8125rem] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

// ------------------------------------------------------------------ Badges

export function Badge({ tone, children, live, className }: { tone: Tone; children: ReactNode; live?: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', tone.bg, tone.text, tone.ring, className)}>
      <span className="relative flex h-1.5 w-1.5">
        {live && <span className={clsx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', tone.dot)} />}
        <span className={clsx('relative inline-flex h-1.5 w-1.5 rounded-full', tone.dot)} />
      </span>
      {children}
    </span>
  );
}

export function StatusBadge({ code, label, className }: { code: MissionStatusCode; label?: string; className?: string }) {
  const meta = STATUS_META[code] ?? STATUS_META.CREATED;
  return <Badge tone={meta.tone} live={meta.live} className={className}>{label ?? meta.label}</Badge>;
}

export function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  const meta = VEHICLE_STATUS[status] ?? VEHICLE_STATUS.AVAILABLE;
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function ActiveBadge({ active, on = 'Actif', off = 'Inactif' }: { active: boolean; on?: string; off?: string }) {
  return active
    ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-go-400"><span className="h-1.5 w-1.5 rounded-full bg-go" />{on}</span>
    : <span className="inline-flex items-center gap-1.5 text-xs font-medium text-subtle"><span className="h-1.5 w-1.5 rounded-full bg-subtle" />{off}</span>;
}

// ------------------------------------------------------------------ États

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('relative overflow-hidden rounded-md bg-raised', className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-raised text-subtle">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center" role="alert">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-stop/10 text-stop">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="font-medium text-ink">Chargement impossible</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{message ?? 'Une erreur est survenue.'}</p>
      {onRetry && <Button variant="secondary" size="sm" className="mt-5" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRetry}>Réessayer</Button>}
    </div>
  );
}

// ------------------------------------------------------------------ Page header

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-semibold text-ink md:text-[1.75rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Modal

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button[data-autofocus]')?.focus(), 30);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-navy-950/70 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={clsx('relative flex max-h-[92vh] w-full animate-modal-in flex-col rounded-t-2xl border border-line bg-surface shadow-lift sm:rounded-2xl', widths[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line/70 px-6 py-5">
          <div>
            <h2 id="modal-title" className="text-lg font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="-mr-2 -mt-1 grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-raised hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scrollbar-thin overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line/70 bg-raised/40 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = 'Confirmer', tone = 'danger', loading,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: ReactNode;
  confirmLabel?: string; tone?: 'danger' | 'primary'; loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Annuler</Button>
          <Button variant={tone} onClick={onConfirm} loading={loading} data-autofocus>{confirmLabel}</Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-muted">{message}</div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Tabs

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-line">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={clsx(
            '-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors',
            value === it.value ? 'border-cyan font-medium text-ink' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {it.label}
          {it.count !== undefined && <span className="rounded-full bg-raised px-1.5 text-2xs text-muted">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Ligne « libellé / valeur » des fiches métier. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(110px,40%)_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children ?? '—'}</dd>
    </div>
  );
}
