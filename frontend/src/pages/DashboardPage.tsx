import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { ArrowRight, Plus, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { dashboardApi } from '@/api/endpoints';
import { useApi } from '@/hooks/useApi';
import type { Activity, Dashboard, MissionStatusCode } from '@/types';
import { ACTION_LABELS, STATUS_META, formatDateTime, formatDay, formatRelative, formatTime } from '@/utils/format';
import { Button } from '@/components/ui/Controls';
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '@/components/ui/Display';
import { DataTable } from '@/components/ui/DataTable';
import { Timeline } from '@/components/Timeline';

function KpiPanel({ data }: { data: Dashboard | null }) {
  const k = data?.kpis;
  const cells: { label: string; value?: number; note?: string; to: string; accent: string; status?: MissionStatusCode }[] = [
    { label: 'Total missions', value: k?.total, note: k ? `${k.today} prévue${k.today > 1 ? 's' : ''} aujourd'hui` : undefined, to: '/missions', accent: '#8FA3BA' },
    { label: 'À affecter', value: k?.toAssign, note: 'Sans chauffeur', to: '/missions?status=CREATED', accent: '#D99A2B', status: 'CREATED' },
    { label: 'En cours', value: k?.inProgress, note: 'Affectées à livrées', to: '/missions?status=ASSIGNED,TO_BE_PICKED_UP,PICKED_UP,IN_PROGRESS', accent: '#2CAABF' },
    { label: 'Terminées', value: k?.completed, note: k ? `${k.completedThisWeek} sur 7 jours · ${k.completionRate.toLocaleString('fr-FR')} % de réussite` : undefined, to: '/missions?status=COMPLETED', accent: '#2A9B64' },
    { label: 'Anomalies', value: k?.anomalies, note: k?.anomalies ? 'À traiter en priorité' : 'Aucune anomalie ouverte', to: '/missions?status=ANOMALY', accent: '#D6455A' },
  ];

  return (
    <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line/70 md:grid-cols-6 xl:grid-cols-5">
      {cells.map((c, i) => (
        <Link
          key={c.label}
          to={c.to}
          className={clsx(
            'group relative flex flex-col gap-1 bg-surface px-5 py-5 transition-colors hover:bg-raised',
            i < 3 ? 'md:col-span-2' : 'md:col-span-3',
            i === 4 && 'col-span-2',
            'xl:col-span-1',
          )}
        >
          <span className="absolute inset-x-5 top-0 h-[2px] rounded-b opacity-70 transition-opacity group-hover:opacity-100" style={{ background: c.accent }} aria-hidden />
          <span className="text-[0.8125rem] text-muted">{c.label}</span>
          {c.value === undefined ? (
            <Skeleton className="my-1 h-9 w-16" />
          ) : (
            <span className={clsx('text-[2.125rem] font-semibold leading-none tabular-nums', c.label === 'Anomalies' && c.value > 0 && 'text-stop')} style={{ fontStretch: '115%' }}>
              {c.value}
            </span>
          )}
          <span className="min-h-[1rem] text-xs text-subtle">{c.note}</span>
        </Link>
      ))}
    </Card>
  );
}

function StatusChart({ data }: { data: Dashboard }) {
  const rows = data.byStatus.map((s) => ({ ...s, label: STATUS_META[s.code]?.label ?? s.label, color: STATUS_META[s.code]?.tone.hex ?? '#8FA3BA' }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap={7}>
        <CartesianGrid horizontal={false} stroke="rgb(var(--line))" strokeDasharray="3 4" />
        <XAxis type="number" allowDecimals={false} tick={{ fill: 'rgb(var(--subtle))', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={128} tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: 'rgb(var(--raised))' }}
          contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 10, fontSize: 12 }}
          labelStyle={{ color: 'rgb(var(--ink))' }}
          formatter={(v: number) => [`${v} mission${v > 1 ? 's' : ''}`, '']}
          separator=""
        />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={18}>
          {rows.map((r) => <Cell key={r.code} fill={r.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TrendChart({ data }: { data: Dashboard }) {
  const rows = data.trend.map((t) => ({ ...t, day: formatDay(t.date) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid vertical={false} stroke="rgb(var(--line))" strokeDasharray="3 4" />
        <XAxis dataKey="day" tick={{ fill: 'rgb(var(--subtle))', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
        <YAxis allowDecimals={false} tick={{ fill: 'rgb(var(--subtle))', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 10, fontSize: 12 }} labelStyle={{ color: 'rgb(var(--ink))' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'rgb(var(--muted))' }} />
        <Line type="monotone" dataKey="planned" name="Planifiées" stroke="#236EBE" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="completed" name="Terminées" stroke="#2A9B64" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function RankList({ title, items, to }: { title: string; items: { id: number; name: string; count: number }[]; to: (id: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div>
      <p className="mb-3 text-sm font-medium">{title}</p>
      {items.length === 0 ? <p className="text-sm text-muted">Pas encore de données.</p> : (
        <ul className="space-y-2.5">
          {items.map((i) => (
            <li key={i.id}>
              <Link to={to(i.id)} className="group block">
                <div className="mb-1 flex justify-between text-[0.8125rem]">
                  <span className="truncate group-hover:text-cyan">{i.name}</span>
                  <span className="tabular-nums text-muted">{i.count}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand to-cyan" style={{ width: `${(i.count / max) * 100}%` }} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const activityColor: Record<string, string> = {
  CREATE: '#236EBE', ASSIGN: '#236EBE', STATUS_CHANGE: '#2CAABF', DOCUMENT_UPLOAD: '#8FA3BA', DOCUMENT_DELETE: '#8FA3BA', IMPORT: '#2A9B64', UPDATE: '#8FA3BA', DELETE: '#D6455A',
};

function ActivityFeed({ items }: { items: Activity[] }) {
  if (!items.length) return <EmptyState title="Aucune activité" description="Les actions réalisées apparaîtront ici." />;
  return (
    <Timeline
      items={items.map((a) => ({
        id: a.id,
        at: a.at,
        title: a.description ?? ACTION_LABELS[a.action] ?? a.action,
        meta: `${a.userName ?? 'Système'} · ${formatRelative(a.at)}`,
        color: activityColor[a.action] ?? '#8FA3BA',
        icon: <span className="h-2 w-2 rounded-full" style={{ background: activityColor[a.action] ?? '#8FA3BA' }} />,
        description: undefined,
      })).map((e) => ({ ...e, title: <span className="font-normal">{e.title}</span> }))}
    />
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi((s) => { void s; return dashboardApi.get(); }, []);

  useEffect(() => {
    const t = setInterval(reload, 60_000);
    return () => clearInterval(t);
  }, [reload]);

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle={<>Vue globale de votre activité{data && <span className="text-subtle"> · mis à jour {formatTime(data.generatedAt)}</span>}</>}
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw className={clsx('h-4 w-4', loading && 'animate-spin')} />} onClick={reload} disabled={loading}>Actualiser</Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/missions/new')}>Nouvelle mission</Button>
          </>
        }
      />

      {error && !data ? (
        <Card><ErrorState message={error.message} onRetry={reload} /></Card>
      ) : (
        <div className="space-y-6">
          <KpiPanel data={data} />

          <div className="grid gap-6 xl:grid-cols-12">
            <Card className="xl:col-span-5">
              <CardHeader title="Missions par statut" subtitle="Répartition actuelle de toutes les missions" />
              <div className="px-3 py-4">{data ? <StatusChart data={data} /> : <Skeleton className="mx-2 h-[260px]" />}</div>
            </Card>
            <Card className="xl:col-span-7">
              <CardHeader title="Activité des 14 derniers jours" subtitle="Missions planifiées et missions terminées par jour" />
              <div className="px-3 py-4">{data ? <TrendChart data={data} /> : <Skeleton className="mx-2 h-[260px]" />}</div>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-12">
            <Card className="xl:col-span-8">
              <CardHeader
                title="Missions nécessitant une action"
                subtitle="À affecter, en anomalie ou en attente de prise en charge"
                actions={<Link to="/missions" className="inline-flex items-center gap-1 text-sm text-cyan hover:underline">Toutes les missions <ArrowRight className="h-3.5 w-3.5" /></Link>}
              />
              <DataTable
                rows={data?.actionRequired}
                loading={loading && !data}
                rowKey={(m) => m.id}
                onRowClick={(m) => navigate(`/missions/${m.id}`)}
                dense
                empty={<EmptyState title="Tout est sous contrôle" description="Aucune mission n'attend d'action de votre part." />}
                columns={[
                  { key: 'ref', header: 'Référence', render: (m) => <span className="ref-code">{m.referenceNumber}</span> },
                  { key: 'client', header: 'Client', render: (m) => m.clientName },
                  { key: 'driver', header: 'Chauffeur', hideBelow: '2xl', render: (m) => m.driverName ?? <span className="text-subtle">Non affecté</span> },
                  { key: 'date', header: 'Date', render: (m) => formatDateTime(m.plannedDate) },
                  { key: 'route', header: 'Départ → Destination', hideBelow: '2xl', render: (m) => <span className="text-muted"><span className="text-ink">{m.pickupCity}</span> → <span className="text-ink">{m.deliveryCity}</span></span> },
                  { key: 'status', header: 'Statut', render: (m) => <StatusBadge code={m.statusCode} /> },
                  {
                    key: 'action', header: <span className="sr-only">Action</span>, className: 'text-right',
                    render: (m) => (
                      <Button size="sm" variant={m.statusCode === 'CREATED' ? 'primary' : 'secondary'} onClick={(e) => { e.stopPropagation(); navigate(`/missions/${m.id}${m.statusCode === 'CREATED' ? '?assign=1' : ''}`); }}>
                        {m.statusCode === 'CREATED' ? 'Affecter' : 'Traiter'}
                      </Button>
                    ),
                  },
                ]}
              />
            </Card>

            <Card className="xl:col-span-4">
              <CardHeader title="Activité récente" actions={<Link to="/history" className="text-sm text-cyan hover:underline">Historique</Link>} />
              <div className="px-5 py-5">
                {data ? <ActivityFeed items={data.recentActivity} /> : <div className="space-y-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>}
              </div>
            </Card>
          </div>

          <Card className="grid gap-8 p-5 md:grid-cols-2">
            {data ? (
              <>
                <RankList title="Missions par chauffeur" items={data.byDriver} to={(id) => `/drivers/${id}`} />
                <RankList title="Missions par client" items={data.byClient} to={(id) => `/clients/${id}`} />
              </>
            ) : (
              <>
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
