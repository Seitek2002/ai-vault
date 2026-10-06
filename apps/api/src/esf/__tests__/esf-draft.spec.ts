import { describe, expect, it } from 'vitest';
import { EsfDraftClient } from '../esf-draft.client';
import { EsfPortalClient } from '../esf-portal.client';

// Доступ к приватным разборщикам — они и есть то, что ломается при обновлении портала.
const client = new EsfDraftClient(new EsfPortalClient()) as unknown as {
  parseForm(html: string): Record<string, string>;
  findButton(html: string, label: string): string | null;
  parseRows(html: string): Array<{ uuid: string; status: string; actions: Record<string, string> }>;
  portalMoney(n: number): string;
  messages(html: string): string[];
};

const FORM = `
<form id="mainform" name="mainform" method="post">
<input type="hidden" name="mainform" value="mainform">
<input id="ownedCrmReceiptCode" name="ownedCrmReceiptCode" type="text" value="CRM-20-e6b4c937">
<input id="receiptType_hinput" name="receiptType_hinput" type="hidden" value="fab1483d">
<input id="isResident_input" name="isResident_input" type="checkbox" checked="checked">
<input id="isIndustryDocument_input" name="isIndustryDocument_input" type="checkbox">
<input id="deliveryDate_input" name="deliveryDate_input" type="text" value="20-09-2026">
<input id="note" name="note" type="text" value="">
<input name="detailTable:0:j_idt233_input" type="text" value="30 000,00000">
<input name="detailTable:0:j_idt233_hinput" type="hidden" value="30000">
<input name="detailTable:0:j_idt259_hinput" type="hidden" value="30000">
<input name="detailTable:0:j_idt263_hinput" type="hidden" value="30000">
<input type="submit" name="detailTable:0:j_idt266" value="Удалить">
<input type="submit" name="j_idt300" value="Сохранить">
<input type="submit" name="j_idt301" value="Отмена">
<input type="hidden" name="javax.faces.ViewState" value="-1:-2">
</form>`;

describe('EsfDraftClient — разбор формы', () => {
  it('собирает поля как браузер: text/hidden, отмеченные чекбоксы, без кнопок', () => {
    const f = client.parseForm(FORM);
    expect(f['ownedCrmReceiptCode']).toBe('CRM-20-e6b4c937');
    expect(f['isResident_input']).toBe('on');
    expect(f).not.toHaveProperty('isIndustryDocument_input');
    expect(f).not.toHaveProperty('j_idt300');
    expect(f['javax.faces.ViewState']).toBe('-1:-2');
    expect(f['detailTable:0:j_idt233_hinput']).toBe('30000');
  });

  it('находит кнопку по подписи при любом порядке атрибутов', () => {
    expect(client.findButton(FORM, 'Сохранить')).toBe('j_idt300');
    expect(client.findButton('<input name="x1" type="submit" value="Сохранить">', 'Сохранить')).toBe('x1');
    expect(client.findButton(FORM, 'Подписать')).toBeNull();
  });

  it('форматирует сумму как портал', () => {
    expect(client.portalMoney(30000)).toBe('30 000,00');
    expect(client.portalMoney(1093750.5)).toBe('1 093 750,50');
    expect(client.portalMoney(999)).toBe('999,00');
  });

  it('вытаскивает ошибки портала', () => {
    const html = '<span class="ui-messages-error-summary">Дата поставки</span><span class="ui-messages-error-detail">не может быть в будущем</span>';
    expect(client.messages(html)).toEqual(['Дата поставки', 'не может быть в будущем']);
  });
});

describe('EsfDraftClient — строки списка с действиями', () => {
  const cells = (arr: string[]) => arr.map((c) => `<td>${c}</td>`).join('');
  const row = (uuid: string, status: string, actions: string) =>
    `<tr data-rk="${uuid}">${cells(['', uuid, '20.09.2026', '20.09.2026', '', 'CRM-1', 'Покупка услуг', status, 'ОсОО «А»', '', '30 000,00', ''])}<td>${actions}</td></tr>`;

  it('даёт имена кнопок по подписи', () => {
    const html =
      row('ad1fe473-8309-460b-8d33-9710a9369e63', 'Новый',
        '<input type="submit" name="form:table:0:j_idt162" value="Редактировать" title="Редактировать"><input type="submit" name="form:table:0:j_idt165" value="Удалить">') +
      row('6903fd2e-d41b-4a41-a0a2-fffc4142fd72', 'Отправлен',
        '<input type="submit" name="form:table:1:j_idt161" value="Просмотр"><input type="submit" name="form:table:1:j_idt163" value="Создать копию" title="Создать копию">');
    const rows = client.parseRows(html);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.actions['Редактировать']).toBe('form:table:0:j_idt162');
    expect(rows[1]!.actions['Создать копию']).toBe('form:table:1:j_idt163');
    expect(rows[1]!.actions).not.toHaveProperty('Редактировать');
  });
});
