import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { CheckCheck, Download, Eye, FileSpreadsheet, Trash2 } from 'lucide-react';
import { documentsApi, historyApi, notificationsApi } from '@/api/endpoints';
import { ApiError } from '@/api/apiClient';
import { useApi, useDebounce, useListState } from '@/hooks/useApi';
import type { DocumentDto, HistoryItem, NotificationDto, PagedQuery } from '@/types';
import { ACTION_LABELS, ENTITY_LABELS, formatDate, formatFileSize, formatRelative, formatTime } from '@/utils/format';
import { Button, IconButton, Input, SearchInput, Select } from '@/components/ui/Controls';
import { Card, ConfirmDialog, EmptyState, Modal, PageHeader, Tabs } from '@/components/ui/Display';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { DocIcon } from '@/components/Timeline';
import { DocumentPreview, useDocumentTypes } from '@/components/Documents';

// ==================================================================== DOCUMENTS

export function DocumentsPage() {
  const toast = useToast();
  const types = useDocumentTypes();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const { state, update, toggleSort } = useListState<PagedQuery & { documentTypeId?: number; extension?: string }>({ page: 1, pageSize: 15, extension: '' });
  useEffect(() => { update({ search: debounced }); }, [debounced, update]);
  const { data, loading, error, reload } = useApi((s) => documentsApi.list(state, s), [JSON.stringify(state)]);
  const [preview, setPreview] = useState<DocumentDto | null>(null);
  const [toDelete, setToDelete] = useState<DocumentDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await documentsApi.remove(toDelete.id);
      toast.success('Document supprimé.', toDelete.fileName);
      setToDelete(null);
      reload();
    } catch (e) { toast.error((e as ApiError).message); } finally { setDeleting(false); }
  };

  return (
    <>
      <PageHeader title="Documents" subtitle="Bons de transport, CMR, photos et preuves de livraison — stockage sécurisé via l'API" />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line/70 p-4 lg:flex-row">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un fichier ou une référence…" className="lg:w-96" />
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <Select aria-label="Type de document" value={state.documentTypeId ?? ''} onChange={(e) => update({ documentTypeId: e.target.value ? Number(e.target.value) : undefined })} placeholder="Tous les types">
              {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
            <Select aria-label="Format" value={state.extension} onChange={(e) => update({ extension: e.target.value })} placeholder="Tous les formats">
              <option value=".pdf">PDF</option><option value=".jpg">JPG</option><option value=".jpeg">JPEG</option><option value=".png">PNG</option><option value=".docx">DOCX</option>
            </Select>
          </div>
        </div>
        <DataTable<DocumentDto>
          rows={data?.items} loading={loading} error={error?.message} onRetry={reload} rowKey={(d) => d.id}
          sortBy={state.sortBy} sortDir={state.sortDir} onSort={toggleSort}
          empty={<EmptyState title="Aucun document" description="Les documents s'ajoutent depuis la fiche d'une mission." />}
          columns={[
            { key: 'name', header: 'Nom', sortKey: 'name', render: (d) => (
              <button type="button" onClick={() => setPreview(d)} className="flex max-w-[280px] items-center gap-3 text-left hover:text-cyan">
                <DocIcon ext={d.fileExtension} /><span className="truncate font-medium">{d.fileName}</span>
              </button>) },
            { key: 'type', header: 'Type', sortKey: 'type', hideBelow: 'md', render: (d) => d.documentTypeLabel },
            { key: 'mission', header: 'Mission', sortKey: 'reference', render: (d) => <Link to={`/missions/${d.missionId}`} className="ref-code hover:text-cyan">{d.referenceNumber}</Link> },
            { key: 'by', header: 'Ajouté par', hideBelow: 'lg', render: (d) => d.uploadedByName },
            { key: 'date', header: 'Date', sortKey: 'date', render: (d) => <span>{formatDate(d.uploadedAt)} <span className="text-subtle">{formatTime(d.uploadedAt)}</span></span> },
            { key: 'size', header: 'Taille', sortKey: 'size', hideBelow: 'md', className: 'tabular-nums text-muted', render: (d) => formatFileSize(d.fileSize) },
            { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right', render: (d) => (
              <div className="flex justify-end">
                <IconButton label="Voir" onClick={() => setPreview(d)}><Eye className="h-4 w-4" /></IconButton>
                <IconButton label="Télécharger" onClick={() => documentsApi.download(d).catch((e) => toast.error((e as ApiError).message))}><Download className="h-4 w-4" /></IconButton>
                <IconButton label="Supprimer" className="hover:text-stop" onClick={() => setToDelete(d)}><Trash2 className="h-4 w-4" /></IconButton>
              </div>) },
          ]}
        />
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={(p) => update({ page: p }, false)} />}
      </Card>
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} loading={deleting} title="Supprimer ce document ?" confirmLabel="Supprimer"
        message={<>« {toDelete?.fileName} » sera retiré de la mission {toDelete?.referenceNumber}. La suppression est logique : la trace est conservée dans l'historique.</>} />
    </>
  );
}

