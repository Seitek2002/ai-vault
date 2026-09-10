"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { Button, Input } from "@/components/ui";
import { formatMoney, settlementsApi, type SettlementDetail } from "@/lib/api/settlements";

/**
 * Правка суммы за месяц. По договору сумма обычно постоянная, но объём услуг
 * меняется — поэтому её можно поправить, пока документы ещё черновики.
 * После сохранения акт и счёт перерисовываются на сервере под новую сумму.
 */
export function AmountEditor({ settlement }: { settlement: SettlementDetail }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(settlement.amount));
  const [error, setError] = useState("");

  const hasIssuedDocs = settlement.documents.some((d) => d.status !== "DRAFT");

  const save = useMutation({
    mutationFn: () => {
      const amount = Number(value.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("Введите сумму числом");
      }
      return settlementsApi.update(settlement.id, { amount });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settlements"] });
      void qc.invalidateQueries({ queryKey: ["settlement", settlement.id] });
      void qc.invalidateQueries({ queryKey: ["documents"] });
      setEditing(false);
      setError("");
    },
    onError: (err) => {
      const msg = err instanceof ApiError || err instanceof Error ? err.message : "Не удалось сохранить";
      setError(Array.isArray(msg) ? String(msg[0]) : msg);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    save.mutate();
  }

  if (!editing) {
    return (
      <div className="text-right">
        <div className="flex items-center justify-end gap-2">
          <p className="text-lg font-semibold text-[var(--color-text-primary)]">
            {formatMoney(settlement.amount, settlement.currency)}
          </p>
          {!hasIssuedDocs && (
            <button
              onClick={() => {
                setValue(String(settlement.amount));
                setEditing(true);
              }}
              title="Изменить сумму за месяц"
              className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-elevated)] transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          {settlement.dueAmount > 0
            ? `не оплачено ${formatMoney(settlement.dueAmount, settlement.currency)}`
            : "оплачено полностью"}
        </p>
        {hasIssuedDocs && (
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
            документы выставлены — сумма зафиксирована
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="text-right">
      <div className="flex items-center justify-end gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setEditing(false);
              setError("");
            }
          }}
          className="w-40 text-right"
        />
        <Button type="submit" size="sm" loading={save.isPending} loadingText="…">
          Сохранить
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setError("");
          }}
        >
          Отмена
        </Button>
      </div>
      <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
        Акт и счёт перерисуются под новую сумму
      </p>
      {error && <p className="text-xs text-[var(--color-danger)] mt-1">{error}</p>}
    </form>
  );
}
