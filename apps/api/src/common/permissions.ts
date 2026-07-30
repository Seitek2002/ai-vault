/**
 * Mirrors the `Permission` enum in `@ai-vault/types` by string value. Kept as a
 * separate local enum (rather than a runtime import from the shared package)
 * because `@ai-vault/types` ships unbuilt TS source — fine for the frontend's
 * bundler, but Node can't resolve its extensionless internal exports at runtime
 * when required directly from compiled backend code.
 */
export enum Permission {
  MANAGE_EMPLOYEES = 'MANAGE_EMPLOYEES',
  MANAGE_POSITIONS = 'MANAGE_POSITIONS',
  MANAGE_COMPANIES = 'MANAGE_COMPANIES',
  MANAGE_DOCUMENTS = 'MANAGE_DOCUMENTS',
  MANAGE_TEMPLATES = 'MANAGE_TEMPLATES',
  MANAGE_SETTINGS = 'MANAGE_SETTINGS',
  EXPORT_DOCUMENTS = 'EXPORT_DOCUMENTS',
}
