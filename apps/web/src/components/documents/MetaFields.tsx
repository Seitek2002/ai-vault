"use client";

import { DocumentType } from "@ai-vault/types";
import type { DocumentMeta } from "@ai-vault/types";

interface MetaFieldsProps {
  type: DocumentType;
  meta: Partial<DocumentMeta>;
  onChange: (meta: Partial<DocumentMeta>) => void;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-1.5 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors";

export function MetaFields({ type, meta, onChange }: MetaFieldsProps) {
  const set = (key: string, value: unknown) =>
    onChange({ ...meta, [key]: value } as Partial<DocumentMeta>);

  const m = meta as Record<string, unknown>;

  const numberField = (key: string, label: string, placeholder = "") => (
    <Field label={label}>
      <input
        type="text"
        className={inputCls}
        placeholder={placeholder}
        value={(m[key] as string) ?? ""}
        onChange={(e) => set(key, e.target.value)}
      />
    </Field>
  );

  const dateField = (key: string, label: string) => (
    <Field label={label}>
      <input
        type="date"
        className={inputCls}
        value={(m[key] as string) ?? ""}
        onChange={(e) => set(key, e.target.value)}
      />
    </Field>
  );

  const amountField = (key: string, label: string) => (
    <Field label={label}>
      <div className="relative">
        <input
          type="number"
          min={0}
          step={0.01}
          className={inputCls + " pr-12"}
          placeholder="0.00"
          value={(m[key] as number) ?? ""}
          onChange={(e) => set(key, parseFloat(e.target.value) || 0)}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-muted)]">
          {(m["currency"] as string) ?? "KGS"}
        </span>
      </div>
    </Field>
  );

  const vatField = () => (
    <Field label="Ставка НДС (%)">
      <input
        type="number"
        min={0}
        max={100}
        className={inputCls}
        value={(m["vatRate"] as number) ?? 12}
        onChange={(e) => set("vatRate", parseFloat(e.target.value) || 0)}
      />
    </Field>
  );

  const currencyField = () => (
    <Field label="Валюта">
      <select
        className={inputCls}
        value={(m["currency"] as string) ?? "KGS"}
        onChange={(e) => set("currency", e.target.value)}
      >
        <option value="KGS">KGS — Кыргызский сом</option>
        <option value="USD">USD — Доллар США</option>
        <option value="EUR">EUR — Евро</option>
        <option value="RUB">RUB — Российский рубль</option>
        <option value="KZT">KZT — Казахстанский тенге</option>
      </select>
    </Field>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Common: number */}
      {numberField(
        type === DocumentType.AVR ? "actNumber" :
        type === DocumentType.CONTRACT ? "contractNumber" : "invoiceNumber",
        type === DocumentType.AVR ? "Номер акта" :
        type === DocumentType.CONTRACT ? "Номер договора" : "Номер документа",
        "№ ___",
      )}

      {/* Date field */}
      {type === DocumentType.CONTRACT
        ? dateField("startDate", "Дата начала")
        : dateField(
            type === DocumentType.AVR ? "actDate" : "invoiceDate",
            type === DocumentType.AVR ? "Дата акта" : "Дата документа",
          )}

      {type === DocumentType.CONTRACT && dateField("endDate", "Дата окончания")}
      {type === DocumentType.KP && dateField("validUntil", "Действует до")}

      {/* Currency */}
      {currencyField()}

      {/* VAT */}
      {(type === DocumentType.KP || type === DocumentType.INVOICE_FACTURA) && vatField()}

      {/* Amounts */}
      {amountField("totalAmount", "Сумма")}

      {(type === DocumentType.KP || type === DocumentType.INVOICE_FACTURA) && (
        <Field label="В т.ч. НДС">
          <div className="px-3 py-1.5 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-sm text-[var(--color-text-muted)]">
            {(
              (((m["totalAmount"] as number) ?? 0) * ((m["vatRate"] as number) ?? 12)) /
              (100 + ((m["vatRate"] as number) ?? 12))
            ).toFixed(2)} {(m["currency"] as string) ?? "KGS"}
          </div>
        </Field>
      )}
    </div>
  );
}
