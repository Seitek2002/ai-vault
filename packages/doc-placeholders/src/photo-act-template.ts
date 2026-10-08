const text = (value: string, bold = false) => ({ type: 'text', text: value, ...(bold ? { marks: [{ type: 'bold' }] } : {}) });
const p = (value: string, bold = false, align = 'justify') => ({ type: 'paragraph', attrs: { textAlign: align }, content: [text(value, bold)] });
const cell = (value: string, header = false, colspan = 1) => ({ type: header ? 'tableHeader' : 'tableCell', attrs: { colspan }, content: [p(value, header, 'left')] });
const party = (label: string, prefix: 'org' | 'company') => [
  p(label, true, 'left'), p(`{{${prefix}.name}}`, false, 'left'), p(`Юридический адрес: {{${prefix}.address}}`, false, 'left'),
  p(`ИНН: {{${prefix}.inn}}`, false, 'left'), p(`ОКПО: {{${prefix}.bin}}`, false, 'left'), p('Банковские реквизиты:', false, 'left'),
  p(`р/с: {{${prefix}.bankAccount}}`, false, 'left'), p(`{{${prefix}.bankName}}`, false, 'left'), p(`БИК: {{${prefix}.bankBik}}`, false, 'left'),
  p('Руководитель ____________________', false, 'left'), p('____________________ / М.П.', false, 'left'),
];
/** Editable text and tables from the supplied scan; no copied signature or stamp. */
export const PHOTO_ACT_TEMPLATE = { type: 'doc', content: [
  p('АКТ ОКАЗАННЫХ УСЛУГ № {{doc.number}}', true, 'center'),
  p('к Договору об оказании услуг № {{contract.number}} от {{contract.date}}', false, 'center'),
  { type: 'table', attrs: { borderless: true }, content: [{ type: 'tableRow', content: [cell('г. Бишкек'), cell('{{date.todayShort}}')] }] },
  p('Мы, нижеподписавшиеся, {{company.name}}, именуемое в дальнейшем «Заказчик», в лице ____________________, действующего на основании ____________________, с одной стороны, и {{org.name}}, именуемое в дальнейшем «Исполнитель», в лице ____________________, действующего на основании ____________________, с другой стороны, совместно именуемые «Стороны», составили настоящий Акт о нижеследующем:'),
  p('1. Во исполнение условий Договора Исполнителем были надлежащим образом выполнены следующие работы и оказаны услуги:'),
  { type: 'table', content: [
    { type: 'tableRow', content: ['№', 'Наименование оказанных услуг', 'Период', 'Стоимость, {{doc.currency}}'].map(v => cell(v, true)) },
    { type: 'tableRow', content: ['1', '{{doc.service}}', '{{period.start}} - {{period.end}}', '{{doc.amount}}'].map(v => cell(v)) },
    { type: 'tableRow', content: [cell('Итого', true, 3), cell('{{doc.amount}}', true)] },
  ] },
  p('2. Услуги оказаны в полном объёме в соответствии с условиями Договора.'),
  p('3. Заказчик принял оказанные услуги, претензий по объёму, срокам, качеству и содержанию не имеет.'),
  p('4. Настоящий Акт является основанием для проведения окончательного расчёта между Сторонами.'),
  p('РЕКВИЗИТЫ И ПОДПИСИ СТОРОН', true, 'left'),
  { type: 'table', attrs: { borderless: true }, content: [{ type: 'tableRow', content: [
    { type: 'tableCell', content: party('Исполнитель:', 'org') }, { type: 'tableCell', content: party('Заказчик:', 'company') },
  ] }] },
] };
