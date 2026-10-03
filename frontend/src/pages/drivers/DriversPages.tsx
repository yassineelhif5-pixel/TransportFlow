import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Download, Eye, KeyRound, Pencil, Plus, Power, Smartphone } from 'lucide-react';
import { driversApi } from '@/api/endpoints';
import { ApiError } from '@/api/apiClient';
import { useApi, useDebounce, useListState } from '@/hooks/useApi';
import { invalidateOptions, useVehicleOptions } from '@/hooks/useOptions';
import type { DriverDetail, DriverDto, DriverUpsert, PagedQuery } from '@/types';
import { formatDate, formatDateTime, initials } from '@/utils/format';
import { Button, Checkbox, IconButton, Input, SearchInput, Select } from '@/components/ui/Controls';
import { ActiveBadge, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, InfoRow, Modal, PageHeader, Skeleton, StatusBadge } from '@/components/ui/Display';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';

const PHONE = /^\+?[0-9 .\-()]{6,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function DriverFormModal({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial: DriverDto | null; onSaved: (d: DriverDetail) => void }) {
  const toast = useToast();
  const vehicles = useVehicleOptions();
  const [f, setF] = useState<DriverUpsert>({ firstName: '', lastName: '', phone: '', licenseNumber: '', licenseExpiryDate: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setF(initial ? {
      firstName: initial.firstName, lastName: initial.lastName, email: initial.email ?? '', phone: initial.phone, licenseNumber: initial.licenseNumber,
      licenseExpiryDate: initial.licenseExpiryDate.slice(0, 10), defaultVehicleId: initial.defaultVehicleId ?? null, createAccount: false,
    } : { firstName: '', lastName: '', email: '', phone: '', licenseNumber: '', licenseExpiryDate: '', defaultVehicleId: null, createAccount: true, username: '', password: '' });
    setErrors({});
    setFormError(null);
  }, [open, initial]);

  const set = <K extends keyof DriverUpsert>(k: K, v: DriverUpsert[K]) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const canCreateAccount = !initial || !initial.hasUserAccount;

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!f.firstName.trim()) e.firstName = 'Le prénom est obligatoire.';
    if (!f.lastName.trim()) e.lastName = 'Le nom est obligatoire.';
    if (!PHONE.test(f.phone.trim())) e.phone = 'Numéro de téléphone invalide.';
    if (f.email && !EMAIL.test(f.email.trim())) e.email = 'Adresse e-mail invalide.';
    if (!f.licenseNumber.trim()) e.licenseNumber = 'Le numéro de permis est obligatoire.';
    if (!f.licenseExpiryDate) e.licenseExpiryDate = "La date d'expiration est obligatoire.";
    if (f.createAccount && canCreateAccount) {
      if (!f.email?.trim()) e.email = "L'e-mail est obligatoire pour créer un accès.";
      const p = f.password ?? '';
      if (p.length < 8 || !/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/\d/.test(p)) e.password = '8 caractères minimum, avec majuscule, minuscule et chiffre.';
    }
    setErrors(e);
    if (Object.keys(e).length) return;

    setPending(true);
    setFormError(null);
    try {
      const payload: DriverUpsert = { ...f, createAccount: !!f.createAccount && canCreateAccount, email: f.email?.trim() || undefined, username: f.username?.trim() || undefined };
      const saved = initial ? await driversApi.update(initial.id, payload) : await driversApi.create(payload);
      invalidateOptions('drivers');
      toast.success(initial ? 'Chauffeur modifié avec succès.' : 'Chauffeur créé avec succès.', saved.driver.fullName);
      onSaved(saved);
      onClose();
    } catch (err) {
      const apiErr = err as ApiError;
      setErrors(Object.fromEntries(Object.entries(apiErr.errors ?? {}).map(([k, v]) => [k, v[0]])));
      setFormError(apiErr.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Modifier ${initial.fullName}` : 'Nouveau chauffeur'} size="lg"
      footer={<><Button variant="secondary" onClick={onClose} disabled={pending}>Annuler</Button><Button onClick={submit} loading={pending}>{initial ? 'Enregistrer' : 'Créer le chauffeur'}</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Prénom" required value={f.firstName} onChange={(e) => set('firstName', e.target.value)} error={errors.firstName} maxLength={100} />
        <Input label="Nom" required value={f.lastName} onChange={(e) => set('lastName', e.target.value)} error={errors.lastName} maxLength={100} />
        <Input label="Téléphone" required type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} placeholder="06 12 34 56 78" />
        <Input label="E-mail" type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} error={errors.email} maxLength={256} />
        <Input label="Numéro de permis" required value={f.licenseNumber} onChange={(e) => set('licenseNumber', e.target.value.toUpperCase())} error={errors.licenseNumber} maxLength={50} />
        <Input label="Expiration du permis" required type="date" value={f.licenseExpiryDate} onChange={(e) => set('licenseExpiryDate', e.target.value)} error={errors.licenseExpiryDate} />
        <Select label="Véhicule habituel" className="md:col-span-2" value={f.defaultVehicleId ?? ''} onChange={(e) => set('defaultVehicleId', e.target.value ? Number(e.target.value) : null)} placeholder="Aucun">
          {vehicles.filter((v) => v.isActive).map((v) => <option key={v.id} value={v.id}>{v.plateNumber} — {v.brand} {v.model} ({v.type})</option>)}
        </Select>
      </div>

      {canCreateAccount && (
        <div className="mt-5 rounded-xl border border-line bg-raised/40 p-4">
          <Checkbox id="create-account" checked={!!f.createAccount} onChange={(v) => set('createAccount', v)}
            label={<span className="inline-flex items-center gap-2 text-ink"><Smartphone className="h-4 w-4 text-cyan" /> Créer l'accès à l'application mobile chauffeur</span>} />
          <p className="ml-6 mt-1 text-xs text-muted">Obligatoire pour pouvoir affecter des missions. Le mot de passe devra être changé à la première connexion.</p>
          {f.createAccount && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Input label="Identifiant" value={f.username ?? ''} onChange={(e) => set('username', e.target.value)} hint="Par défaut : l'adresse e-mail" error={errors.username} maxLength={100} />
              <Input label="Mot de passe provisoire" required type="password" autoComplete="new-password" value={f.password ?? ''} onChange={(e) => set('password', e.target.value)} error={errors.password} leading={<KeyRound className="h-4 w-4" />} />
            </div>
          )}
        </div>
      )}
      {formError && <p className="mt-4 rounded-lg bg-stop/10 px-3 py-2 text-sm text-stop" role="alert">{formError}</p>}
    </Modal>
  );
}

function LicenseCell({ d }: { d: DriverDto }) {
  if (d.licenseExpired) return <span className="inline-flex items-center gap-1 text-stop"><AlertTriangle className="h-3.5 w-3.5" /> {formatDate(d.licenseExpiryDate)}</span>;
  if (d.licenseExpiresSoon) return <span className="inline-flex items-center gap-1 text-warn"><AlertTriangle className="h-3.5 w-3.5" /> {formatDate(d.licenseExpiryDate)}</span>;
  return <span>{formatDate(d.licenseExpiryDate)}</span>;
}

export function DriversPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const { state, update, toggleSort } = useListState<PagedQuery & { isActive?: boolean }>({ page: 1, pageSize: 15 });
  useEffect(() => { update({ search: debounced }); }, [debounced, update]);
  const { data, loading, error, reload } = useApi((s) => driversApi.list(state, s), [JSON.stringify(state)]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DriverDto | null>(null);
  const [toggling, setToggling] = useState<DriverDto | null>(null);
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    if (!toggling) return;
    setPending(true);
    try {
      await driversApi.setActive(toggling.id, !toggling.isActive);
      invalidateOptions('drivers');
      toast.success(toggling.isActive ? 'Chauffeur désactivé.' : 'Chauffeur activé.', toggling.fullName);
      setToggling(null);
      reload();
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader title="Chauffeurs" subtitle="Équipe de conduite, permis et accès mobile"
        actions={<>
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => driversApi.export(state, 'csv').catch((e) => toast.error((e as ApiError).message))}>Exporter</Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Nouveau chauffeur</Button>
        </>} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line/70 p-4 sm:flex-row">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un nom, un téléphone, un permis…" className="sm:w-96" />
          <Select aria-label="Statut" className="sm:w-48" value={state.isActive === undefined ? '' : String(state.isActive)} onChange={(e) => update({ isActive: e.target.value === '' ? undefined : e.target.value === 'true' })} placeholder="Tous">
            <option value="true">Actifs</option><option value="false">Inactifs</option>
          </Select>
        </div>
        <DataTable<DriverDto>
          rows={data?.items} loading={loading} error={error?.message} onRetry={reload} rowKey={(d) => d.id}
          onRowClick={(d) => navigate(`/drivers/${d.id}`)} sortBy={state.sortBy} sortDir={state.sortDir} onSort={toggleSort}
          empty={<EmptyState title="Aucun chauffeur" description="Ajoutez vos chauffeurs pour leur affecter des missions." action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>Nouveau chauffeur</Button>} />}
          columns={[
            { key: 'last', header: 'Nom', sortKey: 'lastName', render: (d) => <span className="font-medium">{d.lastName}</span> },
            { key: 'first', header: 'Prénom', sortKey: 'firstName', render: (d) => d.firstName },
            { key: 'email', header: 'E-mail', hideBelow: '2xl', render: (d) => <span className="text-muted">{d.email ?? '—'}</span> },
            { key: 'phone', header: 'Téléphone', hideBelow: 'md', render: (d) => d.phone },
            { key: 'license', header: 'N° permis', hideBelow: '2xl', render: (d) => <span className="ref-code">{d.licenseNumber}</span> },
            { key: 'exp', header: 'Expiration permis', sortKey: 'license', hideBelow: 'lg', render: (d) => <LicenseCell d={d} /> },
            { key: 'vehicle', header: 'Véhicule', hideBelow: 'md', render: (d) => d.vehiclePlate ? <span className="ref-code">{d.vehiclePlate}</span> : <span className="text-subtle">—</span> },
            { key: 'status', header: 'Statut', sortKey: 'status', render: (d) => <span className="flex flex-col gap-0.5"><ActiveBadge active={d.isActive} />{!d.userActive && d.isActive && <span className="text-2xs text-warn">Sans accès mobile</span>}</span> },
            { key: 'missions', header: 'En cours', className: 'tabular-nums', render: (d) => d.activeMissions > 0 ? <span className="font-medium text-cyan">{d.activeMissions}</span> : <span className="text-subtle">0</span> },
            {
              key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right',
              render: (d) => (
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                  <IconButton label="Voir" onClick={() => navigate(`/drivers/${d.id}`)}><Eye className="h-4 w-4" /></IconButton>
                  <IconButton label="Modifier" onClick={() => { setEditing(d); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
                  <IconButton label={d.isActive ? 'Désactiver' : 'Activer'} className={d.isActive ? 'hover:text-stop' : 'hover:text-go'} onClick={() => setToggling(d)}><Power className="h-4 w-4" /></IconButton>
                </div>
              ),
            },
          ]}
        />
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={(p) => update({ page: p }, false)} />}
      </Card>
      <DriverFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSaved={() => reload()} />
      <ConfirmDialog open={!!toggling} onClose={() => setToggling(null)} onConfirm={toggle} loading={pending} tone={toggling?.isActive ? 'danger' : 'primary'}
        title={toggling?.isActive ? 'Désactiver ce chauffeur ?' : 'Réactiver ce chauffeur ?'} confirmLabel={toggling?.isActive ? 'Désactiver' : 'Activer'}
        message={toggling?.isActive ? <>{toggling.fullName} ne pourra plus recevoir de mission ni se connecter à l'application mobile.</> : <>{toggling?.fullName} pourra de nouveau recevoir des missions.</>} />
    </>
  );
}

export function DriverDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload, setData } = useApi(() => driversApi.get(Number(id)), [id]);
  const [formOpen, setFormOpen] = useState(false);

  if (error) return <Card><ErrorState message={error.message} onRetry={reload} /></Card>;
  if (loading || !data) return <div className="space-y-4"><Skeleton className="h-16 w-80" /><Skeleton className="h-72" /></div>;
  const d = data.driver;

  return (
    <>
      <Link to="/drivers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Chauffeurs</Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand to-cyan text-lg font-semibold text-white">{initials(d.fullName)}</span>
          <div>
            <h1 className="text-2xl font-semibold">{d.firstName} {d.lastName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted"><ActiveBadge active={d.isActive} /> {d.phone} {d.username && <span>· accès : {d.username}</span>}</div>
          </div>
        </div>
        <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setFormOpen(true)}>Modifier</Button>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line/80 bg-line/70 shadow-card">
        {[{ l: 'Missions en cours', v: d.activeMissions }, { l: 'Missions terminées', v: data.completedMissions }, { l: 'Affectations', v: data.totalAssignments }].map((k) => (
          <div key={k.l} className="bg-surface px-5 py-4"><p className="text-xs text-muted">{k.l}</p><p className="mt-1 text-2xl font-semibold tabular-nums" style={{ fontStretch: '112%' }}>{k.v}</p></div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Informations personnelles" />
            <dl className="divide-y divide-line/60 px-5 py-1">
              <InfoRow label="Nom">{d.lastName}</InfoRow>
              <InfoRow label="Prénom">{d.firstName}</InfoRow>
              <InfoRow label="Téléphone">{d.phone}</InfoRow>
              <InfoRow label="E-mail">{d.email ?? '—'}</InfoRow>
              <InfoRow label="Accès mobile">{d.hasUserAccount ? (d.userActive ? 'Actif' : 'Désactivé') : 'Non créé'}</InfoRow>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Permis" />
            <dl className="divide-y divide-line/60 px-5 py-1">
              <InfoRow label="Numéro"><span className="ref-code">{d.licenseNumber}</span></InfoRow>
              <InfoRow label="Expiration"><LicenseCell d={d} /></InfoRow>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Véhicule" />
            <div className="px-5 py-4 text-sm">{d.vehiclePlate ? <Link to={`/vehicles/${d.defaultVehicleId}`} className="ref-code hover:text-cyan">{d.vehiclePlate}</Link> : <span className="text-muted">Aucun véhicule habituel.</span>}</div>
          </Card>
        </div>
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Missions en cours" />
            <DataTable rows={data.currentMissions} rowKey={(m) => m.id} onRowClick={(m) => navigate(`/missions/${m.id}`)} dense
              empty={<EmptyState title="Aucune mission en cours" />}
              columns={[
                { key: 'r', header: 'Référence', render: (m) => <Link to={`/missions/${m.id}`} className="ref-code hover:text-cyan" onClick={(e) => e.stopPropagation()}>{m.referenceNumber}</Link> },
                { key: 'c', header: 'Client', render: (m) => m.clientName },
                { key: 'd', header: 'Date', render: (m) => formatDateTime(m.plannedDate) },
                { key: 't', header: 'Trajet', hideBelow: 'lg', render: (m) => `${m.pickupCity} → ${m.deliveryCity}` },
                { key: 's', header: 'Statut', render: (m) => <StatusBadge code={m.statusCode} /> },
              ]} />
          </Card>
          <Card>
            <CardHeader title="Historique des affectations" />
            <DataTable rows={data.history} rowKey={(h) => `${h.missionId}-${h.assignedAt}`} dense
              empty={<EmptyState title="Aucune affectation" />}
              columns={[
                { key: 'r', header: 'Mission', render: (h) => <Link to={`/missions/${h.missionId}`} className="ref-code hover:text-cyan">{h.referenceNumber}</Link> },
                { key: 'c', header: 'Client', render: (h) => h.clientName },
                { key: 'a', header: 'Affectée le', render: (h) => formatDateTime(h.assignedAt) },
                { key: 's', header: 'Affectation', render: (h) => <span className="text-muted">{h.status === 'ACTIVE' ? 'Active' : h.status === 'REPLACED' ? 'Remplacée' : 'Clôturée'}</span> },
                { key: 'm', header: 'Statut mission', hideBelow: 'md', render: (h) => h.missionStatusLabel },
              ]} />
          </Card>
        </div>
      </div>
      <DriverFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={d} onSaved={setData} />
    </>
  );
}
