import { EsfStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { linksFixture } from './links-fixture';

function fixture() {
  const f = linksFixture();
  f.invoices[0]!.status = EsfStatus.REVOKED;
  f.steps[0]!.doneAt = null;
  f.steps[0]!.note = 'ЭСФ 123 — отозвана на портале';
  f.invoices.push({ ...f.invoices[0]!, id: 'replacement', number: '456', status: EsfStatus.ACCEPTED, settlementId: null, fileAssetId: 'new-pdf' });
  return f;
}

describe('Explicit ESF replacement', () => {
  it('replaces revoked evidence, preserves old invoice and prevents automatic reattachment', async () => {
    const f = fixture();
    await f.service.attach('org', 'user', 'replacement', ['s1'], false, 'inv');
    expect(f.links()).toEqual([{ invoiceId: 'replacement', settlementId: 's1' }]);
    expect(f.invoices[0]).toMatchObject({ status: EsfStatus.REVOKED, settlementId: null, matchNote: 'Отвязана вручную', fileAssetId: 'pdf' });
    expect(f.steps[0]).toMatchObject({ fileAssetId: 'new-pdf', note: 'ЭСФ № 456 от 31.08.2026' });
    expect(f.steps[0]!.doneAt).toBeInstanceOf(Date);
  });
  it('preserves other months and moves old PDF primary to the remaining month', async () => {
    const f = fixture();
    f.links().push({ invoiceId: 'inv', settlementId: 's2' });
    Object.assign(f.steps[1]!, { fileAssetId: 'pdf', note: 'ЭСФ 123 — отозвана на портале' });
    await f.service.attach('org', 'user', 'replacement', ['s1'], false, 'inv');
    expect(f.links()).toEqual([{ invoiceId: 'inv', settlementId: 's2' }, { invoiceId: 'replacement', settlementId: 's1' }]);
    expect(f.invoices[0]!.settlementId).toBe('s2');
    expect(f.steps[1]).toMatchObject({ doneAt: null, fileAssetId: 'pdf', note: 'ЭСФ 123 — отозвана на портале' });
    expect(f.prisma.fileAsset.update).toHaveBeenCalledWith({ where: { id: 'pdf' }, data: { settlementId: 's2' } });
  });
  it('keeps the occupancy guard without an explicit expected old invoice', async () => {
    const f = fixture();
    await expect(f.service.attach('org', 'user', 'replacement', ['s1'], false)).rejects.toThrow('Сначала отвяжите');
    expect(f.invoices[0]!.settlementId).toBe('s1');
  });
  it('rejects stale expected links before changing any evidence', async () => {
    const f = fixture();
    await expect(f.service.attach('org', 'user', 'replacement', ['s2'], false, 'inv')).rejects.toThrow('Привязка ЭСФ изменилась');
    expect(f.prisma.esfInvoice.update).not.toHaveBeenCalled();
  });
  it.each([EsfStatus.NEW, EsfStatus.REVOKED, EsfStatus.REJECTED])('rejects a replacement in status %s without detaching the old one', async status => {
    const f = fixture(); f.invoices[1]!.status = status;
    await expect(f.service.attach('org', 'user', 'replacement', ['s1'], false, 'inv')).rejects.toThrow('отправленную или принятую');
    expect(f.prisma.esfInvoice.update).not.toHaveBeenCalled();
  });
  it.each(['organizationId', 'counterpartyId'] as const)('rejects replacement from another %s', async field => {
    const f = fixture(); f.invoices[1]![field] = 'other';
    await expect(f.service.attach('org', 'user', 'replacement', ['s1'], false, 'inv')).rejects.toThrow();
    expect(f.prisma.esfInvoice.update).not.toHaveBeenCalled();
  });
  it('rejects occupied target invoices before removing the old link', async () => {
    const f = fixture(); f.invoices[1]!.settlementId = 's3';
    await expect(f.service.attach('org', 'user', 'replacement', ['s1'], false, 'inv')).rejects.toThrow('свободную');
    expect(f.prisma.esfInvoice.update).not.toHaveBeenCalled();
  });
  it('preserves independently uploaded manual evidence', async () => {
    const f = fixture();
    Object.assign(f.steps[0]!, { doneAt: new Date(), evidenceUrl: 'https://example.com/manual', fileAssetId: 'manual-pdf', note: 'Manual evidence' });
    await f.service.attach('org', 'user', 'replacement', ['s1'], false, 'inv');
    expect(f.steps[0]).toMatchObject({ evidenceUrl: 'https://example.com/manual', fileAssetId: 'manual-pdf', note: 'Manual evidence' });
  });
  it('takes all invoice locks in stable order before settlement locks', async () => {
    const f = fixture();
    await f.service.attach('org', 'user', 'replacement', ['s1'], false, 'inv');
    const calls = f.prisma.$executeRaw.mock.calls.map(c => c[1]);
    expect(calls.slice(0, 2)).toEqual(['esf-invoice:org:inv', 'esf-invoice:org:replacement']);
    expect(calls[2]).toBe('esf-settlement:org:s1');
  });
});
