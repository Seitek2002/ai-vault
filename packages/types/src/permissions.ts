export enum Permission {
  MANAGE_EMPLOYEES = 'MANAGE_EMPLOYEES',
  MANAGE_POSITIONS = 'MANAGE_POSITIONS',
  MANAGE_COMPANIES = 'MANAGE_COMPANIES',
  MANAGE_DOCUMENTS = 'MANAGE_DOCUMENTS',
  MANAGE_TEMPLATES = 'MANAGE_TEMPLATES',
  MANAGE_SETTINGS = 'MANAGE_SETTINGS',
  EXPORT_DOCUMENTS = 'EXPORT_DOCUMENTS',
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.MANAGE_EMPLOYEES]: 'Управление сотрудниками',
  [Permission.MANAGE_POSITIONS]: 'Управление должностями',
  [Permission.MANAGE_COMPANIES]: 'Управление компаниями',
  [Permission.MANAGE_DOCUMENTS]: 'Управление документами',
  [Permission.MANAGE_TEMPLATES]: 'Управление шаблонами',
  [Permission.MANAGE_SETTINGS]: 'Управление настройками организации',
  [Permission.EXPORT_DOCUMENTS]: 'Экспорт документов',
};

export interface PositionDto {
  id: string;
  name: string;
  permissions: Permission[];
  createdAt: string;
}
