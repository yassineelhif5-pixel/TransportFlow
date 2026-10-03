import { useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, FileDown, FileSpreadsheet } from 'lucide-react';
import { referencesApi } from '@/api/endpoints';
import { ApiError } from '@/api/apiClient';
import type { ImportResult } from '@/types';
import { Button } from '@/components/ui/Controls';
import { Modal } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { FileUpload } from '@/components/Documents';

const STEPS = ['Fichier', 'Analyse', 'Prévisualisation', 'Confirmation'];

/**
 * Import CSV/Excel en étapes : sélection → envoi à l'API et analyse (commit=false) → prévisualisation
 * des lignes valides et des erreurs → confirmation (commit=true). Toute la validation est faite par le backend.
 */
export function ImportWizard({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setStep(0); setFile(null); setAnalysis(null); setResult(null); setError(null); };
  const close = () => { reset(); onClose(); };

  const analyse = async () => {
    if (!file) return;
    setPending(true);
    setError(null);
    setStep(1);
    try {
      const r = await referencesApi.import(file, false);
      setAnalysis(r);
      setStep(2);
    } catch (e) {
      setError((e as ApiError).field('file') ?? (e as ApiError).message);
      setStep(0);
    } finally {
      setPending(false);
    }
  };

  const confirm = async () => {
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const r = await referencesApi.import(file, true);
      setResult(r);
      setStep(3);
      toast.success('Référence(s) importée(s) avec succès.', `${r.imported} ligne(s) importée(s)`);
      onImported();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setPending(false);
    }
  };

  const footer = (
    <>
      {step === 3 ? (
        <Button onClick={close}>Terminer</Button>
      ) : (
        <>
          <Button variant="secondary" onClick={step === 2 ? () => { setStep(0); setAnalysis(null); } : close} disabled={pending}>
            {step === 2 ? 'Changer de fichier' : 'Annuler'}
          </Button>
          {step < 2 && <Button onClick={analyse} loading={pending} disabled={!file}>Analyser le fichier</Button>}
          {step === 2 && (
            <Button onClick={confirm} loading={pending} disabled={!analysis?.validRows}>
              Confirmer l'import{analysis?.validRows ? ` (${analysis.validRows})` : ''}
            </Button>
          )}
        </>
      )}
    </>
  );

  return (
    <Modal open={open} onClose={close} title="Importer des références" description="Formats acceptés : CSV (séparateur ; ou ,) et Excel .xlsx — 5 Mo maximum." size="lg" footer={footer}>
      <ol className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span className={clsx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold', i < step || (i === 3 && step === 3) ? 'bg-go text-white' : i === step ? 'bg-brand text-white' : 'bg-raised text-subtle')}>
              {i < step || (i === 3 && step === 3) ? '✓' : i + 1}
            </span>
            <span className={clsx('hidden text-xs sm:inline', i === step ? 'text-ink' : 'text-muted')}>{s}</span>
            {i < STEPS.length - 1 && <span className={clsx('h-px flex-1', i < step ? 'bg-go' : 'bg-line')} />}
          </li>
        ))}
      </ol>

      {step <= 1 && (
        <div className="space-y-4">
          <FileUpload file={file} onFile={(f) => { setFile(f); setError(null); }} accept=".csv,.xlsx" maxMb={5} hint="Colonnes attendues : Référence, Client (code ou nom), Notes (optionnel)" />
          <button type="button" onClick={() => referencesApi.template()} className="inline-flex items-center gap-2 text-sm text-cyan hover:underline">
            <FileDown className="h-4 w-4" /> Télécharger le modèle CSV
          </button>
          {step === 1 && <p className="text-sm text-muted" role="status">Envoi et analyse en cours…</p>}
        </div>
      )}

      {step === 2 && analysis && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-line bg-raised/50 p-4"><p className="text-2xl font-semibold tabular-nums">{analysis.totalRows}</p><p className="text-xs text-muted">lignes détectées</p></div>
            <div className="rounded-xl border border-go/30 bg-go/5 p-4"><p className="text-2xl font-semibold tabular-nums text-go-400">{analysis.validRows}</p><p className="text-xs text-muted">lignes valides</p></div>
            <div className={clsx('rounded-xl border p-4', analysis.errorRows ? 'border-stop/30 bg-stop/5' : 'border-line bg-raised/50')}><p className={clsx('text-2xl font-semibold tabular-nums', analysis.errorRows > 0 && 'text-stop')}>{analysis.errorRows}</p><p className="text-xs text-muted">lignes en erreur</p></div>
          </div>

          {analysis.errors.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Erreurs détectées <span className="font-normal text-muted">— ces lignes seront ignorées</span></p>
              <ul className="scrollbar-thin max-h-44 divide-y divide-line/60 overflow-y-auto rounded-xl border border-line">
                {analysis.errors.map((e, i) => (
                  <li key={i} className="flex items-start gap-3 px-3 py-2 text-sm">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-stop" />
                    <span className="w-16 shrink-0 text-muted">Ligne {e.line}</span>
                    <span className="flex-1">{e.message}{e.value && <span className="text-muted"> — « {e.value} »</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.preview.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Aperçu des lignes valides</p>
              <div className="scrollbar-thin max-h-56 overflow-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-raised"><tr><th className="th-cell">Ligne</th><th className="th-cell">Référence</th><th className="th-cell">Client</th><th className="th-cell">Notes</th></tr></thead>
                  <tbody>
                    {analysis.preview.map((r) => (
                      <tr key={r.line} className="border-t border-line/60">
                        <td className="td-cell text-muted">{r.line}</td>
                        <td className="td-cell ref-code">{r.number}</td>
                        <td className="td-cell">{r.clientName}</td>
                        <td className="td-cell max-w-[180px] truncate text-muted">{r.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!analysis.validRows && <p className="rounded-lg bg-stop/10 px-3 py-2 text-sm text-stop">Aucune ligne valide : corrigez le fichier puis relancez l'analyse.</p>}
        </div>
      )}

      {step === 3 && result && (
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-go" />
          <p className="mt-4 text-lg font-semibold">{result.imported} référence{result.imported > 1 ? 's' : ''} importée{result.imported > 1 ? 's' : ''}</p>
          <p className="mt-1 text-sm text-muted">
            {result.totalRows - result.imported > 0 ? `${result.totalRows - result.imported} ligne(s) ignorée(s). ` : ''}L'import est enregistré dans l'historique.
          </p>
          <FileSpreadsheet className="mt-6 h-5 w-5 text-subtle" />
          <p className="text-xs text-subtle">{result.fileName}</p>
        </div>
      )}

      {error && <p className="mt-4 rounded-lg bg-stop/10 px-3 py-2 text-sm text-stop" role="alert">{error}</p>}
    </Modal>
  );
}
