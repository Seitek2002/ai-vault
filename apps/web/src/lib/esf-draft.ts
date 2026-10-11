import { esfLinesTotal, esfPeriodLabel, esfServiceForPeriod, type EsfDraftLine, type EsfPeriod } from '@ai-vault/doc-placeholders';

export interface EditableEsfLine {
  name: string;
  quantity: string;
  price: string;
  /** Номер строки ЭСФ-образца; нет — строку добавил менеджер. */
  source?: number;
  /** Единица и ГКЭД — только у добавленных строк, у остальных они из образца. */
  unit?: string;
  gked?: string;
}

const GKED_RE = /^\d{2}\.\d{2}(\.\d{1,2})?$/;

/** Старый вид правок: без ссылок на образец — строки идут по порядку. */
function byIndex(edited: readonly EditableEsfLine[]): boolean {
  return edited.every((row) => row.source === undefined && row.unit === undefined && row.gked === undefined);
}

/** Строка образца, на которую опирается правка; у добавленной — первая строка с её единицей и ГКЭД. */
export function esfLineBase(template: readonly EsfDraftLine[], row: EditableEsfLine, index?: number, all?: readonly EditableEsfLine[]): EsfDraftLine | null {
  if (!template.length) return null;
  const source = all && index !== undefined && byIndex(all) ? index : row.source;
  if (source !== undefined) return template[source] ?? null;
  return { ...template[0]!, unit: (row.unit ?? '').trim(), gked: (row.gked ?? '').trim() };
}

/** Новая строка: единица и ГКЭД как у первой услуги, их можно поменять. */
export function newEsfLine(template: readonly EsfDraftLine[]): EditableEsfLine {
  return { name: '', quantity: '1', price: '', unit: template[0]?.unit ?? '', gked: template[0]?.gked ?? '' };
}

export function reviewEsfLines(template: readonly EsfDraftLine[], edited: readonly EditableEsfLine[], expected: number) {
  if (!template.length) return { error: 'Загрузите строки услуг заново.', lines: [], total: null };
  if (!edited.length) return { error: 'Добавьте хотя бы одну услугу.', lines: [], total: null };
  if (byIndex(edited) && template.length !== edited.length) return { error: 'Загрузите строки услуг заново.', lines: [], total: null };
  const lines: EsfDraftLine[] = [];
  for (let i = 0; i < edited.length; i++) {
    const input = edited[i]!;
    const base = esfLineBase(template, input, i, edited);
    if (!base) return { error: 'Загрузите строки услуг заново.', lines: [], total: null };
    const number = (s: string) => /^\d+(?:[.,]\d{1,5})?$/.test(s.trim().replace(/\s/g, '')) ? Number(s.replace(/\s/g, '').replace(',', '.')) : NaN;
    const quantity = number(input.quantity), price = number(input.price);
    if (!input.name.trim() || input.name.trim().length > 150) return { error: `Укажите название услуги ${i + 1} (до 150 символов).`, lines: [], total: null };
    if (!base.unit) return { error: `Укажите единицу измерения услуги ${i + 1}.`, lines: [], total: null };
    if (!GKED_RE.test(base.gked)) return { error: `Укажите код ГКЭД услуги ${i + 1}, например 62.02.0.`, lines: [], total: null };
    if (!Number.isFinite(quantity) || !Number.isFinite(price) || quantity <= 0 || price <= 0 || quantity > 1e9 || price > 1e9) {
      return { error: `В строке ${i + 1} укажите положительные количество и цену, до 5 знаков после запятой.`, lines: [], total: null };
    }
    lines.push({ ...base, name: input.name.trim(), quantity, price });
  }
  try {
    const total = esfLinesTotal(lines);
    return { lines, total, error: Math.round(total * 100) === Math.round(expected * 100) ? '' : 'Сумма строк отличается от суммы расчёта. Исправьте количество или цены.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Проверьте суммы строк.', lines: [], total: null };
  }
}

export const periodValue = (period: EsfPeriod): string => `${period.year}-${String(period.month).padStart(2, '0')}`;

export function parsePeriodValue(value: string): EsfPeriod {
  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) };
}

/** Период в названии услуги меняется вместе с выбором менеджера, правки имени сохраняются. */
export function applyEsfPeriod(rows: readonly EditableEsfLine[], period: EsfPeriod): EditableEsfLine[] {
  return rows.map((row) => ({ ...row, name: esfServiceForPeriod(row.name, period.year, period.month) }));
}

/** Расчётный месяц и год до него — дальше выбирать незачем. */
export function esfPeriodOptions(latest: EsfPeriod, count = 13): { value: string; label: string }[] {
  const index = latest.year * 12 + latest.month - 1;
  return Array.from({ length: count }, (_, step) => {
    const at = index - step;
    const period = { year: Math.floor(at / 12), month: (at % 12) + 1 };
    return { value: periodValue(period), label: esfPeriodLabel(period) };
  });
}
