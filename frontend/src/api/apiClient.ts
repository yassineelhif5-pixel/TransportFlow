import type { ApiEnvelope, ApiErrorBody, LoginResponse } from '@/types';
import { tokenStore } from '@/auth/tokenStore';

/**
 * Client HTTP centralisé. TOUTES les opérations passent par l'API ASP.NET Core :
 * base URL, JWT, en-têtes, délai d'expiration, normalisation des erreurs et rafraîchissement du jeton.
 */

export const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const DEFAULT_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 120_000;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }

  /** Premier message d'erreur d'un champ (validation backend). */
  field(name: string): string | undefined {
    return this.errors?.[name]?.[0];
  }
}

type Listener = (reason: 'expired' | 'logout') => void;
const sessionListeners = new Set<Listener>();
/** Abonnement aux fins de session (refresh impossible) : l'AuthProvider redirige vers /login. */
export function onSessionEnded(listener: Listener) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

let refreshPromise: Promise<boolean> | null = null;

/** Rafraîchit l'access token une seule fois même si plusieurs requêtes échouent en parallèle. */
export function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return Promise.resolve(false);

  refreshPromise = (async () => {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }, DEFAULT_TIMEOUT_MS);
      if (!res.ok) return false;
      const body = (await res.json()) as ApiEnvelope<LoginResponse>;
      tokenStore.setAccessToken(body.data.accessToken, body.data.expiresIn);
      tokenStore.setRefreshToken(body.data.refreshToken, tokenStore.isRemembered());
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const external = init.signal;
  if (external) external.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal, credentials: 'omit' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      if (external?.aborted) throw e;
      throw new ApiError(0, 'TIMEOUT', "Le serveur ne répond pas. Vérifiez votre connexion puis réessayez.");
    }
    throw new ApiError(0, 'NETWORK_ERROR', "Impossible de joindre le serveur. Vérifiez que l'API est démarrée.");
  } finally {
    clearTimeout(timer);
  }
}

interface RequestOptions {
  query?: object;
  body?: unknown;
  signal?: AbortSignal;
  auth?: boolean;
  timeoutMs?: number;
  raw?: boolean;
}

export function buildQuery(query?: object): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function parseError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* corps non JSON */
  }
  const fallback =
    res.status === 403 ? "Vous n'avez pas les droits nécessaires pour cette action."
      : res.status === 404 ? 'Ressource introuvable.'
        : res.status === 413 ? 'Le fichier envoyé est trop volumineux.'
          : res.status === 429 ? 'Trop de requêtes. Patientez quelques instants.'
            : 'Une erreur est survenue.';
  return new ApiError(res.status, body?.code ?? `HTTP_${res.status}`, body?.message ?? fallback, body?.errors);
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const auth = opts.auth !== false;
  if (auth && !tokenStore.isAccessTokenFresh() && tokenStore.getRefreshToken()) {
    await refreshAccessToken();
  }

  const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'TransportFlow' };
  const token = tokenStore.getAccessToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body; // le navigateur fixe le boundary multipart
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const res = await fetchWithTimeout(`${API_BASE_URL}${path}${buildQuery(opts.query)}`,
    { method, headers, body, signal: opts.signal }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  if (res.status === 401 && auth && !retried) {
    // 1) tentative de refresh ; 2) si impossible → fin de session (logout + /login)
    if (await refreshAccessToken()) return request<T>(method, path, opts, true);
    tokenStore.clear();
    sessionListeners.forEach((l) => l('expired'));
    throw new ApiError(401, 'SESSION_EXPIRED', 'Votre session a expiré.');
  }

  if (!res.ok) throw await parseError(res);
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const envelope = (await res.json()) as ApiEnvelope<T>;
  return envelope.data;
}

export const apiClient = {
  get: <T>(path: string, query?: object, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, formData: FormData, query?: object) =>
    request<T>('POST', path, { body: formData, query, timeoutMs: UPLOAD_TIMEOUT_MS }),

  /** Récupère un fichier binaire via l'API (JWT en en-tête, jamais dans l'URL). */
  async blob(path: string, query?: object): Promise<{ blob: Blob; fileName: string }> {
    const res = await request<Response>('GET', path, { query, raw: true, timeoutMs: UPLOAD_TIMEOUT_MS });
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    const plain = /filename="?([^";]+)"?/i.exec(disposition);
    const fileName = star ? decodeURIComponent(star[1]) : plain ? plain[1] : 'document';
    return { blob: await res.blob(), fileName };
  },

  /** Télécharge un fichier (export, document) et déclenche l'enregistrement côté navigateur. */
  async download(path: string, query?: object, fallbackName?: string) {
    const { blob, fileName } = await apiClient.blob(path, query);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName === 'document' && fallbackName ? fallbackName : fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};
