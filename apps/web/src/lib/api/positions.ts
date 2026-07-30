import { api } from './client';
import { Permission, PERMISSION_LABELS } from '@ai-vault/types';

export { Permission, PERMISSION_LABELS };

export interface Position {
  id: string;
  name: string;
  permissions: Permission[];
  createdAt: string;
}

export interface CreatePositionDto {
  name: string;
  permissions: Permission[];
}

export interface UpdatePositionDto {
  name?: string;
  permissions?: Permission[];
}

export const positionsApi = {
  list: () => api.get<Position[]>('/positions'),
  create: (dto: CreatePositionDto) => api.post<Position>('/positions', dto),
  update: (id: string, dto: UpdatePositionDto) => api.patch<Position>(`/positions/${id}`, dto),
  remove: (id: string) => api.delete<void>(`/positions/${id}`),
};
