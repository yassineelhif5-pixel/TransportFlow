import { useState } from 'react';
import { FlaskConical, RotateCcw, X } from 'lucide-react';

/** Bandeau discret rappelant que les données sont fictives, avec remise à zéro de la démo. */
export function DemoBanner() {
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem('tf.demo.banner') === 'hidden'; } catch { return false; }
  });
  if (hidden) return null;

  const reset = async () => {
    const { resetDemo } = await import('./mockServer');
    resetDemo();
    window.location.reload();
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-[55] flex w-[min(620px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-brand/25 bg-surface/95 px-4 py-2.5 text-[0.8125rem] shadow-lift backdrop-blur">
      <FlaskConical className="h-4 w-4 shrink-0 text-brand" aria-hidden />
      <p className="min-w-0 flex-1 text-muted">
        <span className="font-medium text-ink">Version de démonstration</span> — données fictives, enregistrées uniquement dans votre navigateur.
      </p>
      <button type="button" onClick={reset} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-brand hover:bg-brand/10" title="Remettre les données d'origine">
        <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
      </button>
      <button
        type="button"
        onClick={() => { try { sessionStorage.setItem('tf.demo.banner', 'hidden'); } catch { /* ignore */ } setHidden(true); }}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-subtle hover:bg-raised hover:text-ink"
        aria-label="Masquer le bandeau"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
