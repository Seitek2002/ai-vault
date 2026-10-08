import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EsfStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { AttachEsfDto } from '../dto/esf.dto';
import { linksFixture } from './links-fixture';

describe('ЭСФ за несколько расчётов', () => {
  it('закрывает все выбранные шаги одним PDF и сохраняет основной расчёт', async () => {
    const { service, links, steps, settlements, invoices } = linksFixture();
    await service.attach('org', 'user', 'inv', ['s1', 's2', 's3']);
    expect(links().map((l) => l.settlementId)).toEqual(['s1', 's2', 's3']);
    expect(invoices[0]!.settlementId).toBe('s1');
    expect(steps.every((s) => !!s.doneAt && s.fileAssetId === 'pdf')).toBe(true);
    expect(settlements.every((s) => !!s.closedAt)).toBe(true);
  });
  it('добавление из шага не удаляет остальные месяцы', async () => {
    const { service, links } = linksFixture();
    await service.attach('org', 'user', 'inv', ['s2'], false);
    expect(links().map((l) => l.settlementId)).toEqual(['s1', 's2']);
  });
  it('редактирование списка очищает только убранные месяцы', async () => {
    const { service, links, steps } = linksFixture();
    await service.attach('org', 'user', 'inv', ['s1', 's2']);
    await service.attach('org', 'user', 'inv', ['s2', 's3']);
    expect(links().map((l) => l.settlementId)).toEqual(['s2', 's3']);
    expect(steps[0]).toMatchObject({ doneAt: null, fileAssetId: null });
    expect(steps[1]!.doneAt).toBeInstanceOf(Date);
  });
  it('отвязывает один месяц и переносит основной PDF на оставшийся расчёт', async () => {
    const { service, links, steps, invoices, prisma } = linksFixture();
    await service.attach('org', 'user', 'inv', ['s1', 's2']);
    await service.detach('org', 'inv', 's1');
    expect(links().map((l) => l.settlementId)).toEqual(['s2']);
    expect(invoices[0]!.settlementId).toBe('s2');
    expect(steps[0]!.doneAt).toBeNull();
    expect(steps[1]!.doneAt).toBeInstanceOf(Date);
    expect(prisma.fileAsset.update).toHaveBeenLastCalledWith({ where: { id: 'pdf' }, data: { settlementId: 's2' } });
  });
  it('отвязывает все месяцы по прежнему API', async () => {
    const { service, links, steps } = linksFixture();
    await service.attach('org', 'user', 'inv', ['s1', 's2']);
    await service.detach('org', 'inv');
    expect(links()).toEqual([]);
    expect(steps.every((s) => !s.doneAt)).toBe(true);
  });
  it('не закрывает шаги по черновику', async () => {
    const { service, steps, invoices } = linksFixture();
    invoices[0]!.status = EsfStatus.NEW;
    await service.attach('org', 'user', 'inv', ['s2', 's3']);
    expect(steps.every((s) => !s.doneAt)).toBe(true);
  });
  it('отвязывает черновик только от выбранного месяца и очищает его незакрытый шаг', async () => {
    const { service, steps, invoices, links } = linksFixture();
    invoices[0]!.status = EsfStatus.NEW;
    steps.forEach((step) => { step.doneAt = null; });
    await service.attach('org', 'user', 'inv', ['s1', 's2']);
    await service.detach('org', 'inv', 's1');
    expect(links()).toEqual([{ invoiceId: 'inv', settlementId: 's2' }]);
    expect(invoices[0]!.settlementId).toBe('s2');
    expect(steps[0]).toMatchObject({ doneAt: null, doneById: null, fileAssetId: null, note: null });
    expect(steps[1]).toMatchObject({ doneAt: null, fileAssetId: 'pdf' });
  });
  it('оставляет вручную отвязанный черновик в системе и позволяет привязать его снова', async () => {
    const { service, steps, invoices, links } = linksFixture();
    invoices[0]!.status = EsfStatus.NEW;
    steps[0]!.doneAt = null;
    await service.detach('org', 'inv', 's1');
    expect(invoices[0]).toMatchObject({ settlementId: null, matchNote: 'Отвязана вручную', status: EsfStatus.NEW });
    expect(links()).toEqual([]);
    await service.attach('org', 'user', 'inv', ['s2']);
    expect(invoices[0]).toMatchObject({ settlementId: 's2', matchNote: null });
    expect(links()).toEqual([{ invoiceId: 'inv', settlementId: 's2' }]);
  });
  it.each(['organizationId', 'counterpartyId', 'currency'] as const)('отклоняет несовместимый %s до любых изменений', async (field) => {
    const { service, settlements, prisma, links } = linksFixture();
    settlements[1]![field] = 'other';
    await expect(service.attach('org', 'user', 'inv', ['s1', 's2'])).rejects.toThrow();
    expect(prisma.esfSettlementLink.createMany).not.toHaveBeenCalled();
    expect(links()).toHaveLength(1);
  });
  it('не разрешает занять даже вторичный расчёт другой ЭСФ', async () => {
    const { service, invoices, links } = linksFixture();
    invoices.push({ ...invoices[0]!, id: 'other', settlementId: 's3' });
    links().push({ invoiceId: 'other', settlementId: 's2' });
    await expect(service.attach('org', 'user', 'inv', ['s1', 's2'])).rejects.toBeInstanceOf(BadRequestException);
    expect(links()).toHaveLength(2);
  });
  it.each([[], ['s1', 's1'], [''], Array.from({ length: 121 }, (_, i) => `s${i}`)].map((ids) => ({ ids })))('отклоняет некорректный выбор', async ({ ids }) => {
    const { service, prisma } = linksFixture();
    await expect(service.attach('org', 'user', 'inv', ids)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('не допускает чужую организацию и удалённый расчёт', async () => {
    const { service } = linksFixture();
    await expect(service.attach('other-org', 'user', 'inv', ['s1'])).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.attach('org', 'user', 'inv', ['missing'])).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.detach('org', 'inv', 's2')).rejects.toBeInstanceOf(NotFoundException);
  });
  it.each([{}, { settlementIds: [] }, { settlementIds: ['s1', 's1'] }, { settlementIds: [''] }, { settlementId: '' }])('DTO отклоняет неверный запрос %j', async (body) => {
    expect(await validate(plainToInstance(AttachEsfDto, body))).not.toHaveLength(0);
  });
  it.each([{ settlementId: 's1' }, { settlementIds: ['s1', 's2'] }])('DTO поддерживает оба формата %j', async (body) => {
    expect(await validate(plainToInstance(AttachEsfDto, body))).toHaveLength(0);
  });
});
