import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, Download, Eye, FileSpreadsheet, History, Pencil, Plus, UserPlus, X } from 'lucide-react';
import { missionsApi } from '@/api/endpoints';
import { ApiError } from '@/api/apiClient';
import { useApi, useDebounce, useListState } from '@/hooks/useApi';
import { useClientOptions, useDriverOptions, useStatusOptions } from '@/hooks/useOptions';
import type { MissionListItem, MissionQuery } from '@/types';
import { STATUS_META, formatDateTime, formatRelative } from '@/utils/format';
import { Button, IconButton, SearchInput, Select, Input } from '@/components/ui/Controls';
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui/Display';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';

export default function MissionsListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const statuses = useStatusOptions();
  const clients = useClientOptions();
  const drivers = useDriverOptions();

  const [search, setSearch] = useState(params.get('search') ?? '');
  const debounced = useDebounce(search);
  const { state, update, toggleSort } = useListState<MissionQuery>({
    page: 1, pageSize: 15,
    status: params.get('status') ?? '',
    clientId: params.get('clientId') ? Number(params.get('clientId')) : undefined,
    driverId: params.get('driverId') ? Number(params.get('driverId')) : undefined,
    period: (params.get('period') as MissionQuery['period']) ?? '',
    dateFrom: '', dateTo: '',
  });
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [exporting, setExporting] = useState(false);

  useEffect(() => { update({ search: debounced }); }, [debounced, update]);

  // URL partageable : les filtres principaux sont reflétés dans la barre d'adresse.
  useEffect(() => {
    const next = new URLSearchParams();
    if (state.status) next.set('status', state.status);
    if (state.clientId) next.set('clientId', String(state.clientId));
    if (state.driverId) next.set('driverId', String(state.driverId));
    if (state.period) next.set('period', state.period);
    if (debounced) next.set('search', debounced);
    setParams(next, { replace: true });
  }, [state.status, state.clientId, state.driverId, state.period, debounced, setParams]);

  const { data, loading, error, reload } = useApi((signal) => missionsApi.list(state, signal), [JSON.stringify(state)]);

  const activeFilters = [state.status, state.clientId, state.driverId, state.period, state.dateFrom, state.dateTo, debounced].filter(Boolean).length;
  const clear = () => { setSearch(''); update({ status: '', clientId: undefined, driverId: undefined, period: '', dateFrom: '', dateTo: '' }); };

  const doExport = async (format: 'csv' | 'xlsx', selection = false) => {
    setExporting(true);
    try {
      await missionsApi.export(selection ? { ids: [...selected].join(',') } as MissionQuery : state, format);
      toast.success('Export généré.');
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setExporting(false);
    }
  };

  const multiStatus = state.status?.includes(',');

  return (
    <>
      <PageHeader
        title="Missions"
        subtitle={data ? `${data.total} mission${data.total > 1 ? 's' : ''}${activeFilters ? ' correspondant aux filtres' : ''}` : 'Suivi de toutes les missions de transport'}
        actions={
          <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => doExport('csv')} loading={exporting}>CSV</Button>
            <Button variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => doExport('xlsx')} disabled={exporting}>Excel</Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/missions/new')}>Nouvelle mission</Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-line/70 p-4 xl:flex-row xl:items-end">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une référence…" className="xl:w-72" />
          <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
            <Select aria-label="Statut" value={multiStatus ? '__multi' : state.status} onChange={(e) => update({ status: e.target.value })} placeholder="Tous les statuts">
              {multiStatus && <option value="__multi" disabled>Sélection du tableau de bord</option>}
              {statuses.map((s) => <option key={s.code} value={s.code}>{STATUS_META[s.code]?.label ?? s.label}</option>)}
            </Select>
            <Select aria-label="Client" value={state.clientId ?? ''} onChange={(e) => update({ clientId: e.target.value ? Number(e.target.value) : undefined })} placeholder="Tous les clients">
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select aria-label="Chauffeur" value={state.driverId ?? ''} onChange={(e) => update({ driverId: e.target.value ? Number(e.target.value) : undefined })} placeholder="Tous les chauffeurs">
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.lastName} {d.firstName}</option>)}
            </Select>
            <Select aria-label="Période" value={state.period === '' && (state.dateFrom || state.dateTo) ? 'custom' : state.period} onChange={(e) => update({ period: e.target.value === 'custom' ? '' : (e.target.value as MissionQuery['period']), ...(e.target.value !== 'custom' ? { dateFrom: '', dateTo: '' } : { dateFrom: new Date().toISOString().slice(0, 10) }) })} placeholder="Toutes les dates">
              <option value="today">Aujourd'hui</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois-ci</option>
              <option value="custom">Période personnalisée</option>
            </Select>
          </div>
          {activeFilters > 0 && <Button variant="ghost" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={clear}>Réinitialiser</Button>}
        </div>

        {(state.dateFrom || state.dateTo) && !state.period && (
          <div className="flex flex-wrap items-end gap-3 border-b border-line/70 bg-raised/30 px-4 py-3">
            <CalendarClock className="mb-2.5 h-4 w-4 text-subtle" />
            <Input type="date" label="Du" value={state.dateFrom ?? ''} onChange={(e) => update({ dateFrom: e.target.value })} className="w-44" />
            <Input type="date" label="Au" value={state.dateTo ?? ''} onChange={(e) => update({ dateTo: e.target.value })} className="w-44" />
          </div>
        )}

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-line/70 bg-brand/5 px-4 py-2.5 text-sm">
            <span><strong>{selected.size}</strong> mission{selected.size > 1 ? 's' : ''} sélectionnée{selected.size > 1 ? 's' : ''}</span>
            <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={() => doExport('csv', true)}>Exporter la sélection (CSV)</Button>
            <Button size="sm" variant="secondary" icon={<FileSpreadsheet className="h-3.5 w-3.5" />} onClick={() => doExport('xlsx', true)}>Excel</Button>
            <button type="button" className="ml-auto text-muted hover:text-ink" onClick={() => setSelected(new Set())}>Désélectionner</button>
          </div>
        )}

        <DataTable<MissionListItem>
          rows={data?.items}
          loading={loading}
          error={error?.message}
          onRetry={reload}
          rowKey={(m) => m.id}
          onRowClick={(m) => navigate(`/missions/${m.id}`)}
          sortBy={state.sortBy}
          sortDir={state.sortDir}
          onSort={toggleSort}
          selectable
          selected={selected}
          onSelectionChange={setSelected}
          caption="Liste des missions"
          empty={
            <EmptyState
              title="Aucune mission trouvée"
              description={activeFilters ? 'Aucune mission ne correspond à ces critères.' : 'Créez votre première mission pour commencer le suivi.'}
              action={activeFilters ? <Button variant="secondary" onClick={clear}>Réinitialiser les filtres</Button> : <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/missions/new')}>Nouvelle mission</Button>}
            />
          }
          columns={[
            { key: 'ref', header: 'Référence', sortKey: 'reference', render: (m) => <span className="ref-code">{m.referenceNumber}</span> },
            { key: 'client', header: 'Client', sortKey: 'client', render: (m) => <span className="block max-w-[180px] truncate">{m.clientName}</span> },
            { key: 'date', header: 'Date', sortKey: 'date', render: (m) => formatDateTime(m.plannedDate) },
            { key: 'route', header: 'Départ → Destination', sortKey: 'pickup', hideBelow: '2xl', render: (m) => <span className="text-muted"><span className="text-ink">{m.pickupCity}</span> → <span className="text-ink">{m.deliveryCity}</span></span> },
            { key: 'driver', header: 'Chauffeur', sortKey: 'driver', hideBelow: 'md', render: (m) => m.driverName ?? <span className="text-subtle">Non affecté</span> },
            { key: 'status', header: 'Statut', sortKey: 'status', render: (m) => <StatusBadge code={m.statusCode} /> },
            {
              key: 'last', header: 'Dernière action', sortKey: 'lastaction', hideBelow: '2xl',
              render: (m) => <span className="block max-w-[200px]"><span className="block truncate">{m.lastAction ?? '—'}</span><span className="text-xs text-subtle">{formatRelative(m.lastActionAt)}</span></span>,
            },
            {
              key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right',
              render: (m) => {
                const locked = m.statusCode === 'COMPLETED' || m.statusCode === 'CANCELLED';
                return (
                  <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <IconButton label="Voir" onClick={() => navigate(`/missions/${m.id}`)}><Eye className="h-4 w-4" /></IconButton>
                    <IconButton label="Modifier" disabled={locked} onClick={() => navigate(`/missions/${m.id}/edit`)}><Pencil className="h-4 w-4" /></IconButton>
                    <IconButton label="Affecter" disabled={locked} onClick={() => navigate(`/missions/${m.id}?assign=1`)}><UserPlus className="h-4 w-4" /></IconButton>
                    <IconButton label="Historique" onClick={() => navigate(`/missions/${m.id}#historique`)}><History className="h-4 w-4" /></IconButton>
                  </div>
                );
              },
            },
          ]}
        />
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={(p) => update({ page: p }, false)} />}
      </Card>
      <p className="mt-4 text-xs text-subtle">Astuce : cliquez sur une ligne pour ouvrir la fiche mission. <Link to="/references" className="text-cyan hover:underline">Gérer les références</Link></p>
    </>
  );
}
