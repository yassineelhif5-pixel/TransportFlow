import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthProvider';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { ToastProvider } from '@/components/ui/Toast';
import { StatusBadge } from '@/components/ui/Display';
import LoginPage from '@/pages/LoginPage';
import { tokenStore } from '@/auth/tokenStore';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const admin = { id: 1, username: 'admin', email: 'admin@local.dev', firstName: 'Admin', lastName: 'TF', fullName: 'Admin TF', role: 'ADMIN', mustChangePassword: false };

function renderApp(initial = '/login') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<p>Tableau de bord chargé</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('Connexion', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); tokenStore.clear(); });
  afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); });

  it('valide les champs avant tout appel API', async () => {
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Se connecter' }));
    expect(screen.getByText('Saisissez votre e-mail ou identifiant.')).toBeInTheDocument();
    expect(screen.getByText('Saisissez votre mot de passe.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('affiche le message de l’API en cas d’identifiants incorrects', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { success: false, message: 'Identifiants incorrects.', code: 'INVALID_CREDENTIALS' }));
    renderApp();
    await userEvent.type(await screen.findByLabelText('E-mail ou identifiant'), 'admin');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'faux');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Identifiants incorrects.');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(JSON.parse(init.body)).toMatchObject({ username: 'admin', password: 'faux', audience: 'admin' });
  });

  it('redirige vers le tableau de bord après connexion (admin / admin)', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { success: true, data: { accessToken: 'jwt', refreshToken: 'r', expiresIn: 3600, expiresAt: '', user: admin } }));
    renderApp();
    await userEvent.type(await screen.findByLabelText('E-mail ou identifiant'), 'admin');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'admin');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('Tableau de bord chargé')).toBeInTheDocument();
    expect(tokenStore.getAccessToken()).toBe('jwt');
  });

  it('protège les routes : non connecté → /login', async () => {
    renderApp('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Bienvenue' })).toBeInTheDocument();
  });

  it('refuse un compte chauffeur sur l’administration', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { success: true, data: { accessToken: 'jwt', refreshToken: 'r', expiresIn: 3600, expiresAt: '', user: { ...admin, role: 'DRIVER' } } }));
    renderApp();
    await userEvent.type(await screen.findByLabelText('E-mail ou identifiant'), 'chauffeur');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('réservé aux administrateurs'));
    expect(tokenStore.getRefreshToken()).toBeNull();
  });
});

describe('StatusBadge', () => {
  it('affiche les statuts en français', () => {
    render(<><StatusBadge code="PICKED_UP" /><StatusBadge code="TO_BE_PICKED_UP" /><StatusBadge code="ANOMALY" /></>);
    expect(screen.getByText('Prise en charge')).toBeInTheDocument();
    expect(screen.getByText('À prendre en charge')).toBeInTheDocument();
    expect(screen.getByText('Anomalie')).toBeInTheDocument();
  });
});
