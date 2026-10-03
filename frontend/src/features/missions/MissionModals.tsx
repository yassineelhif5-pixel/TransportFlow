import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { missionsApi } from '@/api/endpoints';
import { ApiError } from '@/api/apiClient';
import type { MissionDetail, MissionStatusCode } from '@/types';
import { STATUS_META, formatDateTime } from '@/utils/format';
import { useDriverOptions, useVehicleOptions } from '@/hooks/useOptions';
import { Button, Select, Textarea } from '@/components/ui/Controls';
import { Modal, StatusBadge } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';

/** Affecter / réaffecter une mission : l'affectation précédente est conservée en historique côté API. */
export function AssignMissionModal({ mission, open, onClose, onDone }: { mission: MissionDetail; open: boolean; onClose: () => void; onDone: (m: MissionDetail) => void }) {
  const toast = useToast();
  const drivers = useDriverOptions();
  const vehicles = useVehicleOptions();
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setDriverId(mission.driver ? String(mission.driver.id) : '');
    setVehicleId(mission.vehicle ? String(mission.vehicle.id) : '');
    setComment('');
    setError(null);
  }, [open, mission]);

  const driver = drivers.find((d) => String(d.id) === driverId);
  // Pré-sélection du véhicule habituel du chauffeur.
  useEffect(() => {
    if (driver?.defaultVehicleId && !vehicleId) setVehicleId(String(driver.defaultVehicleId));
  }, [driver, vehicleId]);

  const driverWarning = useMemo(() => {
    if (!driver) return null;
    if (!driver.isActive) return 'Ce chauffeur est désactivé.';
    if (!driver.userActive) return "Ce chauffeur n'a pas d'accès utilisateur actif.";
    if (driver.licenseExpired) return 'Le permis de ce chauffeur a expiré.';
    if (driver.activeMissions > 0) return `${driver.activeMissions} mission(s) déjà en cours pour ce chauffeur.`;
    return null;
  }, [driver]);
  const blocking = !!driver && (!driver.isActive || !driver.userActive || driver.licenseExpired);

  const submit = async () => {
    if (!driverId) return;
    setPending(true);
    setError(null);
    try {
      const updated = await missionsApi.assign(mission.id, { driverId: Number(driverId), vehicleId: vehicleId ? Number(vehicleId) : null, comment: comment.trim() || undefined });
      toast.success('Mission affectée avec succès.', `${updated.referenceNumber} → ${updated.driver?.fullName}`);
      window.dispatchEvent(new Event('tf:notifications'));
      onDone(updated);
      onClose();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Affecter la mission"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Annuler</Button>
          <Button onClick={submit} loading={pending} disabled={!driverId || blocking}>Confirmer l'affectation</Button>
        </>
      }
    >
      <dl className="mb-5 grid grid-cols-3 gap-3 rounded-xl border border-line bg-raised/50 p-4 text-sm">
        <div><dt className="text-xs text-muted">Mission</dt><dd className="ref-code mt-0.5">{mission.referenceNumber}</dd></div>
        <div><dt className="text-xs text-muted">Client</dt><dd className="mt-0.5 truncate">{mission.client.name}</dd></div>
        <div><dt className="text-xs text-muted">Date</dt><dd className="mt-0.5">{formatDateTime(mission.plannedDate)}</dd></div>
      </dl>

      <div className="space-y-4">
        <Select label="Chauffeur" required value={driverId} onChange={(e) => { setDriverId(e.target.value); setVehicleId(''); }} placeholder="Choisir un chauffeur" error={error?.field('driverId')}>
          {drivers.map((d) => (
            <option key={d.id} value={d.id} disabled={!d.isActive}>
              {d.lastName} {d.firstName}{!d.isActive ? ' (inactif)' : d.activeMissions ? ` — ${d.activeMissions} en cours` : ''}
            </option>
          ))}
        </Select>
        {driverWarning && (
          <p className={`-mt-2 flex items-center gap-2 text-xs ${blocking ? 'text-stop' : 'text-warn'}`}>
            <AlertTriangle className="h-3.5 w-3.5" /> {driverWarning}
          </p>
        )}
        <Select label="Véhicule" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} placeholder="Sans véhicule" hint="Par défaut, le véhicule habituel du chauffeur.">
          {vehicles.map((v) => (
            <option key={v.id} value={v.id} disabled={v.status === 'MAINTENANCE' || v.status === 'OUT_OF_SERVICE'}>
              {v.plateNumber} — {v.brand} {v.model}{v.status === 'MAINTENANCE' ? ' (maintenance)' : v.status === 'OUT_OF_SERVICE' ? ' (hors service)' : ''}
            </option>
          ))}
        </Select>
        <Textarea label="Commentaire" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="Consignes pour le chauffeur, motif de réaffectation…" />
        {mission.driver && <p className="text-xs text-muted">Actuellement affectée à <span className="text-ink">{mission.driver.fullName}</span> : cette affectation sera clôturée et conservée dans l'historique.</p>}
        {error && !error.field('driverId') && <p className="rounded-lg bg-stop/10 px-3 py-2 text-sm text-stop" role="alert">{error.message}</p>}
      </div>
    </Modal>
  );
}

