"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { calculateContractEndDate, contractNumberPeriod, formatContractNumber, parseMoneyInput } from "@ai-vault/doc-placeholders";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { contractsApi, type Contract, type ContractFormData, type ContractAttachment } from "@/lib/api/contracts";
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB, openFile, uploadFile } from "@/lib/api/files";
import { counterpartiesApi } from "@/lib/api/counterparties";
import { formatMoney } from "@/lib/api/settlements";
import { Button, Card, EmptyState, Input, Modal, PageHeader, Select, Spinner } from "@/components/ui";

const labelClass = "block text-xs text-[var(--color-text-secondary)] mb-1";
const hintClass = "block mt-1 text-[11px] text-[var(--color-text-muted)]";

function isContractPdf(file: File): boolean {
  return file.size > 0 && (file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name)));
}

function pdfUpload(file: File): File {
  return file.type ? file : new File([file], file.name, { type: "application/pdf" });
}

const EMPTY: ContractFormData = {
  counterpartyId: "",
  number: "",
  title: "Абонентское обслуживание",
  defaultAmount: 0,
  vatRate: 12,
  currency: "KGS",
  billingDay: 1,
  paymentDueDays: 10,
  esfRequired: true,
  active: true,
  termValue: null,
  termUnit: null,
};

function toForm(c: Contract): ContractFormData {
  return {
    contractPdfId: c.contractPdf?.id ?? null,
    ndaPdfId: c.ndaPdf?.id ?? null,
    additionalPdfIds: (c.additionalPdfs ?? []).map((file) => file.id),
    number: c.number,
    counterpartyId: c.counterpartyId,
    title: c.title,
    defaultAmount: c.defaultAmount,
    vatRate: c.vatRate,
    currency: c.currency,
    billingDay: c.billingDay,
    paymentDueDays: c.paymentDueDays,
    esfRequired: c.esfRequired,
    active: c.active,
    ...(c.termValue && c.termUnit ? { termValue: c.termValue, termUnit: c.termUnit } : {}),
    ...(c.startDate ? { startDate: c.startDate.slice(0, 10) } : {}),
    ...(c.endDate ? { endDate: c.endDate.slice(0, 10) } : {}),
  };
}

