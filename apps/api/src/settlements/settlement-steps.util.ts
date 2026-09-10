import { SettlementStepType } from '@prisma/client';
import { addDays, lastDayOfMonth } from './period.util';

/**
 * Срок шага задаётся смещением в днях от последнего дня расчётного месяца.
 * `paymentDueDays` берётся из договора — у каждого партнёра свой срок оплаты.
 */
type DueOffset = number | 'paymentDueDays';

interface StepDef {
  type: SettlementStepType;
  order: number;
  dueOffset: DueOffset;
}

/**
 * Срок выставления ЭСФ — 5 банковских дней после подписания акта
 * (Налоговый кодекс КР). Считаем календарными от конца месяца: этого
 * достаточно для напоминания, точный расчёт банковских дней здесь избыточен.
 */
const ESF_DUE_OFFSET_DAYS = 5;

export const STEP_DEFS: StepDef[] = [
  { type: SettlementStepType.ISSUE_ACT, order: 1, dueOffset: 3 },
  { type: SettlementStepType.ISSUE_INVOICE, order: 2, dueOffset: 3 },
  { type: SettlementStepType.SEND, order: 3, dueOffset: 5 },
  { type: SettlementStepType.ISSUE_ESF, order: 4, dueOffset: ESF_DUE_OFFSET_DAYS },
  { type: SettlementStepType.RECEIVE_SIGNED, order: 5, dueOffset: 15 },
  { type: SettlementStepType.RECEIVE_PAYMENT, order: 6, dueOffset: 'paymentDueDays' },
];

export const STEP_LABELS: Record<SettlementStepType, string> = {
  ISSUE_ACT: 'Выставить акт',
  ISSUE_INVOICE: 'Выставить счёт',
  SEND: 'Отправить партнёру',
  ISSUE_ESF: 'Выставить ЭСФ',
  RECEIVE_SIGNED: 'Получить подписанный',
  RECEIVE_PAYMENT: 'Подтвердить оплату',
};

/** Шаги, которые ждут действия партнёра, а не наших. */
const PARTNER_STEPS = new Set<SettlementStepType>([
  SettlementStepType.RECEIVE_SIGNED,
  SettlementStepType.RECEIVE_PAYMENT,
]);

export interface StepPlan {
  type: SettlementStepType;
  order: number;
  dueDate: Date;
}

export interface BuildStepsOptions {
  esfRequired: boolean;
  paymentDueDays: number;
}

/** Набор шагов для расчёта за месяц со сроками от конца этого месяца. */
export function buildStepPlans(
  year: number,
  month: number,
  { esfRequired, paymentDueDays }: BuildStepsOptions,
): StepPlan[] {
  const periodEnd = lastDayOfMonth(year, month);

  return STEP_DEFS.filter(
    (def) => esfRequired || def.type !== SettlementStepType.ISSUE_ESF,
  ).map((def) => {
    const offset = def.dueOffset === 'paymentDueDays' ? paymentDueDays : def.dueOffset;
    return { type: def.type, order: def.order, dueDate: addDays(periodEnd, offset) };
  });
}

export type SettlementStatus = 'closed' | 'overdue' | 'waiting_partner' | 'waiting_us';

interface StepStateLike {
  type: SettlementStepType;
  order: number;
  dueDate: Date | null;
  doneAt: Date | null;
}

/**
 * Статус расчёта не хранится — он выводится из шагов, поэтому не может
 * разойтись с ними.
 */
export function deriveStatus(steps: StepStateLike[], now: Date = new Date()): SettlementStatus {
  const open = steps.filter((s) => s.doneAt === null);
  if (open.length === 0) return 'closed';

  if (open.some((s) => s.dueDate !== null && s.dueDate.getTime() < now.getTime())) {
    return 'overdue';
  }

  const next = open.reduce((a, b) => (a.order <= b.order ? a : b));
  return PARTNER_STEPS.has(next.type) ? 'waiting_partner' : 'waiting_us';
}

/** Ближайший незакрытый шаг — то, что показывается в строке дашборда. */
export function nextOpenStep<T extends StepStateLike>(steps: T[]): T | null {
  const open = steps.filter((s) => s.doneAt === null);
  if (open.length === 0) return null;
  return open.reduce((a, b) => (a.order <= b.order ? a : b));
}
