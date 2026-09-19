import { Injectable } from '@nestjs/common';
import { parsePdf } from '../files/parsers/pdf.parser';
import { EsfPortalError } from './esf-portal.client';

/**
 * Официальный PDF ЭСФ (форма «Приложение 4») со страницы проверки по QR.
 * Открывается БЕЗ авторизации — нужен только documentUUID. Это единственная
 * стабильная часть портала: форма регламентирована, в отличие от вёрстки JSF.
 */

const CHECK_URL = 'https://esf.salyk.kg/esf/check-esf?documentUUID=';
const TIMEOUT_MS = 30000;

export interface EsfPdfData {
  number: string | null;
  supplierInn: string | null;
  buyerInn: string | null;
  buyerName: string | null;
  /** dd-mm-yyyy как в PDF */
  deliveryDate: string | null;
  /** «Номер учётной системы» (поле 407 «Примечание») */
  crmRef: string | null;
  total: number | null;
}

/** Разбор текста PDF. Вынесен в чистую функцию ради тестов. */
export function parseEsfPdfText(text: string): EsfPdfData {
  const t = text.replace(/\r/g, '');
  const pick = (re: RegExp): string | null => {
    const m = t.match(re);
    return m?.[1]?.trim() || null;
  };

  // Итоговая строка склеена из четырёх колонок «без НДС | НДС | НсП | всего»
  // — берём последнее число, это и есть общая стоимость.
  const totalsLine = pick(/Итого по счету-фактуре:\s*([\d.]+)/) ?? '';
  const numbers = totalsLine.match(/\d+\.\d{2}/g) ?? [];
  const lastNumber = numbers[numbers.length - 1];

  const crm = pick(/407Примечание\s*:\s*\n?([^\n]*)/);

  return {
    number: pick(/Номер:\s*(\d{7}-\d{3}-\d{8})/),
    supplierInn: pick(/Поставщик ИНН:\s*(\d{14})/),
    buyerInn: pick(/Покупатель ИНН:\s*(\d{14})/),
    buyerName:
      pick(/202Ф\.И\.О\. ИП\/Наименование организации\s*:\s*([\s\S]*?)\n302/)?.replace(/\s+/g, ' ') ??
      null,
    deliveryDate: pick(/(\d{2}-\d{2}-\d{4})\s*Дата поставки/),
    // Пустое поле в PDF схлопывается со следующим заголовком «No» — это не значение.
    crmRef: crm && crm !== 'No' ? crm : null,
    total: lastNumber ? Number(lastNumber) : null,
  };
}

@Injectable()
export class EsfPdfService {
  async download(uuid: string): Promise<Buffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(CHECK_URL + encodeURIComponent(uuid), { signal: controller.signal });
      if (response.status !== 200) {
        throw new EsfPortalError(`PDF ЭСФ ${uuid}: HTTP ${response.status}`, 'network');
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.subarray(0, 5).toString() !== '%PDF-') {
        throw new EsfPortalError(`PDF ЭСФ ${uuid}: ответ не PDF`, 'parse');
      }
      return buffer;
    } catch (error) {
      if (error instanceof EsfPortalError) throw error;
      throw new EsfPortalError(
        `PDF ЭСФ ${uuid}: ${error instanceof Error ? error.message : String(error)}`,
        'network',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async parse(buffer: Buffer): Promise<EsfPdfData> {
    return parseEsfPdfText(await parsePdf(buffer));
  }
}
