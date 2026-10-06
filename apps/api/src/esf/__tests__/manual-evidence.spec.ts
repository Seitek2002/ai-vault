import { EsfStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { linksFixture } from './links-fixture';

const manual = [{ evidenceUrl: 'https://example.com/esf', fileAssetId: null }, { evidenceUrl: null, fileAssetId: 'uploaded-scan' }];
describe('Ручное подтверждение ЭСФ при работе с кабинетом', () => {
  it.each(manual)('сохраняет ручное подтверждение при отзыве общей ЭСФ: %j', async (evidence) => {
    const { service, steps, invoices } = linksFixture();
    await service.attach('org', 'user', 'inv', ['s1', 's2']);
    Object.assign(steps[1]!, evidence);
    await service.refreshStatus('org', 'inv', EsfStatus.REVOKED, '123', null, 'Отозван', 'user');
    expect(invoices[0]!.status).toBe(EsfStatus.REVOKED);
    expect(steps[0]!.doneAt).toBeNull();
    expect(steps[1]).toMatchObject({ ...evidence, doneAt: expect.any(Date) });
  });
  it.each(manual)('не стирает ручное подтверждение при привязке: %j', async (evidence) => {
    const { service, steps } = linksFixture();
    Object.assign(steps[1]!, evidence, { doneAt: new Date() });
    await service.attach('org', 'user', 'inv', ['s1', 's2']);
    expect(steps[1]).toMatchObject({ ...evidence, doneAt: expect.any(Date) });
  });
  it.each(manual)('сохраняет ручное подтверждение при отвязке: %j', async (evidence) => {
    const { service, steps, links } = linksFixture();
    Object.assign(steps[0]!, evidence);
    await service.detach('org', 'inv', 's1');
    expect(steps[0]).toMatchObject({ ...evidence, doneAt: expect.any(Date) });
    expect(links()).toEqual([]);
  });
  it('открывает все шаги, подтверждённые отозванной ЭСФ', async () => {
    const { service, steps } = linksFixture();
    await service.attach('org', 'user', 'inv', ['s1', 's2']);
    await service.refreshStatus('org', 'inv', EsfStatus.REVOKED, '123', null, 'Отозван', 'user');
    expect(steps.slice(0, 2).every((s) => s.doneAt === null && s.doneById === null)).toBe(true);
  });
  it.each(manual)('после отмены ручного шага заменяет старое подтверждение принятым документом: %j', async (evidence) => {
    const { service, steps } = linksFixture();
    Object.assign(steps[0]!, evidence, { doneAt: null });
    await service.refreshStatus('org', 'inv', EsfStatus.ACCEPTED, '123', new Date(), 'Принят', 'user');
    expect(steps[0]).toMatchObject({ doneAt: expect.any(Date), evidenceUrl: null, fileAssetId: 'pdf' });
  });
});
