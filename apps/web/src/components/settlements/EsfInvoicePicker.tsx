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
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
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
            <span className="block text-sm font-medium tabular-nums">№ {selected.number ?? selected.uuid} · {formatMoney(selected.amount, currency)}</span>
            <span className="mt-0.5 block text-xs text-[var(--color-text-secondary)]">{selected.note?.trim() || `${dateLabel(selected.deliveryDate)} · ${ESF_STATUS_LABELS[selected.status]}`}</span>
          </> : "Выберите ЭСФ"}
        </span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && <div id={`${id}-options`} className="mt-2 overflow-hidden rounded-lg border border-[var(--color-border)]"
        onKeyDownCapture={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
        }}>
        <div className="border-b border-[var(--color-border)] px-3 py-2">
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-secondary)]" />
            <Input type="search" aria-label="Поиск ЭСФ по номеру, периоду или примечанию" placeholder="Номер, период или примечание"
              value={search} disabled={disabled} onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
              className="min-h-10 py-1.5 pl-9 text-base sm:min-h-9 sm:text-sm placeholder:text-[var(--color-text-secondary)]" />
          </div>
          <p role="status" className="mt-1 text-xs text-[var(--color-text-secondary)]">{query ? `Найдено: ${filtered.length} из ${invoices.length}` : `Доступно ЭСФ: ${invoices.length}`}</p>
        </div>
        <fieldset disabled={disabled} className="max-h-80 min-w-0 overflow-y-auto overscroll-contain">
          <legend className="sr-only">Выберите ЭСФ для расчёта</legend>
          {filtered.length === 0 ? <p className="p-4 text-sm text-[var(--color-text-secondary)]">
            {query ? "ЭСФ не найдены. Измените запрос или очистите поиск." : "Нет доступных ЭСФ этого партнёра."}
          </p> : filtered.map((invoice) => {
            const periods = linkedPeriods(invoice);
            const contracts = [...new Set((invoice.settlements ?? []).map((s) => `№ ${s.contractNumber} · ${s.contractTitle}`))];
            const expanded = expandedInvoiceId === invoice.id;
            const detailsId = `${id}-details-${invoice.id}`;
            return <div key={invoice.id} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 border-b border-[var(--color-border)] px-3 py-2 last:border-b-0 ${invoice.id === value ? "bg-[var(--color-accent-dim)]" : "hover:bg-[var(--color-bg-elevated)]"}`}>
              <label className="flex min-w-0 cursor-pointer gap-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)]">
                <input type="radio" name={`${id}-invoice`} value={invoice.id} checked={invoice.id === value} onChange={() => choose(invoice.id)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); choose(invoice.id); } }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]" />
                <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 font-medium text-[var(--color-text-primary)]">
                    <span className="tabular-nums">№ {invoice.number ?? invoice.uuid}</span>
                    <span className="whitespace-nowrap tabular-nums">{formatMoney(invoice.amount, currency)}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--color-text-secondary)] tabular-nums">{dateLabel(invoice.deliveryDate)} · {ESF_STATUS_LABELS[invoice.status]}{periods.length > 0 && ` · Привязана: ${periods.join(", ")}`}</span>
                  {invoice.note?.trim() && <span title={invoice.note.trim()} className="mt-0.5 block truncate text-xs text-[var(--color-text-secondary)]">{invoice.note.trim()}</span>}
                </span>
              </label>
              <div className="flex items-start gap-0.5">
                <a href={esfApi.portalPdfUrl(invoice.uuid)} target="_blank" rel="noopener noreferrer"
                  aria-label={`Открыть PDF ЭСФ № ${invoice.number ?? invoice.uuid}`}
                  className="inline-flex min-h-10 items-center gap-1 px-1 text-xs text-[var(--color-accent)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] sm:min-h-7">
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />PDF
                </a>
                <button type="button" disabled={disabled} aria-label={`Подробности ЭСФ № ${invoice.number ?? invoice.uuid}`}
                  aria-expanded={expanded} aria-controls={detailsId}
                  onClick={() => setExpandedInvoiceId(expanded ? null : invoice.id)}
                  className="inline-flex h-10 w-8 items-center justify-center rounded text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50 sm:h-7 sm:w-7">
                  <ChevronDown aria-hidden="true" className={`h-4 w-4 ${expanded ? "rotate-180" : ""}`} />
                </button>
              </div>
              <div id={detailsId} hidden={!expanded} className="col-span-2 mt-2 space-y-1 border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">
                {invoice.note?.trim() && <p>{invoice.note.trim()}</p>}
                <p>Поставка: {dateLabel(invoice.deliveryDate)}</p>
                {invoice.crmRef && <p>Учётный №: {invoice.crmRef}</p>}
                {contracts.length > 0 && <p>Договор: {contracts.join("; ")}</p>}
                <p>ID ЭСФ: {invoice.uuid}</p>
              </div>
            </div>;
          })}
        </fieldset>
      </div>}
    </div>
  );
}
