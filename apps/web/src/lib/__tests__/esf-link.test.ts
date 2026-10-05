import { describe, expect, it, vi } from 'vitest';
import type { Contract } from '../api/contracts';
import type { Settlement } from '../api/settlements';
import { contractsForEsf, linkEsfTarget, settlementsForEsf } from '../esf-link';

const contract = (id: string, counterpartyId: string, patch: Partial<Contract> = {}) => ({
  id, counterpartyId, counterpartyName: counterpartyId, number: `ДГ-${id}`, title: 'Обслуживание',
  active: true, esfRequired: true, ...patch,
} as Contract);
const set = (id: string, contractId: string, year: number, month: number, sequence = 1) => ({
  id, contractId, year, month, sequence, steps: [],
} as unknown as Settlement);

describe('ЭСФ: all contracts and periods', () => {
  it('includes contracts without calculations, inactive contracts and optional ESF contracts', () => {
    const contracts = [contract('other', 'Компания 2'), contract('own', 'Орто-Транс'),
      contract('old', 'Бакай', { active: false, esfRequired: false })];
    const result = contractsForEsf(contracts, 'Орто-Транс', '');
    expect(result.map((c) => c.id)).toEqual(['own', 'old', 'other']);
    expect(contracts.map((c) => c.id)).toEqual(['other', 'own', 'old']);
  });
  it('searches company, contract number and title without case sensitivity', () => {
    const contracts = [contract('1', 'Орто-Транс'), contract('2', 'Бакай', { title: 'AIVIO бот' })];
    expect(contractsForEsf(contracts, null, ' орто ').map((c) => c.id)).toEqual(['1']);
    expect(contractsForEsf(contracts, null, 'дг-2').map((c) => c.id)).toEqual(['2']);
    expect(contractsForEsf(contracts, null, 'aivio').map((c) => c.id)).toEqual(['2']);
    expect(contractsForEsf(contracts, null, 'нет такой компании')).toEqual([]);
  });
  it('finds historical and future sets by the exact contract, year and month', () => {
    const sets = [set('last-dec', '1', 2025, 12), set('dec', '1', 2026, 12, 2),
      set('dec-first', '1', 2026, 12), set('other', '2', 2026, 12), set('march', '1', 2026, 3)];
    expect(settlementsForEsf(sets, '1', 2026, 12).map((s) => s.id)).toEqual(['dec-first', 'dec']);
    expect(settlementsForEsf(sets, '1', 2025, 12).map((s) => s.id)).toEqual(['last-dec']);
    expect(settlementsForEsf(sets, '1', 2026, 3).map((s) => s.id)).toEqual(['march']);
    expect(settlementsForEsf(sets, '1', 2026, 4)).toEqual([]);
  });
  it('keeps calculations even when they have no ISSUE_ESF step', () => {
    expect(settlementsForEsf([set('no-esf', '1', 2026, 3)], '1', 2026, 3)).toHaveLength(1);
  });
});

describe('ЭСФ: explicit creation and attachment', () => {
  const dto = { contractId: 'contract-1', year: 2026, month: 3, amount: 35000 };
  it('links an existing calculation without creating documents or calculations', async () => {
    const ops = { create: vi.fn(), attach: vi.fn().mockResolvedValue({}), onCreated: vi.fn() };
    expect(await linkEsfTarget('invoice-1', { settlementId: 'existing' }, ops)).toBe('existing');
    expect(ops.attach).toHaveBeenCalledWith('invoice-1', 'existing');
    expect(ops.create).not.toHaveBeenCalled();
    expect(ops.onCreated).not.toHaveBeenCalled();
  });
  it('creates only the selected missing month, preserving its chosen amount', async () => {
    const created = set('new', dto.contractId, dto.year, dto.month);
    const ops = { create: vi.fn().mockResolvedValue(created), attach: vi.fn().mockResolvedValue({}), onCreated: vi.fn() };
    expect(await linkEsfTarget('invoice-1', { create: dto }, ops)).toBe('new');
    expect(ops.create).toHaveBeenCalledExactlyOnceWith(dto);
    expect(ops.onCreated).toHaveBeenCalledWith(created);
    expect(ops.attach).toHaveBeenCalledWith('invoice-1', 'new');
  });
  it('keeps the created set on attachment failure so retry does not duplicate it', async () => {
    const created = set('created-before-failure', dto.contractId, dto.year, dto.month);
    let saved: Settlement | undefined;
    const ops = { create: vi.fn().mockResolvedValue(created), attach: vi.fn().mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValue({}),
      onCreated: (s: Settlement) => { saved = s; } };
    await expect(linkEsfTarget('invoice-1', { create: dto }, ops)).rejects.toThrow('Connection lost');
    expect(saved?.id).toBe(created.id);
    await linkEsfTarget('invoice-1', { settlementId: saved!.id }, ops);
    expect(ops.create).toHaveBeenCalledOnce();
    expect(ops.attach).toHaveBeenNthCalledWith(2, 'invoice-1', created.id);
  });
  it('does not attach an invoice when creating its calculation fails', async () => {
    const ops = { create: vi.fn().mockRejectedValue(new Error('Not found')), attach: vi.fn(), onCreated: vi.fn() };
    await expect(linkEsfTarget('invoice-1', { create: dto }, ops)).rejects.toThrow('Not found');
    expect(ops.attach).not.toHaveBeenCalled();
    expect(ops.onCreated).not.toHaveBeenCalled();
  });
});
