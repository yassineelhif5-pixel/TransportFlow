import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, FileSpreadsheet, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { referencesApi } from '@/api/endpoints';
import { ApiError } from '@/api/apiClient';
import { useApi, useDebounce, useListState } from '@/hooks/useApi';
import { useClientOptions } from '@/hooks/useOptions';
import type { PagedQuery, ReferenceDto } from '@/types';
import { formatDateTime } from '@/utils/format';
import { Button, IconButton, Input, SearchInput, Select, Textarea } from '@/components/ui/Controls';
import { Card, ConfirmDialog, EmptyState, Modal, PageHeader, StatusBadge } from '@/components/ui/Display';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { ImportWizard } from '@/features/references/ImportWizard';

const SOURCE: Record<string, string> = { MANUAL: 'Saisie', IMPORT: 'Import', API: 'API' };
const STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: 'Disponible', cls: 'text-cyan' },
  USED: { label: 'Utilisée', cls: 'text-go-400' },
  CANCELLED: { label: 'Annulée', cls: 'text-subtle' },
};

function ReferenceModal({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial: ReferenceDto | null; onSaved: () => void }) {
  const toast = useToast();
  const clients = useClientOptions(true);
  const [number, setNumber] = useState('');
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('OPEN');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const linked = !!initial?.missionId;

  useEffect(() => {
    if (!open) return;
    setNumber(initial?.number ?? '');
    setClientId(initial ? String(initial.clientId) : '');
    setNotes(initial?.notes ?? '');
    setStatus(initial?.status === 'CANCELLED' ? 'CANCELLED' : 'OPEN');
    setError(null);
  }, [open, initial]);

  const submit = async () => {
    const local: Record<string, string[]> = {};
    if (!number.trim()) local.number = ['La référence est obligatoire.'];
    else if (!/^[A-Za-z0-9][A-Za-z0-9\-_/.]{1,49}$/.test(number.trim())) local.number = ['Format invalide (2 à 50 caractères).'];
    if (!clientId) local.clientId = ['Le client est obligatoire.'];
    if (Object.keys(local).length) { setError(new ApiError(400, 'VALIDATION_ERROR', 'Corrigez les champs signalés.', local)); return; }

    setPending(true);
    setError(null);
    try {
      const data = { number: number.trim(), clientId: Number(clientId), notes: notes.trim() || undefined, status: linked ? undefined : status };
      if (initial) await referencesApi.update(initial.id, data); else await referencesApi.create(data);
      toast.success(initial ? 'Référence modifiée avec succès.' : 'Référence créée avec succès.', number.trim().toUpperCase());
      onSaved();
      onClose();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Modifier ${initial.number}` : 'Nouvelle référence'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={pending}>Annuler</Button><Button onClick={submit} loading={pending}>{initial ? 'Enregistrer' : 'Créer la référence'}</Button></>}>
      <div className="space-y-4">
        <Input label="Référence" required value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} disabled={linked} error={error?.field('number')} placeholder="REF-2026-00200" maxLength={50}
          hint={linked ? 'Liée à une mission : le numéro n\'est plus modifiable.' : undefined} />
        <Select label="Client" required value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Choisir un client" disabled={linked} error={error?.field('clientId')}>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
        </Select>
        {initial && !linked && (
          <Select label="Statut" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="OPEN">Disponible</option>
            <option value="CANCELLED">Annulée</option>
          </Select>
        )}
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        {error && !error.errors && <p className="rounded-lg bg-stop/10 px-3 py-2 text-sm text-stop" role="alert">{error.message}</p>}
      </div>
    </Modal>
  );
}

export default function ReferencesPage() {
  const toast = useToast();
  const [params] = useSearchParams();
  const clients = useClientOptions();
  const [search, setSearch] = useState(params.get('highlight') ?? '');
  const debounced = useDebounce(search);
  const { state, update, toggleSort } = useListState<PagedQuery & { status?: string; source?: string; clientId?: number }>({ page: 1, pageSize: 15, status: '', source: '' });
  useEffect(() => { update({ search: debounced }); }, [debounced, update]);
  const { data, loading, error, reload } = useApi((signal) => referencesApi.list(state, signal), [JSON.stringify(state)]);

  const [editing, setEditing] = useState<ReferenceDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ReferenceDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await referencesApi.remove(toDelete.id);
      toast.success('Référence supprimée.', toDelete.number);
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setDeleting(false);
    }
  };

  const doExport = (format: 'csv' | 'xlsx') => referencesApi.export(state, format).then(() => toast.success('Export généré.')).catch((e) => toast.error((e as ApiError).message));

  return (
    <>
      <PageHeader
        title="Références"
        subtitle="Les références client précèdent la création des missions."
        actions={
          <>
            <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Importer</Button>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => doExport('csv')}>Exporter</Button>
            <Button variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => doExport('xlsx')} aria-label="Exporter en Excel">Excel</Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Nouvelle référence</Button>
          </>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line/70 p-4 lg:flex-row">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une référence ou un client…" className="lg:w-80" />
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            <Select aria-label="Client" value={state.clientId ?? ''} onChange={(e) => update({ clientId: e.target.value ? Number(e.target.value) : undefined })} placeholder="Tous les clients">
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select aria-label="Statut" value={state.status} onChange={(e) => update({ status: e.target.value })} placeholder="Tous les statuts">
              <option value="OPEN">Disponible</option><option value="USED">Utilisée</option><option value="CANCELLED">Annulée</option>
            </Select>
            <Select aria-label="Source" value={state.source} onChange={(e) => update({ source: e.target.value })} placeholder="Toutes les sources">
              <option value="MANUAL">Saisie</option><option value="IMPORT">Import</option><option value="API">API</option>
            </Select>
          </div>
        </div>
        <DataTable<ReferenceDto>
          rows={data?.items}
          loading={loading}
          error={error?.message}
          onRetry={reload}
          rowKey={(r) => r.id}
          sortBy={state.sortBy}
          sortDir={state.sortDir}
          onSort={toggleSort}
          empty={<EmptyState title="Aucune référence trouvée" description="Créez une référence ou importez un fichier." action={<Button icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Importer un fichier</Button>} />}
          columns={[
            { key: 'number', header: 'Référence', sortKey: 'number', render: (r) => <span className="ref-code">{r.number}</span> },
            { key: 'client', header: 'Client', sortKey: 'client', render: (r) => <Link to={`/clients/${r.clientId}`} className="hover:text-cyan">{r.clientName}</Link> },
            { key: 'source', header: 'Source', sortKey: 'source', hideBelow: 'xl', render: (r) => <span className="text-muted">{SOURCE[r.source] ?? r.source}</span> },
            { key: 'status', header: 'Statut', sortKey: 'status', render: (r) => <span className={`text-sm font-medium ${STATUS[r.status]?.cls ?? ''}`}>{STATUS[r.status]?.label ?? r.status}</span> },
            { key: 'created', header: 'Date création', sortKey: 'created', hideBelow: 'lg', render: (r) => formatDateTime(r.createdAt) },
            {
              key: 'mission', header: 'Mission associée',
              render: (r) => r.missionId && r.missionStatusCode
                ? <Link to={`/missions/${r.missionId}`} className="inline-flex"><StatusBadge code={r.missionStatusCode} label={r.missionStatusLabel ?? undefined} /></Link>
                : <span className="text-subtle">—</span>,
            },
            {
              key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right',
              render: (r) => (
                <div className="flex justify-end">
                  {!r.missionId && r.status === 'OPEN' && <Link to={`/missions/new?ref=${encodeURIComponent(r.number)}&client=${r.clientId}`} className="mr-1 inline-flex h-9 items-center rounded-lg px-2 text-xs text-cyan hover:bg-raised">Créer la mission</Link>}
                  <IconButton label="Modifier" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
                  <IconButton label="Supprimer" disabled={!!r.missionId} className="hover:text-stop" onClick={() => setToDelete(r)}><Trash2 className="h-4 w-4" /></IconButton>
                </div>
              ),
            },
          ]}
        />
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={(p) => update({ page: p }, false)} />}
      </Card>

      <ReferenceModal open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSaved={reload} />
      <ImportWizard open={importOpen} onClose={() => setImportOpen(false)} onImported={reload} />
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} loading={deleting} title="Supprimer cette référence ?" confirmLabel="Supprimer"
        message={<>La référence <strong className="text-ink">{toDelete?.number}</strong> sera supprimée (suppression logique, tracée dans l'historique).</>} />
    </>
  );
}
