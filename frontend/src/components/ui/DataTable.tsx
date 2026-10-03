import type { ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from './Display';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sortKey?: string;
  className?: string;
  headerClassName?: string;
  /** Masque la colonne sous ce point de rupture pour garder des tableaux lisibles sur tablette. */
  hideBelow?: 'md' | 'lg' | 'xl' | '2xl';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  empty?: ReactNode;
  selectable?: boolean;
  selected?: Set<string | number>;
  onSelectionChange?: (s: Set<string | number>) => void;
  dense?: boolean;
  caption?: string;
}

const hide = { md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell', '2xl': 'hidden 2xl:table-cell' };

/** Tableau professionnel : tri, sélection multiple, skeleton, états vide/erreur, défilement horizontal. */
export function DataTable<T>({
  columns, rows, rowKey, loading, error, onRetry, onRowClick, sortBy, sortDir, onSort, empty, selectable, selected, onSelectionChange, dense, caption,
}: DataTableProps<T>) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;

  const allKeys = rows?.map(rowKey) ?? [];
  const allSelected = !!selected && allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const toggleAll = () => onSelectionChange?.(allSelected ? new Set() : new Set(allKeys));
  const toggleOne = (k: string | number) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k); else next.add(k);
    onSelectionChange?.(next);
  };

  return (
    <div className="scrollbar-thin relative overflow-x-auto">
      <table className="w-full border-collapse">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line/80 bg-raised/40">
            {selectable && (
              <th className="w-10 px-4 py-3">
                <input type="checkbox" aria-label="Tout sélectionner" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-[#236EBE]" />
              </th>
            )}
            {columns.map((c) => {
              const active = c.sortKey && sortBy === c.sortKey;
              return (
                <th key={c.key} scope="col" className={clsx('th-cell', c.headerClassName, c.hideBelow && hide[c.hideBelow])} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sortKey && onSort ? (
                    <button type="button" onClick={() => onSort(c.sortKey!)} className={clsx('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')}>
                      {c.header}
                      {active ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading && !rows?.length
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-line/50">
                  {selectable && <td className="px-4 py-3.5"><Skeleton className="h-4 w-4" /></td>}
                  {columns.map((c) => (
                    <td key={c.key} className={clsx('px-4 py-3.5', c.hideBelow && hide[c.hideBelow])}><Skeleton className="h-4 w-[70%]" /></td>
                  ))}
                </tr>
              ))
            : rows?.map((row) => {
                const k = rowKey(row);
                return (
                  <tr
                    key={k}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    className={clsx(
                      'border-b border-line/50 transition-colors last:border-0',
                      onRowClick && 'cursor-pointer hover:bg-raised/60 focus-visible:bg-raised/60',
                      selected?.has(k) && 'bg-brand/5',
                      loading && 'opacity-60',
                    )}
                  >
                    {selectable && (
                      <td className="px-4" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label="Sélectionner la ligne" checked={selected?.has(k) ?? false} onChange={() => toggleOne(k)} className="h-4 w-4 accent-[#236EBE]" />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td key={c.key} className={clsx('td-cell', dense && 'py-2.5', c.className, c.hideBelow && hide[c.hideBelow])}>{c.render(row)}</td>
                    ))}
                  </tr>
                );
              })}
        </tbody>
      </table>
      {!loading && rows && rows.length === 0 && (empty ?? <EmptyState title="Aucun résultat" description="Modifiez vos filtres ou votre recherche." />)}
    </div>
  );
}

export function Pagination({ page, totalPages, total, pageSize, onPage }: { page: number; totalPages: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const pages: (number | '…')[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 px-4 py-3 text-sm" aria-label="Pagination">
      <p className="text-muted">
        <span className="text-ink">{from}–{to}</span> sur <span className="text-ink">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Page précédente" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1 text-subtle">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              aria-current={p === page ? 'page' : undefined}
              className={clsx('h-8 min-w-8 rounded-lg px-2 text-sm', p === page ? 'bg-brand text-white' : 'text-muted hover:bg-raised hover:text-ink')}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label="Page suivante" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
