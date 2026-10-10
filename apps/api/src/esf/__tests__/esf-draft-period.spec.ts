import { describe, expect, it } from 'vitest';
import { draftDeliveryDate, draftDeliveryError, draftPeriod, draftPeriodError, portalDate } from '../esf-draft-period';

const today = new Date('2026-10-11T09:00:00Z');
const october = { year: 2026, month: 10 };

describe('Период услуг черновика ЭСФ', () => {
  it('по умолчанию предлагает предыдущий месяц', () => {
    expect(draftPeriod(october, undefined, today)).toEqual({ year: 2026, month: 9 });
    expect(draftPeriod(october, {}, today)).toEqual({ year: 2026, month: 9 });
  });

  it('уважает выбор менеджера', () => {
    expect(draftPeriod(october, { periodYear: 2026, periodMonth: 8 }, today)).toEqual({ year: 2026, month: 8 });
  });

  it('не пускает период позже расчётного месяца и будущие месяцы', () => {
    expect(draftPeriodError(october, { year: 2026, month: 10 }, today)).toBeNull();
    expect(draftPeriodError(october, { year: 2026, month: 11 }, today)).toMatch(/не может быть позже/);
    expect(draftPeriodError({ year: 2026, month: 12 }, { year: 2026, month: 11 }, today)).toMatch(/не может быть позже/);
  });

  it('не пускает период старше двух лет', () => {
    expect(draftPeriodError(october, { year: 2024, month: 9 }, today)).toMatch(/старше двух лет/);
    expect(draftPeriodError(october, { year: 2024, month: 10 }, today)).toBeNull();
  });
});

describe('Дата поставки черновика ЭСФ', () => {
  it('ставит конец периода услуг', () => {
    expect(draftDeliveryDate({ year: 2026, month: 9 }, today)).toBe('2026-09-30');
  });

  it('не уходит в будущее для текущего месяца', () => {
    expect(draftDeliveryDate(october, today)).toBe('2026-10-11');
  });

  it('проверяет дату, выбранную менеджером', () => {
    const september = { year: 2026, month: 9 };
    expect(draftDeliveryError(september, '2026-09-30', today)).toBeNull();
    expect(draftDeliveryError(september, '2026-10-05', today)).toBeNull();
    expect(draftDeliveryError(september, '2026-10-12', today)).toMatch(/в будущем/);
    expect(draftDeliveryError(september, '2026-08-31', today)).toMatch(/раньше периода/);
    expect(draftDeliveryError(september, '30.09.2026', today)).toMatch(/неверно/);
  });

  it('переводит дату в формат портала', () => {
    expect(portalDate('2026-09-30')).toBe('30-09-2026');
  });
});
