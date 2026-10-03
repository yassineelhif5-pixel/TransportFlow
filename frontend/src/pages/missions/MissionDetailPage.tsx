import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { AlertTriangle, ArrowLeft, Ban, FilePlus2, Lock, Mail, Pencil, Phone, RefreshCw, Trash2, Truck, UserPlus } from 'lucide-react';
import { missionsApi } from '@/api/endpoints';
import { ApiError } from '@/api/apiClient';
import { useApi } from '@/hooks/useApi';
import type { MissionDetail, MissionStatusCode } from '@/types';
import { LIFECYCLE, STATUS_META, formatDateTime, formatNumber, formatRelative, initials } from '@/utils/format';
import { Button } from '@/components/ui/Controls';
import { Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, InfoRow, Skeleton, StatusBadge } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { DocumentList, DocumentUploader } from '@/components/Documents';
import { MissionTimeline } from '@/components/Timeline';
import { AssignMissionModal, ChangeStatusModal } from '@/features/missions/MissionModals';

/** Progression dans le cycle de vie : Créée → … → Terminée, avec états hors-cycle (anomalie, annulée). */
function Lifecycle({ status }: { status: MissionStatusCode }) {
  const offTrack = status === 'ANOMALY' || status === 'CANCELLED';
  const idx = LIFECYCLE.indexOf(status);
  return (
    <div className="card overflow-hidden px-5 py-5">
      <ol className="relative grid grid-cols-6 gap-1">
        {LIFECYCLE.map((code, i) => {
          const done = !offTrack && idx >= i;
          const current = !offTrack && idx === i;
          const meta = STATUS_META[code];
          return (
            <li key={code} className="relative flex flex-col items-center text-center">
              {i > 0 && (
                <span className={clsx('absolute right-1/2 top-[11px] h-[2px] w-[calc(100%+0.25rem)]', done ? 'bg-gradient-to-r from-brand to-cyan' : 'bg-line')} aria-hidden />
              )}
              <span
                className={clsx('relative z-10 grid h-6 w-6 place-items-center rounded-full border-2 transition-colors', done ? 'border-transparent' : 'border-line bg-surface')}
                style={done ? { background: current ? meta.tone.hex : '#236EBE', boxShadow: current ? `0 0 0 5px ${meta.tone.hex}26` : undefined } : undefined}
              >
                {done && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
              <span className={clsx('mt-2 hidden text-xs sm:block', current ? 'font-medium text-ink' : done ? 'text-muted' : 'text-subtle')}>{meta.label}</span>
            </li>
          );
        })}
      </ol>
      {offTrack && (
        <p className={clsx('mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm', status === 'ANOMALY' ? 'bg-stop/10 text-stop' : 'bg-raised text-muted')}>
          {status === 'ANOMALY' ? <AlertTriangle className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
          {status === 'ANOMALY' ? 'Mission en anomalie : traitez l\'incident puis reprenez le cycle.' : 'Mission annulée.'}
        </p>
      )}
    </div>
  );
}

function RouteCard({ m }: { m: MissionDetail }) {
  return (
    <Card>
      <CardHeader title="Trajet" subtitle={`Prévu le ${formatDateTime(m.plannedDate)}`} />
      <div className="grid gap-0 p-5 md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-6">
        <div className="flex gap-3">
          <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-brand ring-4 ring-brand/20" />
          <div>
            <p className="text-xs text-muted">Chargement</p>
            <p className="text-xl font-semibold" style={{ fontStretch: '112%' }}>{m.pickup.city}</p>
            <p className="text-sm text-muted">{m.pickup.address}{m.pickup.postalCode ? `, ${m.pickup.postalCode}` : ''}</p>
          </div>
        </div>
        <div className="relative my-3 ml-[5px] h-10 w-[2px] md:my-0 md:ml-0 md:h-[2px] md:w-40 lg:w-56" aria-hidden>
          <span className="absolute inset-0 bg-gradient-to-b from-brand via-cyan to-go md:bg-gradient-to-r" />
          {STATUS_META[m.status.code].live && (
            <span className="absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-cyan bg-surface text-cyan shadow-glow">
              <Truck className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
        <div className="flex gap-3">
          <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-go ring-4 ring-go/20" />
          <div>
            <p className="text-xs text-muted">Livraison</p>
            <p className="text-xl font-semibold" style={{ fontStretch: '112%' }}>{m.delivery.city}</p>
            <p className="text-sm text-muted">{m.delivery.address}{m.delivery.postalCode ? `, ${m.delivery.postalCode}` : ''}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function MissionDetailPage() {
  const { id } = useParams();
  const missionId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data: mission, loading, error, reload, setData } = useApi(() => missionsApi.get(missionId), [missionId]);
  const [historyKey, setHistoryKey] = useState(0);
  const history = useApi(() => missionsApi.history(missionId), [missionId, historyKey]);
  const [docsKey, setDocsKey] = useState(0);

  const [assignOpen, setAssignOpen] = useState(params.get('assign') === '1');
  const [statusOpen, setStatusOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (params.get('assign') === '1') { params.delete('assign'); setParams(params, { replace: true }); }
  }, [params, setParams]);

  useEffect(() => {
    if (location.hash === '#historique' && history.data) document.getElementById('historique')?.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash, history.data]);

  const onUpdated = (m: MissionDetail) => { setData(m); setHistoryKey((k) => k + 1); };

  const remove = async () => {
    setDeleting(true);
    try {
      await missionsApi.remove(missionId);
      toast.success('Mission supprimée.');
      navigate('/missions');
    } catch (e) {
      toast.error((e as ApiError).message);
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (error) {
    return (
      <Card>
        {error.status === 404
          ? <EmptyState title="Mission introuvable" description="Elle a peut-être été supprimée." action={<Button variant="secondary" onClick={() => navigate('/missions')}>Retour aux missions</Button>} />
          : <ErrorState message={error.message} onRetry={reload} />}
      </Card>
    );
  }

  if (loading && !mission) {
    return <div className="space-y-5"><Skeleton className="h-12 w-80" /><Skeleton className="h-20" /><div className="grid gap-5 xl:grid-cols-3"><Skeleton className="h-80 xl:col-span-2" /><Skeleton className="h-80" /></div></div>;
  }
  if (!mission) return null;

  const m = mission;
  const deletable = m.status.code === 'CREATED' || m.status.code === 'CANCELLED';

  return (
    <>
      <Link to="/missions" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Missions</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold md:text-[1.75rem]">Mission <span className="ref-code">{m.referenceNumber}</span></h1>
            <StatusBadge code={m.status.code} label={m.status.label} className="text-sm" />
            {m.isLocked && <span className="inline-flex items-center gap-1 text-xs text-subtle"><Lock className="h-3.5 w-3.5" /> Verrouillée</span>}
          </div>
          <p className="mt-1 text-sm text-muted">
            {m.client.name} · créée le {formatDateTime(m.createdAt)}{m.createdByName ? ` par ${m.createdByName}` : ''}
            {m.lastActionAt && <> · dernière action {formatRelative(m.lastActionAt)}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} disabled={m.isLocked} onClick={() => navigate(`/missions/${m.id}/edit`)}>Modifier</Button>
          <Button variant="secondary" icon={<UserPlus className="h-4 w-4" />} disabled={m.isLocked} onClick={() => setAssignOpen(true)}>{m.driver ? 'Réaffecter' : 'Affecter'}</Button>
          <Button variant="secondary" icon={<FilePlus2 className="h-4 w-4" />} onClick={() => setUploadOpen(true)}>Ajouter document</Button>
          <Button icon={<RefreshCw className="h-4 w-4" />} disabled={m.allowedTransitions.length === 0} onClick={() => setStatusOpen(true)}>Changer le statut</Button>
        </div>
      </div>

      <div className="space-y-6">
        <Lifecycle status={m.status.code} />

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <RouteCard m={m} />

            <Card>
              <CardHeader title="Informations" />
              <dl className="grid gap-x-10 px-5 py-2 md:grid-cols-2">
                <div className="divide-y divide-line/60">
                  <InfoRow label="Référence"><span className="ref-code">{m.referenceNumber}</span></InfoRow>
                  <InfoRow label="Client"><Link to={`/clients/${m.client.id}`} className="hover:text-cyan">{m.client.name}</Link> <span className="text-subtle">({m.client.code})</span></InfoRow>
                  <InfoRow label="Date prévue">{formatDateTime(m.plannedDate)}</InfoRow>
                  <InfoRow label="Statut"><StatusBadge code={m.status.code} label={m.status.label} /></InfoRow>
                </div>
                <div className="divide-y divide-line/60">
                  <InfoRow label="Marchandise">{m.goods ?? '—'}</InfoRow>
                  <InfoRow label="Poids">{formatNumber(m.weightKg, ' kg')}</InfoRow>
                  <InfoRow label="Volume">{formatNumber(m.volumeM3, ' m³')}</InfoRow>
                  <InfoRow label="Modifiée le">{m.updatedAt ? formatDateTime(m.updatedAt) : '—'}</InfoRow>
                </div>
              </dl>
              {m.description && <p className="border-t border-line/60 px-5 py-4 text-sm leading-relaxed text-muted">{m.description}</p>}
            </Card>

            <Card>
              <CardHeader title="Documents" subtitle={`${m.documentCount} document${m.documentCount > 1 ? 's' : ''}`} actions={<Button size="sm" variant="secondary" icon={<FilePlus2 className="h-3.5 w-3.5" />} onClick={() => setUploadOpen(true)}>Ajouter</Button>} />
              <div className="px-5 py-2">
                <DocumentList missionId={m.id} refreshKey={docsKey} onChanged={() => { reload(); setHistoryKey((k) => k + 1); }} />
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader title="Chauffeur" actions={!m.isLocked && <Button size="sm" variant="ghost" onClick={() => setAssignOpen(true)}>{m.driver ? 'Changer' : 'Affecter'}</Button>} />
              {m.driver ? (
                <div className="p-5">
                  <Link to={`/drivers/${m.driver.id}`} className="flex items-center gap-3 hover:text-cyan">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-brand to-cyan text-sm font-semibold text-white">{initials(m.driver.fullName)}</span>
                    <span className="font-medium">{m.driver.fullName}</span>
                  </Link>
                  <dl className="mt-4 divide-y divide-line/60">
                    <InfoRow label="Téléphone"><a href={`tel:${m.driver.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-cyan"><Phone className="h-3.5 w-3.5" /> {m.driver.phone}</a></InfoRow>
                    {m.driver.email && <InfoRow label="E-mail"><a href={`mailto:${m.driver.email}`} className="inline-flex items-center gap-1.5 break-all hover:text-cyan"><Mail className="h-3.5 w-3.5 shrink-0" /> {m.driver.email}</a></InfoRow>}
                    <InfoRow label="Véhicule">{m.vehicle ? <Link to={`/vehicles/${m.vehicle.id}`} className="hover:text-cyan"><span className="ref-code">{m.vehicle.plateNumber}</span> <span className="text-muted">· {m.vehicle.brand} {m.vehicle.model}</span></Link> : '—'}</InfoRow>
                  </dl>
                </div>
              ) : (
                <EmptyState title="Aucun chauffeur affecté" description="Affectez un chauffeur pour lancer la mission." action={!m.isLocked && <Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setAssignOpen(true)}>Affecter la mission</Button>} />
              )}
            </Card>

            {m.assignments.length > 0 && (
              <Card>
                <CardHeader title="Affectations" subtitle="Historique complet, jamais supprimé" />
                <ul className="divide-y divide-line/60 px-5">
                  {m.assignments.map((a) => (
                    <li key={a.id} className="py-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className={clsx('font-medium', a.status !== 'ACTIVE' && 'text-muted')}>{a.driverName}</span>
                        <span className={clsx('rounded-full px-2 py-0.5 text-2xs', a.status === 'ACTIVE' ? 'bg-go/10 text-go-400' : 'bg-raised text-subtle')}>
                          {a.status === 'ACTIVE' ? 'Active' : a.status === 'REPLACED' ? 'Remplacée' : 'Clôturée'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{formatDateTime(a.assignedAt)} par {a.assignedByName}{a.vehiclePlate ? ` · ${a.vehiclePlate}` : ''}</p>
                      {a.comment && <p className="mt-1 text-xs text-subtle">« {a.comment} »</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card>
              <div id="historique" className="scroll-mt-24" />
              <CardHeader title="Historique" subtitle="Chaque action est tracée" />
              <div className="p-5">
                {history.loading && !history.data ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
                  : history.data?.length ? <MissionTimeline items={history.data} />
                    : <p className="text-sm text-muted">Aucun événement.</p>}
              </div>
            </Card>

            {deletable && (
              <button type="button" onClick={() => setDeleteOpen(true)} className="inline-flex items-center gap-2 text-sm text-muted hover:text-stop">
                <Trash2 className="h-4 w-4" /> Supprimer la mission
              </button>
            )}
          </div>
        </div>
      </div>

      <AssignMissionModal mission={m} open={assignOpen} onClose={() => setAssignOpen(false)} onDone={onUpdated} />
      <ChangeStatusModal mission={m} open={statusOpen} onClose={() => setStatusOpen(false)} onDone={onUpdated} />
      <DocumentUploader missionId={m.id} open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={() => { setDocsKey((k) => k + 1); reload(); setHistoryKey((k) => k + 1); }} />
      <ConfirmDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={remove} loading={deleting} title="Supprimer cette mission ?" confirmLabel="Supprimer"
        message={<>La mission <strong className="text-ink">{m.referenceNumber}</strong> sera retirée des listes (suppression logique). La référence redevient disponible et l'historique est conservé.</>} />
    </>
  );
}
