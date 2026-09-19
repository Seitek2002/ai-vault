import { describe, expect, it } from 'vitest';
import { EsfStatus } from '@prisma/client';
import {
  mapPortalStatus,
  matchSettlement,
  parsePortalAmount,
  parsePortalDate,
  statusClosesStep,
  type SettlementCandidate,
} from '../esf-matching';

describe('mapPortalStatus', () => {
  it('переводит статусы портала', () => {
    expect(mapPortalStatus('Принят')).toBe(EsfStatus.ACCEPTED);
    expect(mapPortalStatus('Отправлен')).toBe(EsfStatus.SENT);
    expect(mapPortalStatus('Новый')).toBe(EsfStatus.NEW);
    expect(mapPortalStatus('Отозван')).toBe(EsfStatus.REVOKED);
    expect(mapPortalStatus('Отклонен')).toBe(EsfStatus.REJECTED);
    expect(mapPortalStatus('Отклонён')).toBe(EsfStatus.REJECTED);
  });

  it('неизвестное слово не роняет синхронизацию', () => {
    expect(mapPortalStatus('Что-то новое')).toBe(EsfStatus.UNKNOWN);
  });
});

describe('statusClosesStep', () => {
  it('шаг закрывают только отправленная и принятая', () => {
    expect(statusClosesStep(EsfStatus.ACCEPTED)).toBe(true);
    expect(statusClosesStep(EsfStatus.SENT)).toBe(true);
    expect(statusClosesStep(EsfStatus.NEW)).toBe(false);
    expect(statusClosesStep(EsfStatus.REVOKED)).toBe(false);
    expect(statusClosesStep(EsfStatus.REJECTED)).toBe(false);
  });
});

describe('parsePortalAmount', () => {
  it('читает суммы с пробелами-разделителями и запятой', () => {
    expect(parsePortalAmount('30 000,00')).toBe(30000);
    expect(parsePortalAmount('1 826 000,00')).toBe(1826000);
    expect(parsePortalAmount('30 000,00')).toBe(30000);
    expect(parsePortalAmount('400,00')).toBe(400);
  });

  it('мусор — null, а не NaN', () => {
    expect(parsePortalAmount('')).toBeNull();
    expect(parsePortalAmount('—')).toBeNull();
  });
});

describe('parsePortalDate', () => {
  it('читает оба формата портала', () => {
    expect(parsePortalDate('17.09.2026')?.toISOString()).toBe('2026-09-17T00:00:00.000Z');
    expect(parsePortalDate('17-09-2026')?.toISOString()).toBe('2026-09-17T00:00:00.000Z');
  });

  it('пустая строка и мусор — null', () => {
    expect(parsePortalDate('')).toBeNull();
    expect(parsePortalDate('вчера')).toBeNull();
    expect(parsePortalDate(null)).toBeNull();
  });
});

// ── matchSettlement ──────────────────────────────────────────────────────────

const sept = (over: Partial<SettlementCandidate> = {}): SettlementCandidate => ({
  id: 'sep',
  year: 2026,
  month: 9,
  amount: 30000,
  documentNumbers: ['АВР-2026-003', 'СЧ-2026-003'],
  hasEsf: false,
  ...over,
});

const D = (iso: string) => new Date(iso);

