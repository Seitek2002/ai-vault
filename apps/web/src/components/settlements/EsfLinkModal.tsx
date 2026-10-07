"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { esfInvoicesQuery } from "@/lib/queries/esf";
import { X } from "lucide-react";
import { parseMoneyInput } from "@ai-vault/doc-placeholders";
import { Button, Input, Modal, Spinner } from "@/components/ui";
import { contractsApi } from "@/lib/api/contracts";
import { esfApi, esfSettlementIds, type EsfInvoice, type EsfSettlement } from "@/lib/api/esf";
import { MONTH_NAMES, formatMoney, settlementsApi, settlementSetLabel, type Settlement } from "@/lib/api/settlements";
import { contractsForEsf, linkEsfTargets, settlementsForEsf } from "@/lib/esf-link";
import { cn } from "@/lib/cn";

type Choice = EsfSettlement & { key: string; create?: boolean; amountInput?: string };
const period = (s: { year: number; month: number }) => `${MONTH_NAMES[s.month - 1]} ${s.year}`;

export function EsfLinkModal({ inv, onClose }: { inv: EsfInvoice; onClose: () => void }) {
  const qc = useQueryClient();
  const date = new Date(inv.deliveryDate ?? inv.issuedOn ?? inv.importedAt);
  const [search, setSearch] = useState("");
  const [contractChoice, setContractChoice] = useState<string | null>(inv.settlements?.[0]?.contractId ?? null);
  const [year, setYear] = useState(String(inv.settlements?.[0]?.year ?? date.getUTCFullYear()));
  const [chosen, setChosen] = useState<Choice[]>(() => (inv.settlements ?? []).map((s) => ({ ...s, key: s.id })));
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const contractsQuery = useQuery({ queryKey: ["contracts"], queryFn: () => contractsApi.list() });
  const contracts = contractsQuery.data ?? [];
  const ownContracts = contracts.filter((c) => c.counterpartyId === inv.counterpartyId);
  const contractId = contractChoice ?? (ownContracts.length === 1 ? ownContracts[0]?.id ?? "" : "");
  const contract = contracts.find((c) => c.id === contractId);
  const setsQuery = useQuery({
    queryKey: ["settlements", "by-counterparty", contract?.counterpartyId],
    queryFn: () => settlementsApi.byCounterparty(contract!.counterpartyId), enabled: !!contract,
  });
  const invoicesQuery = useQuery(esfInvoicesQuery);
  const taken = new Map((invoicesQuery.data ?? []).filter((i) => i.id !== inv.id)
    .flatMap((i) => esfSettlementIds(i).map((id) => [id, i.number ?? "без номера"] as const)));
  const loading = contractsQuery.isPending || (!!contract && setsQuery.isPending) || invoicesQuery.isPending;
  const loadError = contractsQuery.isError || (!!contract && setsQuery.isError) || invoicesQuery.isError;
  const validYear = Number.isInteger(Number(year)) && Number(year) >= 2000 && Number(year) <= 2100;
  const invalidAmount = chosen.some((s) => s.create && parseMoneyInput(s.amountInput ?? "") === null);
  const total = Math.round(chosen.reduce((sum, s) => sum + (s.create ? parseMoneyInput(s.amountInput ?? "") ?? 0 : s.amount), 0) * 100) / 100;
  const difference = Math.round((total - inv.amount) * 100) / 100;
  const mismatch = Math.abs(difference) >= 0.01;
  const currency = chosen[0]?.currency ?? contract?.currency ?? "KGS";
  const wasLinked = esfSettlementIds(inv).length > 0;
  const clearError = () => { setError(""); setAcknowledged(false); };
  const remove = (key: string) => { setChosen((old) => old.filter((s) => s.key !== key)); clearError(); };
  const link = useMutation({
    mutationFn: async (selection: Choice[]) => {
      if (!selection.length) return esfApi.detach(inv.id);
      return linkEsfTargets(inv.id, selection.map((s) => s.create ? {
        key: s.key, create: { contractId: s.contractId, year: s.year, month: s.month, amount: parseMoneyInput(s.amountInput!)! },
      } : { key: s.key, settlementId: s.id }), {
        create: settlementsApi.create, attach: esfApi.attachMany,
        onCreated: (key, settlement) => {
          setChosen((old) => old.map((s) => s.key === key ? { ...s, id: settlement.id, key: settlement.id, create: false, amount: settlement.amount, sequence: settlement.sequence } : s));
          qc.setQueryData(["settlements", "by-counterparty", settlement.counterpartyId], (old: Settlement[] = []) =>
            [...old.filter((s) => s.id !== settlement.id), settlement]);
        },
      });
    },
    onSuccess: () => onClose(),
    onError: (err) => setError(err instanceof Error ? err.message : "Не удалось сохранить привязку. Попробуйте снова."),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["esf"] });
      void qc.invalidateQueries({ queryKey: ["settlements"] });
      void qc.invalidateQueries({ queryKey: ["settlement"] });
      void qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  function toggle(choice: Choice) {
    setChosen((old) => old.some((s) => s.key === choice.key) ? old.filter((s) => s.key !== choice.key) : [...old, choice]);
    clearError();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (link.isPending || loading || loadError) return;
    if (!chosen.length && !wasLinked) { setError("Выберите хотя бы один месяц."); return; }
    if (invalidAmount) { setError("Проверьте суммы новых расчётов: не более двух знаков после запятой."); return; }
    if (chosen.some((s) => taken.has(s.id))) { setError("Один из расчётов уже занят другой ЭСФ. Уберите его из выбранных."); return; }
    if (chosen.length && mismatch && !acknowledged) { setError("Подтвердите привязку с разницей в суммах."); return; }
    setError(""); link.mutate(chosen);
  }

  return (
    <Modal className="max-w-3xl" onClose={() => { if (!link.isPending) onClose(); }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="esf-link-title" className="flex max-h-[90dvh] flex-col">
        <div className="shrink-0 border-b border-[var(--color-border)] px-5 py-4 sm:px-6">
          <h2 id="esf-link-title" className="text-base font-semibold text-[var(--color-text-primary)]">Месяцы одной ЭСФ</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)] break-words">{inv.counterpartyName ?? inv.buyerName}</p>
          <p className="mt-1 text-sm text-[var(--color-text-primary)] break-words">№ {inv.number ?? "—"} · {formatMoney(inv.amount)}</p>
          {inv.note && <p className="mt-1 text-sm text-[var(--color-text-secondary)] break-words">В ЭСФ: {inv.note}</p>}
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4 sm:px-6">
          <fieldset disabled={link.isPending} className="space-y-4 disabled:opacity-70">
            <div>
              <label htmlFor="esf-contract-search" className="text-sm text-[var(--color-text-secondary)]">Компания и договор · все {contracts.length}</label>
              <Input id="esf-contract-search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по компании, номеру или названию договора" className="mt-1.5" />
              <div role="radiogroup" aria-label="Компания и договор" className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-[var(--color-border)]">
                {contractsForEsf(contracts, inv.counterpartyId, search).map((c) => {
                  const currencyConflict = chosen.length > 0 && c.counterpartyId === chosen[0]?.counterpartyId && c.currency !== currency;
                  return (
                    <label key={c.id} className={cn("flex items-start gap-3 border-b border-[var(--color-border)] px-3 py-2.5 last:border-b-0",
                      currencyConflict ? "text-[var(--color-text-muted)]" : "cursor-pointer hover:bg-[var(--color-bg-elevated)]", contractId === c.id && "bg-[var(--color-bg-elevated)]")}>
                      <input type="radio" name="esf-contract" value={c.id} checked={contractId === c.id} disabled={currencyConflict}
                        onChange={() => { if (chosen.some((s) => s.counterpartyId !== c.counterpartyId)) setChosen([]); setContractChoice(c.id); clearError(); }} className="mt-1 accent-[var(--color-accent)]" />
                      <span className="min-w-0 break-words text-sm text-[var(--color-text-primary)]">{c.counterpartyName}
                        <span className="block text-[var(--color-text-secondary)]">№ {c.number} · {c.title}{!c.active ? " · неактивен" : ""}{currencyConflict ? " · другая валюта" : ""}</span>
                      </span>
                    </label>
                  );
                })}
                {!contractsQuery.isPending && contractsForEsf(contracts, inv.counterpartyId, search).length === 0 && <p className="p-3 text-sm text-[var(--color-text-secondary)]">{contracts.length ? "Договоров по этому запросу нет." : "Сначала добавьте договор в разделе «Договоры»."}</p>}
              </div>
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Можно выбрать разные договоры одной компании. При смене компании выбор месяцев очищается.</p>
            </div>
            {chosen.length > 0 && (
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">Выбрано расчётов: {chosen.length}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...chosen].sort((a, b) => a.year - b.year || a.month - b.month || a.sequence - b.sequence).map((s) => (
                    <span key={s.key} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-primary)]">
                      <span className="min-w-0 break-words">{period(s)} · № {s.contractNumber}{s.create ? " · новый" : ` · комплект ${s.sequence}`}</span>
                      <button type="button" onClick={() => remove(s.key)} aria-label={`Убрать ${period(s)}, договор ${s.contractNumber}, ${s.create ? "новый расчёт" : `комплект ${s.sequence}`}`} className="shrink-0 rounded p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-danger)]"><X className="h-3.5 w-3.5" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {contract && <div>
              <div className="flex items-center justify-between gap-4">
                <p className="min-w-0 text-sm font-medium text-[var(--color-text-primary)] break-words">№ {contract.number} · {contract.title}</p>
                <label className="w-24 shrink-0 text-xs text-[var(--color-text-secondary)]">Год расчёта
                  <Input type="number" min={2000} max={2100} step={1} value={year} onChange={(e) => { setYear(e.target.value); setError(""); }} className="mt-1" />
                </label>
              </div>
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Отметьте месяцы. Новые расчёты будут созданы при сохранении.</p>
              {!validYear && <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">Введите год от 2000 до 2100.</p>}
              {!loading && !loadError && validYear && <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {MONTH_NAMES.map((name, i) => {
                  const m = i + 1;
                  const sets = settlementsForEsf(setsQuery.data ?? [], contractId, Number(year), m);
                  const newKey = `new:${contractId}:${year}:${m}`;
                  const newChoice = chosen.find((s) => s.key === newKey);
                  return <fieldset key={m} className={cn("min-w-0 rounded-lg border p-3", chosen.some((s) => s.contractId === contractId && s.year === Number(year) && s.month === m) ? "border-[var(--color-accent)]" : "border-[var(--color-border)]")}>
                    <legend className="px-1 text-sm font-medium text-[var(--color-text-primary)]">{name}</legend>
                    <div className="space-y-2">
                      {sets.map((s) => <label key={s.id} className={cn("flex items-start gap-2 text-xs", taken.has(s.id) ? "text-[var(--color-text-muted)]" : "cursor-pointer text-[var(--color-text-primary)]")}>
                        <input type="checkbox" checked={chosen.some((c) => c.id === s.id)} disabled={taken.has(s.id)} onChange={() => toggle({ ...s, contractNumber: contract.number, key: s.id })} className="mt-0.5 accent-[var(--color-accent)]" />
                        <span className="min-w-0 break-words">{settlementSetLabel(s)} · {formatMoney(s.amount, s.currency)}{taken.has(s.id) && <span className="block">ЭСФ № {taken.get(s.id)}</span>}</span>
                      </label>)}
                      <label className="flex cursor-pointer items-start gap-2 text-xs text-[var(--color-text-secondary)]">
                        <input type="checkbox" checked={!!newChoice} onChange={() => toggle({ id: newKey, key: newKey, create: true, contractId, contractNumber: contract.number, contractTitle: contract.title, counterpartyId: contract.counterpartyId, year: Number(year), month: m, sequence: 0, amount: contract.defaultAmount, amountInput: String(contract.defaultAmount), currency: contract.currency })} className="mt-0.5 accent-[var(--color-accent)]" />
                        <span>{sets.length ? "Дополнительный комплект" : `Новый расчёт · ${formatMoney(contract.defaultAmount, contract.currency)}`}</span>
                      </label>
                      {newChoice && <label className="block text-xs text-[var(--color-text-secondary)]">Сумма нового расчёта, {contract.currency === "KGS" ? "сом" : contract.currency}
                        <Input aria-label={`Сумма нового расчёта за ${name} ${year}`} value={newChoice.amountInput ?? ""} inputMode="decimal" required onChange={(e) => { setChosen((old) => old.map((s) => s.key === newKey ? { ...s, amountInput: e.target.value } : s)); clearError(); }} className="mt-1" />
                      </label>}
                    </div>
                  </fieldset>;
                })}
              </div>}
            </div>}
          </fieldset>
          {loading && <div className="flex items-center gap-2 py-3 text-sm text-[var(--color-text-secondary)]"><Spinner />Загружаю договоры и расчёты…</div>}
          {loadError && <div role="alert" className="mt-3 text-sm text-[var(--color-danger)]">Не удалось загрузить данные.
            <Button type="button" variant="ghost" onClick={() => { void contractsQuery.refetch(); void setsQuery.refetch(); void invoicesQuery.refetch(); }}>Повторить</Button>
          </div>}
        </div>
        <div className="shrink-0 space-y-3 border-t border-[var(--color-border)] px-5 py-4 sm:px-6">
          {chosen.length > 0 ? <div aria-live="polite" className="text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-1 text-[var(--color-text-primary)]"><span>Итого по {chosen.length} расчётам</span><strong>{formatMoney(total, currency)}</strong></div>
            {invalidAmount ? <p className="mt-1 text-[var(--color-danger)]">Проверьте суммы новых расчётов.</p> : mismatch ? <>
              <p className="mt-1 text-[var(--color-text-secondary)]">{difference > 0 ? "Расчёты больше ЭСФ" : "ЭСФ больше расчётов"} на {formatMoney(Math.abs(difference), currency)}.</p>
              <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-[var(--color-text-primary)]"><input type="checkbox" checked={acknowledged} disabled={link.isPending} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 accent-[var(--color-accent)]" />Привязать несмотря на разницу в суммах</label>
            </> : <p className="mt-1 text-[var(--color-text-secondary)]">Сумма совпадает с ЭСФ.</p>}
          </div> : <p className="text-sm text-[var(--color-text-secondary)]">{wasLinked ? "Будут убраны все привязки этой ЭСФ." : "Выберите один или несколько месяцев."}</p>}
          {error && <p role="alert" className="text-sm text-[var(--color-danger)]">{error} Уже созданные расчёты сохраняются для повторной попытки.</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" disabled={link.isPending} onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={link.isPending} loadingText="Сохраняю…" disabled={loading || loadError || invalidAmount || (!chosen.length && !wasLinked) || (chosen.length > 0 && mismatch && !acknowledged)}>{!chosen.length && wasLinked ? "Убрать все привязки" : "Сохранить привязку"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
