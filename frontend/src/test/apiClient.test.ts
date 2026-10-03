import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient, buildQuery, onSessionEnded } from '@/api/apiClient';
import { tokenStore } from '@/auth/tokenStore';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('apiClient', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    tokenStore.clear();
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('envoie le JWT et renvoie le champ data de l’enveloppe', async () => {
    tokenStore.setAccessToken('jwt-123', 3600);
    fetchMock.mockResolvedValueOnce(json(200, { success: true, data: { total: 3 } }));

    const data = await apiClient.get<{ total: number }>('/api/dashboard');

    expect(data.total).toBe(3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/dashboard');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-123');
  });

  it('normalise les erreurs API (message, code, erreurs de champ)', async () => {
    tokenStore.setAccessToken('jwt', 3600);
    fetchMock.mockResolvedValueOnce(json(400, { success: false, message: 'La référence est obligatoire.', code: 'VALIDATION_ERROR', errors: { referenceNumber: ['La référence est obligatoire.'] } }));

    const err = (await apiClient.post('/api/missions', {}).catch((e) => e)) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.field('referenceNumber')).toBe('La référence est obligatoire.');
  });

  it('rafraîchit le jeton sur 401 puis rejoue la requête', async () => {
    tokenStore.setAccessToken('expired', 3600);
    tokenStore.setRefreshToken('refresh-1', true);
    fetchMock
      .mockResolvedValueOnce(json(401, { success: false, message: 'Votre session a expiré.', code: 'TOKEN_EXPIRED' }))
      .mockResolvedValueOnce(json(200, { success: true, data: { accessToken: 'fresh', refreshToken: 'refresh-2', expiresIn: 3600 } }))
      .mockResolvedValueOnce(json(200, { success: true, data: [1, 2] }));

    const data = await apiClient.get<number[]>('/api/missions');

    expect(data).toEqual([1, 2]);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/refresh');
    expect((fetchMock.mock.calls[2][1].headers as Record<string, string>).Authorization).toBe('Bearer fresh');
    expect(tokenStore.getRefreshToken()).toBe('refresh-2');
  });

  it('termine la session si le refresh est impossible', async () => {
    tokenStore.setAccessToken('expired', 3600);
    tokenStore.setRefreshToken('dead', false);
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    fetchMock
      .mockResolvedValueOnce(json(401, { success: false, message: 'x', code: 'UNAUTHORIZED' }))
      .mockResolvedValueOnce(json(401, { success: false, message: 'x', code: 'SESSION_EXPIRED' }));

    const err = (await apiClient.get('/api/missions').catch((e) => e)) as ApiError;

    expect(err.code).toBe('SESSION_EXPIRED');
    expect(ended).toHaveBeenCalledWith('expired');
    expect(tokenStore.getRefreshToken()).toBeNull();
    off();
  });

  it('envoie les fichiers en multipart sans forcer le Content-Type', async () => {
    tokenStore.setAccessToken('jwt', 3600);
    fetchMock.mockResolvedValueOnce(json(200, { success: true, data: { id: 9 } }));
    const form = new FormData();
    form.append('file', new Blob(['%PDF']), 'CMR.pdf');

    await apiClient.upload('/api/missions/1/documents', form);

    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe(form);
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('construit les query strings en ignorant les valeurs vides', () => {
    expect(buildQuery({ page: 2, status: '', clientId: undefined, search: 'REF 1' })).toBe('?page=2&search=REF+1');
  });
});
