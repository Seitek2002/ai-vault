import { Permission } from '@ai-vault/types';
import type { UserProfile } from './api/settings';

export function hasPermission(me: UserProfile | undefined, permission: Permission): boolean {
  if (!me) return false;
  if (me.role === 'ADMIN') return true;
  return me.position?.permissions.includes(permission) ?? false;
}
