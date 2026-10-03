import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, KeyRound, Lock, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError } from '@/api/apiClient';
import { BrandMark, BrandName } from '@/components/BrandMark';
import { RouteNetwork } from '@/components/RouteNetwork';
import { Button, Checkbox, Input } from '@/components/ui/Controls';
import { Modal } from '@/components/ui/Display';
import { IS_DEMO } from '@/demo/flags';

export default function LoginPage() {
  const { login, status, endReason } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  // Démo publiée : identifiants préremplis pour un accès en un clic.
  const [username, setUsername] = useState(IS_DEMO ? 'admin' : '');
  const [password, setPassword] = useState(IS_DEMO ? 'admin' : '');
  const [remember, setRemember] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [forgotOpen, setForgotOpen] = useState(false);

  if (status === 'authenticated') return <Navigate to={from.startsWith('/login') ? '/dashboard' : from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const fe: typeof fieldErrors = {};
    if (!username.trim()) fe.username = "Saisissez votre e-mail ou identifiant.";
    if (!password) fe.password = 'Saisissez votre mot de passe.';
    setFieldErrors(fe);
    if (fe.username || fe.password) return;

    setPending(true);
    setError(null);
    try {
      await login(username.trim(), password, remember);
      navigate(from.startsWith('/login') ? '/dashboard' : from, { replace: true });
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.message || 'Identifiants incorrects.');
      setPassword('');
    } finally {
      setPending(false);
    }
  };

  const sessionMessage = endReason === 'expired' && !error ? 'Votre session a expiré. Reconnectez-vous pour continuer.' : null;

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.08fr_1fr]">
      {/* Partie gauche : illustration et promesse */}
      <aside className="relative hidden overflow-hidden border-r border-line bg-gradient-to-br from-[#E8F1FA] via-[#F1F6FB] to-[#E6F5F7] text-navy lg:flex lg:flex-col dark:from-navy-950 dark:via-navy-950 dark:to-navy-900 dark:text-white">
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,rgba(35,110,190,.12),transparent_55%),radial-gradient(90%_70%_at_100%_100%,rgba(44,170,191,.12),transparent_60%)]" aria-hidden />
        <div className="relative z-10 flex items-center gap-3 px-12 pt-10">
          <BrandMark className="h-10 w-10" />
          <BrandName className="text-xl" />
        </div>

        <div className="relative z-10 mx-auto my-auto w-full max-w-[560px] px-8">
          <RouteNetwork />
        </div>

        <div className="relative z-10 px-12 pb-12">
          <p className="max-w-md text-[1.75rem] font-semibold leading-tight" style={{ fontStretch: '115%' }}>
            L'administrateur pilote.<br />
            Le chauffeur exécute.<br />
            <span className="text-brand dark:text-white/55">La plateforme trace.</span>
          </p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-brand" /> Missions et affectations</span>
            <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-cyan" /> Suivi des statuts en temps réel</span>
            <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-go" /> Documents et audit</span>
          </div>
        </div>
      </aside>

      {/* Partie droite : carte de connexion */}
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark className="h-10 w-10" />
            <span className="text-xl font-semibold" style={{ fontStretch: '118%' }}>Transport<span className="text-cyan">Flow</span></span>
          </div>

          <h1 className="text-[2rem] font-semibold leading-tight">Bienvenue</h1>
          <p className="mt-2 text-muted">Connectez-vous à votre espace d'administration</p>

          {(error || sessionMessage) && (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-stop/30 bg-stop/10 px-4 py-3 text-sm text-ink" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-stop" />
              <span>{error ?? sessionMessage}</span>
            </div>
          )}

          <form onSubmit={submit} noValidate className="mt-7 space-y-5">
            <Input
              label="E-mail ou identifiant"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={fieldErrors.username}
              leading={<User className="h-4 w-4" />}
              placeholder="admin@entreprise.fr"
              maxLength={256}
            />
            <Input
              label="Mot de passe"
              name="password"
              type={showPwd ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              leading={<Lock className="h-4 w-4" />}
              maxLength={256}
              trailing={
                <button type="button" onClick={() => setShowPwd((s) => !s)} className="grid h-7 w-7 place-items-center rounded text-subtle hover:text-ink" aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />

            <div className="flex items-center justify-between">
              <Checkbox id="remember" label="Se souvenir de moi" checked={remember} onChange={setRemember} />
              <button type="button" onClick={() => setForgotOpen(true)} className="text-sm text-cyan hover:underline">Mot de passe oublié ?</button>
            </div>

            <Button type="submit" size="lg" className="w-full" loading={pending}>
              Se connecter
            </Button>
          </form>

          {(import.meta.env.DEV || IS_DEMO) && (
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-dashed border-warn/40 bg-warn/5 px-4 py-3 text-[0.8125rem] text-muted">
              <KeyRound className="h-4 w-4 shrink-0 text-warn" />
              <span>{IS_DEMO ? 'Accès démonstration' : 'Environnement de développement'} : <strong className="text-ink">admin</strong> / <strong className="text-ink">admin</strong></span>
            </div>
          )}

          <p className="mt-10 flex items-center gap-2 text-xs text-subtle">
            <ShieldCheck className="h-4 w-4 text-go" />
            Accès sécurisé : jeton signé à durée limitée, actions journalisées.
          </p>
        </div>
      </main>

      <Modal open={forgotOpen} onClose={() => setForgotOpen(false)} title="Mot de passe oublié" size="sm"
        footer={<Button onClick={() => setForgotOpen(false)}>J'ai compris</Button>}>
        <p className="text-sm leading-relaxed text-muted">
          Pour des raisons de sécurité, la réinitialisation est effectuée par un administrateur depuis
          <span className="text-ink"> Administration › Utilisateurs</span>. Un mot de passe temporaire vous sera communiqué
          et devra être changé à la première connexion.
        </p>
      </Modal>
    </div>
  );
}
