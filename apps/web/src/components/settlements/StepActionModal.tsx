"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ExternalLink, FileText, Link2, Paperclip, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { esfApi, esfCoversSettlement, esfSettlementIds, ESF_STATUS_LABELS, type CreateEsfDraft } from "@/lib/api/esf";
import { EsfDraftEditor } from './EsfDraftEditor';
import { SettlementDocumentActions } from './SettlementDocumentActions';
import { openFile, uploadFile } from "@/lib/api/files";
import { Button, Input, Modal } from "@/components/ui";
import { fieldClassName } from "@/components/ui/Input";
import {
  formatMoney,
  settlementsApi,
  STEP_FULL_LABELS,
  type Settlement,
  type SettlementStep,
} from "@/lib/api/settlements";

interface Props {
  settlement: Settlement;
  step: SettlementStep;
  onClose: () => void;
}

const labelClass = "block text-xs text-[var(--color-text-secondary)] mb-1";
const stepFileLabels: Partial<Record<SettlementStep["type"], string>> = {
  ISSUE_ACT: "Открыть PDF акта",
  ISSUE_INVOICE: "Открыть PDF счёта",
  ISSUE_ESF: "Открыть скан ЭСФ",
};

type EsfEvidenceMode = "portal" | "url" | "scan";
const scanMimeByExtension: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", heic: "image/heic", heif: "image/heif",
};

function scanMime(file: File): string {
  return file.type || scanMimeByExtension[file.name.split(".").pop()?.toLowerCase() ?? ""] || "";
}

function isEsfScan(file: File): boolean {
  return file.size > 0 && Object.values(scanMimeByExtension).includes(scanMime(file));
}

function isEvidenceUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isPdfScan(file: File): boolean {
  return file.size > 0 && (
    file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name))
  );
}

