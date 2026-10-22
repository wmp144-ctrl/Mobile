import { create } from 'zustand';
import { api, ApiError } from '@/lib/api';
import type { AuthPayload, PublicInfo, PublicUser } from '@/lib/types';

export type AuthStatus = 'loading' | 'anon' | 'authed' | 'locked' | 'needs-setup';

interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  workshopName: string;
  appVersion: string;
  idleTimeoutMinutes: number;
  bootstrapError: string | null;
  applyAuth: (payload: AuthPayload) => void;
  clearSession: () => void;
  initialize: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  lock: () => void;
  unlock: (password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

let initPromise: Promise<void> | null = null;
let refreshPromise: Promise<boolean> | null = null;

async function fetchRefresh(): Promise<AuthPayload | null> {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    return (await response.json()) as AuthPayload;
  } catch {
    return null;
  }
}

/** تازه‌سازی هم‌زمان‌شده نشست؛ درخواست‌های ۴۰۱ پشت سر هم فقط یک بار تازه‌سازی می‌کنند */
export function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const payload = await fetchRefresh();
      if (!payload) return false;
      useAuth.getState().applyAuth(payload);
      return true;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  workshopName: '',
  appVersion: '',
  idleTimeoutMinutes: 10,
  bootstrapError: null,

  applyAuth: (payload) => {
    api.token = payload.accessToken;
    set({ status: 'authed', user: payload.user });
  },

  clearSession: () => {
    api.token = null;
    set({ status: 'anon', user: null });
  },

  initialize: async () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      set({ status: 'loading', bootstrapError: null });
      try {
        const info = await api.get<PublicInfo>('/api/public/info', { auth: false });
        set({ workshopName: info.workshopName, appVersion: info.version });
        if (info.needsSetup) {
          set({ status: 'needs-setup' });
          return;
        }
      } catch {
        set({
          status: 'anon',
          bootstrapError: 'ارتباط با سرور برقرار نشد. از روشن بودن سرور و اتصال به شبکه داخلی مطمئن شوید.',
        });
        return;
      }

      const payload = await fetchRefresh();
      if (!payload) {
        set({ status: 'anon' });
        return;
      }
      get().applyAuth(payload);
      await get().refreshProfile().catch(() => undefined);
    })();
    return initPromise;
  },

  login: async (username, password) => {
    const payload = await api.post<AuthPayload>(
      '/api/auth/login',
      { username, password },
      { auth: false },
    );
    get().applyAuth(payload);
    await get().refreshProfile().catch(() => undefined);
  },

  logout: async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* نشست ممکن است قبلاً بسته شده باشد */
    }
    get().clearSession();
  },

  lock: () => {
    if (get().status !== 'authed') return;
    api.token = null;
    set({ status: 'locked' });
  },

  unlock: async (password) => {
    try {
      const payload = await api.post<AuthPayload>(
        '/api/auth/unlock',
        { password },
        { auth: false },
      );
      get().applyAuth(payload);
      await get().refreshProfile().catch(() => undefined);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'SESSION_INVALID' || error.code === 'UNAUTHENTICATED')
      ) {
        get().clearSession();
      }
      throw error;
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    await api.post('/api/auth/change-password', { currentPassword, newPassword });
    await get().refreshProfile();
  },

  refreshProfile: async () => {
    const result = await api.get<{ user: PublicUser; security: { idleTimeoutMinutes: number } }>(
      '/api/auth/me',
    );
    set({ user: result.user, idleTimeoutMinutes: result.security.idleTimeoutMinutes });
  },
}));

api.onUnauthorized = async () => {
  const refreshed = await refreshSession();
  if (!refreshed) {
    useAuth.getState().clearSession();
  }
  return refreshed;
};
