"use client";

import { useId, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseMoneyInput } from "@ai-vault/doc-placeholders";
import { Pencil } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  formatMoney,
  settlementsApi,
  type Settlement,
  type SettlementDetail,
} from "@/lib/api/settlements";

/**
 * Правка суммы за месяц. По договору сумма обычно постоянная, но объём услуг
 * меняется — поэтому её можно поправить, пока документы ещё черновики.
 * После сохранения акт и счёт перерисовываются на сервере под новую сумму.
 */
export function AmountEditor({
  settlement,
  compact = false,
}: {
  settlement: Settlement & Partial<Pick<SettlementDetail, "documents">>;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const errorId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(settlement.amount));
  const [error, setError] = useState("");

  const hasIssuedDocs = (settlement.documents?.some((d) => d.status !== "DRAFT") ?? false) ||
    settlement.steps.some((step) => step.doneAt && ["ISSUE_ACT", "ISSUE_INVOICE", "ISSUE_ESF"].includes(step.type));

  const save = useMutation({
    mutationFn: (amount: number) => settlementsApi.update(settlement.id, { amount }),
    onSuccess: async (updated) => {
      qc.setQueryData(["settlement", settlement.id], updated);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["settlements"] }),
        qc.invalidateQueries({ queryKey: ["settlement", settlement.id] }),
        qc.invalidateQueries({ queryKey: ["documents"] }),
      ]);
      setEditing(false);
      setError("");
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Не удалось сохранить";
      setError(Array.isArray(msg) ? String(msg[0]) : msg);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return;
    const amount = parseMoneyInput(value);
    if (amount === null) {
      setError("Введите сумму от 0 до 999 999 999 999,99, не более двух знаков после запятой.");
      return;
    }
    setError("");
    save.mutate(amount);
  }

  function cancel() {
    if (save.isPending) return;
    setEditing(false);
    setError("");
  }

  if (!editing) {
    return (
      <div className="text-right">
        <div className="flex items-center justify-end">
          {hasIssuedDocs ? (
            <p
              className={cn(
                "font-semibold tabular-nums text-[var(--color-text-primary)]",
                compact ? "text-sm" : "text-lg",
              )}
            >
              {formatMoney(settlement.amount, settlement.currency)}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => {
                setValue(String(settlement.amount));
                setError("");
                setEditing(true);
              }}
              title="Изменить сумму за месяц"
              aria-label={`Изменить сумму за месяц: ${settlement.counterpartyName}`}
              className="group flex min-h-10 items-center justify-end gap-2 rounded-lg px-2 text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] transition-colors"
            >
              <span
                className={cn(
                  "whitespace-nowrap font-semibold tabular-nums",
                  compact ? "text-sm" : "text-lg",
                )}
              >
                {formatMoney(settlement.amount, settlement.currency)}
              </span>
              <Pencil aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)]" />
            </button>
          )}
        </div>
        {(!compact || (settlement.dueAmount > 0 && settlement.paidAmount > 0)) && (
          <p className="text-xs text-[var(--color-text-muted)] tabular-nums">
            {settlement.dueAmount > 0
              ? `${compact ? "остаток" : "не оплачено"} ${formatMoney(settlement.dueAmount, settlement.currency)}`
              : "оплачено полностью"}
          </p>
        )}
        {hasIssuedDocs && (
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
            документы выставлены — сумма зафиксирована
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={cn("text-right", compact && "ml-auto w-44 py-1")}>
      <div
        className={cn("flex items-center justify-end gap-2", compact ? "flex-col" : "flex-wrap")}
      >
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          inputMode="decimal"
          aria-label={`Сумма за месяц: ${settlement.counterpartyName}`}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          disabled={save.isPending}
          onFocus={(e) => e.target.select()}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className={cn("min-h-10 text-right tabular-nums", compact ? "w-full" : "w-40")}
        />
        <div className="flex items-center justify-end gap-1">
          <Button
            type="submit"
            size="sm"
            className="min-h-10"
            loading={save.isPending}
            loadingText={compact ? "…" : "Сохраняю…"}
          >
            Сохранить
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-10"
            disabled={save.isPending}
            onClick={cancel}
          >
            Отмена
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
        {compact ? "Черновики обновятся" : "Черновики акта и счёта обновятся под новую сумму"}
      </p>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-xs text-[var(--color-danger)] mt-1 max-w-sm break-words"
        >
          {error}
        </p>
      )}
    </form>
  );
}
