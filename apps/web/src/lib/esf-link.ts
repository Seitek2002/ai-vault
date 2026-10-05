import type { Contract } from './api/contracts';
import type { CreateSettlementDto, Settlement } from './api/settlements';

export function contractsForEsf(contracts: Contract[], counterpartyId: string | null, search: string): Contract[] {
  const query = search.trim().toLocaleLowerCase('ru-RU');
  return contracts.filter((c) => `${c.counterpartyName} ${c.number} ${c.title}`.toLocaleLowerCase('ru-RU').includes(query))
    .sort((a, b) => Number(b.counterpartyId === counterpartyId) - Number(a.counterpartyId === counterpartyId)
      || a.counterpartyName.localeCompare(b.counterpartyName, 'ru') || a.number.localeCompare(b.number, 'ru'));
}

export function settlementsForEsf(settlements: Settlement[], contractId: string, year: number, month: number): Settlement[] {
  return settlements.filter((s) => s.contractId === contractId && s.year === year && s.month === month)
    .sort((a, b) => a.sequence - b.sequence);
}

type Target = { settlementId: string } | { create: CreateSettlementDto };

/** Preserve a created calculation when attachment fails, so retry doesn't create another set. */
export async function linkEsfTarget(
  invoiceId: string,
  target: Target,
  operations: {
    create: (dto: CreateSettlementDto) => Promise<Settlement>;
    attach: (invoiceId: string, settlementId: string) => Promise<unknown>;
    onCreated: (settlement: Settlement) => void;
  },
): Promise<string> {
  let settlementId: string;
  if ('settlementId' in target) {
    settlementId = target.settlementId;
  } else {
    const created = await operations.create(target.create);
    operations.onCreated(created);
    settlementId = created.id;
  }
  await operations.attach(invoiceId, settlementId);
  return settlementId;
}
