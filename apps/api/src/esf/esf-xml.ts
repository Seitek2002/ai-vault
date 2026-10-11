import { createHash } from 'node:crypto';

/**
 * Пакетная загрузка ЭСФ: кабинет умеет выгружать ЭСФ в XML и принимать такой
 * же файл обратно («Загрузить файл» в «Реализации»). Это официальный путь
 * интеграции учётных систем — и куда надёжнее, чем заполнять JSF-форму:
 * нет ViewState, автокомплитов и карточек справочника (услуга в XML — текст).
 *
 * Здесь только работа со строкой XML, без сети: берём выгруженную ЭСФ-образец
 * и переписываем в ней то, что меняется от месяца к месяцу.
 */

export interface EsfXmlGood {
  name: string;
  quantity: number;
  price: number;
  /** Суммы налогов строки, уже посчитанные по ставкам портала. */
  vat: number;
  salesTax: number;
}

export interface ReceiptPatch {
  /** «Номер учётной системы» — по нему Vault узнаёт свою ЭСФ после синхронизации. */
  crmRef: string;
  note: string;
  /** yyyy-mm-dd */
  deliveryDate: string;
  contractNumber?: string;
  /** yyyy-mm-dd */
  contractDate?: string;
  goods: EsfXmlGood[];
  totalCost: number;
}

/** Поля выставленной ЭСФ, которые новому черновику не принадлежат. */
const DROP_TAGS = new Set([
  'invoiceNumber', 'invoiceDate', 'documentStatusName',
  'paidAmount', 'amountToBePaid', 'closingBalances', 'openingBalances',
]);

const GOOD_OWN_TAGS = new Set(['baseCount', 'goodsName', 'price', 'vatAmount', 'stAmount']);

export class EsfXmlError extends Error {}

/**
 * `exchangeCode` — обязательный идентификатор документа у отправителя.
 * Выводим его из номера учётной системы, чтобы повторная загрузка того же
 * расчёта несла тот же код, а не плодила документы.
 */
export function exchangeCode(crmRef: string): string {
  const hex = createHash('sha256').update(`esf:${crmRef}`).digest('hex');
  const bytes = hex.slice(0, 32).split('');
  bytes[12] = '4';
  bytes[16] = ['8', '9', 'a', 'b'][parseInt(hex[16]!, 16) % 4]!;
  const uuid = bytes.join('');
  return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20, 32)}`;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Первый <receipt> выгрузки — образец, с которого копируем реквизиты. */
export function firstReceipt(xml: string): string {
  const match = xml.match(/<receipt\b[^>]*>([\s\S]*?)<\/receipt>/);
  if (!match) throw new EsfXmlError('В выгрузке портала нет ЭСФ');
  return match[1]!;
}

/** Значение простого поля; у пустых полей портала стоит xsi:nil. */
export function receiptField(receipt: string, tag: string): string | null {
  const match = receipt.match(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>|<${tag}\\b([^>]*)\\/>`));
  if (!match) return null;
  if (match[2] === undefined) return null;
  return match[2];
}

/** Элементы верхнего уровня в порядке, в котором их отдал портал. */
function elements(receipt: string): { tag: string; xml: string }[] {
  const out: { tag: string; xml: string }[] = [];
  const re = /<([A-Za-z][\w.-]*)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
  for (const match of receipt.matchAll(re)) out.push({ tag: match[1]!, xml: match[0] });
  return out;
}

export function decimal(value: number, digits: number): string {
  if (!Number.isFinite(value)) throw new EsfXmlError('Недопустимое число в ЭСФ');
  return value.toFixed(digits);
}

/** Дата договора у портала с временем и поясом: 2026-03-01T00:00:00+06:00. */
function contractDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new EsfXmlError('Дата договора указана неверно');
  return `${iso}T00:00:00+06:00`;
}

function good(source: string | null, line: EsfXmlGood): string {
  // Неизвестные нам поля строки (например единицы у других счетов) сохраняем из образца.
  const extra = source
    ? elements(source).filter((el) => !GOOD_OWN_TAGS.has(el.tag)).map((el) => el.xml)
    : [];
  return ['<good>',
    `<baseCount>${decimal(line.quantity, 5)}</baseCount>`,
    `<goodsName>${escapeXml(line.name.trim())}</goodsName>`,
    `<price>${decimal(line.price, 5)}</price>`,
    `<stAmount>${decimal(line.salesTax, 2)}</stAmount>`,
    ...extra,
    `<vatAmount>${decimal(line.vat, 2)}</vatAmount>`,
    '</good>'].join('');
}

/**
 * Собирает файл загрузки из ЭСФ-образца: реквизиты продавца, покупателя,
 * счета, валюта и коды остаются как были, меняются услуги, суммы, даты,
 * номер учётной системы и реквизиты договора.
 */
export function buildReceiptXml(sourceXml: string, patch: ReceiptPatch): string {
  if (!patch.goods.length) throw new EsfXmlError('В ЭСФ нет ни одной услуги');
  const receipt = firstReceipt(sourceXml);
  const sourceGood = receipt.match(/<good>([\s\S]*?)<\/good>/)?.[1] ?? null;

  const replacements: Record<string, string> = {
    createdDate: `<createdDate>${patch.deliveryDate}</createdDate>`,
    deliveryDate: `<deliveryDate>${patch.deliveryDate}</deliveryDate>`,
    ownedCrmReceiptCode: `<ownedCrmReceiptCode>${escapeXml(patch.crmRef)}</ownedCrmReceiptCode>`,
    note: `<note>${escapeXml(patch.note)}</note>`,
    totalCost: `<totalCost>${decimal(patch.totalCost, 2)}</totalCost>`,
    goods: `<goods>${patch.goods.map((line) => good(sourceGood, line)).join('')}</goods>`,
    exchangeCode: `<exchangeCode>${exchangeCode(patch.crmRef)}</exchangeCode>`,
    ...(patch.contractNumber ? { deliveryContractNumber: `<deliveryContractNumber>${escapeXml(patch.contractNumber)}</deliveryContractNumber>` } : {}),
    ...(patch.contractDate ? { deliveryContractDate: `<deliveryContractDate>${contractDate(patch.contractDate)}</deliveryContractDate>` } : {}),
  };

  const seen = new Set<string>();
  const body = elements(receipt)
    .filter((el) => !DROP_TAGS.has(el.tag))
    .map((el) => {
      seen.add(el.tag);
      return replacements[el.tag] ?? el.xml;
    });
  // Поля, которых в образце не было (пустой note, договор без номера).
  for (const [tag, xml] of Object.entries(replacements)) if (!seen.has(tag)) body.push(xml);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<receipts>\n<receipt>${body.join('')}</receipt>\n</receipts>\n`;
}
