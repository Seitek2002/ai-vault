import { describe, expect, it } from 'vitest';
import { buildReceiptXml, exchangeCode, firstReceipt, receiptField } from '../esf-xml';
import { EsfXmlClient } from '../esf-xml.client';

/** Сокращённая выгрузка портала «Выгрузить выделенные в XML-файл». */
const SAMPLE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<receipts>
    <receipt>
        <amountToBePaid xsi:nil="true" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>
        <bankAccount>1240020001943137</bankAccount>
        <contractorBankAccount>1092220273490183</contractorBankAccount>
        <contractorName>ОсОО «Партнёр &amp; Ко»</contractorName>
        <contractorPin>01501201310158</contractorPin>
        <createdDate>2026-10-07</createdDate>
        <currencyCode>417</currencyCode>
        <currencyName>Сом</currencyName>
        <deliveryContractDate>2026-07-02T00:00:00+06:00</deliveryContractDate>
        <deliveryContractNumber>5</deliveryContractNumber>
        <deliveryDate>2026-10-07</deliveryDate>
        <documentStatusName>Принят</documentStatusName>
        <exchangeCode>28957f05-7687-4267-8390-f80ba27d931a</exchangeCode>
        <goods>
            <good>
                <baseCount>1.00000</baseCount>
                <goodsName>Пакет №1 «ИИ-робот» за период Сентябрь 2026</goodsName>
                <price>20000.00000</price>
                <stAmount>0.00</stAmount>
                <stCode>50</stCode>
                <vatAmount>0.00</vatAmount>
            </good>
        </goods>
        <invoiceDate>2026-10-07T00:00:00+06:00</invoiceDate>
        <invoiceDeliveryTypeCode>399</invoiceDeliveryTypeCode>
        <invoiceNumber>0002026-003-01183961</invoiceNumber>
        <isResident>true</isResident>
        <note>сентябрь 2026</note>
        <ownedCrmReceiptCode>CRM-Volt-3</ownedCrmReceiptCode>
        <paymentTypeCode>20</paymentTypeCode>
        <receiptTypeCode>20</receiptTypeCode>
        <totalCost>20000.00</totalCost>
        <type>10</type>
        <vatCode>100</vatCode>
        <vatDeliveryTypeCode>102</vatDeliveryTypeCode>
    </receipt>
