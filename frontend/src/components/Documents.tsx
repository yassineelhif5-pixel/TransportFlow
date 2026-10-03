import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Download, Eye, Trash2, UploadCloud, X } from 'lucide-react';
import { documentsApi, missionsApi } from '@/api/endpoints';
import { ApiError } from '@/api/apiClient';
import type { DocumentDto, DocumentType } from '@/types';
import { formatDateTime, formatFileSize } from '@/utils/format';
import { Button, IconButton, Select, Textarea } from './ui/Controls';
import { ConfirmDialog, EmptyState, Modal, Skeleton } from './ui/Display';
import { useToast } from './ui/Toast';
import { DocIcon } from './Timeline';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx';
const MAX_MB = 10;

/** Zone de dépôt de fichier (glisser-déposer ou sélection), avec contrôle préalable côté navigateur. */
export function FileUpload({ file, onFile, accept = ACCEPT, maxMb = MAX_MB, hint }: { file: File | null; onFile: (f: File | null) => void; accept?: string; maxMb?: number; hint?: string }) {
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined | null) => {
    setError(null);
    if (!f) return;
    const ext = `.${f.name.split('.').pop()?.toLowerCase()}`;
    if (!accept.split(',').includes(ext)) return setError(`Format non autorisé. Formats acceptés : ${accept.replace(/\./g, '').toUpperCase().replace(/,/g, ', ')}.`);
    if (f.size > maxMb * 1024 * 1024) return setError(`Le fichier dépasse ${maxMb} Mo.`);
    if (f.size === 0) return setError('Le fichier est vide.');
    onFile(f);
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        className={clsx(
          'relative flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-colors',
          drag ? 'border-cyan bg-cyan/5' : 'border-line hover:border-subtle',
        )}
      >
        {file ? (
          <div className="flex w-full items-center gap-3 text-left">
            <DocIcon ext={`.${file.name.split('.').pop()?.toLowerCase()}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted">{formatFileSize(file.size)}</p>
            </div>
            <IconButton label="Retirer le fichier" onClick={() => onFile(null)}><X className="h-4 w-4" /></IconButton>
          </div>
        ) : (
          <>
            <UploadCloud className="mb-3 h-7 w-7 text-cyan" aria-hidden />
            <p className="text-sm text-ink">Glissez un fichier ici ou <button type="button" onClick={() => inputRef.current?.click()} className="font-medium text-cyan underline-offset-2 hover:underline">parcourez</button></p>
            <p className="mt-1 text-xs text-subtle">{hint ?? `PDF, JPG, PNG ou DOCX — ${maxMb} Mo maximum`}</p>
          </>
        )}
        <input ref={inputRef} type="file" accept={accept} className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} aria-label="Choisir un fichier" />
      </div>
      {error && <p className="mt-2 text-xs text-stop" role="alert">{error}</p>}
    </div>
  );
}

let typesCache: DocumentType[] | null = null;
export function useDocumentTypes() {
  const [types, setTypes] = useState<DocumentType[]>(typesCache ?? []);
  useEffect(() => {
    if (typesCache) return;
    documentsApi.types().then((t) => { typesCache = t; setTypes(t); }).catch(() => undefined);
  }, []);
  return types;
}

/** Modale d'ajout de document : multipart/form-data vers POST /api/missions/{id}/documents. */
export function DocumentUploader({ missionId, open, onClose, onUploaded }: { missionId: number; open: boolean; onClose: () => void; onUploaded: (d: DocumentDto) => void }) {
  const types = useDocumentTypes();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [typeId, setTypeId] = useState('');
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (open) { setFile(null); setTypeId(''); setComment(''); setError(null); }
  }, [open]);

  const submit = async () => {
    if (!file || !typeId) return;
    setPending(true);
    setError(null);
    try {
      const doc = await missionsApi.uploadDocument(missionId, file, Number(typeId), comment.trim() || undefined);
      toast.success('Document ajouté avec succès.', doc.fileName);
      onUploaded(doc);
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
      title="Ajouter un document"
      description="Le fichier est vérifié puis stocké de façon sécurisée par l'API."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Annuler</Button>
          <Button onClick={submit} loading={pending} disabled={!file || !typeId}>Ajouter le document</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FileUpload file={file} onFile={setFile} />
        <Select label="Type de document" required value={typeId} onChange={(e) => setTypeId(e.target.value)} placeholder="Choisir un type" error={error?.field('documentTypeId')}>
          {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
        <Textarea label="Commentaire" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="Ex. CMR signée par le destinataire" />
        {error && <p className="rounded-lg bg-stop/10 px-3 py-2 text-sm text-stop" role="alert">{error.field('file') ?? error.message}</p>}
      </div>
    </Modal>
  );
}

/** Aperçu sécurisé : le fichier est récupéré via l'API (JWT) puis affiché depuis un blob local. */
export function DocumentPreview({ doc, onClose }: { doc: DocumentDto | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!doc) return;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    documentsApi.preview(doc.id)
      .then(({ blob }) => { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); })
      .catch(() => setFailed(true));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [doc]);

  if (!doc) return null;
  const isImage = doc.mimeType.startsWith('image/');
  const isPdf = doc.mimeType === 'application/pdf';

  return (
    <Modal open onClose={onClose} title={doc.fileName} description={`${doc.documentTypeLabel} · ${formatFileSize(doc.fileSize)}`} size="xl"
      footer={<Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => documentsApi.download(doc)}>Télécharger</Button>}>
      <div className="grid min-h-[50vh] place-items-center overflow-hidden rounded-xl bg-raised">
        {failed ? <p className="text-sm text-muted">Aperçu indisponible.</p>
          : !url ? <Skeleton className="h-[50vh] w-full" />
            : isImage ? <img src={url} alt={doc.fileName} className="max-h-[65vh] w-auto object-contain" />
              : isPdf ? <iframe src={url} title={doc.fileName} className="h-[65vh] w-full bg-white" />
                : <EmptyState title="Aperçu non disponible pour ce format" description="Téléchargez le document pour l'ouvrir." />}
      </div>
    </Modal>
  );
}

/** Liste des documents d'une mission avec aperçu, téléchargement et suppression (logique). */
export function DocumentList({ missionId, refreshKey, onChanged, readOnly }: { missionId: number; refreshKey?: number; onChanged?: () => void; readOnly?: boolean }) {
  const toast = useToast();
  const [docs, setDocs] = useState<DocumentDto[] | null>(null);
  const [preview, setPreview] = useState<DocumentDto | null>(null);
  const [toDelete, setToDelete] = useState<DocumentDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    missionsApi.documents(missionId).then(setDocs).catch(() => setDocs([]));
  }, [missionId]);
  useEffect(load, [load, refreshKey]);

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await documentsApi.remove(toDelete.id);
      toast.success('Document supprimé.', toDelete.fileName);
      setToDelete(null);
      load();
      onChanged?.();
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setDeleting(false);
    }
  };

  if (!docs) return <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  if (docs.length === 0) return <p className="py-3 text-sm text-muted">Aucun document pour cette mission.</p>;

  return (
    <>
      <ul className="divide-y divide-line/60">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-3 py-2.5">
            <DocIcon ext={d.fileExtension} />
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => setPreview(d)} className="block max-w-full truncate text-left text-sm font-medium hover:text-cyan">{d.fileName}</button>
              <p className="truncate text-xs text-muted">{d.documentTypeLabel} · {formatFileSize(d.fileSize)} · {formatDateTime(d.uploadedAt)}</p>
            </div>
            <div className="flex shrink-0">
              <IconButton label="Aperçu" onClick={() => setPreview(d)}><Eye className="h-4 w-4" /></IconButton>
              <IconButton label="Télécharger" onClick={() => documentsApi.download(d).catch((e) => toast.error((e as ApiError).message))}><Download className="h-4 w-4" /></IconButton>
              {!readOnly && <IconButton label="Supprimer" className="hover:text-stop" onClick={() => setToDelete(d)}><Trash2 className="h-4 w-4" /></IconButton>}
            </div>
          </li>
        ))}
      </ul>
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={deleting}
        title="Supprimer ce document ?"
        message={<>« {toDelete?.fileName} » sera retiré de la mission. La trace reste conservée dans l'historique.</>}
        confirmLabel="Supprimer"
      />
    </>
  );
}
