"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseMoneyInput } from "@ai-vault/doc-placeholders";
import { Button, Input, Modal, Select, Spinner } from "@/components/ui";
import { contractsApi } from "@/lib/api/contracts";
import {
  MONTH_NAMES, settlementsApi,
  type CreateSettlementDto, type SettlementDetail,
} from "@/lib/api/settlements";

export function AddSettlementModal({
  year, month, contractId = "", onClose, onCreated,
}: {
  year: number;
  month: number;
  contractId?: string;
  onClose: () => void;
  onCreated: (settlement: SettlementDetail) => void;
}) {
  const [selectedId, setSelectedId] = useState(contractId);
  const [amount, setAmount] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const qc = useQueryClient();
  const { data: contracts = [], isLoading, isError } = useQuery({
    queryKey: ["contracts"], queryFn: () => contractsApi.list(),
  });
  const contract = contracts.find((c) => c.id === selectedId);
  const amountValue = amount ?? (contract ? String(contract.defaultAmount) : "");
  const create = useMutation({
    mutationFn: (dto: CreateSettlementDto) => settlementsApi.create(dto),
    onSuccess: async (created) => {
      qc.setQueryData(["settlement", created.id], created);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["settlements"] }),
        qc.invalidateQueries({ queryKey: ["documents"] }),
      ]);
      onCreated(created);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Не удалось добавить акт и счёт"),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending) return;
    const parsed = parseMoneyInput(amountValue);
    if (!contract) { setError("Выберите договор компании."); return; }
    if (parsed === null) { setError("Введите сумму, не более двух знаков после запятой."); return; }
    setError("");
    create.mutate({ contractId: contract.id, year, month, amount: parsed, ...(label.trim() ? { label: label.trim() } : {}) });
  }

  return (
    <Modal onClose={() => { if (!create.isPending) onClose(); }}>
      <form onSubmit={submit} className="max-h-[85dvh] overflow-y-auto p-6">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Добавить акт и счёт</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{MONTH_NAMES[month - 1]} {year}</p>
        <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
          Каждый комплект имеет свою сумму, документы, ЭСФ и оплату. Уже добавленные акты и счета сохранятся.
        </p>
        {isLoading ? <div className="flex justify-center py-8"><Spinner /></div> : isError ? (
          <p role="alert" className="my-6 text-sm text-[var(--color-danger)]">Не удалось загрузить договоры. Закройте форму и попробуйте снова.</p>
        ) : contracts.length === 0 ? (
          <p className="my-6 text-sm text-[var(--color-text-secondary)]">Сначала <Link href="/contracts" className="text-[var(--color-accent)] hover:underline">добавьте договор</Link> компании.</p>
        ) : (
          <div className="mt-5 space-y-4">
            <label className="block text-xs text-[var(--color-text-secondary)]">
              Компания и договор
              <Select value={selectedId} onChange={(id) => { setSelectedId(id); setAmount(null); setError(""); }}
                disabled={create.isPending} placeholder="Выберите договор" className="mt-1.5"
                options={contracts.map((c) => ({ value: c.id, label: `${c.counterpartyName} · № ${c.number} · ${c.title}${c.active ? "" : " · неактивен"}` }))} />
            </label>
            <label className="block text-xs text-[var(--color-text-secondary)]">
              Сумма комплекта{contract ? `, ${contract.currency === "KGS" ? "сом" : contract.currency}` : ""}
              <Input value={amountValue} onChange={(e) => { setAmount(e.target.value); setError(""); }}
                inputMode="decimal" required disabled={!contract || create.isPending} className="mt-1.5" />
            </label>
            <label className="block text-xs text-[var(--color-text-secondary)]">
              Назначение (необязательно)
              <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={200}
                placeholder="Дополнительные работы, второй этап…" disabled={create.isPending} className="mt-1.5" />
            </label>
            <p className="text-xs text-[var(--color-text-secondary)]">Номер комплекта выдаётся автоматически. Скан PDF прикрепляется при выставлении каждого документа.</p>
          </div>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={create.isPending} onClick={onClose}>Отмена</Button>
          <Button type="submit" disabled={!contract || isLoading || isError} loading={create.isPending} loadingText="Добавляю…">Добавить</Button>
        </div>
      </form>
    </Modal>
  );
}