/** Changement de statut selon la machine à états exposée par l'API (allowedTransitions). */
export function ChangeStatusModal({ mission, open, onClose, onDone }: { mission: MissionDetail; open: boolean; onClose: () => void; onDone: (m: MissionDetail) => void }) {
  const toast = useToast();
  const [target, setTarget] = useState<MissionStatusCode | ''>('');
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (open) { setTarget(mission.allowedTransitions[0]?.code ?? ''); setComment(''); setError(null); }
  }, [open, mission]);

  const needsComment = target === 'ANOMALY';
  const submit = async () => {
    if (!target) return;
    if (needsComment && !comment.trim()) { setError(new ApiError(400, 'VALIDATION_ERROR', "Décrivez l'anomalie rencontrée.", { comment: ["Décrivez l'anomalie rencontrée."] })); return; }
    setPending(true);
    setError(null);
    try {
      const updated = await missionsApi.changeStatus(mission.id, { statusCode: target, comment: comment.trim() || undefined });
      toast.success('Statut mis à jour.', `${updated.referenceNumber} : ${updated.status.label}`);
      window.dispatchEvent(new Event('tf:notifications'));
      onDone(updated);
      onClose();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Changer le statut" description={`Mission ${mission.referenceNumber}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Annuler</Button>
          <Button variant={target === 'CANCELLED' || target === 'ANOMALY' ? 'danger' : target === 'COMPLETED' ? 'success' : 'primary'} onClick={submit} loading={pending} disabled={!target}>
            Valider le changement
          </Button>
        </>
      }>
      {mission.allowedTransitions.length === 0 ? (
        <p className="text-sm text-muted">Aucun changement de statut n'est possible depuis « {mission.status.label} ».</p>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3 text-sm">
            <StatusBadge code={mission.status.code} label={mission.status.label} />
            <ArrowRight className="h-4 w-4 text-subtle" />
            {target ? <StatusBadge code={target} /> : <span className="text-subtle">Nouveau statut</span>}
          </div>
          <fieldset>
            <legend className="field-label">Nouveau statut</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {mission.allowedTransitions.map((t) => {
                const meta = STATUS_META[t.code];
                const selected = target === t.code;
                return (
                  <label key={t.code} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors ${selected ? 'border-cyan bg-cyan/5' : 'border-line hover:border-subtle'}`}>
                    <input type="radio" name="status" value={t.code} checked={selected} onChange={() => setTarget(t.code)} className="sr-only" />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.tone.hex }} />
                    <span className="flex-1">{t.label}</span>
                    {selected && <CheckCircle2 className="h-4 w-4 text-cyan" />}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <Textarea label={needsComment ? "Description de l'anomalie" : 'Commentaire'} required={needsComment} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000}
            error={error?.field('comment')} placeholder={needsComment ? 'Ex. Palette endommagée constatée au chargement' : 'Optionnel'} />
          {error && !error.field('comment') && <p className="rounded-lg bg-stop/10 px-3 py-2 text-sm text-stop" role="alert">{error.message}</p>}
        </div>
      )}
    </Modal>
  );
}
