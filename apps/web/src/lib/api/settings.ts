import { api } from './client';

export interface CompanySettings {
  id: string;
  organizationId: string;
  name: string;
  inn: string;
  bin?: string | null;
  address: string;
  phone?: string | null;
  email?: string | null;
  bankAccount?: string | null;
  bankName?: string | null;
  bankBik?: string | null;
  vatRate?: number | null;
  currency?: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
}

export interface UpdateSettingsDto {
  name?: string;
  inn?: string;
  bin?: string;
  address?: string;
  phone?: string;
  email?: string;
  bankAccount?: string;
  bankName?: string;
  bankBik?: string;
  vatRate?: number;
  currency?: string;
}

export interface UpdateMeDto {
  name?: string;
  newPassword?: string;
  currentPassword?: string;
}

export const settingsApi = {
  getSettings: () => api.get<CompanySettings>('/settings'),
  updateSettings: (dto: UpdateSettingsDto) => api.patch<CompanySettings>('/settings', dto),
  getMe: () => api.get<UserProfile>('/auth/me'),
  updateMe: (dto: UpdateMeDto) => api.patch<UserProfile>('/auth/me', dto),
};
