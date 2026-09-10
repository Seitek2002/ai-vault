/**
 * Подстановка именованных плейсхолдеров ({{org.inn}}, {{company.name}}, ...).
 *
 * Логика переехала в `@ai-vault/doc-placeholders`, потому что она нужна не
 * только браузеру: расчёт за месяц генерирует акт и счёт на сервере, и
 * документ должен получаться тем же самым кодом — иначе автоматический и
 * ручной документы разойдутся. Публичный интерфейс не изменился.
 */
export {
  PLACEHOLDER_MENU,
  substitutePlaceholders,
  extractManualVariables,
  substituteVariables,
  usesCompanyPlaceholders,
  usesOrgPlaceholders,
  type PlaceholderContext,
} from "@ai-vault/doc-placeholders";
