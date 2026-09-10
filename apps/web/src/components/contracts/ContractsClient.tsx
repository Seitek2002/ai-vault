"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { contractsApi, type Contract, type ContractFormData } from "@/lib/api/contracts";
import { counterpartiesApi } from "@/lib/api/counterparties";
import { formatMoney } from "@/lib/api/settlements";
import { Button, Card, EmptyState, Input, Modal, PageHeader, Select, Spinner } from "@/components/ui";

const labelClass = "block text-xs text-[var(--color-text-secondary)] mb-1";
const hintClass = "block mt-1 text-[11px] text-[var(--color-text-muted)]";

const EMPTY: ContractFormData = {
  counterpartyId: "",
  title: "Абонентское обслуживание",
  defaultAmount: 0,
  vatRate: 12,
  currency: "KGS",
  billingDay: 1,
  paymentDueDays: 10,
  esfRequired: true,
  active: true,
};

function toForm(c: Contract): ContractFormData {
  return {
    counterpartyId: c.counterpartyId,
    title: c.title,
    defaultAmount: c.defaultAmount,
    vatRate: c.vatRate,
    currency: c.currency,
    billingDay: c.billingDay,
    paymentDueDays: c.paymentDueDays,
    esfRequired: c.esfRequired,
    active: c.active,
    ...(c.startDate ? { startDate: c.startDate.slice(0, 10) } : {}),
    ...(c.endDate ? { endDate: c.endDate.slice(0, 10) } : {}),
  };
}

function ContractModal({ editing, onClose }: { editing: Contract | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ContractFormData>(editing ? toForm(editing) : EMPTY);
  const [error, setError] = useState("");

  const { data: counterparties } = useQuery({
    queryKey: ["companies"],
    queryFn: () => counterpartiesApi.list(),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payload: ContractFormData = {
        ...form,
        defaultAmount: Number(String(form.defaultAmount).replace(",", ".")),
        ...(form.startDate ? { startDate: new Date(form.startDate).toISOString() } : {}),
        ...(form.endDate ? { endDate: new Date(form.endDate).toISOString() } : {}),
      };
      return editing ? contractsApi.update(editing.id, payload) : contractsApi.create(payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contracts"] });
      onClose();
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "Не удалось сохранить";
      setError(Array.isArray(msg) ? String(msg[0]) : msg);
    },
  });

  function set<K extends keyof ContractFormData>(key: K, value: ContractFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.counterpartyId) {
      setError("Выберите партнёра");
      return;
    }
    mutation.mutate();
  }

  return (
    <Modal onClose={onClose} size="lg">
      <form onSubmit={onSubmit} className="p-5 max-h-[80vh] overflow-y-auto">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
          {editing ? "Договор" : "Новый договор"}
        </h3>

        <label className="block mb-3">
          <span className={labelClass}>Партнёр</span>
          <Select
            value={form.counterpartyId}
            onChange={(value) => set("counterpartyId", value)}
            options={[
              { value: "", label: "— выберите —" },
              ...(counterparties ?? []).map((cp) => ({ value: cp.id, label: cp.name })),
            ]}
          />
          <span className={hintClass}>
            Нет нужного?{" "}
            <Link href="/companies" className="text-[var(--color-accent)] hover:underline">
              Добавьте компанию
            </Link>
          </span>
        </label>

        <label className="block mb-3">
          <span className={labelClass}>Название</span>
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
        </label>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="block">
            <span className={labelClass}>Сумма в месяц</span>
            <Input
              value={String(form.defaultAmount)}
              onChange={(e) => set("defaultAmount", e.target.value as unknown as number)}
              inputMode="decimal"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Ставка НДС, %</span>
            <Input
              type="number"
              value={form.vatRate ?? 12}
              onChange={(e) => set("vatRate", Number(e.target.value))}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="block">
            <span className={labelClass}>День выставления</span>
            <Input
              type="number"
              min={1}
              max={28}
              value={form.billingDay ?? 1}
              onChange={(e) => set("billingDay", Number(e.target.value))}
            />
            <span className={hintClass}>Когда создавать расчёт за месяц</span>
          </label>
          <label className="block">
            <span className={labelClass}>Срок оплаты, дней</span>
            <Input
              type="number"
              min={0}
              max={180}
              value={form.paymentDueDays ?? 10}
              onChange={(e) => set("paymentDueDays", Number(e.target.value))}
            />
            <span className={hintClass}>От конца расчётного месяца</span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="block">
            <span className={labelClass}>Начало</span>
            <Input
              type="date"
              value={form.startDate ?? ""}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Окончание</span>
            <Input
              type="date"
              value={form.endDate ?? ""}
              onChange={(e) => set("endDate", e.target.value)}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 mb-1 cursor-pointer">
          <input
            type="checkbox"
            checked={form.esfRequired ?? true}
            onChange={(e) => set("esfRequired", e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          <span className="text-sm text-[var(--color-text-primary)]">Партнёр требует ЭСФ</span>
        </label>
        <p className="text-[11px] text-[var(--color-text-muted)] mb-3 pl-6">
          Если снять — шаг «Выставить ЭСФ» не создаётся
        </p>

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={form.active ?? true}
            onChange={(e) => set("active", e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          <span className="text-sm text-[var(--color-text-primary)]">
            Активен — участвует в формировании месяца
          </span>
        </label>

        {error && <p className="text-xs text-[var(--color-danger)] mb-2">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={mutation.isPending} loadingText="Сохраняю…">
            Сохранить
          </Button>
        </div>
      </form>
    </Modal>
  );
}

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
          description="Договор задаёт, сколько и когда выставлять партнёру каждый месяц"
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
                        неактивен
                      </span>
                    )}
                    {!c.esfRequired && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] shrink-0">
                        без ЭСФ
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] truncate">
                    {c.title} · выставление {c.billingDay}-го · оплата +{c.paymentDueDays} дн.
                  </p>
                </div>

                <span className="text-sm text-[var(--color-text-primary)] whitespace-nowrap shrink-0">
                  {formatMoney(c.defaultAmount, c.currency)}
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
