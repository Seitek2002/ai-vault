import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { SettlementDocsService } from '../settlement-docs.service';
import { SettlementsService } from '../settlements.service';

function fixture() {
  const settlement = { id: 's1', organizationId: 'org1', contractId: 'c1', counterpartyId: 'cp1', year: 2026, month: 9, sequence: 2, label: 'Дополнительные услуги', amount: new Prisma.Decimal(35000), vatAmount: new Prisma.Decimal(0), currency: 'KGS' };
  const steps = [{ id: 'act-step', settlementId: 's1', type: 'ISSUE_ACT', documentId: null, doneAt: null }, { id: 'invoice-step', settlementId: 's1', type: 'ISSUE_INVOICE', documentId: null, doneAt: null }];
  const records: any[] = [];
  const settings = { name: 'Исполнитель', inn: '123', address: 'Адрес', actCounter: 0, actCounterYear: null, actPrefix: 'АВР', invoiceCounter: 0, invoiceCounterYear: null, invoicePrefix: 'СЧ' };
  const match = (row: any, where: any) => Object.entries(where).every(([k, v]) => typeof v === 'object' && v !== null ? row[k]?.startsWith((v as any).startsWith) : row[k] === v);
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    settlement: { findFirst: vi.fn(({ where }) => Promise.resolve(match(settlement, where) ? settlement : null)) },
    settlementStep: {
      findFirst: vi.fn(({ where }) => Promise.resolve(steps.find(s => match(s, where)) ?? null)),
      update: vi.fn(({ where, data }) => Object.assign(steps.find(s => s.id === where.id)!, data)),
    },
    companySettings: { findUnique: vi.fn().mockResolvedValue(settings), update: vi.fn(({ data }) => Object.assign(settings, data)) },
    counterparty: { findFirstOrThrow: vi.fn().mockResolvedValue({ id: 'cp1', name: 'Заказчик', inn: '456', address: 'Бишкек' }) },
    contract: { findFirstOrThrow: vi.fn().mockResolvedValue({ id: 'c1', number: 'ДГ-25', title: 'Обслуживание', startDate: new Date('2026-03-01T00:00:00Z') }) },
    documentTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
    document: {
      findFirst: vi.fn(({ where }) => Promise.resolve(records.find(r => match(r, where)) ?? null)),
      findFirstOrThrow: vi.fn(({ where }) => Promise.resolve(records.find(r => match(r, where))!)),
      findMany: vi.fn(({ where }) => Promise.resolve(records.filter(r => match(r, where)))),
      create: vi.fn(({ data }) => { const doc = { id: `d${records.length + 1}`, status: 'DRAFT', ...data }; records.push(doc); return Promise.resolve(doc); }),
    },
    documentVersion: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = { $transaction: vi.fn((run) => run(tx)) };
  const docs = new SettlementDocsService();
  const service = new SettlementsService(prisma as never, docs);
  const generate = (step = 'act-step', org = 'org1', dto = {}) => service.generateStepDocument('s1', step, org, 'u1', dto);
  return { generate, service, tx, docs, records, settings, steps, settlement };
}

describe('generation from a settlement step', () => {
  it('creates standard act and invoice without Constructor templates, and leaves both steps open', async () => {
    const f = fixture();
    const act = await f.generate(); const invoice = await f.generate('invoice-step');
    expect(act.number).toBe('АВР-2026-001'); expect(invoice.number).toBe('СЧ-2026-001');
    expect(f.records.map(r => r.type)).toEqual(['AVR', 'INVOICE_PAYMENT']);
    for (const doc of f.records) {
      const body = JSON.stringify(doc.bodyJson);
      expect(body).toContain('Заказчик'); expect(body).toContain('Исполнитель');
      expect(body).toContain('Дополнительные услуги'); expect(body).toContain('35 000,00');
      expect(body).toContain('ДГ-25'); expect(body).toContain('1.03.2026');
      expect(body).toContain('1.09.26 г.'); expect(body).toContain('30.09.26 г.');
      expect(body).not.toContain('{{'); expect(body).not.toContain('Адам.Тех');
      expect(doc.meta).toMatchObject({ totalAmount: 35000, totalVat: 0, periodStart: '2026-09-01', periodEnd: '2026-09-30' });
    }
    expect(f.steps.every(s => !s.doneAt)).toBe(true);
  });
  it('reuses the document and number after a repeated request', async () => {
    const f = fixture(); const first = await f.generate(); const repeat = await f.generate();
    expect(repeat).toMatchObject({ id: first.id, number: first.number, reused: true });
    expect(f.records).toHaveLength(1); expect(f.settings.actCounter).toBe(1);
  });
  it('reattaches an existing document instead of creating a duplicate when the step has no link', async () => {
    const f = fixture(); const first = await f.generate(); f.steps[0]!.documentId = null;
    expect(await f.generate()).toMatchObject({ id: first.id }); expect(f.records).toHaveLength(1);
  });
  it('cannot create a document for another organization or unrelated step', async () => {
    const f = fixture(); await expect(f.generate('act-step', 'org2')).rejects.toThrow('Расчёт не найден');
    await expect(f.generate('other-step')).rejects.toThrow('Шаг не найден'); expect(f.records).toHaveLength(0);
  });
  it('does not generate for a completed step without a document', async () => {
    const f = fixture(); f.steps[0]!.doneAt = new Date() as never;
    await expect(f.generate()).rejects.toThrow('Шаг уже завершён'); expect(f.records).toHaveLength(0);
  });
  it('rejects a foreign or wrong-type selected template without spending a number', async () => {
    const f = fixture(); await expect(f.generate('act-step', 'org1', { templateId: 'foreign' })).rejects.toThrow('Шаблон этого типа не найден');
    expect(f.records).toHaveLength(0); expect(f.settings.actCounter).toBe(0);
  });
  it('uses a selected Constructor template with the same substitution engine', async () => {
    const f = fixture(); f.tx.documentTemplate.findFirst.mockResolvedValue({ bodyJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Мой акт {{doc.number}}: {{company.name}} / {{doc.amount}}' }] }] }, metaDefaults: {}, categoryId: null } as never);
    await f.generate('act-step', 'org1', { templateId: 'custom-act' });
    expect(JSON.stringify(f.records[0].bodyJson)).toContain('Мой акт АВР-2026-001: Заказчик / 35 000,00');
  });
  it('does not reuse yearly numbers when generating an older period between current periods', async () => {
    const f = fixture(); await f.generate();
    f.settings.actCounterYear = 2025 as never; f.settings.actCounter = 50;
    expect(await f.docs.nextNumber(f.tx as never, 'org1', 'act', 2026)).toBe('АВР-2026-002');
  });
  it('uses independent act and invoice numbering without timestamp fallback if settings are absent', async () => {
    const f = fixture(); f.tx.companySettings.findUnique.mockResolvedValue(null as never);
    await f.generate(); await f.generate('invoice-step');
    expect(f.records.map(r => r.number)).toEqual(['АВР-2026-001', 'СЧ-2026-001']);
  });
});
