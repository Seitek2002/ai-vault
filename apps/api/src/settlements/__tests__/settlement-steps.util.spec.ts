import { describe, expect, it } from 'vitest';
import { SettlementStepType } from '@prisma/client';
import { buildStepPlans, deriveStatus, extractVat, nextOpenStep } from '../settlement-steps.util';

const iso = (d: Date) => d.toISOString().slice(0, 10);

function planMap(year: number, month: number, opts: { esfRequired: boolean; paymentDueDays: number }) {
  return Object.fromEntries(
    buildStepPlans(year, month, opts).map((p) => [p.type, iso(p.dueDate)]),
  );
}

describe('buildStepPlans', () => {
  it('считает сроки от конца расчётного месяца', () => {
    const due = planMap(2026, 9, { esfRequired: true, paymentDueDays: 10 });
    // Сентябрь заканчивается 30-го.
    expect(due[SettlementStepType.ISSUE_ACT]).toBe('2026-10-03');
    expect(due[SettlementStepType.ISSUE_INVOICE]).toBe('2026-10-03');
    expect(due[SettlementStepType.SEND]).toBe('2026-10-05');
    expect(due[SettlementStepType.ISSUE_ESF]).toBe('2026-10-05');
    expect(due[SettlementStepType.RECEIVE_SIGNED]).toBe('2026-10-15');
    expect(due[SettlementStepType.RECEIVE_PAYMENT]).toBe('2026-10-10');
  });

  it('берёт срок оплаты из договора', () => {
    const due = planMap(2026, 9, { esfRequired: true, paymentDueDays: 45 });
    expect(due[SettlementStepType.RECEIVE_PAYMENT]).toBe('2026-11-14');
  });

  it('переносит сроки декабря на следующий год', () => {
    const due = planMap(2026, 12, { esfRequired: true, paymentDueDays: 10 });
    expect(due[SettlementStepType.ISSUE_ACT]).toBe('2027-01-03');
    expect(due[SettlementStepType.RECEIVE_PAYMENT]).toBe('2027-01-10');
  });

  it('не создаёт шаг ЭСФ партнёру, который её не требует', () => {
    const plans = buildStepPlans(2026, 9, { esfRequired: false, paymentDueDays: 10 });
    expect(plans.map((p) => p.type)).not.toContain(SettlementStepType.ISSUE_ESF);
    expect(plans).toHaveLength(5);
  });

  it('нумерует шаги в порядке процесса', () => {
    const plans = buildStepPlans(2026, 9, { esfRequired: true, paymentDueDays: 10 });
    expect(plans.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

// ── deriveStatus ─────────────────────────────────────────────────────────────

const NOW = new Date('2026-10-08T00:00:00Z');
const FUTURE = new Date('2026-10-20T00:00:00Z');
const PAST = new Date('2026-10-01T00:00:00Z');

const step = (
  type: SettlementStepType,
  order: number,
  dueDate: Date | null,
  doneAt: Date | null,
) => ({ type, order, dueDate, doneAt });

describe('deriveStatus', () => {
  it('закрыт, когда закрыты все шаги', () => {
    const steps = [
      step(SettlementStepType.ISSUE_ACT, 1, PAST, PAST),
      step(SettlementStepType.RECEIVE_PAYMENT, 6, PAST, PAST),
    ];
    expect(deriveStatus(steps, NOW)).toBe('closed');
  });

  it('просрочен, если хоть один открытый шаг просрочен', () => {
    const steps = [
      step(SettlementStepType.ISSUE_ACT, 1, PAST, null),
      step(SettlementStepType.RECEIVE_PAYMENT, 6, FUTURE, null),
    ];
    expect(deriveStatus(steps, NOW)).toBe('overdue');
  });

  it('просрочка важнее того, чья очередь ходить', () => {
    // Открыт только «ждём партнёра», но срок вышел — это всё равно просрочка.
    const steps = [step(SettlementStepType.RECEIVE_SIGNED, 5, PAST, null)];
    expect(deriveStatus(steps, NOW)).toBe('overdue');
  });

  it('ждём партнёра, когда ближайший открытый шаг — приём', () => {
    const steps = [
      step(SettlementStepType.ISSUE_ACT, 1, PAST, PAST),
      step(SettlementStepType.RECEIVE_SIGNED, 5, FUTURE, null),
      step(SettlementStepType.RECEIVE_PAYMENT, 6, FUTURE, null),
    ];
    expect(deriveStatus(steps, NOW)).toBe('waiting_partner');
  });

  it('за нами, когда ближайший открытый шаг — наш', () => {
    const steps = [
      step(SettlementStepType.ISSUE_ACT, 1, FUTURE, null),
      step(SettlementStepType.RECEIVE_PAYMENT, 6, FUTURE, null),
    ];
    expect(deriveStatus(steps, NOW)).toBe('waiting_us');
  });

  it('шаг без срока не считается просроченным', () => {
    const steps = [step(SettlementStepType.SEND, 3, null, null)];
    expect(deriveStatus(steps, NOW)).toBe('waiting_us');
  });
});

describe('nextOpenStep', () => {
  it('возвращает открытый шаг с наименьшим порядком', () => {
    const steps = [
      step(SettlementStepType.ISSUE_ACT, 1, PAST, PAST),
      step(SettlementStepType.SEND, 3, FUTURE, null),
      step(SettlementStepType.ISSUE_INVOICE, 2, FUTURE, null),
    ];
    expect(nextOpenStep(steps)?.type).toBe(SettlementStepType.ISSUE_INVOICE);
  });

  it('возвращает null, когда всё закрыто', () => {
    expect(nextOpenStep([step(SettlementStepType.ISSUE_ACT, 1, PAST, PAST)])).toBeNull();
  });
});

// ── extractVat ───────────────────────────────────────────────────────────────

describe('extractVat', () => {
  it('выделяет налог из суммы с НДС, а не начисляет сверху', () => {
    // 30 000 с НДС 12% → 30000 × 12 / 112
    expect(extractVat(30000, 12, true)).toBe(3214.29);
    expect(extractVat(100000, 12, true)).toBe(10714.29);
  });

  it('партнёру без ЭСФ налог не выделяется', () => {
    expect(extractVat(30000, 12, false)).toBe(0);
  });

  it('нулевая ставка даёт ноль', () => {
    expect(extractVat(30000, 0, true)).toBe(0);
  });

  it('округляет до копеек', () => {
    const vat = extractVat(12345.67, 12, true);
    expect(vat).toBe(Math.round(vat * 100) / 100);
  });

  it('сумма без налога плюс налог равны исходной сумме', () => {
    const amount = 87654.32;
    const vat = extractVat(amount, 12, true);
    expect(Math.round((amount - vat) * 1.12 * 100) / 100).toBeCloseTo(amount, 1);
  });
});