</receipts>`;

const patch = {
  crmRef: 'ErkinAI.Docs-cmr0dp0110009tk1z02w0lvpl',
  note: 'Пакет на ИИ чат-бота Aivio — сентябрь 2026',
  deliveryDate: '2026-09-30',
  contractNumber: 'ДГ-0003/0326',
  contractDate: '2026-03-01',
  goods: [
    { name: 'Пакет №1 «ИИ-робот» за период сентябрь 2026', quantity: 1, price: 30000, vat: 0, salesTax: 0 },
    { name: 'Доступ к чат-центру за период сентябрь 2026', quantity: 2, price: 2500, vat: 0, salesTax: 0 },
  ],
  totalCost: 35000,
};

describe('Файл пакетной загрузки ЭСФ', () => {
  const xml = buildReceiptXml(SAMPLE, patch);
  const receipt = firstReceipt(xml);

  it('сохраняет реквизиты образца', () => {
    expect(receiptField(receipt, 'bankAccount')).toBe('1240020001943137');
    expect(receiptField(receipt, 'contractorPin')).toBe('01501201310158');
    expect(receiptField(receipt, 'currencyCode')).toBe('417');
    expect(receiptField(receipt, 'vatDeliveryTypeCode')).toBe('102');
    expect(receiptField(receipt, 'contractorName')).toBe('ОсОО «Партнёр &amp; Ко»');
  });

  it('переписывает даты, номера и примечание', () => {
    expect(receiptField(receipt, 'deliveryDate')).toBe('2026-09-30');
    expect(receiptField(receipt, 'createdDate')).toBe('2026-09-30');
    expect(receiptField(receipt, 'ownedCrmReceiptCode')).toBe('ErkinAI.Docs-cmr0dp0110009tk1z02w0lvpl');
    expect(receiptField(receipt, 'note')).toBe('Пакет на ИИ чат-бота Aivio — сентябрь 2026');
    expect(receiptField(receipt, 'deliveryContractNumber')).toBe('ДГ-0003/0326');
    expect(receiptField(receipt, 'deliveryContractDate')).toBe('2026-03-01T00:00:00+06:00');
    expect(receiptField(receipt, 'totalCost')).toBe('35000.00');
  });

  it('не тащит в черновик номер и статус выставленной ЭСФ', () => {
    for (const tag of ['invoiceNumber', 'invoiceDate', 'documentStatusName']) {
      expect(xml).not.toContain(`<${tag}>`);
    }
  });

  it('даёт свой exchangeCode: он обязателен и не должен быть кодом образца', () => {
    const code = receiptField(receipt, 'exchangeCode');
    expect(code).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(code).not.toBe('28957f05-7687-4267-8390-f80ba27d931a');
    // Повторная загрузка того же расчёта — тот же код, другой расчёт — другой.
    expect(code).toBe(exchangeCode(patch.crmRef));
    expect(exchangeCode('ErkinAI.Docs-other')).not.toBe(code);
  });

  it('заменяет услуги, сохраняя коды налогов строки', () => {
    const goods = [...receipt.matchAll(/<good>([\s\S]*?)<\/good>/g)].map((m) => m[1]!);
    expect(goods).toHaveLength(2);
    expect(receiptField(goods[0]!, 'goodsName')).toBe('Пакет №1 «ИИ-робот» за период сентябрь 2026');
    expect(receiptField(goods[0]!, 'baseCount')).toBe('1.00000');
    expect(receiptField(goods[0]!, 'price')).toBe('30000.00000');
    expect(receiptField(goods[1]!, 'baseCount')).toBe('2.00000');
    expect(receiptField(goods[1]!, 'price')).toBe('2500.00000');
    expect(receiptField(goods[1]!, 'stCode')).toBe('50');
    expect(receiptField(goods[1]!, 'vatAmount')).toBe('0.00');
  });

  it('экранирует спецсимволы в названии услуги', () => {
    const escaped = buildReceiptXml(SAMPLE, { ...patch, goods: [{ name: 'Услуга «А&Б» <тест>', quantity: 1, price: 35000, vat: 0, salesTax: 0 }] });
    expect(escaped).toContain('<goodsName>Услуга «А&amp;Б» &lt;тест&gt;</goodsName>');
  });

  it('остаётся разбираемым: один receipt, корректный пролог', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true);
    expect([...xml.matchAll(/<receipt>/g)]).toHaveLength(1);
  });

  it('добавляет поля, которых в образце не было', () => {
    const lean = SAMPLE.replace(/<note>[\s\S]*?<\/note>/, '').replace(/<deliveryContractNumber>[\s\S]*?<\/deliveryContractNumber>/, '');
    const built = firstReceipt(buildReceiptXml(lean, patch));
    expect(receiptField(built, 'note')).toBe('Пакет на ИИ чат-бота Aivio — сентябрь 2026');
    expect(receiptField(built, 'deliveryContractNumber')).toBe('ДГ-0003/0326');
  });

  it('не собирает ЭСФ без услуг', () => {
    expect(() => buildReceiptXml(SAMPLE, { ...patch, goods: [] })).toThrow();
  });
});

describe('Недостающие услуги справочника', () => {
  const client = new EsfXmlClient({} as never, {} as never) as unknown as {
    missingServices(messages: string[]): string[];
  };

  it('вытаскивает названия услуг из ответа портала', () => {
    expect(client.missingServices([
      'exchangeCode: fce2c562 - Товара/услуги с наименованием "Пакет №1 за сентябрь 2026" не существует в базе!',
      'Товара/услуги с наименованием "Доступ к чат-центру" не существует в базе!',
    ])).toEqual(['Пакет №1 за сентябрь 2026', 'Доступ к чат-центру']);
  });

  it('не выдумывает услуг на обычных сообщениях', () => {
    expect(client.missingServices(['Файл успешно загружен', 'Отсутствует обязательное поле (exchangeCode)'])).toEqual([]);
  });
});
