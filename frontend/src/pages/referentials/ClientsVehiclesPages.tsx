import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, MapPin, Pencil, Phone, Plus, Power } from 'lucide-react';
import { clientsApi, vehiclesApi } from '@/api/endpoints';
import { ApiError } from '@/api/apiClient';
import { useApi, useDebounce, useListState } from '@/hooks/useApi';
import { invalidateOptions } from '@/hooks/useOptions';
import type { ClientDetail, ClientDto, ClientUpsert, PagedQuery, VehicleDetail, VehicleDto, VehicleStatus, VehicleUpsert } from '@/types';
import { STATUS_META, VEHICLE_STATUS, formatDateTime, formatNumber } from '@/utils/format';
import { Button, IconButton, Input, SearchInput, Select } from '@/components/ui/Controls';
import { ActiveBadge, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, InfoRow, Modal, PageHeader, Skeleton, StatusBadge, Tabs, VehicleStatusBadge } from '@/components/ui/Display';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';

const fieldErrors = (e: ApiError) => Object.fromEntries(Object.entries(e.errors ?? {}).map(([k, v]) => [k, v[0]]));

// ==================================================================== CLIENTS

function ClientFormModal({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial: ClientDto | null; onSaved: (c: ClientDetail) => void }) {
  const toast = useToast();
  const [f, setF] = useState<ClientUpsert>({ code: '', name: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setF(initial ? { code: initial.code, name: initial.name, address: initial.address ?? '', city: initial.city ?? '', postalCode: initial.postalCode ?? '', country: initial.country, phone: initial.phone ?? '', email: initial.email ?? '' }
      : { code: '', name: '', address: '', city: '', postalCode: '', country: 'France', phone: '', email: '' });
    setErrors({});
    setFormError(null);
  }, [open, initial]);

  const set = (k: keyof ClientUpsert, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!/^[A-Za-z0-9_-]{2,20}$/.test(f.code.trim())) e.code = 'Code invalide (2 à 20 caractères : lettres, chiffres, - _).';
    if (!f.name.trim()) e.name = 'Le nom est obligatoire.';
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Adresse e-mail invalide.';
    if (f.phone && !/^\+?[0-9 .\-()]{6,20}$/.test(f.phone)) e.phone = 'Numéro de téléphone invalide.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setPending(true);
    setFormError(null);
    try {
      const saved = initial ? await clientsApi.update(initial.id, f) : await clientsApi.create(f);
      invalidateOptions('clients');
      toast.success(initial ? 'Client modifié avec succès.' : 'Client créé avec succès.', saved.client.name);
      onSaved(saved);
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err as ApiError));
      setFormError((err as ApiError).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Modifier ${initial.name}` : 'Nouveau client'} size="lg"
      footer={<><Button variant="secondary" onClick={onClose} disabled={pending}>Annuler</Button><Button onClick={submit} loading={pending}>{initial ? 'Enregistrer' : 'Créer le client'}</Button></>}>
      <div className="grid gap-4 md:grid-cols-[160px_1fr]">
        <Input label="Code" required value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} error={errors.code} maxLength={20} placeholder="ABC" />
        <Input label="Nom" required value={f.name} onChange={(e) => set('name', e.target.value)} error={errors.name} maxLength={200} placeholder="ABC Logistics" />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Input label="Adresse" className="md:col-span-2" value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} maxLength={250} />
        <Input label="Code postal" value={f.postalCode ?? ''} onChange={(e) => set('postalCode', e.target.value)} maxLength={20} />
        <Input label="Ville" value={f.city ?? ''} onChange={(e) => set('city', e.target.value)} maxLength={120} />
        <Input label="Pays" value={f.country ?? ''} onChange={(e) => set('country', e.target.value)} maxLength={80} />
        <Input label="Téléphone" type="tel" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} error={errors.phone} />
        <Input label="E-mail" type="email" className="md:col-span-2" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} error={errors.email} maxLength={256} />
      </div>
      {formError && <p className="mt-4 rounded-lg bg-stop/10 px-3 py-2 text-sm text-stop" role="alert">{formError}</p>}
    </Modal>
  );
}

export function ClientsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const { state, update, toggleSort } = useListState<PagedQuery & { isActive?: boolean }>({ page: 1, pageSize: 15 });
  useEffect(() => { update({ search: debounced }); }, [debounced, update]);
  const { data, loading, error, reload } = useApi((s) => clientsApi.list(state, s), [JSON.stringify(state)]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientDto | null>(null);
  const [toggling, setToggling] = useState<ClientDto | null>(null);
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    if (!toggling) return;
    setPending(true);
    try {
      await clientsApi.setActive(toggling.id, !toggling.isActive);
      invalidateOptions('clients');
      toast.success(toggling.isActive ? 'Client désactivé.' : 'Client activé.', toggling.name);
      setToggling(null);
      reload();
    } catch (e) { toast.error((e as ApiError).message); } finally { setPending(false); }
  };

  return (
    <>
      <PageHeader title="Clients" subtitle="Donneurs d'ordre, références et missions associées"
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Nouveau client</Button>} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line/70 p-4 sm:flex-row">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un nom, un code, une ville…" className="sm:w-96" />
          <Select aria-label="Statut" className="sm:w-48" value={state.isActive === undefined ? '' : String(state.isActive)} onChange={(e) => update({ isActive: e.target.value === '' ? undefined : e.target.value === 'true' })} placeholder="Tous">
            <option value="true">Actifs</option><option value="false">Inactifs</option>
          </Select>
        </div>
        <DataTable<ClientDto>
          rows={data?.items} loading={loading} error={error?.message} onRetry={reload} rowKey={(c) => c.id}
          onRowClick={(c) => navigate(`/clients/${c.id}`)} sortBy={state.sortBy} sortDir={state.sortDir} onSort={toggleSort}
          empty={<EmptyState title="Aucun client" description="Ajoutez un client pour créer ses références et missions." />}
          columns={[
            { key: 'code', header: 'Code', sortKey: 'code', render: (c) => <span className="ref-code">{c.code}</span> },
            { key: 'name', header: 'Nom', sortKey: 'name', render: (c) => <span className="font-medium">{c.name}</span> },
            { key: 'city', header: 'Ville', sortKey: 'city', hideBelow: 'md', render: (c) => c.city ?? '—' },
            { key: 'country', header: 'Pays', sortKey: 'country', hideBelow: 'lg', render: (c) => c.country },
            { key: 'phone', header: 'Téléphone', hideBelow: 'lg', render: (c) => c.phone ?? '—' },
            { key: 'email', header: 'E-mail', hideBelow: '2xl', render: (c) => <span className="text-muted">{c.email ?? '—'}</span> },
            { key: 'missions', header: 'Missions', hideBelow: 'md', className: 'tabular-nums', render: (c) => <span>{c.missionCount}{c.activeMissionCount > 0 && <span className="text-cyan"> · {c.activeMissionCount} en cours</span>}</span> },
            { key: 'status', header: 'Statut', render: (c) => <ActiveBadge active={c.isActive} /> },
            {
              key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right',
              render: (c) => (
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                  <IconButton label="Modifier" onClick={() => { setEditing(c); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
                  <IconButton label={c.isActive ? 'Désactiver' : 'Activer'} className={c.isActive ? 'hover:text-stop' : 'hover:text-go'} onClick={() => setToggling(c)}><Power className="h-4 w-4" /></IconButton>
                </div>
              ),
            },
          ]}
        />
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={(p) => update({ page: p }, false)} />}
      </Card>
      <ClientFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSaved={() => reload()} />
      <ConfirmDialog open={!!toggling} onClose={() => setToggling(null)} onConfirm={toggle} loading={pending} tone={toggling?.isActive ? 'danger' : 'primary'}
        title={toggling?.isActive ? 'Désactiver ce client ?' : 'Réactiver ce client ?'} confirmLabel={toggling?.isActive ? 'Désactiver' : 'Activer'}
        message={toggling?.isActive ? <>Aucune nouvelle mission ni référence ne pourra être créée pour {toggling.name}. L'historique est conservé.</> : <>{toggling?.name} sera de nouveau disponible.</>} />
    </>
  );
}

export function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload, setData } = useApi(() => clientsApi.get(Number(id)), [id]);
  const [tab, setTab] = useState<'missions' | 'references'>('missions');
  const [formOpen, setFormOpen] = useState(false);

  if (error) return <Card><ErrorState message={error.message} onRetry={reload} /></Card>;
  if (loading || !data) return <div className="space-y-4"><Skeleton className="h-16 w-80" /><Skeleton className="h-72" /></div>;
  const c = data.client;
  const total = data.missionsByStatus.reduce((s, x) => s + x.count, 0);

  return (
    <>
      <Link to="/clients" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Clients</Link>
      <PageHeader title={c.name} subtitle={<span className="inline-flex flex-wrap items-center gap-3"><span className="ref-code">{c.code}</span><ActiveBadge active={c.isActive} /></span>}
        actions={<>
          <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setFormOpen(true)}>Modifier</Button>
          <Button icon={<Plus className="h-4 w-4" />} disabled={!c.isActive} onClick={() => navigate(`/missions/new?client=${c.id}`)}>Nouvelle mission</Button>
        </>} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Informations" />
            <dl className="divide-y divide-line/60 px-5 py-1">
              <InfoRow label="Adresse"><span className="inline-flex items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" />{[c.address, [c.postalCode, c.city].filter(Boolean).join(' '), c.country].filter(Boolean).join(', ')}</span></InfoRow>
              <InfoRow label="Téléphone">{c.phone ? <a className="inline-flex items-center gap-1.5 hover:text-cyan" href={`tel:${c.phone.replace(/\s/g, '')}`}><Phone className="h-3.5 w-3.5" />{c.phone}</a> : '—'}</InfoRow>
              <InfoRow label="E-mail">{c.email ? <a className="inline-flex items-center gap-1.5 break-all hover:text-cyan" href={`mailto:${c.email}`}><Mail className="h-3.5 w-3.5 shrink-0" />{c.email}</a> : '—'}</InfoRow>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Statistiques" subtitle={`${total} mission${total > 1 ? 's' : ''} · ${c.referenceCount} référence${c.referenceCount > 1 ? 's' : ''} · ${data.completedThisMonth} terminée(s) ce mois`} />
            <div className="space-y-3 p-5">
              {data.missionsByStatus.length === 0 && <p className="text-sm text-muted">Aucune mission pour ce client.</p>}
              {data.missionsByStatus.map((s) => (
                <div key={s.code}>
                  <div className="mb-1 flex justify-between text-[0.8125rem]"><span>{STATUS_META[s.code]?.label ?? s.label}</span><span className="tabular-nums text-muted">{s.count}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full" style={{ width: `${(s.count / Math.max(1, total)) * 100}%`, background: STATUS_META[s.code]?.tone.hex }} /></div>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <Card className="xl:col-span-2">
          <div className="px-5 pt-3"><Tabs value={tab} onChange={setTab} items={[{ value: 'missions', label: 'Missions', count: data.missions.length }, { value: 'references', label: 'Références', count: data.references.length }]} /></div>
          {tab === 'missions' ? (
            <DataTable rows={data.missions} rowKey={(m) => m.id} onRowClick={(m) => navigate(`/missions/${m.id}`)} dense empty={<EmptyState title="Aucune mission" />}
              columns={[
                { key: 'r', header: 'Référence', render: (m) => <span className="ref-code">{m.referenceNumber}</span> },
                { key: 'd', header: 'Date', render: (m) => formatDateTime(m.plannedDate) },
                { key: 't', header: 'Trajet', hideBelow: 'md', render: (m) => `${m.pickupCity} → ${m.deliveryCity}` },
                { key: 'c', header: 'Chauffeur', hideBelow: 'lg', render: (m) => m.driverName ?? <span className="text-subtle">—</span> },
                { key: 's', header: 'Statut', render: (m) => <StatusBadge code={m.statusCode} /> },
              ]} />
          ) : (
            <DataTable rows={data.references} rowKey={(r) => r.id} dense empty={<EmptyState title="Aucune référence" />}
              columns={[
                { key: 'n', header: 'Référence', render: (r) => <span className="ref-code">{r.number}</span> },
                { key: 's', header: 'Statut', render: (r) => r.status === 'OPEN' ? 'Disponible' : r.status === 'USED' ? 'Utilisée' : 'Annulée' },
                { key: 'c', header: 'Créée le', render: (r) => formatDateTime(r.createdAt) },
                { key: 'm', header: 'Mission', render: (r) => r.missionId && r.missionStatusCode ? <Link to={`/missions/${r.missionId}`}><StatusBadge code={r.missionStatusCode} /></Link> : '—' },
              ]} />
          )}
        </Card>
      </div>
      <ClientFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={c} onSaved={setData} />
    </>
  );
}

// ==================================================================== VÉHICULES

function VehicleFormModal({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial: VehicleDto | null; onSaved: (v: VehicleDetail) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ plateNumber: '', brand: '', model: '', type: '', capacityKg: '', capacityM3: '', status: 'AVAILABLE' as VehicleStatus });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setF(initial ? { plateNumber: initial.plateNumber, brand: initial.brand, model: initial.model, type: initial.type, capacityKg: String(initial.capacityKg), capacityM3: initial.capacityM3?.toString() ?? '', status: initial.status }
      : { plateNumber: '', brand: '', model: '', type: '', capacityKg: '', capacityM3: '', status: 'AVAILABLE' });
    setErrors({});
    setFormError(null);
  }, [open, initial]);

  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!/^[A-Za-z0-9 -]{4,15}$/.test(f.plateNumber.trim())) e.plateNumber = 'Immatriculation invalide.';
    if (!f.brand.trim()) e.brand = 'La marque est obligatoire.';
    if (!f.model.trim()) e.model = 'Le modèle est obligatoire.';
    if (!f.type.trim()) e.type = 'Le type est obligatoire.';
    const cap = Number(f.capacityKg.replace(',', '.'));
    if (!cap || cap <= 0) e.capacityKg = 'La capacité doit être positive.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setPending(true);
    setFormError(null);
    try {
      const payload: VehicleUpsert = { plateNumber: f.plateNumber.trim(), brand: f.brand.trim(), model: f.model.trim(), type: f.type.trim(), capacityKg: cap, capacityM3: f.capacityM3 ? Number(f.capacityM3.replace(',', '.')) : null, status: f.status };
      const saved = initial ? await vehiclesApi.update(initial.id, payload) : await vehiclesApi.create(payload);
      invalidateOptions('vehicles');
      toast.success(initial ? 'Véhicule modifié avec succès.' : 'Véhicule créé avec succès.', saved.vehicle.plateNumber);
      onSaved(saved);
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err as ApiError));
      setFormError((err as ApiError).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Modifier ${initial.plateNumber}` : 'Nouveau véhicule'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={pending}>Annuler</Button><Button onClick={submit} loading={pending}>{initial ? 'Enregistrer' : 'Créer le véhicule'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Immatriculation" required value={f.plateNumber} onChange={(e) => set('plateNumber', e.target.value.toUpperCase())} error={errors.plateNumber} placeholder="AB-123-CD" maxLength={15} />
        <Input label="Type" required value={f.type} onChange={(e) => set('type', e.target.value)} error={errors.type} placeholder="Semi-remorque" list="vehicle-types" maxLength={60} />
        <datalist id="vehicle-types"><option value="Semi-remorque" /><option value="Porteur" /><option value="Porteur frigorifique" /><option value="Fourgon" /><option value="Plateau" /></datalist>
        <Input label="Marque" required value={f.brand} onChange={(e) => set('brand', e.target.value)} error={errors.brand} maxLength={80} />
        <Input label="Modèle" required value={f.model} onChange={(e) => set('model', e.target.value)} error={errors.model} maxLength={80} />
        <Input label="Capacité (kg)" required inputMode="decimal" value={f.capacityKg} onChange={(e) => set('capacityKg', e.target.value)} error={errors.capacityKg} />
        <Input label="Volume utile (m³)" inputMode="decimal" value={f.capacityM3} onChange={(e) => set('capacityM3', e.target.value)} />
        <Select label="Statut" className="sm:col-span-2" value={f.status} onChange={(e) => set('status', e.target.value)}>
          {(Object.keys(VEHICLE_STATUS) as VehicleStatus[]).map((s) => <option key={s} value={s}>{VEHICLE_STATUS[s].label}</option>)}
        </Select>
      </div>
      {formError && <p className="mt-4 rounded-lg bg-stop/10 px-3 py-2 text-sm text-stop" role="alert">{formError}</p>}
    </Modal>
  );
}

