import { Prisma, SettlementStepType } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seal } from '../../common/secret-box';
import { EsfService } from '../esf.service';

afterEach(() => vi.unstubAllEnvs());

describe('Номер учётной системы новых ЭСФ', () => {
  it.each(['CRM-15-a81a719d', 'АВР-2026-001', null])('использует полный ID расчёта вместо номера акта %s или копируемой ЭСФ', async (actNumber) => {
    vi.stubEnv('ESF_SECRET_KEY', 'ab'.repeat(32));
    const id = 'cmup4kfzx003rp520mmvcigam';
    const prisma = {
      companySettings: { findUnique: vi.fn().mockResolvedValue({ esfLogin: 'test-login', esfPasswordEnc: seal('test-password') }) },
      settlement: { findFirst: vi.fn().mockResolvedValue({ id, contractId: 'contract', counterpartyId: 'company', year: 2026, month: 9, amount: new Prisma.Decimal(35000),
        contract: { title: 'Services' }, counterparty: { name: 'Test company' }, steps: [{ type: SettlementStepType.ISSUE_ESF, doneAt: null }],
        documents: actNumber ? [{ type: 'AVR', number: actNumber }] : [] }) },
      esfInvoice: { findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ uuid: 'source-uuid', crmRef: 'CRM-15-a81a719d' })
        .mockResolvedValueOnce({ id: 'new-esf', uuid: 'new-uuid', settlementId: id, settlementLinks: [{ settlementId: id }] }) },
    };
    const draft = { createByCopy: vi.fn().mockResolvedValue({ uuid: 'new-uuid' }) };
    const links = { attach: vi.fn() };
    const service = new EsfService(prisma as never, {} as never, {} as never, draft as never, {} as never, links as never);
    vi.spyOn(service, 'sync').mockResolvedValue({ fetched: 1, created: 1, updated: 0, matched: 1, unmatched: 0, errors: [] });
    vi.spyOn(service, 'findOneDto').mockResolvedValue({ id: 'new-esf' } as never);
    await service.createDraft('org', 'user', id);
    expect(draft.createByCopy).toHaveBeenCalledWith(expect.objectContaining({ crmRef: `ErkinAI.Docs-${id}`, amount: 35000, sourceUuid: 'source-uuid' }));
    expect(links.attach).not.toHaveBeenCalled();
  });
});
