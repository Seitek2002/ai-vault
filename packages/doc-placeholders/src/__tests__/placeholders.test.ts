import { describe, expect, it } from 'vitest';
import {
  extractManualVariables,
  substitutePlaceholders,
  substituteVariables,
  usesCompanyPlaceholders,
  usesOrgPlaceholders,
} from '../placeholders';
import { formatAmount, ruDate, shortNumericDate, shortPeriodDate } from '../format';

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

const CTX = {
  org: {
    name: 'Адам.Тех',
    inn: '01703202510204',
    bin: '33748819',
    address: 'г. Бишкек, ул. Гоголя, 179-62',
    bankAccount: '1240020001943137',
    bankName: 'ОАО «Бакай Банк»',
    bankBik: '124012',
  },
  company: { name: 'Ромашка', inn: '12345678901234', address: 'г. Ош' },
  dateIso: '2026-09-30',
  number: 'АВР-2026-001',
  amount: 30000,
  periodStart: '1.09.26 г.',
  periodEnd: '30.09.26 г.',
};

function texts(node: unknown, out: string[] = []): string[] {
  if (typeof node !== 'object' || node === null) return out;
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === 'string') out.push(n.text);
  (n.content ?? []).forEach((child) => texts(child, out));
  return out;
}

describe('substitutePlaceholders', () => {
  it('подставляет реквизиты обеих сторон', () => {
    const doc = {
      type: 'doc',
      content: [para('{{org.name}} / {{org.inn}}'), para('{{company.name}} / {{company.inn}}')],
    };
    expect(texts(substitutePlaceholders(doc, CTX))).toEqual([
      'Адам.Тех / 01703202510204',
      'Ромашка / 12345678901234',
    ]);
  });

  it('подставляет номер, дату, сумму и период', () => {
    const doc = {
      type: 'doc',
      content: [
        para('№ {{doc.number}} от {{date.today}} ({{date.todayShort}})'),
        para('с {{period.start}} по {{period.end}} на {{doc.amount}}'),
      ],
    };
    expect(texts(substitutePlaceholders(doc, CTX))).toEqual([
      '№ АВР-2026-001 от 30 сентября 2026 г. (30.09.2026)',
      'с 1.09.26 г. по 30.09.26 г. на 30 000,00',
    ]);
  });

  it('на месте пустого реквизита ставит прочерк, а не пустоту', () => {
    const doc = { type: 'doc', content: [para('БИК: {{company.bankBik}}')] };
    expect(texts(substitutePlaceholders(doc, CTX))[0]).toBe('БИК: _______________');
  });

  it('без суммы подставляет заглушку', () => {
    const doc = { type: 'doc', content: [para('{{doc.amount}}')] };
    expect(texts(substitutePlaceholders(doc, { ...CTX, amount: 0 }))[0]).toBe('__ 000,00');
  });

  it('не трогает ручные переменные шаблона', () => {
    const doc = { type: 'doc', content: [para('{{org.name}} и {{номер_пакета}}')] };
    expect(texts(substitutePlaceholders(doc, CTX))[0]).toBe('Адам.Тех и {{номер_пакета}}');
  });

  it('экранирует кавычки, не ломая JSON документа', () => {
    const doc = { type: 'doc', content: [para('{{org.bankName}}')] };
    const filled = substitutePlaceholders(doc, {
      ...CTX,
      org: { ...CTX.org, bankName: 'ОАО "Банк" \\ филиал' },
    });
    expect(texts(filled)[0]).toBe('ОАО "Банк" \\ филиал');
  });

  it('не мутирует исходный шаблон', () => {
    const doc = { type: 'doc', content: [para('{{org.name}}')] };
    const before = JSON.stringify(doc);
    substitutePlaceholders(doc, CTX);
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('extractManualVariables', () => {
  it('возвращает только несистемные переменные, без повторов', () => {
    const doc = {
      type: 'doc',
      content: [para('{{org.name}} {{пакет}} {{doc.number}} {{пакет}} {{чаты}}')],
    };
    expect(extractManualVariables(doc)).toEqual(['пакет', 'чаты']);
  });
});

describe('substituteVariables', () => {
  it('подставляет значения, введённые пользователем', () => {
    const doc = { type: 'doc', content: [para('Пакет {{пакет}}')] };
    expect(texts(substituteVariables(doc, { 'пакет': '№4' }))[0]).toBe('Пакет №4');
  });
});

describe('usesCompanyPlaceholders / usesOrgPlaceholders', () => {
  it('различает, какие пространства имён есть в шаблоне', () => {
    const onlyOrg = { type: 'doc', content: [para('{{org.inn}}')] };
    expect(usesOrgPlaceholders(onlyOrg)).toBe(true);
    expect(usesCompanyPlaceholders(onlyOrg)).toBe(false);
  });
});

describe('форматтеры', () => {
  it('денежный формат с разделением разрядов', () => {
    expect(formatAmount(30000)).toBe('30 000,00');
    expect(formatAmount(1234567.5)).toBe('1 234 567,50');
    expect(formatAmount(0)).toBe('0,00');
  });

  it('русская дата', () => {
    expect(ruDate(new Date(2026, 8, 30))).toBe('30 сентября 2026 г.');
  });

  it('числовые даты', () => {
    expect(shortNumericDate('2026-09-05')).toBe('5.09.2026');
    expect(shortPeriodDate('2026-09-05')).toBe('5.09.26 г.');
  });
});
