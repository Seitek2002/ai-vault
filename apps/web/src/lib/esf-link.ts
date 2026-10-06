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

/** Create missing periods first; a failed link can reuse every already-created set. */
export async function linkEsfTargets(
  invoiceId: string,
  targets: (Target & { key: string })[],
  operations: {
    create: (dto: CreateSettlementDto) => Promise<Settlement>;
    attach: (invoiceId: string, settlementIds: string[]) => Promise<unknown>;
    onCreated: (key: string, settlement: Settlement) => void;
  },
): Promise<void> {
  if (!targets.length || targets.length > 120 || new Set(targets.map((t) => t.key)).size !== targets.length) {
    throw new Error('Выберите от 1 до 120 разных расчётов.');
  }
  const ids: string[] = [];
  for (const target of targets) {
    if ('settlementId' in target) ids.push(target.settlementId);
    else {
      const created = await operations.create(target.create);
      operations.onCreated(target.key, created);
      ids.push(created.id);
    }
  }
  await operations.attach(invoiceId, [...new Set(ids)]);
}

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
