import { api } from './client';
import { saveTokens, clearTokens } from '../tokens';
import type { LoginRequest, LoginResponse } from '@ai-vault/types';

export const authApi = {
  async login(body: LoginRequest): Promise<LoginResponse> {
    const res = await api.post<LoginResponse>('/auth/login', body);
    saveTokens(res.accessToken, res.refreshToken);
    return res;
  },

  async register(body: { name: string; email: string; password: string; organizationName: string }): Promise<LoginResponse> {
    const res = await api.post<LoginResponse>('/auth/register', body);
    saveTokens(res.accessToken, res.refreshToken);
    return res;
  },

  async refresh(refreshToken: string): Promise<LoginResponse> {
    const res = await api.post<LoginResponse>('/auth/refresh', { refreshToken });
    saveTokens(res.accessToken, res.refreshToken);
    return res;
  },

  async logout(): Promise<void> {
    try {
      await api.post<void>('/auth/logout', {});
    } finally {
      clearTokens();
    }
  },
};
