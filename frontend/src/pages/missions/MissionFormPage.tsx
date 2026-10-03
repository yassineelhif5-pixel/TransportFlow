import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock, MapPin, Navigation, Package, UserPlus } from 'lucide-react';
import { missionsApi, referencesApi } from '@/api/endpoints';
import { ApiError } from '@/api/apiClient';
import { useClientOptions, useDriverOptions, useVehicleOptions } from '@/hooks/useOptions';
import type { LocationInput, MissionDetail, MissionUpsert, ReferenceDto } from '@/types';
import { fromLocalInput, toLocalInput } from '@/utils/format';
import { Button, Input, Select, Textarea } from '@/components/ui/Controls';
import { Card, CardHeader, ErrorState, PageHeader, Skeleton } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';

const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-_/.]{1,49}$/;
const emptyLocation: LocationInput = { address: '', city: '', postalCode: '', country: 'France' };

interface FormState {
  referenceNumber: string;
  clientId: string;
  plannedDate: string;
  pickup: LocationInput;
  delivery: LocationInput;
  description: string;
  goods: string;
  weightKg: string;
  volumeM3: string;
  driverId: string;
  vehicleId: string;
}

type Errors = Record<string, string | undefined>;

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (!f.referenceNumber.trim()) e.referencenumber = 'La référence est obligatoire.';
  else if (!REF_PATTERN.test(f.referenceNumber.trim())) e.referencenumber = 'Format invalide (2 à 50 caractères : lettres, chiffres, - _ / .).';
  if (!f.clientId) e.clientid = 'Le client est obligatoire.';
  if (!f.plannedDate) e.planneddate = 'La date prévue est obligatoire.';
  for (const k of ['pickup', 'delivery'] as const) {
    if (!f[k].address.trim()) e[`${k}.address`] = "L'adresse est obligatoire.";
    if (!f[k].city.trim()) e[`${k}.city`] = 'La ville est obligatoire.';
  }
  const w = f.weightKg ? Number(f.weightKg.replace(',', '.')) : null;
  if (w !== null && (Number.isNaN(w) || w < 0 || w > 100000)) e.weightkg = 'Le poids doit être compris entre 0 et 100 000 kg.';
  const v = f.volumeM3 ? Number(f.volumeM3.replace(',', '.')) : null;
  if (v !== null && (Number.isNaN(v) || v < 0 || v > 1000)) e.volumem3 = 'Le volume doit être compris entre 0 et 1 000 m³.';
  return e;
}

/** Erreurs de validation renvoyées par l'API, indexées en minuscules (ex. « pickup.address »). */
function serverErrors(err: ApiError): Errors {
  const out: Errors = {};
  for (const [k, v] of Object.entries(err.errors ?? {})) out[k.toLowerCase()] = v[0];
  return out;
}

function LocationFields({ title, icon, value, onChange, errors, prefix }: { title: string; icon: React.ReactNode; value: LocationInput; onChange: (v: LocationInput) => void; errors: Errors; prefix: 'pickup' | 'delivery' }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 flex items-center gap-2 text-sm font-medium">{icon}{title}</legend>
      <Input label="Adresse" required value={value.address} onChange={(e) => onChange({ ...value, address: e.target.value })} error={errors[`${prefix}.address`]} maxLength={250} placeholder="12 rue des Entrepôts" />
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <Input label="Code postal" value={value.postalCode ?? ''} onChange={(e) => onChange({ ...value, postalCode: e.target.value })} maxLength={20} />
        <Input label="Ville" required value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} error={errors[`${prefix}.city`]} maxLength={120} />
      </div>
    </fieldset>
  );
}

