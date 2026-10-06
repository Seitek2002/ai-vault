import { esfLineAmounts, type EsfDraftLine } from '@ai-vault/doc-placeholders';

export const SOURCE_UUID = '6903fd2e-d41b-4a41-a0a2-fffc4142fd72';
export const DRAFT_UUID = 'ad1fe473-8309-460b-8d33-9710a9369e63';
export const SERVICE_LINES: EsfDraftLine[] = [
  { name: 'ИИ-робот — август 2026', unit: 'Штука', gked: '62.02.0', quantity: 1, price: 30000, vatRate: 0, salesTaxRate: 0, priceIncludesTaxes: false },
  { name: 'Чат-центр — август 2026', unit: 'Штука', gked: '62.02.0', quantity: 1, price: 5000, vatRate: 0, salesTaxRate: 0, priceIncludesTaxes: false },
];
const labels = ['Номер', 'Услуги', 'Единицы измерения', 'Код ГКЭД', 'Факт. кол-во', 'Цена', 'Сумма НДС', 'НСП', 'Сумма НСП', 'Номер ГТД', 'Стоимость  без НДС и НсП', 'Общая стоимость', 'Действия'];
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function serviceTable(lines = SERVICE_LINES, editable = true, shift = 0) {
  const rows = lines.map((line, i) => {
    const a = esfLineAmounts(line);
    const key = (n: number) => `detailTable:${i}:j_idt${n + shift}`;
    const number = (n: number, value: number, decimals: number) => editable
      ? `<div class="ui-cell-editor-output">${value.toFixed(decimals)}</div><span><input name="${key(n)}_input" value="${value.toFixed(decimals)}"><input type="hidden" name="${key(n)}_hinput" value=""></span>` : value.toFixed(decimals);
    const choice = (n: number, text: string, id: string) => editable
      ? `<div class="ui-cell-editor-output">${escape(text)}</div><input name="${key(n)}_input" value="${escape(text)}"><input name="${key(n)}_hinput" type="hidden" value="${id}">` : escape(text);
    const cells = [String(i + 1), choice(221, line.name, `service-${i}`), choice(233, line.unit, 'unit-id'), line.gked,
      number(244, line.quantity, 5), number(248, line.price, 5), number(252, a.vat, 2), choice(257, `${line.salesTaxRate}%`, 'sales-tax-id'),
      number(265, a.salesTax, 2), '', number(274, a.net, 2), number(278, a.total, 2), ''];
    return `<tr data-ri="${i}">${cells.map(c => `<td role="gridcell">${c}</td>`).join('')}</tr>`;
  });
  return `<div id="detailTable"><div class="ui-datatable-tablewrapper"><table><thead id="detailTable_head"><tr>${labels.map(l => `<th>${l}</th>`).join('')}</tr></thead><tbody id="detailTable_data">${rows.join('')}</tbody></table></div></div>`;
}

export function editForm(lines = SERVICE_LINES, shift = 0) {
  return `<form id="mainform" action="/esf/view/document/realization_form.xhtml?cid=7"><input name="mainform" value="mainform">
  <input name="ownedCrmReceiptCode" value="CRM-old"><input name="deliveryDate_input" value="01-08-2026"><input name="note" value="Old note">
  <input name="contractor_hinput" value="buyer-original"><input name="bankAccountSeller_hinput" value="seller-original"><input name="bankAccountBuyer_hinput" value="bank-original">
  ${serviceTable(lines, true, shift)}<input type="submit" name="j_idt316" value="Сохранить"><input name="javax.faces.ViewState" value="state-1"></form>`;
}

export function listPage(copied = false) {
  const row = (uuid: string, status: string, actions: string[]) => `<tr data-rk="${uuid}">${['', uuid, '01.09.2026', '01.09.2026', '01.09.2026', '', 'Services', status, 'Test company', '', '35 000,00', ''].map(c => `<td>${c}</td>`).join('')}<td>${actions.map(action => `<input type="submit" name="action-${uuid}-${action}" value="${action}">`).join('')}</td></tr>`;
  return `<form id="form" action="/esf/view/document/realization_list.xhtml?cid=7"><input name="javax.faces.ViewState" value="list-state">${row(SOURCE_UUID, 'Принят', ['Просмотр', 'Создать копию'])}${copied ? row(DRAFT_UUID, 'Новый', ['Редактировать']) : ''}</form>`;
}