describe('matchSettlement', () => {
  it('crmRef с номером нашего акта — точное совпадение, месяц и сумма не важны', () => {
    const r = matchSettlement(
      { crmRef: 'АВР-2026-003', deliveryDate: D('2026-11-05'), amount: 999 },
      [sept()],
    );
    expect(r).toEqual({ kind: 'matched', settlementId: 'sep', how: 'crmRef' });
  });

  it('crmRef сравнивается без учёта регистра и пробелов', () => {
    const r = matchSettlement({ crmRef: ' авр-2026-003 ', deliveryDate: null, amount: 0 }, [sept()]);
    expect(r.kind).toBe('matched');
  });

  it('чужой crmRef (CRM-20-…) не мешает совпасть по месяцу и сумме', () => {
    const r = matchSettlement(
      { crmRef: 'CRM-20-e6b4c937', deliveryDate: D('2026-09-17'), amount: 30000 },
      [sept()],
    );
    expect(r).toEqual({ kind: 'matched', settlementId: 'sep', how: 'month+amount' });
  });

  it('месяц берётся из даты поставки', () => {
    const r = matchSettlement({ crmRef: null, deliveryDate: D('2026-08-31'), amount: 30000 }, [
      sept(),
      sept({ id: 'aug', month: 8 }),
    ]);
    expect(r).toEqual({ kind: 'matched', settlementId: 'aug', how: 'month+amount' });
  });

  it('один расчёт за месяц с другой суммой — берём его, но помечаем «month»', () => {
    const r = matchSettlement({ crmRef: null, deliveryDate: D('2026-09-17'), amount: 45000 }, [sept()]);
    expect(r).toEqual({ kind: 'matched', settlementId: 'sep', how: 'month' });
  });

  it('расчёт, на котором уже есть ЭСФ, кандидатом не считается', () => {
    const r = matchSettlement({ crmRef: null, deliveryDate: D('2026-09-17'), amount: 30000 }, [
      sept({ hasEsf: true }),
    ]);
    expect(r.kind).toBe('none');
    expect((r as { note: string }).note).toContain('уже есть ЭСФ');
  });

  it('нет расчёта за месяц — понятная причина', () => {
    const r = matchSettlement({ crmRef: null, deliveryDate: D('2026-03-12'), amount: 30000 }, [sept()]);
    expect(r).toEqual({ kind: 'none', note: 'Нет расчёта за 03.2026 по этому партнёру' });
  });

  it('два расчёта за месяц с одинаковой суммой — неоднозначно', () => {
    const r = matchSettlement({ crmRef: null, deliveryDate: D('2026-09-17'), amount: 30000 }, [
      sept({ id: 'a' }),
      sept({ id: 'b' }),
    ]);
    expect(r.kind).toBe('ambiguous');
  });

  it('два расчёта за месяц, сумма ни с одним не совпала — неоднозначно', () => {
    const r = matchSettlement({ crmRef: null, deliveryDate: D('2026-09-17'), amount: 1 }, [
      sept({ id: 'a' }),
      sept({ id: 'b', amount: 50000 }),
    ]);
    expect(r.kind).toBe('ambiguous');
  });

  it('без даты поставки и без crmRef — не сопоставляем', () => {
    const r = matchSettlement({ crmRef: null, deliveryDate: null, amount: 30000 }, [sept()]);
    expect(r.kind).toBe('none');
  });
});

// ── normalizeCompanyName ─────────────────────────────────────────────────────

import { normalizeCompanyName } from '../esf-matching';

describe('normalizeCompanyName', () => {
  it('портал и карточка сходятся без юридической формы и кавычек', () => {
    expect(normalizeCompanyName('Общество с ограниченной ответственностью "Кей Джи Лотерея"')).toBe(
      normalizeCompanyName('ОсОО «Кей Джи Лотерея»'),
    );
    expect(normalizeCompanyName('Открытое акционерное общество "Бакай банк"')).toBe(
      normalizeCompanyName('ОАО «Бакай Банк»'),
    );
    expect(normalizeCompanyName('Общественный фонд "Экселерейт Просперити"')).toBe(
      normalizeCompanyName('ОФ Экселерейт Просперити'),
    );
  });

  it('вложенные кавычки и скобки не мешают', () => {
    expect(normalizeCompanyName('Общество с ограниченной ответственностью "Строительная компания "Авангард стиль"')).toBe(
      'строительная компания авангард стиль',
    );
    expect(normalizeCompanyName('ОсОО "Borsan Construction"(Борсан Констракшн"')).toBe(
      'borsan construction борсан констракшн',
    );
  });

  it('форма внутри слова не режется', () => {
    // «ип» — часть слова, а не «индивидуальный предприниматель»
    expect(normalizeCompanyName('Типография')).toBe('типография');
  });
});
