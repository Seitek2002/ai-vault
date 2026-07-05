import { ruDate, todayISO } from "./docBody";
import type { CounterpartySettings, ProviderSettings } from "./docBody";

/**
 * Именованные плейсхолдеры для шаблонов документов.
 *
 * Пространства имён:
 *   {{company.*}} — реквизиты контрагента (Заказчик/Покупатель)
 *   {{org.*}}     — реквизиты нашей организации (Поставщик/Исполнитель)
 *   {{date.today}} — текущая дата в русском формате («5 июля 2026 г.»)
 *   {{doc.number}} — номер документа
 * Любые другие {{...}} — ручные переменные, заполняются на шаге «Переменные».
 */

const FALLBACK = "_______________";

const COMPANY_KEYS = [
  "name", "inn", "bin", "address", "bankAccount", "bankName", "bankBik", "phone", "email",
] as const;

const ORG_KEYS = [
  "name", "inn", "bin", "address", "bankAccount", "bankName", "bankBik",
] as const;

/** Поля для меню «Вставить поле» в тулбаре редактора */
export const PLACEHOLDER_MENU: Array<{ group: string; items: Array<{ label: string; key: string }> }> = [
  {
    group: "Компания (контрагент)",
    items: [
      { label: "Название", key: "company.name" },
      { label: "ИНН", key: "company.inn" },
      { label: "ОКПО", key: "company.bin" },
      { label: "Юридический адрес", key: "company.address" },
      { label: "Расчётный счёт", key: "company.bankAccount" },
      { label: "Банк", key: "company.bankName" },
      { label: "БИК", key: "company.bankBik" },
      { label: "Телефон", key: "company.phone" },
      { label: "Email", key: "company.email" },
    ],
  },
  {
    group: "Моя организация",
    items: [
      { label: "Название", key: "org.name" },
      { label: "ИНН", key: "org.inn" },
      { label: "ОКПО", key: "org.bin" },
      { label: "Юридический адрес", key: "org.address" },
      { label: "Расчётный счёт", key: "org.bankAccount" },
      { label: "Банк", key: "org.bankName" },
      { label: "БИК", key: "org.bankBik" },
    ],
  },
  {
    group: "Документ",
    items: [
      { label: "Сегодняшняя дата", key: "date.today" },
      { label: "Номер документа", key: "doc.number" },
    ],
  },
];

export interface PlaceholderContext {
  company?: CounterpartySettings | null;
  org?: ProviderSettings | null;
  /** ISO-дата (YYYY-MM-DD); по умолчанию — сегодня */
  dateIso?: string;
  /** Номер документа; по умолчанию — «___» */
  number?: string;
}

/** Экранирует значение для безопасной вставки внутрь JSON-строки */
function jsonEscape(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

function ruDateFromISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return ruDate(new Date(y!, m! - 1, d!));
}

/**
 * Подставляет известные (системные) плейсхолдеры в bodyJson.
 * Незаполненные поля заменяются прочерками. Неизвестные {{...}} не трогает.
 */
export function substitutePlaceholders(bodyJson: unknown, ctx: PlaceholderContext): unknown {
  let text = JSON.stringify(bodyJson);

  const map: Record<string, string> = {};
  const company = ctx.company as Record<string, unknown> | null | undefined;
  for (const key of COMPANY_KEYS) {
    map[`company.${key}`] = String(company?.[key] ?? "");
  }
  const org = ctx.org as Record<string, unknown> | null | undefined;
  for (const key of ORG_KEYS) {
    map[`org.${key}`] = String(org?.[key] ?? "");
  }
  map["date.today"] = ruDateFromISO(ctx.dateIso ?? todayISO());
  map["doc.number"] = ctx.number?.trim() || "___";

  for (const [key, raw] of Object.entries(map)) {
    const value = raw.trim() ? raw : FALLBACK;
    text = text.split(`{{${key}}}`).join(jsonEscape(value));
  }

  return JSON.parse(text) as unknown;
}

const SYSTEM_PREFIXES = ["company.", "org.", "date.", "doc."];

/** Ручные переменные шаблона — все {{...}}, кроме системных пространств имён */
export function extractManualVariables(bodyJson: unknown): string[] {
  const text = JSON.stringify(bodyJson);
  const matches = text.match(/\{\{([^}]+)\}\}/g) ?? [];
  const keys = matches.map((m) => m.slice(2, -2).trim());
  return [...new Set(keys.filter((k) => !SYSTEM_PREFIXES.some((p) => k.startsWith(p))))];
}

/** Подставляет ручные переменные (значения вводит пользователь) */
export function substituteVariables(bodyJson: unknown, values: Record<string, string>): unknown {
  let text = JSON.stringify(bodyJson);
  for (const [key, value] of Object.entries(values)) {
    text = text.split(`{{${key}}}`).join(jsonEscape(value));
  }
  return JSON.parse(text) as unknown;
}

/** Использует ли шаблон плейсхолдеры компании — тогда старая эвристика не нужна */
export function usesCompanyPlaceholders(bodyJson: unknown): boolean {
  return JSON.stringify(bodyJson).includes("{{company.");
}

/** Использует ли шаблон плейсхолдеры организации */
export function usesOrgPlaceholders(bodyJson: unknown): boolean {
  return JSON.stringify(bodyJson).includes("{{org.");
}