// ==================================================================== HISTORIQUE

function ValueBlock({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  let pretty = value;
  try { pretty = JSON.stringify(JSON.parse(value), null, 2); } catch { /* texte brut */ }
  return (
    <div>
      <p className="mb-1 text-xs text-muted">{label}</p>
      <pre className="scrollbar-thin max-h-56 overflow-auto rounded-lg border border-line bg-raised/50 p-3 text-xs leading-relaxed text-ink">{pretty}</pre>
    </div>
  );
}

const actionTone: Record<string, string> = {
  CREATE: 'text-brand-400', ASSIGN: 'text-brand-400', STATUS_CHANGE: 'text-cyan', DOCUMENT_UPLOAD: 'text-cyan', IMPORT: 'text-go-400',
  DELETE: 'text-stop', DOCUMENT_DELETE: 'text-stop', LOGIN_FAILED: 'text-stop', UNASSIGN: 'text-warn',
};

export function HistoryPage() {
  const toast = useToast();
  const filters = useApi(() => historyApi.filters(), []);
  const [search, setSearch] = useState('');
  const [reference, setReference] = useState('');
  const debounced = useDebounce(search);
  const debouncedRef = useDebounce(reference);
  const { state, update } = useListState<PagedQuery & { userId?: number; action?: string; entityName?: string; reference?: string; dateFrom?: string; dateTo?: string }>({ page: 1, pageSize: 20, action: '', entityName: '', dateFrom: '', dateTo: '' });
  useEffect(() => { update({ search: debounced, reference: debouncedRef }); }, [debounced, debouncedRef, update]);
  const { data, loading, error, reload } = useApi((s) => historyApi.list(state, s), [JSON.stringify(state)]);
  const [detail, setDetail] = useState<HistoryItem | null>(null);

  const doExport = (format: 'csv' | 'xlsx') => historyApi.export(state, format).then(() => toast.success('Export généré.')).catch((e) => toast.error((e as ApiError).message));

  return (
    <>
      <PageHeader title="Historique" subtitle="Journal d'audit métier : qui a fait quoi, quand et depuis où. Les entrées ne sont jamais supprimées."
        actions={<>
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => doExport('csv')}>CSV</Button>
          <Button variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => doExport('xlsx')}>Excel</Button>
        </>} />
      <Card>
        <div className="grid gap-3 border-b border-line/70 p-4 sm:grid-cols-2 xl:grid-cols-6">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher…" className="xl:col-span-2" />
          <Input aria-label="Référence" placeholder="Référence (REF-…)" value={reference} onChange={(e) => setReference(e.target.value)} />
          <Select aria-label="Utilisateur" value={state.userId ?? ''} onChange={(e) => update({ userId: e.target.value ? Number(e.target.value) : undefined })} placeholder="Tous les utilisateurs">
            {filters.data?.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          <Select aria-label="Action" value={state.action} onChange={(e) => update({ action: e.target.value })} placeholder="Toutes les actions">
            {filters.data?.actions.map((a) => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
          </Select>
          <Select aria-label="Entité" value={state.entityName} onChange={(e) => update({ entityName: e.target.value })} placeholder="Toutes les entités">
            {filters.data?.entities.map((a) => <option key={a} value={a}>{ENTITY_LABELS[a] ?? a}</option>)}
          </Select>
          <Input type="date" aria-label="Du" value={state.dateFrom} onChange={(e) => update({ dateFrom: e.target.value })} />
          <Input type="date" aria-label="Au" value={state.dateTo} onChange={(e) => update({ dateTo: e.target.value })} />
        </div>
        <DataTable<HistoryItem>
          rows={data?.items} loading={loading} error={error?.message} onRetry={reload} rowKey={(h) => h.id} onRowClick={setDetail} dense
          empty={<EmptyState title="Aucune entrée" description="Aucune action ne correspond à ces filtres." />}
          columns={[
            { key: 'date', header: 'Date', render: (h) => formatDate(h.createdAt) },
            { key: 'time', header: 'Heure', className: 'tabular-nums text-muted', render: (h) => formatTime(h.createdAt) },
            { key: 'user', header: 'Utilisateur', render: (h) => h.userName ?? <span className="text-subtle">Système</span> },
            { key: 'entity', header: 'Entité', hideBelow: 'md', render: (h) => ENTITY_LABELS[h.entityName] ?? h.entityName },
            { key: 'id', header: 'ID', hideBelow: 'lg', className: 'tabular-nums text-muted', render: (h) => h.entityId ?? '—' },
            { key: 'action', header: 'Action', render: (h) => <span className={clsx('text-xs font-medium', actionTone[h.action] ?? 'text-muted')}>{ACTION_LABELS[h.action] ?? h.action}</span> },
            { key: 'desc', header: 'Description', className: 'whitespace-normal min-w-[260px]', render: (h) => <span className="line-clamp-2">{h.description}</span> },
          ]}
        />
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={(p) => update({ page: p }, false)} />}
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? (ACTION_LABELS[detail.action] ?? detail.action) : ''} description={detail ? `${formatDate(detail.createdAt)} à ${formatTime(detail.createdAt)} · ${detail.userName ?? 'Système'}` : ''} size="lg">
        {detail && (
          <div className="space-y-4 text-sm">
            <p>{detail.description}</p>
            <dl className="grid grid-cols-3 gap-3 rounded-xl border border-line bg-raised/40 p-3 text-xs">
              <div><dt className="text-muted">Entité</dt><dd className="mt-0.5">{ENTITY_LABELS[detail.entityName] ?? detail.entityName}</dd></div>
              <div><dt className="text-muted">Identifiant</dt><dd className="mt-0.5">{detail.entityId ?? '—'}</dd></div>
              <div><dt className="text-muted">Adresse IP</dt><dd className="mt-0.5">{detail.ipAddress ?? '—'}</dd></div>
            </dl>
            <ValueBlock label="Ancienne valeur" value={detail.oldValue} />
            <ValueBlock label="Nouvelle valeur" value={detail.newValue} />
            {detail.entityName === 'Mission' && detail.entityId && <Link to={`/missions/${detail.entityId}`} className="inline-block text-cyan hover:underline">Ouvrir la mission</Link>}
          </div>
        )}
      </Modal>
    </>
  );
}

