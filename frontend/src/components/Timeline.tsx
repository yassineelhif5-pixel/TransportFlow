import type { ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowRightLeft, CircleDot, FileText, FilePlus2, FileX2, Pencil, Sparkles, UserRoundCheck } from 'lucide-react';
import type { MissionTimelineItem } from '@/types';
import { STATUS_META, formatDateTime, formatTime, formatDay } from '@/utils/format';

export interface TimelineEntry {
  id: string | number;
  at: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  color?: string;
}

/** Fil chronologique vertical (historique mission, activité récente). */
export function Timeline({ items, compact }: { items: TimelineEntry[]; compact?: boolean }) {
  return (
    <ol className="relative">
      {items.map((it, i) => (
        <li key={it.id} className="relative flex gap-4 pb-5 last:pb-0">
          {i < items.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-1.75rem)] w-px bg-line" aria-hidden />}
          <span
            className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-surface"
            style={it.color ? { color: it.color, borderColor: `${it.color}55`, background: `${it.color}14` } : undefined}
          >
            {it.icon ?? <CircleDot className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-sm font-medium text-ink">{it.title}</p>
              <time className="text-xs tabular-nums text-subtle" dateTime={it.at}>{compact ? formatTime(it.at) : formatDateTime(it.at)}</time>
            </div>
            {it.description && <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">{it.description}</p>}
            {it.meta && <p className="mt-1 text-xs text-subtle">{it.meta}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Convertit l'historique d'une mission (API) en entrées de timeline, groupées par jour. */
export function MissionTimeline({ items }: { items: MissionTimelineItem[] }) {
  const groups = new Map<string, MissionTimelineItem[]>();
  for (const it of items) {
    const day = formatDay(it.at);
    groups.set(day, [...(groups.get(day) ?? []), it]);
  }
  const iconFor = (t: MissionTimelineItem) => {
    switch (t.type) {
      case 'CREATE': return { icon: <Sparkles className="h-3.5 w-3.5" />, color: '#236EBE' };
      case 'ASSIGN': return { icon: <UserRoundCheck className="h-3.5 w-3.5" />, color: '#236EBE' };
      case 'DOCUMENT': return { icon: <FilePlus2 className="h-3.5 w-3.5" />, color: '#8FA3BA' };
      case 'DOCUMENT_DELETE': return { icon: <FileX2 className="h-3.5 w-3.5" />, color: '#8FA3BA' };
      case 'UPDATE': return { icon: <Pencil className="h-3.5 w-3.5" />, color: '#8FA3BA' };
      default: {
        const meta = t.statusCode ? STATUS_META[t.statusCode] : undefined;
        return { icon: <ArrowRightLeft className="h-3.5 w-3.5" />, color: meta?.tone.hex ?? '#2CAABF' };
      }
    }
  };

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([day, entries]) => (
        <section key={day}>
          <h3 className="mb-3 text-xs font-medium text-subtle first-letter:uppercase">{day}</h3>
          <Timeline
            compact
            items={entries.map((e, i) => ({
              id: `${e.at}-${i}`,
              at: e.at,
              title: e.title,
              description: e.description,
              meta: e.userName ? `Par ${e.userName}` : undefined,
              ...iconFor(e),
            }))}
          />
        </section>
      ))}
    </div>
  );
}

export function DocIcon({ ext, className }: { ext: string; className?: string }) {
  const color = ext === '.pdf' ? 'text-stop' : ext === '.docx' ? 'text-brand-400' : 'text-cyan';
  return (
    <span className={clsx('relative inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-raised', color, className)}>
      <FileText className="h-4 w-4" />
      <span className="absolute -bottom-1 rounded bg-surface px-0.5 text-[0.55rem] font-bold uppercase leading-tight ring-1 ring-line">{ext.replace('.', '')}</span>
    </span>
  );
}
