import { saveTokens, clearTokens, getRefreshToken } from '../tokens';
import { useReauthStore } from '../../stores/reauth.store';

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

// Endpoints that don't require (or predate) an access token — a 401 here
// means "wrong credentials"/"bad refresh token", not "session expired", so
// it must never trigger the refresh-and-retry flow below (that would either
// loop or just be meaningless for these three).
const PUBLIC_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];
function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}?`));
}

async function rawFetch(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers: HeadersInit = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers ?? {}),
  };
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({ message: res.statusText }));
  return new ApiError(res.status, (body as { message?: string }).message ?? res.statusText);
}

/**
 * Shared request path for JSON calls, multipart uploads and blob downloads
 * alike — on a 401 (expired access token) it transparently refreshes via the
 * refresh token and retries the same request once, surfacing a
 * "reauthorizing" overlay for the moment that takes so the UI doesn't just
 * look frozen. Only gives up (and redirects to login) if the refresh itself
 * fails or the retry still 401s. Returns the raw, already-ok Response —
 * callers decide how to read the body (.json(), .blob(), ...).
 */
async function fetchWithAuth(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const res = await rawFetch(path, init, token);

  if (res.status !== 401 || isPublicPath(path)) {
    if (!res.ok) throw await toApiError(res);
    return res;
  }

  useReauthStore.getState().setActive(true);
  try {
    const newToken = await attemptRefresh();
    if (!newToken) {
      redirectToLogin();
      throw new ApiError(401, 'Сессия истекла');
    }

    const retryRes = await rawFetch(path, init, newToken);

    if (retryRes.status === 401) {
      redirectToLogin();
      throw new ApiError(401, 'Сессия истекла');
    }
    if (!retryRes.ok) throw await toApiError(retryRes);

    return retryRes;
  } finally {
    useReauthStore.getState().setActive(false);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchWithAuth(path, init);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function requestBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const res = await fetchWithAuth(path, init);
  return res.blob();
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
    request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** Multipart file upload (avatar, logo, background photos, archive PDFs, editor images…) — same auth/refresh handling as the JSON methods. */
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  /** Binary download (PDF/DOCX export…) — same auth/refresh handling as the JSON methods. */
  getBlob: (path: string) => requestBlob(path),
};

export { THIRTY_DAYS };
