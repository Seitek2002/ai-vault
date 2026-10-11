import type { EsfDraftLine } from '@ai-vault/doc-placeholders';

/**
 * Строки новой ЭСФ из правок менеджера. Строка из образца ссылается на него
 * (`source`) и берёт оттуда единицу, ГКЭД и ставки налогов. Добавленная
 * строка указывает единицу и ГКЭД сама, ставки — как у первой строки
 * образца: режим налогов у ЭСФ один на весь документ.
 */

export interface DraftLineInput {
  name: string;
  quantity: number;
  price: number;
  /** Номер строки ЭСФ-образца; нет — строку добавил менеджер. */
  source?: number;
  unit?: string;
  gked?: string;
}

export class DraftLinesError extends Error {}

const MAX_LINES = 50;
const GKED_RE = /^\d{2}\.\d{2}(\.\d{1,2})?$/;

/** Клиент до появления добавления строк слал только название, количество и цену. */
function legacy(inputs: readonly DraftLineInput[]): boolean {
  return inputs.every((line) => line.source === undefined && line.unit === undefined && line.gked === undefined);
}

export function mergeDraftLines(template: readonly EsfDraftLine[], inputs: readonly DraftLineInput[]): EsfDraftLine[] {
  if (!template.length) throw new DraftLinesError('В ЭСФ-образце нет строк услуг');
  if (!inputs.length) throw new DraftLinesError('Добавьте хотя бы одну услугу.');
  if (inputs.length > MAX_LINES) throw new DraftLinesError(`В одной ЭСФ не больше ${MAX_LINES} услуг.`);
  const byIndex = legacy(inputs);
  if (byIndex && inputs.length !== template.length) throw new DraftLinesError('Проверьте все строки услуг ЭСФ-образца.');

  return inputs.map((input, index) => {
    const row = index + 1;
    const source = byIndex ? index : input.source;
    const base = source === undefined ? undefined : template[source];
    if (source !== undefined && !base) throw new DraftLinesError(`Строка ${row} ссылается на строку, которой нет в образце. Загрузите строки заново.`);

    const unit = (base?.unit ?? input.unit ?? '').trim();
    const gked = (base?.gked ?? input.gked ?? '').trim();
    if (!unit || unit.length > 50) throw new DraftLinesError(`Укажите единицу измерения в строке ${row}.`);
    if (!GKED_RE.test(gked)) throw new DraftLinesError(`Укажите код ГКЭД в строке ${row}, например 62.02.0.`);

    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 150) throw new DraftLinesError(`Укажите название услуги в строке ${row} (до 150 символов).`);
    const exact = (n: number) => Math.abs(n - Number(n.toFixed(5))) <= 1e-9;
    if (!Number.isFinite(input.quantity) || input.quantity <= 0 || input.quantity > 1e9 || !exact(input.quantity) ||
      !Number.isFinite(input.price) || input.price <= 0 || input.price > 1e9 || !exact(input.price)) {
      throw new DraftLinesError(`Проверьте количество и цену в строке ${row}: положительные, до 5 знаков после запятой.`);
    }
    return { ...(base ?? template[0]!), unit, gked, name, quantity: input.quantity, price: input.price };
  });
}

/** Строки один в один повторяют образец — тогда годится и старый путь «Создать копию». */
export function linesFollowTemplate(inputs: readonly DraftLineInput[], templateLength?: number): boolean {
  const sameRows = inputs.every((line, index) => (line.source ?? index) === index && line.unit === undefined && line.gked === undefined);
  return sameRows && (templateLength === undefined || inputs.length === templateLength);
}