export function VehiclesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const { state, update, toggleSort } = useListState<PagedQuery & { status?: string }>({ page: 1, pageSize: 15, status: '' });
  useEffect(() => { update({ search: debounced }); }, [debounced, update]);
  const { data, loading, error, reload } = useApi((s) => vehiclesApi.list(state, s), [JSON.stringify(state)]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleDto | null>(null);

  return (
    <>
      <PageHeader title="Véhicules" subtitle="Flotte, capacités et disponibilité"
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Nouveau véhicule</Button>} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line/70 p-4 sm:flex-row">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une immatriculation, une marque…" className="sm:w-96" />
          <Select aria-label="Statut" className="sm:w-56" value={state.status} onChange={(e) => update({ status: e.target.value })} placeholder="Tous les statuts">
            {(Object.keys(VEHICLE_STATUS) as VehicleStatus[]).map((s) => <option key={s} value={s}>{VEHICLE_STATUS[s].label}</option>)}
          </Select>
        </div>
        <DataTable<VehicleDto>
          rows={data?.items} loading={loading} error={error?.message} onRetry={reload} rowKey={(v) => v.id}
          onRowClick={(v) => navigate(`/vehicles/${v.id}`)} sortBy={state.sortBy} sortDir={state.sortDir} onSort={toggleSort}
          empty={<EmptyState title="Aucun véhicule" description="Ajoutez les véhicules de votre flotte." />}
          columns={[
            { key: 'plate', header: 'Immatriculation', sortKey: 'plate', render: (v) => <span className="ref-code rounded border border-line bg-raised px-1.5 py-0.5">{v.plateNumber}</span> },
            { key: 'brand', header: 'Marque', sortKey: 'brand', render: (v) => v.brand },
            { key: 'model', header: 'Modèle', hideBelow: 'md', render: (v) => v.model },
            { key: 'type', header: 'Type', sortKey: 'type', hideBelow: 'lg', render: (v) => v.type },
            { key: 'cap', header: 'Capacité', sortKey: 'capacity', className: 'tabular-nums', render: (v) => <span>{formatNumber(v.capacityKg, ' kg')}{v.capacityM3 ? <span className="text-muted"> · {formatNumber(v.capacityM3, ' m³')}</span> : null}</span> },
            { key: 'driver', header: 'Chauffeur', hideBelow: 'xl', render: (v) => v.driverName ?? <span className="text-subtle">—</span> },
            { key: 'status', header: 'Statut', sortKey: 'status', render: (v) => <VehicleStatusBadge status={v.status} /> },
            { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right', render: (v) => <div onClick={(e) => e.stopPropagation()}><IconButton label="Modifier" onClick={() => { setEditing(v); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton></div> },
          ]}
        />
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={(p) => update({ page: p }, false)} />}
      </Card>
      <VehicleFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSaved={() => reload()} />
    </>
  );
}

