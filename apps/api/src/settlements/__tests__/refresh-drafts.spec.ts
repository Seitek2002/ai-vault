import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { SettlementDocsService } from '../settlement-docs.service';

/**
 * Проверяем оркестрацию перерисовки черновиков на подставном Prisma-клиенте:
 * какие записи трогаются, что попадает в тело документа и сохраняется ли
 * номер. БД здесь не нужна — важно поведение метода, а не работа Prisma.
 */

const TEMPLATE_BODY = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Акт № {{doc.number}}' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Заказчик: {{company.name}}' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Сумма: {{doc.amount}} сом' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Период: {{period.start}}–{{period.end}}' }] },
    // Пустой узел — шаблон из Конструктора вполне может его содержать.
    { type: 'paragraph', content: [{ type: 'text', text: '' }] },
  ],
};

function makeTx(drafts: Array<{ id: string; type: string; number: string | null }>) {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const versions: Array<Record<string, unknown>> = [];

  const tx = {
    document: {
      findMany: vi.fn().mockResolvedValue(drafts.map((d) => ({ ...d, meta: { currency: 'KGS' } }))),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: where.id, data });
        return Promise.resolve({});
      }),
    },
    documentTemplate: {
      findFirst: vi.fn().mockResolvedValue({
        bodyJson: TEMPLATE_BODY,
        metaDefaults: {},
        categoryId: null,
      }),
    },
    documentVersion: {
      findFirst: vi.fn().mockResolvedValue({ version: 3 }),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        versions.push(data);
        return Promise.resolve({});
      }),
    },
  };

  return { tx, updates, versions };
}

const SETTLEMENT = {
  id: 's1',
  organizationId: 'org1',
  contractId: 'c1',
  counterpartyId: 'cp1',
  year: 2026,
  month: 9,
  amount: new Prisma.Decimal(45000),
  vatAmount: new Prisma.Decimal(4821.43),
  currency: 'KGS',
  closedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const COUNTERPARTY = {
  id: 'cp1',
  organizationId: 'org1',
  name: 'Ромашка',
  inn: '123',
  bin: null,
  address: null,
  phone: null,
  email: null,
  bankAccount: null,
  bankName: null,
  bankBik: null,
  createdAt: new Date(),
};

function bodyText(data: Record<string, unknown>): string {
  return JSON.stringify(data.bodyJson);
}

describe('refreshDraftsForSettlement', () => {
  const service = new SettlementDocsService();

  const run = (drafts: Array<{ id: string; type: string; number: string | null }>) => {
    const { tx, updates, versions } = makeTx(drafts);
    return service
      .refreshDraftsForSettlement(tx as never, {
        settlement: SETTLEMENT as never,
        counterparty: COUNTERPARTY as never,
        settings: null,
        userId: 'u1',
        organizationId: 'org1',
      })
      .then((count) => ({ count, tx, updates, versions }));
  };

  it('перерисовывает черновик под новую сумму', async () => {
    const { count, updates } = await run([{ id: 'd1', type: 'AVR', number: 'АВР-2026-001' }]);
    expect(count).toBe(1);
    expect(updates).toHaveLength(1);
    expect(bodyText(updates[0]!.data)).toContain('45 000,00');
  });

  it('сохраняет прежний номер документа', async () => {
    const { updates } = await run([{ id: 'd1', type: 'AVR', number: 'АВР-2026-001' }]);
    const body = bodyText(updates[0]!.data);
    expect(body).toContain('АВР-2026-001');
    // Номер не должен переприсваиваться — счётчик тратить незачем.
    expect(updates[0]!.data).not.toHaveProperty('number');
  });

  it('обновляет сумму и в meta документа', async () => {
    const { updates } = await run([{ id: 'd1', type: 'AVR', number: 'АВР-2026-001' }]);
    expect(updates[0]!.data.meta).toMatchObject({ totalAmount: 45000, currency: 'KGS' });
  });

  it('заводит новую версию поверх существующих', async () => {
    const { versions } = await run([{ id: 'd1', type: 'AVR', number: 'АВР-2026-001' }]);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ documentId: 'd1', version: 4, createdById: 'u1' });
  });

  it('вычищает пустые текстовые узлы из шаблона', async () => {
    const { updates } = await run([{ id: 'd1', type: 'AVR', number: 'АВР-2026-001' }]);
    expect(bodyText(updates[0]!.data)).not.toContain('"text":""');
  });

  it('подставляет реквизиты контрагента и период месяца', async () => {
    const { updates } = await run([{ id: 'd1', type: 'AVR', number: 'АВР-2026-001' }]);
    const body = bodyText(updates[0]!.data);
    expect(body).toContain('Ромашка');
    expect(body).toContain('1.09.26 г.');
    expect(body).toContain('30.09.26 г.');
  });

  it('обрабатывает и акт, и счёт', async () => {
    const { count, updates } = await run([
      { id: 'd1', type: 'AVR', number: 'АВР-2026-001' },
      { id: 'd2', type: 'INVOICE_PAYMENT', number: 'СЧ-2026-001' },
    ]);
    expect(count).toBe(2);
    expect(updates.map((u) => u.id)).toEqual(['d1', 'd2']);
  });

  it('не трогает документы посторонних типов', async () => {
    const { count, updates } = await run([{ id: 'd9', type: 'CONTRACT', number: 'Д-1' }]);
    expect(count).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it('без черновиков ничего не делает', async () => {
    const { count, updates, versions } = await run([]);
    expect(count).toBe(0);
    expect(updates).toHaveLength(0);
    expect(versions).toHaveLength(0);
  });
});
