import type { UserRole } from './documents';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface CompanySettingsDto {
  id: string;
  name: string;
  inn: string;
  bin?: string;
  address: string;
  phone?: string;
  email?: string;
  bankAccount?: string;
  bankName?: string;
  bankBik?: string;
  vatRate: number;
  currency: string;
  logoUrl?: string;
}
