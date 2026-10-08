"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { CONTRACT_AMOUNT_LABELS } from "@ai-vault/doc-placeholders";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Handshake, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { contractsApi, type Contract } from "@/lib/api/contracts";
import { formatMoney } from "@/lib/api/settlements";
import { Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { ContractModal } from "./ContractModal";
export { ContractModal } from "./ContractModal";
const ContractHistory = dynamic(() => import("./ContractHistory").then((m) => m.ContractHistory), {
  loading: () => <div className="flex justify-center py-5"><Spinner /></div>,
});
const date = (value: string) => new Date(value).toLocaleDateString("ru-RU", { timeZone: "UTC" });

export function ContractsClient() {
  const [modal, setModal] = useState<{ editing: Contract | null } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["contracts"], queryFn: () => contractsApi.list() });
  const remove = useMutation({ mutationFn: (id: string) => contractsApi.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["contracts"] }),
  });
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const contracts = data ?? [];
  return <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-6 lg:p-8">
    <PageHeader title="Договоры" subtitle="Условия, документы и оплаты по каждому партнёру"
      actions={<Button onClick={() => setModal({ editing: null })}>Новый договор</Button>} />
    {isLoading ? <div className="flex justify-center py-16"><Spinner /></div> : isError ? <div role="alert" className="py-8 text-sm text-[var(--color-danger)]">Не удалось загрузить договоры. <Button variant="secondary" size="sm" onClick={() => void refetch()}>Повторить</Button></div> : contracts.length === 0 ? <EmptyState icon={<Handshake className="size-6" />} title="Договоров пока нет" description="Договор задаёт сумму, периодичность платежа и срок действия" action={<Button onClick={() => setModal({ editing: null })}>Новый договор</Button>} /> : <ul className="flex flex-col gap-2">
      {contracts.map((c) => <li key={c.id}><Card className="group">
        <div className="flex flex-wrap items-center gap-x-2 px-3 py-2 sm:flex-nowrap sm:px-4">
          <button aria-expanded={expanded.has(c.id)} aria-controls={`history-${c.id}`} onClick={() => toggle(c.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded py-1.5 text-left focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]">
            <ChevronDown className={`size-4 shrink-0 text-[var(--color-text-muted)] transition-transform ${expanded.has(c.id) ? "rotate-180" : ""}`} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium"><span className="break-words">{c.counterpartyName}</span>{!c.active && <span className="text-xs font-normal text-[var(--color-text-muted)]">{c.terminationDate ? "Расторгнут" : "Не действует"}</span>}</span>
              <span className="mt-0.5 block break-words text-xs text-[var(--color-text-secondary)]">№ {c.number} · {c.title}</span>
              <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">{c.startDate ? date(c.startDate) : "Начало не указано"} — {c.effectiveEndDate || c.endDate ? date((c.effectiveEndDate ?? c.endDate)!) : "без ограничения"}</span>
            </span>
          </button>
          <div className="ml-7 flex w-full items-center justify-between gap-2 py-1 sm:ml-0 sm:w-auto sm:shrink-0 sm:gap-4">
            <span className="text-sm font-medium whitespace-nowrap">{formatMoney(c.defaultAmount, c.currency)}<span className="mt-0.5 block text-xs font-normal text-[var(--color-text-secondary)] sm:text-right">{CONTRACT_AMOUNT_LABELS[c.billingPeriod ?? "MONTHLY"]}</span></span>
            <div className="flex items-center gap-1"><Button size="sm" variant="secondary" onClick={() => setModal({ editing: c })}>Изменить</Button><button onClick={() => remove.mutate(c.id)} disabled={remove.isPending} aria-label={`Удалить договор № ${c.number}`} title="Удалить договор" className="rounded p-2 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"><Trash2 className="size-4" /></button></div>
          </div>
        </div>
        <div id={`history-${c.id}`} hidden={!expanded.has(c.id)}>{expanded.has(c.id) && <ContractHistory contract={c} />}</div>
      </Card></li>)}
    </ul>}
    {remove.isError && <p className="mt-3 text-sm text-[var(--color-danger)]">{remove.error instanceof ApiError ? remove.error.message : "Не удалось удалить"}</p>}
    {modal && <ContractModal editing={modal.editing} onClose={() => setModal(null)} />}
  </div>;
}
