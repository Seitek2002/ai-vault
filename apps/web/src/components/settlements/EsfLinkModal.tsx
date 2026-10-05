"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseMoneyInput } from "@ai-vault/doc-placeholders";
import { Button, Input, Modal, Select, Spinner } from "@/components/ui";
import { contractsApi } from "@/lib/api/contracts";
import { esfApi, type EsfInvoice } from "@/lib/api/esf";
import { MONTH_NAMES, formatMoney, settlementsApi, settlementSetLabel, type Settlement } from "@/lib/api/settlements";
import { contractsForEsf, linkEsfTarget, settlementsForEsf } from "@/lib/esf-link";
import { cn } from "@/lib/cn";

export function EsfLinkModal({ inv, onClose }: { inv: EsfInvoice; onClose: () => void }) {
  const qc = useQueryClient();
  const date = new Date(inv.deliveryDate ?? inv.issuedOn ?? inv.importedAt);
  const [search, setSearch] = useState("");
  const [contractChoice, setContractChoice] = useState<string | null>(null);
  const [year, setYear] = useState(String(date.getUTCFullYear()));
  const [month, setMonth] = useState(String(date.getUTCMonth() + 1));
  const [setChoice, setSetChoice] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Settlement | null>(null);
  const contractsQuery = useQuery({ queryKey: ["contracts"], queryFn: () => contractsApi.list() });
  const contracts = contractsQuery.data ?? [];
  const ownContracts = contracts.filter((c) => c.counterpartyId === inv.counterpartyId);
  const contractId = contractChoice ?? (ownContracts.length === 1 ? ownContracts[0]?.id ?? "" : "");
  const contract = contracts.find((c) => c.id === contractId);
  const setsQuery = useQuery({
    queryKey: ["settlements", "by-counterparty", contract?.counterpartyId],
    queryFn: () => settlementsApi.byCounterparty(contract!.counterpartyId), enabled: !!contract,
  });
  const invoicesQuery = useQuery({ queryKey: ["esf", "link-targets"], queryFn: () => esfApi.list() });
  const taken = new Map((invoicesQuery.data ?? []).filter((i) => i.id !== inv.id && i.settlementId)
    .map((i) => [i.settlementId, i.number ?? "без номера"]));
  const sets = settlementsForEsf(setsQuery.data ?? [], contractId, Number(year), Number(month));
  if (created && created.contractId === contractId && created.year === Number(year) && created.month === Number(month)
    && !sets.some((s) => s.id === created.id)) sets.push(created);
  const available = sets.filter((s) => !taken.has(s.id));
  const matching = available.filter((s) => Math.abs(s.amount - inv.amount) < 0.01);
  const suggested = matching.length === 1 ? matching[0]?.id ?? "" : available.length === 1 ? available[0]?.id ?? "" : "";
  const selected = setChoice ?? (sets.length === 0 ? "new" : suggested);
  const selectedSet = sets.find((s) => s.id === selected);
  const amountValue = amount ?? String(contract?.defaultAmount ?? inv.amount);
  const loading = contractsQuery.isLoading || setsQuery.isLoading || invoicesQuery.isLoading;
  const loadError = contractsQuery.isError || setsQuery.isError || invoicesQuery.isError;
  const resetChoice = () => { setSetChoice(null); setError(""); };
  const link = useMutation({
    mutationFn: (target: Parameters<typeof linkEsfTarget>[1]) => linkEsfTarget(inv.id, target, {
      create: settlementsApi.create, attach: esfApi.attach,
      onCreated: (settlement) => {
        setCreated(settlement);
        setSetChoice(settlement.id);
        qc.setQueryData(["settlements", "by-counterparty", settlement.counterpartyId], (old: Settlement[] = []) =>
          [...old.filter((s) => s.id !== settlement.id), settlement]);
      },
    }),
    onSuccess: () => onClose(),
    onError: (err) => setError(err instanceof Error ? err.message : "Не удалось привязать ЭСФ. Попробуйте снова."),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["esf"] });
      void qc.invalidateQueries({ queryKey: ["settlements"] });
      void qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (link.isPending || loading || loadError || !contract) return;
    const y = Number(year), m = Number(month);
    if (!Number.isInteger(y) || y < 2000 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12) {
      setError("Выберите месяц и год от 2000 до 2100."); return;
    }
    if (selected === "new") {
      const parsed = parseMoneyInput(amountValue);
      if (parsed === null) { setError("Введите сумму расчёта, не более двух знаков после запятой."); return; }
      setError("");
      link.mutate({ create: { contractId, year: y, month: m, amount: parsed } });
    } else if (selectedSet && !taken.has(selectedSet.id)) {
      setError(""); link.mutate({ settlementId: selectedSet.id });
    } else setError("Выберите свободный комплект или создайте новый.");
  }

  return (
    <Modal onClose={() => { if (!link.isPending) onClose(); }}>
      <form onSubmit={submit} className="max-h-[85dvh] overflow-y-auto p-5 sm:p-6">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Привязать ЭСФ</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{inv.counterpartyName ?? inv.buyerName}</p>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">№ {inv.number ?? "—"} · {formatMoney(inv.amount)}</p>
        <fieldset disabled={link.isPending} className="mt-5 space-y-4 disabled:opacity-70">
          <div>
            <label htmlFor="esf-contract-search" className="text-sm text-[var(--color-text-secondary)]">Компания и договор · все {contracts.length}</label>
            <Input id="esf-contract-search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по компании, номеру или названию договора" className="mt-1.5" />
            <div role="radiogroup" aria-label="Компания и договор" className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-[var(--color-border)]">
              {contractsForEsf(contracts, inv.counterpartyId, search).map((c) => (
                <label key={c.id} className={cn("flex cursor-pointer items-start gap-3 px-3 py-2.5 border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-bg-elevated)]",
                  contractId === c.id && "bg-[var(--color-bg-elevated)]")}>
                  <input type="radio" name="esf-contract" value={c.id} checked={contractId === c.id}
                    onChange={() => { setContractChoice(c.id); setAmount(null); resetChoice(); }} className="mt-1 accent-[var(--color-accent)]" />
                  <span className="min-w-0 text-sm text-[var(--color-text-primary)] break-words">
                    {c.counterpartyName}
                    <span className="block text-sm text-[var(--color-text-secondary)]">№ {c.number} · {c.title}{!c.active ? " · неактивен" : ""}</span>
                  </span>
                </label>
              ))}
              {!contractsQuery.isLoading && contractsForEsf(contracts, inv.counterpartyId, search).length === 0 && (
                <p className="p-3 text-sm text-[var(--color-text-secondary)]">{contracts.length ? "По этому запросу договоров нет. Измените поиск." : "Сначала добавьте договор в разделе «Договоры»."}</p>
              )}
            </div>
            {contract && <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Выбран: {contract.counterpartyName} · № {contract.number} · {contract.title}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span id="esf-month-label" className="text-sm text-[var(--color-text-secondary)]">Месяц расчёта</span>
              <div className="mt-1.5"><Select value={month} onChange={(v) => { setMonth(v); resetChoice(); }} title="Месяц расчёта"
                options={MONTH_NAMES.map((label, i) => ({ value: String(i + 1), label }))} /></div>
            </div>
            <label className="text-sm text-[var(--color-text-secondary)]">Год расчёта
              <Input type="number" min={2000} max={2100} step={1} required value={year}
                onChange={(e) => { setYear(e.target.value); resetChoice(); }} className="mt-1.5" />
            </label>
          </div>
          {contract && !loading && !loadError && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium text-[var(--color-text-primary)]">{MONTH_NAMES[Number(month) - 1]} {year} · комплекты</legend>
              {sets.map((s) => (
                <label key={s.id} className={cn("flex items-start gap-3 text-sm", taken.has(s.id) ? "text-[var(--color-text-muted)]" : "cursor-pointer text-[var(--color-text-primary)]")}>
                  <input type="radio" name="esf-set" checked={selected === s.id} disabled={taken.has(s.id)}
                    onChange={() => { setSetChoice(s.id); setError(""); }} className="mt-1 accent-[var(--color-accent)]" />
                  <span>{settlementSetLabel(s)} · {formatMoney(s.amount, s.currency)}
                    {taken.has(s.id) && <span className="block">Привязана ЭСФ № {taken.get(s.id)}</span>}
                  </span>
                </label>
              ))}
              <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--color-text-primary)]">
                <input type="radio" name="esf-set" checked={selected === "new"} onChange={() => { setSetChoice("new"); setError(""); }} className="mt-1 accent-[var(--color-accent)]" />
                <span>{sets.length ? "Создать дополнительный комплект" : "Создать расчёт за выбранный месяц"}</span>
              </label>
              {sets.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">За этот месяц расчёт ещё не создан. Он появится при нажатии кнопки ниже.</p>}
              {selected === "new" && (
                <label className="block pt-1 text-sm text-[var(--color-text-secondary)]">Сумма нового расчёта, {contract.currency === "KGS" ? "сом" : contract.currency}
                  <Input value={amountValue} inputMode="decimal" required onChange={(e) => { setAmount(e.target.value); setError(""); }} className="mt-1.5" />
                </label>
              )}
            </fieldset>
          )}
        </fieldset>
        {loading && <div className="flex items-center gap-2 py-3 text-sm text-[var(--color-text-secondary)]"><Spinner />Загружаю договоры и расчёты…</div>}
        {loadError && <div role="alert" className="mt-3 text-sm text-[var(--color-danger)]">Не удалось загрузить данные.
          <Button type="button" variant="ghost" onClick={() => { void contractsQuery.refetch(); void setsQuery.refetch(); void invoicesQuery.refetch(); }}>Повторить</Button>
        </div>}
        {error && <p role="alert" className="mt-3 text-sm text-[var(--color-danger)]">{error}{created && " Расчёт уже создан; повторная попытка привяжет ЭСФ к нему."}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" disabled={link.isPending} onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={link.isPending} loadingText="Привязываю…"
            disabled={!contract || !selected || loading || loadError || (selected !== "new" && (!selectedSet || taken.has(selected)))}>
            {selected === "new" ? "Создать расчёт и привязать" : "Привязать"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
