import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, onSessionEnded, refreshAccessToken } from '@/api/apiClient';
import { authApi } from '@/api/endpoints';
import type { LoginResponse, UserInfo } from '@/types';
import { tokenStore } from './tokenStore';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: UserInfo | null;
  /** Raison de la dernière fin de session (affichée sur l'écran de connexion). */
  endReason: 'expired' | null;
  login: (username: string, password: string, rememberMe: boolean) => Promise<UserInfo>;
  logout: () => Promise<void>;
  applySession: (session: LoginResponse) => void;
  setUser: (user: UserInfo) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [endReason, setEndReason] = useState<'expired' | null>(null);

  const applySession = useCallback((session: LoginResponse, remember = tokenStore.isRemembered()) => {
    tokenStore.setAccessToken(session.accessToken, session.expiresIn);
    tokenStore.setRefreshToken(session.refreshToken, remember);
    setUser(session.user);
    setStatus('authenticated');
    setEndReason(null);
  }, []);

  // Restauration de session au chargement : refresh token → nouvel access token → profil via l'API.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokenStore.getRefreshToken()) {
        setStatus('anonymous');
        return;
      }
      const ok = await refreshAccessToken();
      if (!ok) {
        tokenStore.clear();
        if (!cancelled) setStatus('anonymous');
        return;
      }
      try {
        const me = await authApi.me();
        if (cancelled) return;
        if (me.role !== 'ADMIN') {
          tokenStore.clear();
          setStatus('anonymous');
          return;
        }
        setUser(me);
        setStatus('authenticated');
      } catch {
        tokenStore.clear();
        if (!cancelled) setStatus('anonymous');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () =>
      onSessionEnded((reason) => {
        setUser(null);
        setStatus('anonymous');
        setEndReason(reason === 'expired' ? 'expired' : null);
      }),
    [],
  );

  const login = useCallback(async (username: string, password: string, rememberMe: boolean) => {
    const session = await authApi.login(username, password, rememberMe);
    if (session.user.role !== 'ADMIN') {
      // Double contrôle : l'API refuse déjà (audience admin), le navigateur ne garde rien.
      throw new ApiError(403, 'ADMIN_ONLY', 'Cet espace est réservé aux administrateurs.');
    }
    applySession(session, rememberMe);
    return session.user;
  }, [applySession]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* la session locale est effacée quoi qu'il arrive */
    }
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
    setEndReason(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, endReason, login, logout, applySession: (s) => applySession(s), setUser }),
    [status, user, endReason, login, logout, applySession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}
