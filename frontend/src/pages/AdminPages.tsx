import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Copy, KeyRound, Lock, Pencil, Plus, Power, Save, ShieldAlert } from 'lucide-react';
import { authApi, settingsApi, usersApi } from '@/api/endpoints';
import { API_BASE_URL, ApiError } from '@/api/apiClient';
import { useAuth } from '@/auth/AuthProvider';
import { useApi, useDebounce, useListState } from '@/hooks/useApi';
import type { PagedQuery, UserDto } from '@/types';
import { formatDateTime, initials } from '@/utils/format';
import { Button, IconButton, Input, SearchInput, Select } from '@/components/ui/Controls';
import { ActiveBadge, Card, CardHeader, ConfirmDialog, EmptyState, InfoRow, Modal, PageHeader, Skeleton } from '@/components/ui/Display';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';

const strong = (p: string) => p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p);
const fieldErrors = (e: ApiError) => Object.fromEntries(Object.entries(e.errors ?? {}).map(([k, v]) => [k, v[0]]));

// ==================================================================== UTILISATEURS

function UserFormModal({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial: UserDto | null; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ username: '', email: '', firstName: '', lastName: '', phone: '', role: 'ADMIN', password: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setF(initial ? { username: initial.username, email: initial.email, firstName: initial.firstName, lastName: initial.lastName, phone: initial.phone ?? '', role: initial.role, password: '' }
      : { username: '', email: '', firstName: '', lastName: '', phone: '', role: 'ADMIN', password: '' });
    setErrors({});
    setFormError(null);
  }, [open, initial]);
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!initial && !/^[a-zA-Z0-9._@-]+$/.test(f.username)) e.username = 'Identifiant invalide (lettres, chiffres, . _ @ -).';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Adresse e-mail invalide.';
    if (!f.firstName.trim()) e.firstName = 'Le prénom est obligatoire.';
    if (!f.lastName.trim()) e.lastName = 'Le nom est obligatoire.';
    if (!initial && !strong(f.password)) e.password = '8 caractères minimum, avec majuscule, minuscule et chiffre.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setPending(true);
    setFormError(null);
    try {
      if (initial) await usersApi.update(initial.id, { email: f.email, firstName: f.firstName, lastName: f.lastName, phone: f.phone || undefined, role: f.role });
      else await usersApi.create({ ...f, phone: f.phone || undefined });
      toast.success(initial ? 'Utilisateur modifié avec succès.' : 'Utilisateur créé avec succès.', `${f.firstName} ${f.lastName}`);
      onSaved();
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err as ApiError));
      setFormError((err as ApiError).message);
    } finally { setPending(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Modifier ${initial.fullName}` : 'Nouvel utilisateur'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={pending}>Annuler</Button><Button onClick={submit} loading={pending}>{initial ? 'Enregistrer' : "Créer l'utilisateur"}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Prénom" required value={f.firstName} onChange={(e) => set('firstName', e.target.value)} error={errors.firstName} />
        <Input label="Nom" required value={f.lastName} onChange={(e) => set('lastName', e.target.value)} error={errors.lastName} />
        <Input label="Identifiant" required value={f.username} onChange={(e) => set('username', e.target.value)} error={errors.username} disabled={!!initial} autoComplete="off" />
        <Input label="E-mail" required type="email" value={f.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
        <Input label="Téléphone" type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        <Select label="Rôle" required value={f.role} onChange={(e) => set('role', e.target.value)} hint={f.role === 'DRIVER' ? "N'a pas accès à l'administration." : undefined}>
          <option value="ADMIN">Administrateur</option><option value="DRIVER">Chauffeur</option>
        </Select>
        {!initial && <Input label="Mot de passe provisoire" required type="password" autoComplete="new-password" className="sm:col-span-2" value={f.password} onChange={(e) => set('password', e.target.value)} error={errors.password} hint="À changer obligatoirement à la première connexion." />}
      </div>
      {formError && <p className="mt-4 rounded-lg bg-stop/10 px-3 py-2 text-sm text-stop" role="alert">{formError}</p>}
    </Modal>
  );
}

export function UsersPage() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const { state, update, toggleSort } = useListState<PagedQuery & { role?: string }>({ page: 1, pageSize: 15, role: '' });
  useEffect(() => { update({ search: debounced }); }, [debounced, update]);
  const { data, loading, error, reload } = useApi((s) => usersApi.list(state, s), [JSON.stringify(state)]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [toggling, setToggling] = useState<UserDto | null>(null);
  const [resetting, setResetting] = useState<UserDto | null>(null);
  const [tempPassword, setTempPassword] = useState<{ user: UserDto; password: string } | null>(null);
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    if (!toggling) return;
    setPending(true);
    try {
      await usersApi.setActive(toggling.id, !toggling.isActive);
      toast.success(toggling.isActive ? 'Utilisateur désactivé.' : 'Utilisateur activé.', toggling.fullName);
      setToggling(null);
      reload();
    } catch (e) { toast.error((e as ApiError).message); setToggling(null); } finally { setPending(false); }
  };

  const reset = async () => {
    if (!resetting) return;
    setPending(true);
    try {
      const r = await usersApi.resetPassword(resetting.id);
      setTempPassword({ user: resetting, password: r.temporaryPassword });
      setResetting(null);
      reload();
    } catch (e) { toast.error((e as ApiError).message); } finally { setPending(false); }
  };

  return (
    <>
      <PageHeader title="Utilisateurs" subtitle="Comptes d'accès à l'administration et à l'application chauffeur"
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Nouvel utilisateur</Button>} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line/70 p-4 sm:flex-row">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un nom, un e-mail…" className="sm:w-96" />
          <Select aria-label="Rôle" className="sm:w-52" value={state.role} onChange={(e) => update({ role: e.target.value })} placeholder="Tous les rôles">
            <option value="ADMIN">Administrateurs</option><option value="DRIVER">Chauffeurs</option>
          </Select>
        </div>
        <DataTable<UserDto>
          rows={data?.items} loading={loading} error={error?.message} onRetry={reload} rowKey={(u) => u.id} sortBy={state.sortBy} sortDir={state.sortDir} onSort={toggleSort}
          empty={<EmptyState title="Aucun utilisateur" />}
          columns={[
            { key: 'name', header: 'Nom', sortKey: 'name', render: (u) => (
              <span className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-raised text-xs font-semibold text-muted">{initials(u.fullName)}</span>
                <span><span className="block font-medium">{u.fullName}</span><span className="block text-xs text-muted">{u.username}</span></span>
              </span>) },
            { key: 'email', header: 'E-mail', sortKey: 'email', hideBelow: 'md', render: (u) => <span className="text-muted">{u.email}</span> },
            { key: 'role', header: 'Rôle', sortKey: 'role', render: (u) => <span className={u.role === 'ADMIN' ? 'text-brand-400' : 'text-cyan'}>{u.role === 'ADMIN' ? 'Administrateur' : 'Chauffeur'}</span> },
            { key: 'status', header: 'Statut', render: (u) => <span className="flex flex-col gap-0.5"><ActiveBadge active={u.isActive} />{u.isLocked && <span className="inline-flex items-center gap-1 text-2xs text-warn"><Lock className="h-3 w-3" /> Verrouillé</span>}{u.mustChangePassword && <span className="text-2xs text-subtle">Mot de passe à changer</span>}</span> },
            { key: 'last', header: 'Dernière connexion', sortKey: 'lastlogin', hideBelow: 'lg', render: (u) => u.lastLoginAt ? formatDateTime(u.lastLoginAt) : <span className="text-subtle">Jamais</span> },
            { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right', render: (u) => (
              <div className="flex justify-end">
                <IconButton label="Modifier" onClick={() => { setEditing(u); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
                <IconButton label="Réinitialiser le mot de passe" onClick={() => setResetting(u)}><KeyRound className="h-4 w-4" /></IconButton>
                <IconButton label={u.isActive ? 'Désactiver' : 'Activer'} disabled={u.id === me?.id} className={u.isActive ? 'hover:text-stop' : 'hover:text-go'} onClick={() => setToggling(u)}><Power className="h-4 w-4" /></IconButton>
              </div>) },
          ]}
        />
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={(p) => update({ page: p }, false)} />}
      </Card>

      <UserFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSaved={reload} />
      <ConfirmDialog open={!!toggling} onClose={() => setToggling(null)} onConfirm={toggle} loading={pending} tone={toggling?.isActive ? 'danger' : 'primary'}
        title={toggling?.isActive ? 'Désactiver cet utilisateur ?' : 'Réactiver cet utilisateur ?'} confirmLabel={toggling?.isActive ? 'Désactiver' : 'Activer'}
        message={toggling?.isActive ? <>{toggling.fullName} sera déconnecté immédiatement et ne pourra plus se connecter.</> : <>{toggling?.fullName} pourra de nouveau se connecter.</>} />
      <ConfirmDialog open={!!resetting} onClose={() => setResetting(null)} onConfirm={reset} loading={pending} tone="primary" title="Réinitialiser le mot de passe ?" confirmLabel="Réinitialiser"
        message={<>Un mot de passe temporaire sera généré pour {resetting?.fullName}. Ses sessions en cours seront fermées et il devra le changer à la prochaine connexion.</>} />
      <Modal open={!!tempPassword} onClose={() => setTempPassword(null)} title="Mot de passe temporaire" size="sm"
        footer={<Button onClick={() => setTempPassword(null)}>J'ai transmis le mot de passe</Button>}>
        <p className="text-sm text-muted">Communiquez ce mot de passe à {tempPassword?.user.fullName} par un canal sûr. Il ne sera plus affiché.</p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-raised p-3">
          <code className="flex-1 select-all text-base font-semibold tracking-wider">{tempPassword?.password}</code>
          <IconButton label="Copier" onClick={() => { navigator.clipboard?.writeText(tempPassword?.password ?? ''); toast.info('Mot de passe copié.'); }}><Copy className="h-4 w-4" /></IconButton>
        </div>
      </Modal>
    </>
  );
}

// ==================================================================== PROFIL

export function ProfilePage() {
  const toast = useToast();
  const location = useLocation();
  const forced = (location.state as { forcePasswordChange?: boolean } | null)?.forcePasswordChange;
  const { user, setUser, applySession } = useAuth();
  const [profile, setProfile] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [pErrors, setPErrors] = useState<Record<string, string | undefined>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => { if (user) setProfile({ firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone ?? '' }); }, [user]);
  if (!user) return null;

  const saveProfile = async () => {
    setSavingProfile(true);
    setPErrors({});
    try {
      const updated = await authApi.updateProfile({ ...profile, phone: profile.phone || undefined });
      setUser(updated);
      toast.success('Profil mis à jour.');
    } catch (e) { setPErrors(fieldErrors(e as ApiError)); toast.error((e as ApiError).message); } finally { setSavingProfile(false); }
  };

  const changePwd = async () => {
    const e: Record<string, string> = {};
    if (!pwd.current) e.currentPassword = "L'ancien mot de passe est obligatoire.";
    if (!strong(pwd.next)) e.newPassword = '8 caractères minimum, avec majuscule, minuscule et chiffre.';
    else if (pwd.next === pwd.current) e.newPassword = "Le nouveau mot de passe doit être différent de l'ancien.";
    if (pwd.confirm !== pwd.next) e.confirmPassword = 'La confirmation ne correspond pas au nouveau mot de passe.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSavingPwd(true);
    try {
      const session = await authApi.changePassword(pwd.current, pwd.next, pwd.confirm);
      applySession(session);
      setPwd({ current: '', next: '', confirm: '' });
      toast.success('Mot de passe modifié.', 'Vos autres sessions ont été fermées.');
    } catch (err) { setErrors(fieldErrors(err as ApiError)); if (!(err as ApiError).errors) toast.error((err as ApiError).message); } finally { setSavingPwd(false); }
  };

  return (
    <>
      <PageHeader title="Mon profil" subtitle="Informations personnelles et sécurité du compte" />
      {(forced || user.mustChangePassword) && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <span>Pour des raisons de sécurité, vous devez définir un nouveau mot de passe avant d'accéder à l'administration.</span>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Informations" />
          <div className="flex items-center gap-4 px-5 pt-5">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand to-cyan text-lg font-semibold text-white">{initials(user.fullName)}</span>
            <div><p className="font-medium">{user.fullName}</p><p className="text-sm text-muted">{user.role === 'ADMIN' ? 'Administrateur' : 'Chauffeur'} · {user.username}</p></div>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Input label="Prénom" value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} error={pErrors.firstName} />
            <Input label="Nom" value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} error={pErrors.lastName} />
            <Input label="E-mail" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} error={pErrors.email} />
            <Input label="Téléphone" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} error={pErrors.phone} />
          </div>
          <dl className="divide-y divide-line/60 border-t border-line/60 px-5">
            <InfoRow label="Rôle">{user.role === 'ADMIN' ? 'Administrateur' : 'Chauffeur'}</InfoRow>
            <InfoRow label="Dernière connexion">{formatDateTime(user.lastLoginAt)}</InfoRow>
          </dl>
          <div className="flex justify-end border-t border-line/60 px-5 py-4"><Button icon={<Save className="h-4 w-4" />} loading={savingProfile} onClick={saveProfile}>Enregistrer</Button></div>
        </Card>

        <Card>
          <CardHeader title="Modifier le mot de passe" subtitle="8 caractères minimum, avec une majuscule, une minuscule et un chiffre." />
          <div className="space-y-4 p-5">
            <Input label="Ancien mot de passe" type="password" autoComplete="current-password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} error={errors.currentPassword} />
            <Input label="Nouveau mot de passe" type="password" autoComplete="new-password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} error={errors.newPassword} />
            <Input label="Confirmation" type="password" autoComplete="new-password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} error={errors.confirmPassword} />
            <div className="flex gap-1.5" aria-hidden>
              {[pwd.next.length >= 8, /[A-Z]/.test(pwd.next), /[a-z]/.test(pwd.next), /\d/.test(pwd.next)].map((ok, i) => <span key={i} className={`h-1 flex-1 rounded-full ${ok ? 'bg-go' : 'bg-line'}`} />)}
            </div>
          </div>
          <div className="flex justify-end border-t border-line/60 px-5 py-4"><Button icon={<KeyRound className="h-4 w-4" />} loading={savingPwd} onClick={changePwd}>Modifier le mot de passe</Button></div>
        </Card>
      </div>
    </>
  );
}

// ==================================================================== PARAMÈTRES

export function SettingsPage() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => settingsApi.list(), []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const health = useApi(async () => {
    const res = await fetch(`${API_BASE_URL}/health`, { headers: { Accept: 'application/json' } });
    return (await res.json()) as { status: string; components: Record<string, { status: string; description?: string }> };
  }, []);

  useEffect(() => { if (data) setValues(Object.fromEntries(data.map((p) => [p.key, p.value]))); }, [data]);
  const dirty = data?.some((p) => values[p.key] !== p.value);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const updated = await settingsApi.update(data.filter((p) => values[p.key] !== p.value).map((p) => ({ key: p.key, value: values[p.key] })));
      setData(updated);
      toast.success('Paramètres enregistrés.');
    } catch (e) { toast.error((e as ApiError).message); } finally { setSaving(false); }
  };

  const labels: Record<string, string> = { api: 'API', sqlserver: 'SQL Server', storage: 'Stockage documentaire' };

  return (
    <>
      <PageHeader title="Paramètres" subtitle="Configuration générale et état des services" actions={<Button icon={<Save className="h-4 w-4" />} disabled={!dirty} loading={saving} onClick={save}>Enregistrer</Button>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Paramètres système" subtitle="Stockés dans SQL Server (table SystemParameter)" />
          {error ? <EmptyState title="Chargement impossible" description={error.message} action={<Button variant="secondary" onClick={reload}>Réessayer</Button>} /> : loading || !data ? <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div> : (
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {data.map((p) => (
                <Input key={p.key} label={p.description ?? p.key} hint={p.key} value={values[p.key] ?? ''} onChange={(e) => setValues({ ...values, [p.key]: e.target.value })} maxLength={500} />
              ))}
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="État des services" subtitle="GET /health" actions={<Button size="sm" variant="ghost" onClick={health.reload}>Actualiser</Button>} />
          <ul className="divide-y divide-line/60 px-5">
            {health.loading && !health.data && <li className="py-4"><Skeleton className="h-8" /></li>}
            {health.error && <li className="py-4 text-sm text-stop">Service de santé injoignable.</li>}
            {health.data && Object.entries(health.data.components).map(([k, c]) => (
              <li key={k} className="flex items-center justify-between gap-3 py-3.5 text-sm">
                <span><span className="block font-medium">{labels[k] ?? k}</span><span className="text-xs text-muted">{c.description}</span></span>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${c.status === 'Healthy' ? 'text-go-400' : 'text-stop'}`}>
                  <span className={`h-2 w-2 rounded-full ${c.status === 'Healthy' ? 'bg-go' : 'bg-stop'}`} />{c.status === 'Healthy' ? 'Opérationnel' : 'Indisponible'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
