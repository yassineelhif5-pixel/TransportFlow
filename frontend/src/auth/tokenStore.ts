/**
 * Stockage des jetons.
 * - L'access token (JWT court) reste en mémoire uniquement.
 * - Le refresh token est conservé en localStorage si « Se souvenir de moi », sinon en sessionStorage
 *   (effacé à la fermeture du navigateur). Aucun mot de passe n'est jamais stocké côté client.
 */
const REFRESH_KEY = 'tf.rt';

let accessToken: string | null = null;
let accessExpiresAt = 0;

export const tokenStore = {
  getAccessToken: () => accessToken,
  isAccessTokenFresh: () => !!accessToken && Date.now() < accessExpiresAt - 30_000,
  setAccessToken(token: string, expiresInSeconds: number) {
    accessToken = token;
    accessExpiresAt = Date.now() + expiresInSeconds * 1000;
  },
  getRefreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_KEY) ?? sessionStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  isRemembered(): boolean {
    try {
      return localStorage.getItem(REFRESH_KEY) !== null;
    } catch {
      return false;
    }
  },
  setRefreshToken(token: string, remember: boolean) {
    try {
      localStorage.removeItem(REFRESH_KEY);
      sessionStorage.removeItem(REFRESH_KEY);
      (remember ? localStorage : sessionStorage).setItem(REFRESH_KEY, token);
    } catch {
      /* stockage indisponible : la session durera le temps de l'onglet */
    }
  },
  clear() {
    accessToken = null;
    accessExpiresAt = 0;
    try {
      localStorage.removeItem(REFRESH_KEY);
      sessionStorage.removeItem(REFRESH_KEY);
    } catch {
      /* ignore */
    }
  },
};
