import { saveTokens, clearTokens, getRefreshToken } from '../tokens';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

let refreshPromise: Promise<string | null> | null = null;

async function attemptRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return null;

      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) return null;

      const data = await res.json() as { accessToken: string; refreshToken: string };
      saveTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  clearTokens();
  window.location.href = '/login';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers ?? {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && !path.startsWith('/auth/')) {
    const newToken = await attemptRefresh();
    if (!newToken) {
      redirectToLogin();
      throw new ApiError(401, 'Сессия истекла');
    }

    const retryHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${newToken}`,
      ...(init.headers ?? {}),
    };
    const retryRes = await fetch(`${API_BASE}${path}`, { ...init, headers: retryHeaders });

    if (retryRes.status === 401) {
      redirectToLogin();
      throw new ApiError(401, 'Сессия истекла');
    }

    if (!retryRes.ok) {
      const body = await retryRes.json().catch(() => ({ message: retryRes.statusText }));
      throw new ApiError(retryRes.status, (body as { message?: string }).message ?? retryRes.statusText);
    }

    if (retryRes.status === 204) return undefined as T;
    return retryRes.json() as Promise<T>;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, (body as { message?: string }).message ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export { THIRTY_DAYS };
