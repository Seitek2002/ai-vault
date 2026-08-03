import { api, ApiError } from './client';
import type { Position } from './positions';
import type { BackgroundImageScope } from '../backgrounds';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

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
  logoUrl?: string | null;
}

export interface BackgroundFilter {
  opacity: number;
  blur: number;
  brightness: number;
  saturate: number;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string | null;
  avatarUrl?: string | null;
  backgroundId?: string | null;
  backgroundImageUrl?: string | null;
  backgroundFilter?: BackgroundFilter | null;
  backgroundImageScope?: BackgroundImageScope | null;
  sidebarBackgroundId?: string | null;
  sidebarImageUrl?: string | null;
  sidebarImageFilter?: BackgroundFilter | null;
  position?: Position | null;
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
  backgroundId?: string | null;
  backgroundFilter?: BackgroundFilter | null;
  removeBackgroundImage?: boolean;
  backgroundImageScope?: BackgroundImageScope | null;
  sidebarBackgroundId?: string | null;
  sidebarImageFilter?: BackgroundFilter | null;
  removeSidebarImage?: boolean;
}

export interface Member {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  avatarUrl?: string | null;
  position?: Position | null;
}

export interface AddMemberDto {
  email: string;
  positionId?: string;
}

export interface CreateMemberDto {
  name: string;
  email: string;
  password: string;
  positionId?: string;
}

export interface UpdateMemberDto {
  positionId?: string | null;
  role?: string;
}

export interface CreateOrganizationDto {
  name: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

async function uploadFileTo<T>(path: string, file: File): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, (body as { message?: string }).message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const settingsApi = {
  getSettings: () => api.get<CompanySettings>('/settings'),
  updateSettings: (dto: UpdateSettingsDto) => api.patch<CompanySettings>('/settings', dto),
  getMe: () => api.get<UserProfile>('/auth/me'),
  updateMe: (dto: UpdateMeDto) => api.patch<UserProfile>('/auth/me', dto),
  listMembers: () => api.get<Member[]>('/auth/members'),
  addMember: (dto: AddMemberDto) => api.post<Member>('/auth/members', dto),
  createMember: (dto: CreateMemberDto) => api.post<Member>('/auth/members/create', dto),
  updateMember: (id: string, dto: UpdateMemberDto) => api.patch<Member>(`/auth/members/${id}`, dto),
  createOrganization: (dto: CreateOrganizationDto) => api.post<AuthTokens>('/auth/organization', dto),
  uploadAvatar: (file: File) => uploadFileTo<UserProfile>('/auth/me/avatar', file),
  uploadBackgroundImage: (file: File) => uploadFileTo<UserProfile>('/auth/me/background-image', file),
  uploadSidebarImage: (file: File) => uploadFileTo<UserProfile>('/auth/me/sidebar-image', file),
  uploadLogo: (file: File) => uploadFileTo<CompanySettings>('/settings/logo', file),
};
