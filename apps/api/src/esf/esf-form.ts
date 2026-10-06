import { esfLineAmounts, type EsfDraftLine } from '@ai-vault/doc-placeholders';
import { EsfPortalError } from './esf-portal.client';

export function decodeHtml(s: string): string {
  return s.replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function htmlText(s: string): string {
  return decodeHtml(s.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

export function formScope(html: string, id: string): string {
  const match = html.match(new RegExp(`<form\\b[^>]*\\bid="${id}"[^>]*>[\\s\\S]*?<\\/form>`));
  if (!match) throw new EsfPortalError(`На странице нет формы ${id}`, 'parse');
  return match[0];
}

export function formAction(html: string, id: string): string {
  const action = formScope(html, id).match(/\baction="([^"]+)"/)?.[1];
  if (!action) throw new EsfPortalError('Не найден адрес формы портала', 'parse');
  const url = new URL(decodeHtml(action), 'https://esf.salyk.kg');
  if (url.hostname !== 'esf.salyk.kg' || url.port || url.username || url.password) throw new EsfPortalError('Неизвестный адрес формы портала', 'parse');
  return url.pathname + url.search;
}

export function formFields(html: string, id = 'mainform'): Record<string, string> {
  const scope = formScope(html, id);
  const fields: Record<string, string> = {};
  for (const m of scope.matchAll(/<input\b([^>]*)>/g)) {
    const attrs = m[1]!;
    const name = attrs.match(/\bname="([^"]*)"/)?.[1];
    if (!name) continue;
    const type = attrs.match(/\btype="([^"]*)"/)?.[1] ?? 'text';
    if (['submit', 'button', 'file'].includes(type)) continue;
    if (['checkbox', 'radio'].includes(type) && !/\bchecked\b/.test(attrs)) continue;
    fields[name] = decodeHtml(attrs.match(/\bvalue="([^"]*)"/)?.[1] ?? (['checkbox', 'radio'].includes(type) ? 'on' : ''));
  }
  for (const m of scope.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)) {
    const name = m[1]!.match(/\bname="([^"]*)"/)?.[1];
    if (name) fields[name] = decodeHtml(m[2]!);
  }
  for (const m of scope.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const name = m[1]!.match(/\bname="([^"]*)"/)?.[1];
    const selected = [...m[2]!.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)];
    const option = selected.find(o => /\bselected\b/.test(o[1]!)) ?? selected[0];
    if (name && option) fields[name] = decodeHtml(option[1]!.match(/\bvalue="([^"]*)"/)?.[1] ?? htmlText(option[2]!));
  }
  return fields;
}

export interface PortalServiceLine extends EsfDraftLine {
  serviceId: string;
  unitId: string;
  keys: Partial<Record<'name' | 'quantity' | 'price' | 'vat' | 'salesTax' | 'net' | 'total', string>>;
}

/** Locate controls by table column labels, never by generated j_idt numbers. */
export function parseServiceTable(html: string, validateAmounts = true): PortalServiceLine[] {
  const head = html.match(/<thead\b[^>]*id="detailTable_head"[^>]*>([\s\S]*?)<\/thead>/)?.[1];
  const body = html.match(/<tbody\b[^>]*id="detailTable_data"[^>]*>([\s\S]*?)<\/tbody>/)?.[1];
  if (!head || !body) throw new EsfPortalError('Не найдена таблица услуг ЭСФ', 'parse');
  const headers = [...head.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(m => htmlText(m[1]!).toLowerCase());
  const col = (label: string): number => {
    const index = headers.indexOf(label);
    if (index < 0) throw new EsfPortalError(`На портале не найдена колонка «${label}»`, 'parse');
    return index;
  };
  const columns = { name: col('услуги'), unit: col('единицы измерения'), gked: col('код гкэд'), quantity: col('факт. кол-во'),
    price: col('цена'), vat: col('сумма ндс'), salesRate: col('нсп'), salesTax: col('сумма нсп'),
    net: col('стоимость без ндс и нсп'), total: col('общая стоимость') };
  const lines = [...body.matchAll(/<tr\b[^>]*data-ri="\d+"[^>]*>([\s\S]*?)<\/tr>/g)].map(row => {
    const cells = [...row[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]!);
    if (cells.length < headers.length) throw new EsfPortalError('Неполная строка услуги на портале', 'parse');
    const cell = (key: keyof typeof columns) => cells[columns[key]]!;
    const text = (key: keyof typeof columns) => {
      const s = cell(key);
      return htmlText(s.match(/class="ui-cell-editor-output"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? s);
    };
    const control = (key: keyof typeof columns) => cell(key).match(/\bname="([^"]+)_hinput"/)?.[1];
    const fields: Record<string, string> = {};
    for (const m of row[1]!.matchAll(/<input\b([^>]*)>/g)) {
      const name = m[1]!.match(/\bname="([^"]+)"/)?.[1];
      if (name) fields[name] = decodeHtml(m[1]!.match(/\bvalue="([^"]*)"/)?.[1] ?? '');
    }
    const number = (key: keyof typeof columns) => {
      const base = control(key);
      const raw = (base && (fields[`${base}_hinput`] || fields[`${base}_input`])) || text(key);
      const value = Number(raw.replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(value) || value < 0) throw new EsfPortalError(`Непонятное число в колонке «${key}»`, 'parse');
      return value;
    };
    const net = number('net'), vat = number('vat'), salesTax = number('salesTax'), total = number('total');
    const salesMatch = text('salesRate').match(/([\d.,]+)\s*%/);
    if (!salesMatch || (validateAmounts && net <= 0)) throw new EsfPortalError('Не удалось определить налоговые ставки строки ЭСФ', 'parse');
    const line: PortalServiceLine = {
      name: text('name'), quantity: number('quantity'), price: number('price'), unit: text('unit'), gked: text('gked'),
      vatRate: net > 0 ? Number((vat / net * 100).toFixed(5)) : 0, salesTaxRate: Number(salesMatch[1]!.replace(',', '.')),
      serviceId: fields[`${control('name')}_hinput`] ?? '', unitId: fields[`${control('unit')}_hinput`] ?? '',
      priceIncludesTaxes: Math.round(number('quantity') * number('price') * 100) === Math.round(total * 100) && total !== net,
      keys: Object.fromEntries(['name', 'quantity', 'price', 'vat', 'salesTax', 'net', 'total'].map(key => [key, control(key as keyof typeof columns)])),
    };
    const amounts = esfLineAmounts(line);
    if (validateAmounts && [['net', net], ['vat', vat], ['salesTax', salesTax], ['total', total]].some(([key, value]) => Math.abs(amounts[key as keyof typeof amounts] - Number(value)) > 0.011)) {
      throw new EsfPortalError('Суммы строки образца не совпадают с количеством, ценой и налогами. Проверьте ЭСФ на портале.', 'parse');
    }
    return line;
  });
  if (!lines.length || lines.length > 100) throw new EsfPortalError('В образце должно быть от 1 до 100 строк услуг', 'parse');
  return lines;
}
