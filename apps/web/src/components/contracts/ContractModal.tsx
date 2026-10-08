"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { calculateContractEndDate, contractNumberPeriod, effectiveContractEndDate, formatContractNumber, parseMoneyInput, CONTRACT_PAYMENT_LABELS, type ContractBillingPeriod } from "@ai-vault/doc-placeholders";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, ShieldCheck, Paperclip, Upload, X, CalendarDays } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { contractsApi, type Contract, type ContractFormData, type ContractAttachment } from "@/lib/api/contracts";
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB, openFile, uploadFile } from "@/lib/api/files";
import { counterpartiesApi } from "@/lib/api/counterparties";
import { Button, Input, Modal, Select } from "@/components/ui";

type Slot = "contractPdfId" | "ndaPdfId" | "terminationPdfId";
const labelClass = "block text-xs text-slate-300 mb-1";
const hintClass = "mt-1 text-[11px] leading-relaxed text-slate-300";
const dateText = (value: string) => value.slice(0, 10).split("-").reverse().join(".");
const fileSize = (size: number) => `${(size / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;

function initialForm(c: Contract | null): ContractFormData {
  return {
    number: c?.number ?? "", counterpartyId: c?.counterpartyId ?? "", title: c?.title ?? "Абонентское обслуживание",
    defaultAmount: c?.defaultAmount ?? 0, currency: c?.currency ?? "KGS", billingDay: c?.billingDay ?? 1,
    paymentDueDays: c?.paymentDueDays ?? 10, esfRequired: c?.esfRequired ?? true, active: c?.active ?? true,
    billingPeriod: c?.billingPeriod ?? "MONTHLY", autoRenew: c?.autoRenew ?? false,
    startDate: c?.startDate?.slice(0, 10) ?? null, endDate: c?.endDate?.slice(0, 10) ?? null,
    termUnit: c?.termUnit ? "MONTHS" : null,
    termValue: c?.termValue ? c.termValue * (c.termUnit === "YEARS" ? 12 : 1) : null,
    terminationDate: c?.terminationDate?.slice(0, 10) ?? null,
    contractPdfId: c?.contractPdf?.id ?? null, ndaPdfId: c?.ndaPdf?.id ?? null,
    terminationPdfId: c?.terminationPdf?.id ?? null, additionalPdfIds: c?.additionalPdfs?.map(f => f.id) ?? [],
  };
}

function UploadControl({ title, multiple = false, onSelect }: { title: string; multiple?: boolean; onSelect: (files: File[]) => void }) {
  return <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-500 px-2.5 py-2 text-xs text-slate-200 hover:bg-slate-700 focus-within:outline-2 focus-within:outline-[var(--color-accent)]">
    <Upload className="h-3.5 w-3.5" aria-hidden="true" />{title}
    <input type="file" aria-label={title} multiple={multiple} accept="application/pdf,.pdf" className="sr-only"
      onChange={e => { const selected = Array.from(e.target.files ?? []); e.target.value = ""; if (selected.length) onSelect(selected); }} />
  </label>;
}

export function ContractModal({ editing, onClose }: { editing: Contract | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => initialForm(editing));
  const [amount, setAmount] = useState(String(editing?.defaultAmount ?? 0));
  const [termMode, setTermMode] = useState<"MONTHS" | "MANUAL" | "NONE">(editing?.termUnit ? "MONTHS" : editing?.endDate ? "MANUAL" : "NONE");
  const [terminated, setTerminated] = useState(Boolean(editing?.terminationDate));
  const [error, setError] = useState("");
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({});
  const [extraFiles, setExtraFiles] = useState<{ key: string; file: File }[]>([]);
  const [extraAttachments, setExtraAttachments] = useState<ContractAttachment[]>(editing?.additionalPdfs ?? []);
  const [attachments, setAttachments] = useState<Record<Slot, ContractAttachment | null>>({
    contractPdfId: editing?.contractPdf ?? null, ndaPdfId: editing?.ndaPdf ?? null, terminationPdfId: editing?.terminationPdf ?? null,
  });
  const endDate = termMode === "MONTHS" && form.startDate && form.termValue
    ? calculateContractEndDate(form.startDate, form.termValue, "MONTHS") : termMode === "MANUAL" ? form.endDate ?? null : null;
  const renewedEnd = form.autoRenew && !terminated && endDate
    ? effectiveContractEndDate({ ...form, active: true, endDate }) : null;
  const period = form.billingPeriod ?? "MONTHLY";
  const { data: counterparties } = useQuery({ queryKey: ["companies"], queryFn: () => counterpartiesApi.list() });
  function set<K extends keyof ContractFormData>(key: K, value: ContractFormData[K]) { setForm(current => ({ ...current, [key]: value })); }
  function selectFiles(selected: File[], slot?: Slot) {
    if (selected.some(file => file.size === 0 || !(file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name))))) {
      setError("Выберите непустой файл в формате PDF"); return;
    }
    if (selected.some(file => file.size > MAX_UPLOAD_SIZE_BYTES)) { setError(`Размер каждого PDF не должен превышать ${MAX_UPLOAD_SIZE_MB} МБ`); return; }
    setError("");
    if (slot) setFiles(current => ({ ...current, [slot]: selected[0] }));
    else setExtraFiles(current => [...current, ...selected.map(file => ({ key: crypto.randomUUID(), file }))]);
  }
  async function openAttachment(file: ContractAttachment) {
    try { await openFile(file.id); } catch { setError("Не удалось открыть PDF. Попробуйте ещё раз."); }
  }
  const mutation = useMutation({
    mutationFn: async () => {
      const defaultAmount = parseMoneyInput(amount);
      if (defaultAmount === null) throw new Error("Некорректная сумма договора");
      const payload: ContractFormData = { ...form, defaultAmount,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
        terminationDate: terminated && form.terminationDate ? new Date(form.terminationDate).toISOString() : null,
        terminationPdfId: terminated ? form.terminationPdfId ?? null : null,
        active: terminated ? false : form.active ?? true, autoRenew: terminated ? false : form.autoRenew ?? false,
      };
      for (const key of ["contractPdfId", "ndaPdfId", ...(terminated ? ["terminationPdfId"] : [])] as Slot[]) {
        const file = files[key]; if (!file) continue;
        const uploaded = await uploadFile(file.type ? file : new File([file], file.name, { type: "application/pdf" }));
        payload[key] = uploaded.id;
        setForm(current => ({ ...current, [key]: uploaded.id }));
        setAttachments(current => ({ ...current, [key]: uploaded }));
        setFiles(current => ({ ...current, [key]: undefined }));
      }
      const ids = [...(form.additionalPdfIds ?? [])];
      for (const pending of extraFiles) {
        const file = pending.file;
        const uploaded = await uploadFile(file.type ? file : new File([file], file.name, { type: "application/pdf" }));
        ids.push(uploaded.id);
        setForm(current => ({ ...current, additionalPdfIds: [...ids] }));
        setExtraAttachments(current => [...current, uploaded]);
        setExtraFiles(current => current.filter(item => item.key !== pending.key));
      }
      payload.additionalPdfIds = ids;
      return editing ? contractsApi.update(editing.id, payload) : contractsApi.create(payload);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["contracts"] }); onClose(); },
    onError: err => { const message = err instanceof ApiError ? err.message : "Не удалось сохранить договор. Попробуйте ещё раз."; setError(Array.isArray(message) ? String(message[0]) : message); },
  });
  function onSubmit(e: FormEvent) {
    e.preventDefault(); if (mutation.isPending) return; setError("");
    if (!form.counterpartyId) { setError("Выберите партнёра"); return; }
    if (parseMoneyInput(amount) === null) { setError("Введите сумму от 0 до 999 999 999 999,99 с точностью до двух знаков"); return; }
    if (termMode === "MONTHS" && !endDate) { setError("Укажите дату подписания и целый срок от 1 до 1200 месяцев"); return; }
    if (termMode === "MANUAL" && !endDate) { setError("Укажите дату окончания договора"); return; }
    if (endDate && form.startDate && endDate < form.startDate) { setError("Окончание не может быть раньше даты подписания"); return; }
    if (form.autoRenew && !terminated && (!form.startDate || !endDate || endDate <= form.startDate)) { setError("Для автопродления укажите дату подписания и срок договора"); return; }
    if (terminated && !form.terminationDate) { setError("Укажите дату расторжения"); return; }
    if (terminated && !files.terminationPdfId && !form.terminationPdfId) { setError("Для расторжения прикрепите PDF уведомления"); return; }
    mutation.mutate();
  }
  function attachmentRow(slot: Slot, title: string, icon: typeof FileText, tint: string) {
    const Icon = icon, file = files[slot], saved = attachments[slot];
    return <div className="flex min-w-0 flex-wrap items-center gap-3 py-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tint}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1 basis-36"><p className="text-xs font-medium">{title}</p>
        <p className="mt-0.5 truncate text-[11px] text-slate-300" title={file?.name ?? saved?.originalName}>{file?.name ?? saved?.originalName ?? "PDF до 100 МБ"}</p>
        {(file || saved) && <span className="text-[11px] text-slate-300">{fileSize(file?.size ?? saved?.size ?? 0)}{file ? " · готов к загрузке" : " · сохранён"}</span>}
      </div>
      {!file && saved && <Button type="button" size="sm" variant="ghost" onClick={() => void openAttachment(saved)}>Открыть</Button>}
      <UploadControl title={`${file || saved ? "Заменить" : "Загрузить"} ${slot === "contractPdfId" ? "договор" : slot === "ndaPdfId" ? "NDA" : "уведомление"}`} onSelect={selected => selectFiles(selected, slot)} />
      {(file || saved) && <button type="button" aria-label={`Убрать ${title}`} className="p-2 text-slate-300 hover:text-red-300"
        onClick={() => { setFiles(current => ({ ...current, [slot]: undefined })); setAttachments(current => ({ ...current, [slot]: null })); set(slot, null); }}><X className="h-4 w-4" /></button>}
    </div>;
  }
  return <Modal className="max-w-3xl overflow-clip" onClose={() => { if (!mutation.isPending) onClose(); }}>
    <form onSubmit={onSubmit} className="flex max-h-[90svh] min-w-0 flex-col [&_input::placeholder]:text-slate-400" aria-label="Условия договора">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-600 px-5 py-4">
        <h3 className="text-base font-semibold">{editing ? "Договор" : "Новый договор"}</h3>
        <button type="button" aria-label="Закрыть договор" disabled={mutation.isPending} onClick={onClose} className="p-2 text-slate-300 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 overflow-y-auto px-5 py-4">
        <fieldset disabled={mutation.isPending} className="min-w-0 space-y-5">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="min-w-0"><span className={labelClass}>Номер договора</span><Input value={form.number ?? ""} maxLength={100} placeholder={`Автоматически · /${contractNumberPeriod(form.startDate)}`} onChange={e => set("number", e.target.value)} /></label>
              <label className="min-w-0"><span className={labelClass}>Дата подписания</span><span className="flex items-center gap-2"><span className="text-sm text-slate-300">от</span><Input type="date" aria-label="Дата подписания" className="min-w-0 flex-1" value={form.startDate ?? ""} onChange={e => set("startDate", e.target.value)} /></span></label>
            </div>
            <p className={hintClass}>{form.number?.trim() ? `При сохранении: ${formatContractNumber(form.number, form.startDate)}` : "Номер выдаст система. Можно ввести свой."}</p>
            <label className="block"><span className={labelClass}>Партнёр</span><Select value={form.counterpartyId} onChange={value => set("counterpartyId", value)} options={[{ value: "", label: "Выберите компанию" }, ...(counterparties ?? []).map(cp => ({ value: cp.id, label: cp.name }))]} />
              <span className={hintClass}>Нет в списке? <Link href="/companies" className="text-blue-300 hover:underline">Добавьте компанию</Link></span></label>
            <label className="block"><span className={labelClass}>Наименование услуги</span><Input value={form.title} required minLength={2} maxLength={200} onChange={e => set("title", e.target.value)} /></label>
          </div>

          <section className="min-w-0 rounded-xl bg-slate-900/60 p-4" aria-labelledby="contract-conditions-heading">
            <h4 id="contract-conditions-heading" className="mb-3 text-sm font-semibold">Условия договора</h4>
            <fieldset className="min-w-0"><legend className={labelClass}>Периодичность платежа</legend>
              <div className="grid gap-1.5 sm:grid-cols-3">{(["MONTHLY", "YEARLY", "ONE_TIME"] as ContractBillingPeriod[]).map(value => <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-xs ${period === value ? "border-blue-400 bg-blue-400/15 text-blue-100" : "border-slate-600 text-slate-200 hover:bg-slate-800"}`}>
                <input type="radio" name="billingPeriod" value={value} checked={period === value} onChange={() => set("billingPeriod", value)} className="accent-blue-400" />{CONTRACT_PAYMENT_LABELS[value]}</label>)}</div>
            </fieldset>
            <p className={`${hintClass} mb-3`}>{period === "YEARLY" ? "Раз в год, в месяц подписания договора. Без даты подписания — в месяц создания." : period === "ONE_TIME" ? "Один автоматический расчёт по договору." : "Расчёт создаётся каждый месяц."}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="min-w-0"><span className={labelClass}>{period === "MONTHLY" ? "Сумма в месяц" : period === "YEARLY" ? "Сумма в год" : "Сумма платежа"}, сом</span><Input value={amount} inputMode="decimal" required onFocus={e => e.target.select()} onChange={e => setAmount(e.target.value)} /></label>
              <label className="min-w-0"><span className={labelClass}>День месяца выставления счёта</span><Input type="number" min={1} max={31} required value={form.billingDay ?? 1} onChange={e => set("billingDay", Number(e.target.value))} /></label>
              <label className="min-w-0"><span className={labelClass}>Срок оплаты, дней</span><Input type="number" min={0} max={180} required value={form.paymentDueDays ?? 10} onChange={e => set("paymentDueDays", Number(e.target.value))} /></label>
            </div>
            <p className={hintClass}>Если выбранного дня нет в месяце, счёт выставляется в последний день. Срок оплаты — от конца расчётного месяца.</p>
            <div className="mt-4 grid gap-3 border-t border-slate-600 pt-4 sm:grid-cols-2">
              <div className="min-w-0"><span className={labelClass}>Срок действия договора</span><Select value={termMode} onChange={value => {
                const mode = value as typeof termMode; setTermMode(mode);
                setForm(current => ({ ...current, termUnit: mode === "MONTHS" ? "MONTHS" : null, termValue: mode === "MONTHS" ? current.termValue || 12 : null,
                  endDate: mode === "MANUAL" ? endDate : null, ...(mode === "NONE" ? { autoRenew: false } : {}) }));
              }} options={[{ value: "MONTHS", label: "Указать количество месяцев" }, { value: "MANUAL", label: "Задать дату окончания вручную" }, { value: "NONE", label: "Без срока окончания" }]} /></div>
              {termMode === "MONTHS" && <label className="min-w-0"><span className={labelClass}>Количество месяцев</span><Input type="number" min={1} max={1200} step={1} required value={form.termValue ?? ""} onChange={e => set("termValue", Number(e.target.value))} /></label>}
              {termMode === "MANUAL" && <label className="min-w-0"><span className={labelClass}>Дата окончания</span><Input type="date" aria-label="Дата окончания" min={form.startDate ?? undefined} required value={form.endDate ?? ""} onChange={e => set("endDate", e.target.value)} /></label>}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-xs text-blue-100"><CalendarDays className="h-4 w-4 shrink-0 text-blue-300" />{endDate ? `Окончание: ${dateText(endDate)}` : termMode === "NONE" ? "Без даты окончания" : "Укажите дату подписания и срок"}</p>
              <label className="flex cursor-pointer items-center gap-2 py-1 text-xs text-slate-200"><input type="checkbox" checked={!terminated && (form.autoRenew ?? false)} disabled={termMode === "NONE" || terminated} onChange={e => set("autoRenew", e.target.checked)} className="h-4 w-4 accent-blue-400" />Автопродление</label>
            </div>
            {form.autoRenew && !terminated && <p className={hintClass}>Продлевается на тот же срок.{renewedEnd && renewedEnd !== endDate ? ` Текущее окончание с продлением: ${dateText(renewedEnd)}.` : ""}</p>}
          </section>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="flex cursor-pointer items-center gap-2 py-1"><input type="checkbox" checked={!terminated && (form.active ?? true)} disabled={terminated} onChange={e => set("active", e.target.checked)} className="h-4 w-4 accent-emerald-400" />Действующий</label>
            <label className="flex cursor-pointer items-center gap-2 py-1"><input type="checkbox" checked={form.esfRequired ?? true} onChange={e => set("esfRequired", e.target.checked)} className="h-4 w-4 accent-blue-400" />Требуется ЭСФ</label>
          </div>

          <section aria-labelledby="contract-attachments-heading"><div className="flex flex-wrap items-baseline justify-between gap-2"><h4 id="contract-attachments-heading" className="text-sm font-semibold">Вложения</h4><span className="text-[11px] text-slate-300">PDF · до 100 МБ каждый</span></div>
            <div className="mt-1 divide-y divide-slate-600">
              {attachmentRow("contractPdfId", "Договор", FileText, "bg-blue-400/15 text-blue-200")}
              {attachmentRow("ndaPdfId", "Соглашение о конфиденциальности", ShieldCheck, "bg-violet-400/15 text-violet-200")}
              <div className="flex flex-wrap items-center gap-3 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-600/50 text-slate-200"><Paperclip className="h-4 w-4" /></span><span className="min-w-0 flex-1 basis-36 text-xs font-medium">Дополнительные соглашения и приложения</span><UploadControl title="Добавить PDF" multiple onSelect={selected => selectFiles(selected)} /></div>
            </div>
            {[...extraAttachments.map(file => ({ key: file.id, name: file.originalName, size: file.size, saved: file })), ...extraFiles.map(item => ({ key: item.key, name: item.file.name, size: item.file.size, saved: null }))].map(item => <div key={item.key} className="mt-1 flex min-w-0 items-center gap-2 rounded-lg bg-slate-900/60 px-3 py-2 text-xs"><span className="min-w-0 flex-1 truncate" title={item.name}>{item.name}<span className="ml-2 text-slate-300">{fileSize(item.size)}</span></span>
              {item.saved && <Button type="button" size="sm" variant="ghost" onClick={() => void openAttachment(item.saved!)}>Открыть</Button>}
              <button type="button" aria-label={`Убрать ${item.name}`} className="p-2 text-slate-300 hover:text-red-300" onClick={() => {
                setExtraAttachments(current => current.filter(file => file.id !== item.key)); setExtraFiles(current => current.filter(file => file.key !== item.key));
                setForm(current => ({ ...current, additionalPdfIds: (current.additionalPdfIds ?? []).filter(id => id !== item.key) }));
              }}><X className="h-4 w-4" /></button></div>)}
          </section>
          <section className="border-t border-slate-600 pt-4"><label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={terminated} onChange={e => setTerminated(e.target.checked)} className="h-4 w-4 accent-red-400" />Договор расторгнут</label>
            {terminated && <div className="mt-3 rounded-xl bg-red-950/30 p-3"><label className="block max-w-xs"><span className={labelClass}>Дата расторжения</span><Input type="date" aria-label="Дата расторжения" min={form.startDate ?? undefined} required value={form.terminationDate ?? ""} onChange={e => set("terminationDate", e.target.value)} /></label>
              {attachmentRow("terminationPdfId", "Уведомление о расторжении · обязательно", FileText, "bg-red-400/15 text-red-200")}
              <p className="text-[11px] leading-relaxed text-red-200">Новые расчёты и автопродление прекращаются. Созданные документы и платежи сохраняются.</p></div>}
          </section>
        </fieldset>
      </div>
      <div className="shrink-0 border-t border-slate-600 bg-[var(--color-bg-surface)] px-5 py-3">
        {error && <p role="alert" className="mb-2 text-xs text-red-300">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onClose}>Отмена</Button><Button type="submit" loading={mutation.isPending} loadingText="Сохраняю…">Сохранить</Button></div>
      </div>
    </form>
  </Modal>;
}