export function StepActionModal({ settlement, step, onClose }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);

  // Поля разных шагов; каждый использует только своё.
  const [note, setNote] = useState(step.note ?? "");
  const [file, setFile] = useState<File | null>(null);
  const uploadedFile = useRef<{ file: File; id: string } | null>(null);
  const [amount, setAmount] = useState(String(settlement.dueAmount || settlement.amount));
  const [paidAt, setPaidAt] = useState(todayIso());
  const [reference, setReference] = useState("");
  const isEsfStep = step.type === "ISSUE_ESF";
  const [esfMode, setEsfMode] = useState<EsfEvidenceMode>(step.evidenceUrl ? "url" : "portal");
  const [evidenceUrl, setEvidenceUrl] = useState(step.evidenceUrl ?? "");
  const [esfInvoiceId, setEsfInvoiceId] = useState("");
  const esfQuery = useQuery({
    queryKey: ["esf", "all"],
    queryFn: () => esfApi.list(),
    enabled: isEsfStep && !step.doneAt,
  });
  const esfCandidates = (esfQuery.data ?? []).filter((invoice) =>
    !invoice.hiddenAt && invoice.counterpartyId === settlement.counterpartyId &&
    (invoice.status === "SENT" || invoice.status === "ACCEPTED"),
  ).sort((a, b) => (b.deliveryDate ?? "").localeCompare(a.deliveryDate ?? ""));
  const linkedInvoice = esfQuery.data?.find((invoice) => esfCoversSettlement(invoice, settlement.id));
  const selectedInvoiceId = esfInvoiceId || esfCandidates.find((invoice) => esfCoversSettlement(invoice, settlement.id))?.id || "";
  const selectedInvoice = esfCandidates.find((invoice) => invoice.id === selectedInvoiceId);
  const actPdfId = settlement.steps.find((s) => s.type === "ISSUE_ACT")?.fileAssetId ?? null;
  const requiresPdfScan = step.type === "ISSUE_ACT" || step.type === "ISSUE_INVOICE";
  const scanDocument = step.type === "ISSUE_ACT" ? "акта" : "счёта на оплату";

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["settlements"] });
    void qc.invalidateQueries({ queryKey: ["settlement", settlement.id] });
    void qc.invalidateQueries({ queryKey: ["documents"] });
    if (isEsfStep) void qc.invalidateQueries({ queryKey: ["esf"] });
  }

  function handleError(err: unknown) {
    const message =
      err instanceof ApiError || err instanceof Error ? err.message : "Не удалось выполнить";
    setError(Array.isArray(message) ? String(message[0]) : message);
  }

  async function uploadEvidence(chosen: File): Promise<string> {
    if (uploadedFile.current?.file === chosen) return uploadedFile.current.id;
    const upload = !chosen.type && (requiresPdfScan || isEsfStep)
      ? new File([chosen], chosen.name, { type: requiresPdfScan ? "application/pdf" : scanMime(chosen) })
      : chosen;
    const { id } = await uploadFile(upload);
    uploadedFile.current = { file: chosen, id };
    return id;
  }

  const complete = useMutation({
    mutationFn: async () => {
      if (isEsfStep && esfMode === "portal") {
        if (!selectedInvoice) throw new Error("Выберите отправленную или принятую ЭСФ этого партнёра.");
        if (!esfCoversSettlement(selectedInvoice, settlement.id)) {
          await esfApi.attach(selectedInvoice.id, settlement.id);
        }
      }
      if (isEsfStep && esfMode === "url" && !isEvidenceUrl(evidenceUrl)) {
        throw new Error("Укажите корректную ссылку на ЭСФ, начинающуюся с https:// или http://.");
      }
      if (isEsfStep && esfMode === "scan" && (!file || !isEsfScan(file))) {
        throw new Error("Прикрепите непустой скан ЭСФ в PDF или фото (JPEG, PNG, WebP, HEIC, HEIF).");
      }
      if (requiresPdfScan && !file) {
        throw new Error(`Прикрепите скан ${scanDocument} в формате PDF, чтобы завершить шаг.`);
      }
      if (requiresPdfScan && file && !isPdfScan(file)) {
        throw new Error(`Выберите непустой файл PDF со сканом ${scanDocument}.`);
      }
      let fileAssetId: string | undefined;
      if (file && (!isEsfStep || esfMode === "scan")) {
        fileAssetId = await uploadEvidence(file);
      }
      return settlementsApi.completeStep(settlement.id, step.id, {
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(fileAssetId ? { fileAssetId } : {}),
        ...(isEsfStep && esfMode === "url" ? { evidenceUrl: evidenceUrl.trim() } : {}),
      });
    },
    onSuccess: () => { invalidate(); onClose(); },
    onError: (err) => { invalidate(); handleError(err); },
  });

  const reopen = useMutation({
    mutationFn: () => settlementsApi.reopenStep(settlement.id, step.id),
    onSuccess: () => { invalidate(); onClose(); },
    onError: handleError,
  });

  const addPayment = useMutation({
    mutationFn: async () => {
      let fileAssetId: string | undefined;
      if (file) fileAssetId = await uploadEvidence(file);
      return settlementsApi.addPayment(settlement.id, {
        amount: Number(amount.replace(",", ".")),
        paidAt: new Date(paidAt).toISOString(),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(fileAssetId ? { fileAssetId } : {}),
      });
    },
    onSuccess: () => { invalidate(); onClose(); },
    onError: handleError,
  });

  const removePayment = useMutation({
    mutationFn: (paymentId: string) => settlementsApi.removePayment(settlement.id, paymentId),
    onSuccess: invalidate,
    onError: handleError,
  });

  const busy = complete.isPending || reopen.isPending || addPayment.isPending || draftBusy;
  const isPaymentStep = step.type === "RECEIVE_PAYMENT";
  const hasEsfEvidence = esfMode === "portal" ? !!selectedInvoice
    : esfMode === "url" ? !!evidenceUrl.trim() : !!file;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (isPaymentStep) addPayment.mutate();
    else complete.mutate();
  }

  return (
    <Modal onClose={() => { if (!busy) onClose(); }} size={isEsfStep ? "lg" : "md"}>
      <div className="p-5 max-h-[80vh] overflow-y-auto">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {STEP_FULL_LABELS[step.type]}
          </h3>
          <span className="text-xs text-[var(--color-text-muted)] min-w-0 text-right">
            {settlement.counterpartyName}
            <span className="block">{settlement.contractTitle}</span>
            <span className="block">Комплект №{settlement.sequence ?? 1}{settlement.label ? ` · ${settlement.label}` : ""}</span>
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mb-4">
          {formatMoney(settlement.amount, settlement.currency)}
          {settlement.dueAmount > 0 && settlement.paidAmount > 0 && (
            <> · остаток {formatMoney(settlement.dueAmount, settlement.currency)}</>
          )}
        </p>

        {step.documentId && !requiresPdfScan && (
          <Link
            href={`/documents/${step.documentId}`}
            className="mb-4 flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--color-accent-border)] bg-[var(--color-accent-dim)] text-sm text-[var(--color-accent)] hover:brightness-110 transition"
          >
            Открыть документ
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}

        {step.doneAt && !isPaymentStep ? (
          <div>
            <p className="text-sm text-[var(--color-text-secondary)] mb-1">
              Готово {new Date(step.doneAt).toLocaleDateString("ru-RU")}
              {step.doneByName ? ` · ${step.doneByName}` : ""}
            </p>
            {step.note && (
              <p className="text-sm text-[var(--color-text-primary)] mb-3">{step.note}</p>
            )}
            <DoneStepFiles step={step} settlementId={settlement.id} />
            {error && <p className="text-xs text-[var(--color-danger)] mb-2">{error}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={onClose}>Закрыть</Button>
              <Button variant="secondary" onClick={() => reopen.mutate()} disabled={busy}>
                Отменить шаг
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            {isEsfStep && (
              <>
                <fieldset className="mb-4" disabled={busy}>
                  <legend className="text-sm text-[var(--color-text-secondary)] mb-2">Подтверждение ЭСФ</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: "portal", label: "Кабинет", icon: FileText },
                      { value: "url", label: "Ссылка", icon: Link2 },
                      { value: "scan", label: "Скан", icon: Paperclip },
                    ] as const).map(({ value, label, icon: Icon }) => (
                      <label key={value} className={`flex flex-col items-center gap-2 rounded-lg border px-2 py-3 cursor-pointer text-xs transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--color-accent)] ${esfMode === value ? "border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)]" : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"}`}>
                        <Icon className="w-4 h-4" aria-hidden="true" />
                        <span className="flex items-center gap-1.5">
                          <input type="radio" name="esf-evidence" value={value} checked={esfMode === value} onChange={() => { setEsfMode(value); setFile(null); setError(""); }} className="accent-[var(--color-accent)]" />
                          {label}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {esfMode === "portal" && (
                  <div className="mb-4">
                    <label className="block">
                      <span className={labelClass}>ЭСФ партнёра из кабинета</span>
                      <select className={fieldClassName} required disabled={busy || esfQuery.isPending || esfQuery.isError} value={selectedInvoiceId} onChange={(e) => { setEsfInvoiceId(e.target.value); setError(""); }}>
                        <option value="">{esfQuery.isPending ? "Загружаю ЭСФ…" : "Выберите ЭСФ"}</option>
                        {esfCandidates.map((invoice) => (
                          <option key={invoice.id} value={invoice.id}>
                            № {invoice.number ?? "—"} · {invoice.deliveryDate ? new Date(invoice.deliveryDate).toLocaleDateString("ru-RU") : "без даты"} · {formatMoney(invoice.amount, settlement.currency)} · {ESF_STATUS_LABELS[invoice.status]}{esfSettlementIds(invoice).length ? ` · уже в расчётах: ${esfSettlementIds(invoice).length}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedInvoice && (
                      <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-xs">
                        <p className="text-[var(--color-text-primary)] break-words">ЭСФ № {selectedInvoice.number ?? "—"}</p>
                        <p className="mt-1 text-[var(--color-text-secondary)]">ID ЭСФ на портале: <span className="font-mono break-all select-all text-[var(--color-text-primary)]">{selectedInvoice.uuid}</span></p>
                        <p className="mt-1 text-[var(--color-text-secondary)]">{selectedInvoice.deliveryDate ? new Date(selectedInvoice.deliveryDate).toLocaleDateString("ru-RU") : "Без даты"} · {formatMoney(selectedInvoice.amount, settlement.currency)} · {ESF_STATUS_LABELS[selectedInvoice.status]}</p>
                        {esfSettlementIds(selectedInvoice).length > 0 && !esfCoversSettlement(selectedInvoice, settlement.id) && <p className="mt-1 text-[var(--color-text-secondary)]">Эта ЭСФ уже покрывает другие расчёты. Текущий месяц будет добавлен к ним.</p>}
                      </div>
                    )}
                    {esfQuery.isError ? (
                      <div role="alert" className="mt-2 text-xs text-[var(--color-danger)]">
                        Не удалось загрузить ЭСФ.
                        <button type="button" onClick={() => void esfQuery.refetch()} className="ml-2 underline">Повторить</button>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-xs text-[var(--color-text-secondary)]">
                        {selectedInvoice ? "Проверьте дату и сумму: выбранная ЭСФ будет связана с этим расчётом." : !esfQuery.isPending && esfCandidates.length === 0 ? "Нет доступных отправленных или принятых ЭСФ этого партнёра. Синхронизируйте кабинет или добавьте ссылку / скан." : "Показаны отправленные и принятые ЭСФ этого партнёра, свободные или связанные с этим расчётом."}
                      </p>
                    )}
                    {linkedInvoice?.status === "NEW" ? <EsfDraftPanel settlementId={settlement.id} stepNote={step.note} actPdfId={actPdfId} onBusyChange={setDraftBusy} /> : !linkedInvoice && (
                      <details className="mt-3 text-xs text-[var(--color-text-secondary)]">
                        <summary className="cursor-pointer py-1">Создать новую ЭСФ на портале</summary>
                        <div className="mt-2"><EsfDraftPanel settlementId={settlement.id} stepNote={step.note} actPdfId={actPdfId} onBusyChange={setDraftBusy} /></div>
                      </details>
                    )}
                  </div>
                )}

                {esfMode === "url" && (
                  <label className="block mb-4">
                    <span className={labelClass}>Ссылка на ЭСФ — обязательно</span>
                    <Input type="url" required maxLength={2048} disabled={busy} value={evidenceUrl} onChange={(e) => { setEvidenceUrl(e.target.value); setError(""); }} placeholder="https://esf.salyk.kg/…" />
                    <span className="block mt-1.5 text-xs text-[var(--color-text-secondary)]">Ссылка сохранится в расчёте и будет доступна после завершения шага.</span>
                  </label>
                )}

                {esfMode === "scan" && (
                  <label className="block mb-4">
                    <span className={labelClass}>Скан ЭСФ (PDF или фото) — обязательно</span>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" required disabled={busy} onChange={(e) => {
                      const chosen = e.target.files?.[0] ?? null;
                      setError("");
                      if (chosen && !isEsfScan(chosen)) {
                        setFile(null);
                        e.target.value = "";
                        setError("Выберите непустой PDF или фото (JPEG, PNG, WebP, HEIC, HEIF).");
                        return;
                      }
                      setFile(chosen);
                    }} className="block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-xs text-[var(--color-text-secondary)] file:mr-3 file:min-h-10 file:px-3 file:rounded-lg file:border-0 file:bg-[var(--color-accent-dim)] file:text-[var(--color-accent)] file:text-xs file:font-medium focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50" />
                    <span className="block mt-1.5 text-xs text-[var(--color-text-secondary)] break-words">{file ? `Прикреплён: ${file.name}` : "Подойдёт PDF или фото с телефона."}</span>
                  </label>
                )}
                <label className="block mb-3">
                  <span className={labelClass}>Номер и дата ЭСФ (необязательно)</span>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="ЭСФ № 4417 от 05.10.2026"
                    maxLength={500}
                    disabled={busy}
                  />
                </label>
              </>
            )}

            {step.type === "RECEIVE_SIGNED" && (
              <label className="block mb-3">
                <span className={labelClass}>Скан подписанного документа</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-[var(--color-text-secondary)] file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-[var(--color-accent-dim)] file:text-[var(--color-accent)] file:text-xs file:font-medium"
                />
                <span className="block mt-1 text-[11px] text-[var(--color-text-muted)]">
                  Фото с телефона тоже подойдёт
                </span>
              </label>
            )}

            {isPaymentStep && (
              <>
                {settlement.payments.length > 0 && (
                  <ul className="mb-3 flex flex-col gap-1.5">
                    {settlement.payments.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)]"
                      >
                        <span className="text-sm text-[var(--color-text-primary)]">
                          {formatMoney(p.amount, settlement.currency)}
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)] flex-1 truncate">
                          {new Date(p.paidAt).toLocaleDateString("ru-RU")}
                          {p.reference ? ` · ${p.reference}` : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => removePayment.mutate(p.id)}
                          disabled={removePayment.isPending}
                          title="Удалить платёж"
                          className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <label className="block">
                    <span className={labelClass}>Сумма</span>
                    <Input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      inputMode="decimal"
                      autoFocus
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Дата</span>
                    <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                  </label>
                </div>
                <label className="block mb-3">
                  <span className={labelClass}>№ платёжного поручения</span>
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="п/п 55"
                  />
                </label>
                <label className="block mb-3">
                  <span className={labelClass}>Скан платёжки (необязательно)</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-xs text-[var(--color-text-secondary)] file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-[var(--color-accent-dim)] file:text-[var(--color-accent)] file:text-xs file:font-medium"
                  />
                </label>
              </>
            )}

            {step.type === "SEND" && (
              <p className="text-sm text-[var(--color-text-secondary)] mb-3">
                Отметьте, когда акт и счёт ушли партнёру. Документы получат статус «Отправлен».
              </p>
            )}

            {requiresPdfScan && (
              <div className="mb-4">
                <SettlementDocumentActions settlement={settlement} step={step} disabled={busy} onBusyChange={setDraftBusy} />
                <p className="text-sm text-[var(--color-text-secondary)] mb-3">
                  {step.documentId
                    ? `Проверьте черновик и прикрепите скан выставленного ${scanDocument} в PDF. После завершения шага документ получит статус «Финальный».`
                    : `Прикрепите скан выставленного ${scanDocument} в PDF, чтобы завершить шаг.`}
                </p>
                <label className="block">
                  <span className={labelClass}>Скан {scanDocument} (PDF) — обязательно</span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    required
                    disabled={busy}
                    onChange={(e) => {
                      const chosen = e.target.files?.[0] ?? null;
                      setError("");
                      if (chosen && !isPdfScan(chosen)) {
                        setFile(null);
                        e.target.value = "";
                        setError(`Выберите непустой файл PDF со сканом ${scanDocument}.`);
                        return;
                      }
                      setFile(chosen);
                    }}
                    className="block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-xs text-[var(--color-text-secondary)] file:mr-3 file:min-h-10 file:px-3 file:rounded-lg file:border-0 file:bg-[var(--color-accent-dim)] file:text-[var(--color-accent)] file:text-xs file:font-medium focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50"
                  />
                </label>
                <p className="mt-1.5 text-xs text-[var(--color-text-secondary)] break-words">
                  {file ? `Прикреплён: ${file.name}` : `Без PDF ${scanDocument} шаг завершить нельзя.`}
                </p>
              </div>
            )}

            {error && <p role="alert" className="text-xs text-[var(--color-danger)] mb-2">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Отмена</Button>
              <Button type="submit" disabled={(requiresPdfScan && !file) || (isEsfStep && !hasEsfEvidence)} loading={busy} loadingText="Сохраняю…">
                {isPaymentStep ? "Внести платёж" : "Готово"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

/**
 * Что приложено к закрытому шагу: наш файл (скан, PDF ЭСФ) по короткой
 * ссылке и, для ЭСФ, официальная страница на портале.
 */
function DoneStepFiles({ step, settlementId }: { step: SettlementStep; settlementId: string }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const { data: esf } = useQuery({
    queryKey: ["esf", "settlement", settlementId],
    queryFn: () => esfApi.list().then((all) => all.filter((i) => esfCoversSettlement(i, settlementId))),
    enabled: step.type === "ISSUE_ESF",
  });
  const portal = esf?.find((i) => i.fileAssetId === step.fileAssetId) ?? esf?.[0];

  const savedUrl = step.evidenceUrl && isEvidenceUrl(step.evidenceUrl) ? step.evidenceUrl : null;
  if (!step.fileAssetId && !portal && !savedUrl) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-1">
      {step.fileAssetId && (
        <Button
          size="sm"
          variant="secondary"
          disabled={opening}
          onClick={async () => {
            setOpening(true);
            setError("");
            try {
              await openFile(step.fileAssetId!);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Не удалось открыть файл. Попробуйте ещё раз.");
            } finally {
              setOpening(false);
            }
          }}
        >
          <FileText className="w-3.5 h-3.5" />
          {stepFileLabels[step.type] ?? "Открыть файл"}
        </Button>
      )}
      {portal && (
        <a
          href={esfApi.portalPdfUrl(portal.uuid)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline px-2 py-1.5"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          На портале
        </a>
      )}
      {portal && <div className="w-full text-xs text-[var(--color-text-secondary)]">
        <p className="text-[var(--color-text-primary)] break-words">{portal.number ? `ЭСФ № ${portal.number}` : "ЭСФ без номера"}</p>
        <p className="mt-1">ID ЭСФ на портале: <span className="font-mono break-all select-all text-[var(--color-text-primary)]">{portal.uuid}</span></p>
        {(portal.settlements?.length ?? 0) > 1 && <p>Эта ЭСФ покрывает {portal.settlements!.map((s) => `${s.month.toString().padStart(2, "0")}.${s.year}`).join(", ")}.</p>}
        <Link href={`/settlements/${settlementId}`} className="inline-block py-1 text-[var(--color-accent)] hover:underline">Изменить месяцы в карточке расчёта</Link>
      </div>}
      {savedUrl && (
        <a href={savedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline px-2 py-1.5">
          <ExternalLink className="w-3.5 h-3.5" />
          Открыть ссылку ЭСФ
        </a>
      )}
      {error && <p role="alert" className="w-full text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}

/**
 * Черновик ЭСФ на портале: Vault копирует последнюю ЭСФ партнёра с новой
 * датой, суммой и номером учётной системы. Подписать и отправить — только на портале,
 * после этого синхронизация закроет шаг сама.
 */
function EsfDraftPanel({ settlementId, stepNote, actPdfId, onBusyChange }: { settlementId: string; stepNote: string | null; actPdfId: string | null; onBusyChange: (busy: boolean) => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const { data: esf } = useQuery({
    queryKey: ["esf", "settlement", settlementId],
    queryFn: () => esfApi.list().then((all) => all.filter((i) => esfCoversSettlement(i, settlementId))),
  });
  const draft = esf?.[0];

  const create = useMutation({
    mutationFn: (data: CreateEsfDraft) => esfApi.createDraft(settlementId, data),
    onMutate: () => { setError(""); onBusyChange(true); },
    onSettled: () => onBusyChange(false),
    onSuccess: () => {
      setError("");
      void qc.invalidateQueries({ queryKey: ["esf"] });
      void qc.invalidateQueries({ queryKey: ["settlements"] });
      void qc.invalidateQueries({ queryKey: ["settlement", settlementId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Не удалось создать черновик"),
  });

  if (draft) {
    return (
      <div className="mb-3 px-3 py-2.5 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)]">
        <p className="text-sm text-[var(--color-text-primary)]">
          {draft.status === "NEW" ? "Черновик на портале" : `ЭСФ № ${draft.number ?? "—"}`}
          {draft.status === "NEW" && (
            <span className="text-xs text-[#FBBF24] ml-2">ждёт подписи</span>
          )}
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">ID ЭСФ на портале: <span className="font-mono break-all select-all text-[var(--color-text-primary)]">{draft.uuid}</span></p>
        {draft.crmRef && <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Номер учётной системы: <span className="break-all select-all text-[var(--color-text-primary)]">{draft.crmRef}</span></p>}
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {draft.status === "NEW"
            ? "Откройте портал, проверьте и нажмите «Подписать» — после этого шаг закроется сам при синхронизации."
            : stepNote ?? ""}
        </p>
        <a
          href={esfApi.portalListUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline mt-1.5"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Открыть «Реализация» на портале
        </a>
      </div>
    );
  }

  return <EsfDraftEditor settlementId={settlementId} actPdfId={actPdfId} creating={create.isPending} error={error} onCreate={data => create.mutate(data)} />;
}
