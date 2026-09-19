import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseEsfPdfText } from '../esf-pdf';
import { EsfPortalClient } from '../esf-portal.client';
import { isSecretBoxConfigured, open, seal } from '../../common/secret-box';

// Фрагмент реального текста PDF ЭСФ (форма «Приложение 4») после pdf-parse.
const PDF_TEXT = `BLANK STI - 008CЧЕТ-ФАКТУРАПриложение 4
Кыргызская Республикав виде электронного документа на работы и/или услугиНОМЕР ТЕКУЩЕГО ЛИСТА: 1
101CТАТУС:102Номер:0002026-003-01100148103Дата оформления
Раздел 1. «Реквизиты поставщика и покупателя»
 Поставщик ИНН: 01703202510204201Покупатель ИНН: 00412199810063301
 Ф.И.О. ИП/Наименование организации: Общество с ограниченной
ответственностью "Адам.Тех"
202Ф.И.О. ИП/Наименование организации : Общество с ограниченной
ответственностью "Строительная компания "Авангард стиль"
302
17-09-2026 Дата поставки :
407Примечание :
CRM-20-e6b4c937
Итого по счету-фактуре:30000.000.000.0030000.00
`;

describe('parseEsfPdfText', () => {
  it('вытаскивает номер, ИНН обеих сторон, наименование, дату, сумму и учётный номер', () => {
    const p = parseEsfPdfText(PDF_TEXT);
    expect(p.number).toBe('0002026-003-01100148');
    expect(p.supplierInn).toBe('01703202510204');
    expect(p.buyerInn).toBe('00412199810063');
    expect(p.buyerName).toBe('Общество с ограниченной ответственностью "Строительная компания "Авангард стиль"');
    expect(p.deliveryDate).toBe('17-09-2026');
    expect(p.crmRef).toBe('CRM-20-e6b4c937');
    expect(p.total).toBe(30000);
  });

  it('склеенная итоговая строка: общая стоимость — последнее число', () => {
    const p = parseEsfPdfText('Итого по счету-фактуре:918750.000.000.00918750.00');
    expect(p.total).toBe(918750);
  });

  it('пустое примечание, схлопнувшееся с заголовком «No», — это не значение', () => {
    const p = parseEsfPdfText('407Примечание :\nNo\nп/п');
    expect(p.crmRef).toBeNull();
  });

  it('отсутствующие поля — null, а не исключение', () => {
    const p = parseEsfPdfText('пусто');
    expect(p).toEqual({
      number: null, supplierInn: null, buyerInn: null, buyerName: null,
      deliveryDate: null, crmRef: null, total: null,
    });
  });
});

// Строка таблицы «Реализация → ЭСФ» — как приходит в partial-response портала.
const ROW_XML = `<?xml version='1.0' encoding='UTF-8'?>
<partial-response><changes><update id="form:table"><![CDATA[<tr data-ri="0" data-rk="136721054" class="ui-widget-content"><td role="gridcell" class="ui-selection-column"><div class="ui-chkbox"><input type="checkbox"></div></td><td role="gridcell">6903fd2e-d41b-4a41-a0a2-fffc4142fd72</td><td role="gridcell">18.09.2026</td><td role="gridcell">17.09.2026</td><td role="gridcell">18.09.2026</td><td role="gridcell">CRM-20-e6b4c937</td><td role="gridcell">Покупка услуг</td><td role="gridcell">Отправлен</td><td role="gridcell">Общество с ограниченной ответственностью &quot;Строительная компания &quot;Авангард стиль&quot;</td><td role="gridcell">0002026-003-01100148</td><td role="gridcell">30&nbsp;000,00</td><td role="gridcell"></td><td role="gridcell"><input type="submit" value="Печать"></td></tr><tr data-ri="1" data-rk="1"><td></td><td>не-uuid</td></tr>]]></update></changes></partial-response>`;

describe('EsfPortalClient.parseRows', () => {
  const client = new EsfPortalClient();
  // Метод приватный по замыслу — тестируем через приведение, чтобы не расширять публичный API ради теста.
  const parseRows = (xml: string) => (client as unknown as { parseRows: (x: string) => unknown[] }).parseRows(xml);

  it('разбирает строку в поля по порядку колонок портала', () => {
    const rows = parseRows(ROW_XML) as Array<Record<string, string>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      uuid: '6903fd2e-d41b-4a41-a0a2-fffc4142fd72',
      createdOn: '18.09.2026',
      deliveryDate: '17.09.2026',
      issuedOn: '18.09.2026',
      crmRef: 'CRM-20-e6b4c937',
      status: 'Отправлен',
      counterpartyName: 'Общество с ограниченной ответственностью "Строительная компания "Авангард стиль"',
      number: '0002026-003-01100148',
      amount: '30 000,00',
      note: '',
    });
  });

  it('строка без UUID во второй колонке пропускается', () => {
    const rows = parseRows(ROW_XML);
    expect(rows.every((r) => /^[0-9a-f-]{36}$/.test((r as { uuid: string }).uuid))).toBe(true);
  });
});

describe('secret-box', () => {
  const saved = process.env['ESF_SECRET_KEY'];
  beforeEach(() => { process.env['ESF_SECRET_KEY'] = 'a'.repeat(64); });
  afterEach(() => {
    if (saved === undefined) delete process.env['ESF_SECRET_KEY'];
    else process.env['ESF_SECRET_KEY'] = saved;
  });

  it('шифрует и расшифровывает', () => {
    const sealed = seal('пароль-от-кабинета');
    expect(sealed.startsWith('v1:')).toBe(true);
    expect(sealed).not.toContain('пароль');
    expect(open(sealed)).toBe('пароль-от-кабинета');
  });

  it('одинаковый пароль каждый раз даёт разный шифртекст (случайный IV)', () => {
    expect(seal('x')).not.toBe(seal('x'));
  });

  it('подделанный шифртекст не расшифровывается', () => {
    const sealed = seal('secret');
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('AA') ? 'BB' : 'AA');
    expect(() => open(tampered)).toThrow();
  });

  it('без ключа сохранять нельзя', () => {
    delete process.env['ESF_SECRET_KEY'];
    expect(isSecretBoxConfigured()).toBe(false);
    expect(() => seal('x')).toThrow(/ESF_SECRET_KEY/);
  });

  it('ключ неверной длины отклоняется', () => {
    process.env['ESF_SECRET_KEY'] = 'короткий';
    expect(() => seal('x')).toThrow(/64 hex/);
  });
});
