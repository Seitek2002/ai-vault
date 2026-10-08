"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Spinner } from "@/components/ui";
import { formatMoney, settlementsApi, settlementSetLabel } from "@/lib/api/settlements";

export function DeletedSettlements({ year, month }: { year: number; month: number }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["settlements", "deleted", year, month], queryFn: () => settlementsApi.deleted(year, month) });
  const restore = useMutation({
    mutationFn: (id: string) => settlementsApi.restore(id),
    onSuccess: () => { for (const key of ["settlements", "settlement", "contract-history", "esf"]) void qc.invalidateQueries({ queryKey: [key] }); },
  });
  if (query.isPending) return <p role="status" className="flex items-center gap-2 py-3 text-xs"><Spinner size="sm" /> Загружаем удалённые комплекты…</p>;
  if (query.isError) return <p role="alert" className="py-3 text-sm text-[var(--color-danger)]">Не удалось загрузить комплекты. <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>Повторить</Button></p>;
  return <div className="pt-2">
    <p className="mb-2 text-xs text-[var(--color-text-secondary)]">Документы и оплаты сохранены. Эти комплекты не учитываются в итогах месяца.</p>
    {query.data.settlements.length === 0 ? <p className="py-3 text-sm text-[var(--color-text-muted)]">В этом месяце удалённых комплектов нет.</p> : <ul className="divide-y divide-[var(--color-border)]">
      {query.data.settlements.map((set) => <li key={set.id} className="flex flex-wrap items-center gap-3 py-3 text-xs">
        <Link href={`/settlements/${set.id}`} className="min-w-0 flex-1 text-[var(--color-accent)] hover:underline"><span className="block break-words font-medium">{set.counterpartyName}</span><span className="block break-words text-[var(--color-text-secondary)]">{set.contractTitle} · {settlementSetLabel(set)}</span></Link>
        <span className="font-medium">{formatMoney(set.amount, set.currency)}</span>
        <Button size="sm" variant="secondary" disabled={restore.isPending} loading={restore.isPending && restore.variables === set.id} loadingText="Восстанавливаю…" aria-label={`Восстановить ${settlementSetLabel(set)}: ${set.counterpartyName}`} onClick={() => restore.mutate(set.id)}>Восстановить</Button>
      </li>)}
    </ul>}
    {restore.isError && <p role="alert" className="mt-2 text-xs text-[var(--color-danger)]">{restore.error instanceof Error ? restore.error.message : "Не удалось восстановить комплект."}</p>}
  </div>;
}
