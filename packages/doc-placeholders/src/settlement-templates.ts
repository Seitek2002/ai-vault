// Standard settlement forms use the same ProseMirror editor and exporters as custom templates.
const text = (value: string) => ({ type: 'text', text: value });
const paragraph = (value: string) => ({ type: 'paragraph', content: [text(value)] });
const heading = (value: string) => ({ type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [text(value)] });
const cell = (value: string, header = false) => ({ type: header ? 'tableHeader' : 'tableCell', content: [paragraph(value)] });
const party = (label: string, prefix: 'org' | 'company') => [
  paragraph(label + ': {{' + prefix + '.name}}'),
  paragraph('ИНН: {{' + prefix + '.inn}} · ОКПО: {{' + prefix + '.bin}}'),
  paragraph('Адрес: {{' + prefix + '.address}}'),
  paragraph('Банк: {{' + prefix + '.bankName}}'),
  paragraph('Расчётный счёт: {{' + prefix + '.bankAccount}} · БИК: {{' + prefix + '.bankBik}}'),
];
const services = () => ({ type: 'table', content: [
  { type: 'tableRow', content: ['№', 'Наименование услуги', 'Кол-во', 'Ед.', 'Цена', 'Сумма'].map(v => cell(v, true)) },
  { type: 'tableRow', content: ['1', '{{doc.service}}', '1', 'усл.', '{{doc.amount}}', '{{doc.amount}}'].map(v => cell(v)) },
] });
const totals = () => [
  paragraph('Итого: {{doc.amount}} {{doc.currency}}'),
  paragraph('В том числе НДС: {{doc.vatAmount}} {{doc.currency}}'),
];
const requisites = () => ({ type: 'table', attrs: { borderless: true }, content: [
  { type: 'tableRow', content: [
    { type: 'tableCell', content: [...party('Исполнитель', 'org'), paragraph('Подпись: ____________________'), paragraph('М.П.')] },
    { type: 'tableCell', content: [...party('Заказчик', 'company'), paragraph('Подпись: ____________________'), paragraph('М.П.')] },
  ] },
] });

export const SETTLEMENT_DOCUMENT_TEMPLATES = {
  AVR: { type: 'doc', content: [
    heading('АКТ ОКАЗАННЫХ УСЛУГ № {{doc.number}}'),
    paragraph('Дата акта: {{date.today}}'),
    paragraph('Договор № {{contract.number}} от {{contract.date}}'),
    paragraph('Исполнитель: {{org.name}}. Заказчик: {{company.name}}.'),
    paragraph('Период оказания услуг: {{period.start}} - {{period.end}}'),
    paragraph('Исполнитель оказал, а Заказчик принял следующие услуги:'),
    services(), ...totals(),
    paragraph('Услуги оказаны в полном объёме. Претензий по объёму и качеству оказанных услуг стороны не имеют.'),
    paragraph('Реквизиты и подписи сторон'), requisites(),
  ] },
  INVOICE_PAYMENT: { type: 'doc', content: [
    heading('СЧЁТ НА ОПЛАТУ № {{doc.number}}'),
    paragraph('Дата счёта: {{date.today}}'),
    ...party('Поставщик (Исполнитель)', 'org'),
    ...party('Покупатель (Заказчик)', 'company'),
    paragraph('Основание: договор № {{contract.number}} от {{contract.date}}'),
    paragraph('Услуги за период {{period.start}} - {{period.end}}'),
    services(), ...totals(),
    paragraph('Всего к оплате: {{doc.amount}} {{doc.currency}}'),
    paragraph('Оплату перечислить на расчётный счёт Исполнителя, указанный выше.'),
    paragraph('Руководитель: ____________________    Подпись: ____________________'),
    paragraph('М.П.'),
  ] },
} as const;