// ==================================================================== NOTIFICATIONS

export function NotificationsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload, setData } = useApi((s) => notificationsApi.list({ page, pageSize: 20, unreadOnly: tab === 'unread' }, s), [page, tab]);

  const markAll = async () => {
    const n = await notificationsApi.markAllRead();
    toast.success('Toutes les notifications sont lues.', `${n} notification(s)`);
    window.dispatchEvent(new Event('tf:notifications'));
    reload();
  };

  const open = async (n: NotificationDto) => {
    if (!n.isRead) {
      await notificationsApi.markRead(n.id).catch(() => undefined);
      window.dispatchEvent(new Event('tf:notifications'));
      setData(data ? { ...data, items: data.items.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) } : null);
    }
    if (n.entityName === 'Mission' && n.entityId) navigate(`/missions/${n.entityId}`);
  };

  const markOne = async (n: NotificationDto) => {
    await notificationsApi.markRead(n.id);
    window.dispatchEvent(new Event('tf:notifications'));
    setData(data ? { ...data, items: data.items.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) } : null);
  };

  const dot = { INFO: 'bg-brand', SUCCESS: 'bg-go', WARNING: 'bg-warn', DANGER: 'bg-stop' };

  return (
    <>
      <PageHeader title="Notifications" subtitle="Affectations, prises en charge, livraisons et anomalies"
        actions={<Button variant="secondary" icon={<CheckCheck className="h-4 w-4" />} onClick={markAll}>Marquer tout comme lu</Button>} />
      <Card>
        <div className="px-5 pt-3"><Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} items={[{ value: 'all', label: 'Toutes' }, { value: 'unread', label: 'Non lues' }]} /></div>
        {error ? <EmptyState title="Chargement impossible" description={error.message} /> : loading && !data ? <p className="px-5 py-8 text-sm text-muted">Chargement…</p> : data?.items.length === 0 ? (
          <EmptyState title={tab === 'unread' ? 'Tout est lu' : 'Aucune notification'} description="Les événements importants sur les missions apparaîtront ici." />
        ) : (
          <ul className="divide-y divide-line/60">
            {data?.items.map((n) => (
              <li key={n.id} className={clsx('flex items-start gap-4 px-5 py-4', !n.isRead && 'bg-brand/[0.035]')}>
                <span className={clsx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', n.isRead ? 'bg-line' : dot[n.type])} />
                <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                  <p className={clsx('text-sm', !n.isRead && 'font-semibold')}>{n.title}</p>
                  <p className="text-sm text-muted">{n.message}</p>
                  <p className="mt-1 text-xs text-subtle">{formatRelative(n.createdAt)}</p>
                </button>
                {!n.isRead && <Button size="sm" variant="ghost" onClick={() => markOne(n)}>Marquer comme lu</Button>}
              </li>
            ))}
          </ul>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
      </Card>
    </>
  );
}
