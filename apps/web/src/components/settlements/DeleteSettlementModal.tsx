"use client";

import { useEffect, useId, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { MONTH_NAMES, formatMoney, settlementsApi, settlementSetLabel, type Settlement } from "@/lib/api/settlements";

export function DeleteSettlementModal({ settlement, onClose, onDeleted }: {
  settlement: Settlement; onClose: () => void; onDeleted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => settlementsApi.remove(settlement.id),
    onSuccess: () => {
      for (const key of ["settlements", "settlement", "contract-history", "esf"]) void qc.invalidateQueries({ queryKey: [key] });
      onDeleted();
    },
  });
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); if (!remove.isPending) onClose(); }}
    className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5 text-[var(--color-text-primary)] backdrop:bg-black/60">
    <h2 id={titleId} className="text-base font-semibold">Удалить комплект?</h2>
    <p className="mt-3 text-sm font-medium break-words">{settlement.counterpartyName}</p>
    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{MONTH_NAMES[settlement.month - 1]} {settlement.year} · {settlementSetLabel(settlement)}</p>
    <p className="mt-1 text-sm font-medium">{formatMoney(settlement.amount, settlement.currency)}</p>
    <p id={descriptionId} className="mt-4 text-sm text-[var(--color-text-secondary)]">Комплект исчезнет из рабочего списка и итогов месяца. Акты, счета, сканы, оплаты и связи с ЭСФ сохранятся. Восстановить можно в «Удалённых комплектах» за этот месяц.</p>
    {settlement.payments.length > 0 && <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Сохранится оплат: {settlement.payments.length}, на сумму {formatMoney(settlement.paidAmount, settlement.currency)}.</p>}
    {remove.isError && <p role="alert" className="mt-3 text-sm text-[var(--color-danger)]">{remove.error instanceof Error ? remove.error.message : "Не удалось удалить комплект. Попробуйте снова."}</p>}
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      <Button autoFocus type="button" variant="secondary" disabled={remove.isPending} onClick={onClose}>Отмена</Button>
      <Button type="button" variant="danger" loading={remove.isPending} loadingText="Удаляю…" onClick={() => remove.mutate()}>Удалить комплект</Button>
    </div>
  </dialog>;
}
