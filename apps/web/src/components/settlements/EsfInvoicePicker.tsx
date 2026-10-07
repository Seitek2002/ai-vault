"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Search } from "lucide-react";
import { Input } from "@/components/ui";
import { fieldClassName } from "@/components/ui/Input";
import { esfApi, ESF_STATUS_LABELS, type EsfInvoice } from "@/lib/api/esf";
import { formatMoney, MONTH_NAMES } from "@/lib/api/settlements";

interface Props {
  invoices: EsfInvoice[];
  value: string;
  currency: string;
  disabled: boolean;
  loading: boolean;
  onChange: (id: string) => void;
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC" });
const dateLabel = (date: string | null) => date ? dateFormat.format(new Date(date)) : "не указана";
const linkedPeriods = (invoice: EsfInvoice) => [...new Set((invoice.settlements ?? [])
  .map((s) => `${MONTH_NAMES[s.month - 1]} ${s.year}`))];

function searchableText(invoice: EsfInvoice): string {
  return [invoice.number, invoice.uuid, invoice.note, invoice.crmRef, invoice.amount,
    ESF_STATUS_LABELS[invoice.status], ...linkedPeriods(invoice),
    ...(invoice.settlements ?? []).map((s) => `${s.contractNumber} ${s.contractTitle}`)]
    .join(" ").toLocaleLowerCase("ru-RU");
}

export function EsfInvoicePicker({ invoices, value, currency, disabled, loading, onChange }: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = invoices.find((invoice) => invoice.id === value);
  const query = search.trim().toLocaleLowerCase("ru-RU");
  const filtered = invoices.filter((invoice) => searchableText(invoice).includes(query));

  function choose(invoiceId: string) {
    onChange(invoiceId);
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div>
      <p id={`${id}-label`} className="mb-1 text-sm text-[var(--color-text-secondary)]">ЭСФ партнёра из кабинета</p>
      <button ref={trigger} type="button" disabled={disabled} aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={open} aria-controls={`${id}-options`}
        onClick={() => { setOpen(!open); setSearch(""); }}
        className={`${fieldClassName} flex min-h-11 items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50`}>
        <span id={`${id}-value`} className="min-w-0 [overflow-wrap:anywhere]">
          {loading ? "Загружаю ЭСФ…" : selected ? <>
            <span className="block font-medium">{selected.note?.trim() || `ЭСФ № ${selected.number ?? "без номера"}`}</span>
            <span className="mt-1 block text-xs text-[var(--color-text-secondary)] tabular-nums">№ {selected.number ?? selected.uuid} · {formatMoney(selected.amount, currency)}</span>
          </> : "Выберите ЭСФ"}
        </span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && <div id={`${id}-options`} className="mt-2 overflow-hidden rounded-lg border border-[var(--color-border)]"
        onKeyDownCapture={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
        }}>
        <div className="border-b border-[var(--color-border)] p-3">
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-secondary)]" />
            <Input type="search" aria-label="Поиск ЭСФ по номеру, периоду или примечанию" placeholder="Номер, период или примечание"
              value={search} disabled={disabled} onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
              className="min-h-11 pl-9 text-base sm:text-sm placeholder:text-[var(--color-text-secondary)]" />
          </div>
          <p role="status" className="mt-2 text-xs text-[var(--color-text-secondary)]">{query ? `Найдено: ${filtered.length} из ${invoices.length}` : `Доступно ЭСФ: ${invoices.length}`}</p>
        </div>
        <fieldset disabled={disabled} className="max-h-80 min-w-0 overflow-y-auto overscroll-contain">
          <legend className="sr-only">Выберите ЭСФ для расчёта</legend>
          {filtered.length === 0 ? <p className="p-4 text-sm text-[var(--color-text-secondary)]">
            {query ? "ЭСФ не найдены. Измените запрос или очистите поиск." : "Нет доступных ЭСФ этого партнёра."}
          </p> : filtered.map((invoice) => {
            const periods = linkedPeriods(invoice);
            const contracts = [...new Set((invoice.settlements ?? []).map((s) => `№ ${s.contractNumber} · ${s.contractTitle}`))];
            return <div key={invoice.id} className={`border-b border-[var(--color-border)] last:border-b-0 ${invoice.id === value ? "bg-[var(--color-accent-dim)]" : "hover:bg-[var(--color-bg-elevated)]"}`}>
              <label className="flex cursor-pointer gap-3 p-3 pb-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)]">
                <input type="radio" name={`${id}-invoice`} value={invoice.id} checked={invoice.id === value} onChange={() => choose(invoice.id)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); choose(invoice.id); } }}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]" />
                <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
                  <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-base font-semibold text-[var(--color-text-primary)]">
                    <span>{invoice.note?.trim() || "Примечание не указано"}</span>
                    <span className="tabular-nums">{formatMoney(invoice.amount, currency)}</span>
                  </span>
                  <span className="mt-1 block text-[var(--color-text-primary)] tabular-nums">№ {invoice.number ?? invoice.uuid}</span>
                  <span className="mt-1 block text-[var(--color-text-secondary)] tabular-nums">Поставка: {dateLabel(invoice.deliveryDate)} · {ESF_STATUS_LABELS[invoice.status]}</span>
                  {invoice.crmRef && <span className="mt-1 block text-[var(--color-text-secondary)]">Учётный №: {invoice.crmRef}</span>}
                  {periods.length > 0 && <span className="mt-1 block text-[var(--color-text-secondary)]">Уже привязана: {periods.join(", ")}</span>}
                  {contracts.length > 0 && <span className="mt-1 block text-[var(--color-text-secondary)]">Договор: {contracts.join("; ")}</span>}
                </span>
              </label>
              <div className="flex justify-end px-3 pb-2">
                <a href={esfApi.portalPdfUrl(invoice.uuid)} target="_blank" rel="noopener noreferrer"
                  aria-label={`Открыть PDF ЭСФ № ${invoice.number ?? invoice.uuid}`}
                  className="inline-flex min-h-10 items-center gap-1.5 text-sm text-[var(--color-accent)] underline-offset-4 hover:underline">
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />Открыть PDF
                </a>
              </div>
            </div>;
          })}
        </fieldset>
      </div>}
    </div>
  );
}