export default function MissionFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const clients = useClientOptions(true);
  const drivers = useDriverOptions(true);
  const vehicles = useVehicleOptions();

  const [form, setForm] = useState<FormState>({
    referenceNumber: query.get('ref') ?? '', clientId: query.get('client') ?? '', plannedDate: '', pickup: { ...emptyLocation }, delivery: { ...emptyLocation },
    description: '', goods: '', weightKg: '', volumeM3: '', driverId: '', vehicleId: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<'save' | 'assign' | null>(null);
  const [loaded, setLoaded] = useState<MissionDetail | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [availableRefs, setAvailableRefs] = useState<ReferenceDto[]>([]);

  useEffect(() => {
    if (!isEdit) return;
    missionsApi.get(Number(id)).then((m) => {
      setLoaded(m);
      setForm({
        referenceNumber: m.referenceNumber, clientId: String(m.client.id), plannedDate: toLocalInput(m.plannedDate),
        pickup: { address: m.pickup.address, city: m.pickup.city, postalCode: m.pickup.postalCode ?? '', country: m.pickup.country },
        delivery: { address: m.delivery.address, city: m.delivery.city, postalCode: m.delivery.postalCode ?? '', country: m.delivery.country },
        description: m.description ?? '', goods: m.goods ?? '', weightKg: m.weightKg?.toString() ?? '', volumeM3: m.volumeM3?.toString() ?? '',
        driverId: '', vehicleId: '',
      });
    }).catch((e) => setLoadError(e as ApiError));
  }, [id, isEdit]);

  // Références disponibles (sans mission) du client choisi, proposées à la saisie.
  useEffect(() => {
    if (!form.clientId) { setAvailableRefs([]); return; }
    referencesApi.list({ clientId: Number(form.clientId), available: true, pageSize: 50 }).then((r) => setAvailableRefs(r.items)).catch(() => setAvailableRefs([]));
  }, [form.clientId]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [String(k).toLowerCase()]: undefined }));
  };

  const driver = drivers.find((d) => String(d.id) === form.driverId);
  useEffect(() => {
    if (driver?.defaultVehicleId) setForm((f) => (f.vehicleId ? f : { ...f, vehicleId: String(driver.defaultVehicleId) }));
  }, [driver]);

  const referenceLocked = isEdit && loaded?.status.code !== 'CREATED';
  const locked = isEdit && loaded?.isLocked;

  const payload = useMemo<MissionUpsert>(() => ({
    referenceNumber: form.referenceNumber.trim(),
    clientId: Number(form.clientId),
    plannedDate: form.plannedDate ? fromLocalInput(form.plannedDate) : '',
    pickup: { ...form.pickup, address: form.pickup.address.trim(), city: form.pickup.city.trim() },
    delivery: { ...form.delivery, address: form.delivery.address.trim(), city: form.delivery.city.trim() },
    description: form.description.trim() || undefined,
    goods: form.goods.trim() || undefined,
    weightKg: form.weightKg ? Number(form.weightKg.replace(',', '.')) : null,
    volumeM3: form.volumeM3 ? Number(form.volumeM3.replace(',', '.')) : null,
  }), [form]);

  const submit = async (mode: 'save' | 'assign') => {
    const v = validate(form);
    setErrors(v);
    setFormError(null);
    if (Object.values(v).some(Boolean)) {
      setFormError('Corrigez les champs signalés.');
      return;
    }
    setPending(mode);
    try {
      const data: MissionUpsert = mode === 'assign' && form.driverId ? { ...payload, driverId: Number(form.driverId), vehicleId: form.vehicleId ? Number(form.vehicleId) : null } : payload;
      const result = isEdit ? await missionsApi.update(Number(id), data) : await missionsApi.create(data);
      if (isEdit) toast.success('Mission modifiée avec succès.');
      else toast.success(mode === 'assign' && form.driverId ? 'Mission créée et affectée avec succès.' : 'Mission créée avec succès.', result.referenceNumber);
      // Sans chauffeur choisi : la fiche s'ouvre directement sur l'affectation.
      navigate(`/missions/${result.id}${mode === 'assign' && !form.driverId ? '?assign=1' : ''}`);
    } catch (e) {
      const err = e as ApiError;
      setErrors(serverErrors(err));
      if (err.code === 'REFERENCE_ALREADY_USED' || err.code === 'REFERENCE_CLIENT_MISMATCH' || err.code === 'REFERENCE_DELETED' || err.code === 'REFERENCE_CANCELLED') setErrors({ referencenumber: err.message });
      setFormError(err.message);
    } finally {
      setPending(null);
    }
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); submit('save'); };

  if (loadError) return <Card><ErrorState message={loadError.message} /></Card>;
  if (isEdit && !loaded) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-96" /></div>;

  return (
    <form onSubmit={onSubmit} noValidate>
      <PageHeader
        back={<Link to={isEdit ? `/missions/${id}` : '/missions'} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> {isEdit ? 'Retour à la mission' : 'Missions'}</Link>}
        title={isEdit ? `Modifier la mission ${loaded?.referenceNumber}` : 'Nouvelle mission'}
        subtitle={isEdit ? 'Les modifications sont tracées dans l\'historique.' : 'Une mission est toujours liée à une référence et à un client.'}
      />

      {locked && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm"><Lock className="h-4 w-4 text-warn" /> Cette mission est « {loaded?.status.label} » : elle ne peut plus être modifiée.</div>
      )}

      <fieldset disabled={!!locked} className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Informations" />
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Select label="Client" required value={form.clientId} onChange={(e) => set('clientId', e.target.value)} placeholder="Choisir un client" error={errors.clientid} disabled={referenceLocked}>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
              </Select>
              <Input
                label="Référence" required value={form.referenceNumber} onChange={(e) => set('referenceNumber', e.target.value.toUpperCase())}
                error={errors.referencenumber} list="available-refs" placeholder="REF-2026-00125" maxLength={50} disabled={referenceLocked}
                hint={referenceLocked ? 'Non modifiable après affectation.' : availableRefs.length ? `${availableRefs.length} référence(s) disponible(s) pour ce client. Une nouvelle référence sera créée sinon.` : 'Une nouvelle référence sera créée si elle n\'existe pas.'}
              />
              <datalist id="available-refs">{availableRefs.map((r) => <option key={r.id} value={r.number}>{r.notes ?? ''}</option>)}</datalist>
              <Input type="datetime-local" label="Date prévue" required value={form.plannedDate} onChange={(e) => set('plannedDate', e.target.value)} error={errors.planneddate} />
              <div />
              <Textarea label="Description" className="md:col-span-2" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} placeholder="Consignes, horaires de quai, contact sur place…" />
            </div>
          </Card>

          <Card>
            <CardHeader title="Trajet" />
            <div className="grid gap-8 p-5 md:grid-cols-2">
              <LocationFields title="Lieu de chargement" icon={<MapPin className="h-4 w-4 text-brand-400" />} value={form.pickup} onChange={(v) => set('pickup', v)} errors={errors} prefix="pickup" />
              <LocationFields title="Lieu de livraison" icon={<Navigation className="h-4 w-4 text-go-400" />} value={form.delivery} onChange={(v) => set('delivery', v)} errors={errors} prefix="delivery" />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Package className="h-4 w-4 text-cyan" /> Marchandise</span>} />
            <div className="space-y-4 p-5">
              <Input label="Nature de la marchandise" value={form.goods} onChange={(e) => set('goods', e.target.value)} maxLength={250} placeholder="Palettes produits secs" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Poids (kg)" inputMode="decimal" value={form.weightKg} onChange={(e) => set('weightKg', e.target.value)} error={errors.weightkg} placeholder="18 000" />
                <Input label="Volume (m³)" inputMode="decimal" value={form.volumeM3} onChange={(e) => set('volumeM3', e.target.value)} error={errors.volumem3} placeholder="60" />
              </div>
            </div>
          </Card>

          {!isEdit && (
            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-2"><UserPlus className="h-4 w-4 text-cyan" /> Chauffeur</span>} subtitle="Optionnel : affectez directement la mission." />
              <div className="space-y-4 p-5">
                <Select label="Chauffeur" value={form.driverId} onChange={(e) => { set('driverId', e.target.value); set('vehicleId', ''); }} placeholder="Affecter plus tard" error={errors.driverid}>
                  {drivers.map((d) => <option key={d.id} value={d.id} disabled={!d.userActive || d.licenseExpired}>{d.lastName} {d.firstName}{d.licenseExpired ? ' (permis expiré)' : !d.userActive ? ' (sans accès)' : ''}</option>)}
                </Select>
                {form.driverId && (
                  <Select label="Véhicule" value={form.vehicleId} onChange={(e) => set('vehicleId', e.target.value)} placeholder="Sans véhicule">
                    {vehicles.map((v) => <option key={v.id} value={v.id} disabled={v.status === 'MAINTENANCE' || v.status === 'OUT_OF_SERVICE'}>{v.plateNumber} — {v.brand} {v.model}</option>)}
                  </Select>
                )}
              </div>
            </Card>
          )}
        </div>
      </fieldset>

      {formError && <p className="mt-6 rounded-xl border border-stop/30 bg-stop/10 px-4 py-3 text-sm text-ink" role="alert">{formError}</p>}

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap justify-end gap-2 border-t border-line/70 bg-bg/90 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Button variant="secondary" onClick={() => navigate(isEdit ? `/missions/${id}` : '/missions')} disabled={!!pending}>Annuler</Button>
        <Button type="submit" variant={isEdit ? 'primary' : 'secondary'} loading={pending === 'save'} disabled={!!pending || !!locked}>Enregistrer</Button>
        {!isEdit && <Button onClick={() => submit('assign')} loading={pending === 'assign'} disabled={!!pending} icon={<UserPlus className="h-4 w-4" />}>Enregistrer et affecter</Button>}
      </div>
    </form>
  );
}
