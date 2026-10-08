"use client";

import { useState } from "react";
import { CONTRACT_AMOUNT_LABELS } from "@ai-vault/doc-placeholders";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { contractsApi, type Contract } from "@/lib/api/contracts";
import { formatMoney } from "@/lib/api/settlements";
import { Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { ContractModal } from "./ContractModal";
export { ContractModal } from "./ContractModal";
export function ContractsClient() {
  const [modal, setModal] = useState<{ editing: Contract | null } | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => contractsApi.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["contracts"] }),
  });

  const contracts = data ?? [];

  return (
    <div className="p-6 lg:p-8 h-full flex flex-col overflow-y-auto">
      <PageHeader
        title="Договоры"
        subtitle="Сумма, периодичность и срок оплаты по каждому партнёру"
        actions={<Button onClick={() => setModal({ editing: null })}>Новый договор</Button>}
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : contracts.length === 0 ? (
        <EmptyState
          icon={<Handshake className="w-6 h-6" />}
          title="Договоров пока нет"
          description="Договор задаёт сумму, периодичность платежа и срок действия"
          action={<Button onClick={() => setModal({ editing: null })}>Новый договор</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {contracts.map((c) => (
            <li key={c.id}>
              <Card className="flex items-center gap-4 px-4 py-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                      {c.counterpartyName}
                    </span>
                    {!c.active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] shrink-0">
                        {c.terminationDate ? "Расторгнут" : "Не действует"}
                      </span>
                    )}
                    {!c.esfRequired && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] shrink-0">
                        без ЭСФ
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] truncate">
                    № {c.number} · {c.title} · выставление {c.billingDay}-го · оплата +{c.paymentDueDays} дн.
                  </p>
                </div>

                <span className="text-sm text-[var(--color-text-primary)] whitespace-nowrap shrink-0">
                  {formatMoney(c.defaultAmount, c.currency)}
                  <span className="ml-1 text-xs text-[var(--color-text-secondary)]">{CONTRACT_AMOUNT_LABELS[c.billingPeriod ?? "MONTHLY"]}</span>
                </span>

                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => setModal({ editing: c })}>
                    Изменить
                  </Button>
                  <button
                    onClick={() => remove.mutate(c.id)}
                    disabled={remove.isPending}
                    title="Удалить договор"
                    className="p-1.5 rounded-lg text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--color-danger)] transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {remove.isError && (
        <p className="mt-3 text-sm text-[var(--color-danger)]">
          {remove.error instanceof ApiError ? remove.error.message : "Не удалось удалить"}
        </p>
      )}

      {modal && <ContractModal editing={modal.editing} onClose={() => setModal(null)} />}
    </div>
  );
}