export function VehicleDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => vehiclesApi.get(Number(id)), [id]);
  const [formOpen, setFormOpen] = useState(false);

  if (error) return <Card><ErrorState message={error.message} onRetry={reload} /></Card>;
  if (loading || !data) return <div className="space-y-4"><Skeleton className="h-16 w-80" /><Skeleton className="h-72" /></div>;
  const v = data.vehicle;

  const changeStatus = async (status: VehicleStatus) => {
    try {
      setData(await vehiclesApi.setStatus(v.id, status));
      invalidateOptions('vehicles');
      toast.success('Statut du véhicule mis à jour.', VEHICLE_STATUS[status].label);
    } catch (e) { toast.error((e as ApiError).message); }
  };

  return (
    <>
      <Link to="/vehicles" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Véhicules</Link>
      <PageHeader title={<span className="ref-code">{v.plateNumber}</span>} subtitle={`${v.brand} ${v.model} · ${v.type}`}
        actions={<>
          <Select aria-label="Statut du véhicule" value={v.status} onChange={(e) => changeStatus(e.target.value as VehicleStatus)} className="w-48">
            {(Object.keys(VEHICLE_STATUS) as VehicleStatus[]).map((s) => <option key={s} value={s}>{VEHICLE_STATUS[s].label}</option>)}
          </Select>
          <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setFormOpen(true)}>Modifier</Button>
        </>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Caractéristiques" />
          <dl className="divide-y divide-line/60 px-5 py-1">
            <InfoRow label="Immatriculation"><span className="ref-code">{v.plateNumber}</span></InfoRow>
            <InfoRow label="Marque / modèle">{v.brand} {v.model}</InfoRow>
            <InfoRow label="Type">{v.type}</InfoRow>
            <InfoRow label="Capacité">{formatNumber(v.capacityKg, ' kg')}</InfoRow>
            <InfoRow label="Volume utile">{formatNumber(v.capacityM3, ' m³')}</InfoRow>
            <InfoRow label="Statut"><VehicleStatusBadge status={v.status} /></InfoRow>
            <InfoRow label="Chauffeur habituel">{v.driverId ? <Link className="hover:text-cyan" to={`/drivers/${v.driverId}`}>{v.driverName}</Link> : '—'}</InfoRow>
            <InfoRow label="Mission en cours">{v.currentMissionId ? <Link className="ref-code hover:text-cyan" to={`/missions/${v.currentMissionId}`}>{v.currentMissionReference}</Link> : '—'}</InfoRow>
          </dl>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Historique d'utilisation" subtitle={`${data.totalMissions} mission(s) réalisée(s) ou en cours`} />
          <DataTable rows={data.history} rowKey={(h) => `${h.missionId}-${h.assignedAt}`} dense empty={<EmptyState title="Ce véhicule n'a encore été affecté à aucune mission" />}
            columns={[
              { key: 'r', header: 'Mission', render: (h) => <Link to={`/missions/${h.missionId}`} className="ref-code hover:text-cyan">{h.referenceNumber}</Link> },
              { key: 'c', header: 'Client', render: (h) => h.clientName },
              { key: 'a', header: 'Affectée le', render: (h) => formatDateTime(h.assignedAt) },
              { key: 's', header: 'Statut mission', render: (h) => h.missionStatusLabel },
            ]} />
        </Card>
      </div>
      <VehicleFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={v} onSaved={setData} />
    </>
  );
}