export function ContractModal({ editing, onClose }: { editing: Contract | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ContractFormData>(editing ? toForm(editing) : EMPTY);
  const [amount, setAmount] = useState(String(editing?.defaultAmount ?? 0));
  const [error, setError] = useState("");
  const [files, setFiles] = useState<Partial<Record<"contractPdfId" | "ndaPdfId", File>>>({});
  const [extraFiles, setExtraFiles] = useState<{ key: string; file: File }[]>([]);
  const [extraAttachments, setExtraAttachments] = useState<ContractAttachment[]>(editing?.additionalPdfs ?? []);
  const [attachments, setAttachments] = useState({
    contractPdfId: editing?.contractPdf ?? null,
    ndaPdfId: editing?.ndaPdf ?? null,
  });

  const termMode = form.termUnit ?? (form.endDate ? "LEGACY" : "NONE");
  const calculatedEndDate = form.termUnit && form.termValue && form.startDate
    ? calculateContractEndDate(form.startDate, form.termValue, form.termUnit)
    : termMode === "LEGACY" ? form.endDate ?? null : null;

  const { data: counterparties } = useQuery({
    queryKey: ["companies"],
    queryFn: () => counterpartiesApi.list(),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const defaultAmount = parseMoneyInput(amount);
      if (defaultAmount === null) throw new Error("Некорректная сумма договора");
      const payload: ContractFormData = {
        ...form,
        defaultAmount,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: calculatedEndDate ? new Date(calculatedEndDate).toISOString() : null,
      };
      for (const key of ["contractPdfId", "ndaPdfId"] as const) {
        const file = files[key];
        if (!file) continue;
        const uploaded = await uploadFile(pdfUpload(file));
        payload[key] = uploaded.id;
        setForm((current) => ({ ...current, [key]: uploaded.id }));
        setAttachments((current) => ({ ...current, [key]: uploaded }));
        setFiles((current) => ({ ...current, [key]: undefined }));
      }
      const additionalPdfIds = [...(form.additionalPdfIds ?? [])];
      for (const pending of extraFiles) {
        const uploaded = await uploadFile(pdfUpload(pending.file));
        additionalPdfIds.push(uploaded.id);
        setForm((current) => ({ ...current, additionalPdfIds: [...additionalPdfIds] }));
        setExtraAttachments((current) => [...current, uploaded]);
        setExtraFiles((current) => current.filter((item) => item.key !== pending.key));
      }
      payload.additionalPdfIds = additionalPdfIds;
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

  async function openAttachment(attachment: ContractAttachment) {
    try {
      await openFile(attachment.id);
    } catch {
      setError("Не удалось открыть файл");
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mutation.isPending) return;
    setError("");
    if (!form.counterpartyId) {
      setError("Выберите партнёра");
      return;
    }
    if (parseMoneyInput(amount) === null) {
      setError("Введите сумму от 0 до 999 999 999 999,99, не более двух знаков после запятой");
      return;
    }
    if (form.termUnit && !form.startDate) {
      setError("Укажите дату подписания договора");
      return;
    }
    if (form.termUnit && !calculatedEndDate) {
      setError("Укажите целый срок от 1 до 1200 месяцев или от 1 до 100 лет");
      return;
    }
    mutation.mutate();
  }

  return (
    <Modal onClose={() => { if (!mutation.isPending) onClose(); }} size="lg">
      <form onSubmit={onSubmit} className="p-5 max-h-[80vh] overflow-y-auto">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
          {editing ? "Договор" : "Новый договор"}
        </h3>

        <fieldset disabled={mutation.isPending}>
        <div className="mb-3">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] gap-3">
            <label className="block min-w-0">
              <span className={labelClass}>Номер договора</span>
              <Input value={form.number ?? ""} maxLength={100}
                placeholder={`Автоматически · /${contractNumberPeriod(form.startDate)}`}
                onChange={(e) => set("number", e.target.value)} />
            </label>
            <label className="block min-w-0">
              <span className={labelClass}>Дата подписания</span>
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="text-sm text-[var(--color-text-secondary)] shrink-0">от</span>
                <Input type="date" aria-label="Дата подписания" className="min-w-0 flex-1"
                  value={form.startDate ?? ""}
                  onChange={(e) => set("startDate", e.target.value)} />
              </span>
            </label>
          </div>
          <span className={hintClass}>{form.number?.trim()
            ? `Номер при сохранении: ${formatContractNumber(form.number, form.startDate)}`
            : "Оставьте пустым для автоматической нумерации или введите свой номер"}. Суффикс /ММГГ — по дате договора, без неё — по дате создания.</span>
        </div>
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
          <span className={labelClass}>Наименование услуги</span>
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
        </label>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="block">
            <span className={labelClass}>Сумма в месяц</span>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              required
              onFocus={(e) => e.target.select()}
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

        <div className="mb-3">
          <div>
            <span className={labelClass}>Срок договора</span>
            <div className="flex gap-2">
              {form.termUnit && (
                <Input type="number" min={1} max={form.termUnit === "YEARS" ? 100 : 1200} step={1}
                  required aria-label="Количество месяцев или лет" className="w-20 shrink-0"
                  value={form.termValue || ""}
                  onChange={(e) => set("termValue", Number(e.target.value))} />
              )}
              <div className="flex-1 min-w-0">
                <Select value={termMode} disabled={mutation.isPending}
                  onChange={(value) => {
                    if (value === "MONTHS" || value === "YEARS") {
                      setForm((current) => ({ ...current, termUnit: value, termValue: current.termValue || 1, endDate: null }));
                    } else if (value === "LEGACY") {
                      setForm((current) => {
                        const updated = { ...current, endDate: editing?.endDate?.slice(0, 10) ?? null };
                        delete updated.termValue;
                        delete updated.termUnit;
                        return updated;
                      });
                    } else {
                      setForm((current) => ({ ...current, termUnit: null, termValue: null, endDate: null }));
                    }
                  }}
                  options={[
                    { value: "NONE", label: "Без срока окончания" },
                    { value: "MONTHS", label: "Месяцы" },
                    { value: "YEARS", label: "Годы" },
                    ...(editing?.endDate && !editing.termUnit ? [{ value: "LEGACY", label: "Сохранить текущую дату" }] : []),
                  ]} />
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-[var(--color-text-secondary)] mb-4">
          {calculatedEndDate
            ? `Окончание: ${calculatedEndDate.slice(0, 10).split("-").reverse().join(".")}`
            : form.termUnit ? "Выберите дату подписания и срок — окончание рассчитается автоматически" : "Дата окончания не установлена"}
        </p>

        <fieldset disabled={mutation.isPending} className="mb-4 space-y-3">
          <legend className="text-sm font-medium mb-2">Вложения</legend>
          {(["contractPdfId", "ndaPdfId"] as const).map((key) => {
            const attachment = attachments[key];
            const file = files[key];
            return (
              <div key={key} className="rounded-lg border border-[var(--color-border)] p-3">
                <label className="block">
                  <span className={labelClass}>{key === "contractPdfId" ? "PDF договора" : "Соглашение о конфиденциальности — NDA (PDF)"}</span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="block w-full text-xs text-[var(--color-text-secondary)]"
                    onChange={(event) => {
                      const selected = event.target.files?.[0];
                      event.target.value = "";
                      if (!selected) return;
                      if (!isContractPdf(selected)) {
                        setError("Выберите непустой файл в формате PDF");
                        return;
                      }
                      if (selected.size > MAX_UPLOAD_SIZE_BYTES) {
                        setError(`Размер PDF не должен превышать ${MAX_UPLOAD_SIZE_MB} МБ`);
                        return;
                      }
                      setError("");
                      setFiles((current) => ({ ...current, [key]: selected }));
                    }}
                  />
                </label>
                {(file || attachment) && (
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <span className="truncate flex-1">{file?.name ?? attachment?.originalName}</span>
                    {!file && attachment && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => void openAttachment(attachment)}>
                        Открыть
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => {
                      setFiles((current) => ({ ...current, [key]: undefined }));
                      setAttachments((current) => ({ ...current, [key]: null }));
                      set(key, null);
                    }}>
                      Убрать
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <label className="block">
              <span className={labelClass}>Дополнительные соглашения, приложения и другие документы (PDF)</span>
              <input type="file" multiple accept="application/pdf,.pdf"
                className="block w-full text-xs text-[var(--color-text-secondary)]"
                onChange={(event) => {
                  const selected = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (selected.some((file) => !isContractPdf(file))) {
                    setError("Выберите непустые файлы в формате PDF");
                    return;
                  }
                  if (selected.some((file) => file.size > MAX_UPLOAD_SIZE_BYTES)) {
                    setError(`Размер каждого PDF не должен превышать ${MAX_UPLOAD_SIZE_MB} МБ`);
                    return;
                  }
                  setError("");
                  setExtraFiles((current) => [...current, ...selected.map((file) => ({ key: crypto.randomUUID(), file }))]);
                }} />
            </label>
            {extraAttachments.map((attachment) => (
              <div key={attachment.id} className="flex items-center gap-2 mt-2 text-xs">
                <span className="truncate flex-1">{attachment.originalName}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => void openAttachment(attachment)}>Открыть</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => {
                  setExtraAttachments((current) => current.filter((file) => file.id !== attachment.id));
                  setForm((current) => ({ ...current, additionalPdfIds: (current.additionalPdfIds ?? []).filter((id) => id !== attachment.id) }));
                }}>Убрать</Button>
              </div>
            ))}
            {extraFiles.map((pending) => (
              <div key={pending.key} className="flex items-center gap-2 mt-2 text-xs">
                <span className="truncate flex-1">{pending.file.name}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setExtraFiles((current) => current.filter((item) => item.key !== pending.key))}>Убрать</Button>
              </div>
            ))}
          </div>
          <p className={hintClass}>Необязательно. PDF до {MAX_UPLOAD_SIZE_MB} МБ каждый. Файлы сохраняются вместе с договором.</p>
        </fieldset>

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

        </fieldset>

        {error && <p className="text-xs text-[var(--color-danger)] mb-2">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onClose}>
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
                    № {c.number} · {c.title} · выставление {c.billingDay}-го · оплата +{c.paymentDueDays} дн.
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
