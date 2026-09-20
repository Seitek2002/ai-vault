"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ExternalLink, FileText, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { esfApi } from "@/lib/api/esf";
import { openFile, uploadFile } from "@/lib/api/files";
import { Button, Input, Modal } from "@/components/ui";
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function StepActionModal({ settlement, step, onClose }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState("");

  // Поля разных шагов; каждый использует только своё.
  const [note, setNote] = useState(step.note ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState(String(settlement.dueAmount || settlement.amount));
  const [paidAt, setPaidAt] = useState(todayIso());
  const [reference, setReference] = useState("");

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["settlements"] });
    void qc.invalidateQueries({ queryKey: ["settlement", settlement.id] });
    void qc.invalidateQueries({ queryKey: ["documents"] });
  }

  function handleError(err: unknown) {
    const message =
      err instanceof ApiError || err instanceof Error ? err.message : "Не удалось выполнить";
    setError(Array.isArray(message) ? String(message[0]) : message);
  }

  const complete = useMutation({
    mutationFn: async () => {
      let fileAssetId: string | undefined;
      if (file) fileAssetId = (await uploadFile(file)).id;
      return settlementsApi.completeStep(settlement.id, step.id, {
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(fileAssetId ? { fileAssetId } : {}),
      });
    },
    onSuccess: () => { invalidate(); onClose(); },
    onError: handleError,
  });

  const reopen = useMutation({
    mutationFn: () => settlementsApi.reopenStep(settlement.id, step.id),
    onSuccess: () => { invalidate(); onClose(); },
    onError: handleError,
  });

  const addPayment = useMutation({
    mutationFn: async () => {
      let fileAssetId: string | undefined;
      if (file) fileAssetId = (await uploadFile(file)).id;
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

  const busy = complete.isPending || reopen.isPending || addPayment.isPending;
  const isPaymentStep = step.type === "RECEIVE_PAYMENT";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (isPaymentStep) addPayment.mutate();
    else complete.mutate();
  }

  return (
    <Modal onClose={onClose} size="md">
      <div className="p-5 max-h-[80vh] overflow-y-auto">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {STEP_FULL_LABELS[step.type]}
          </h3>
          <span className="text-xs text-[var(--color-text-muted)] shrink-0">
            {settlement.counterpartyName}
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mb-4">
          {formatMoney(settlement.amount, settlement.currency)}
          {settlement.dueAmount > 0 && settlement.paidAmount > 0 && (
            <> · остаток {formatMoney(settlement.dueAmount, settlement.currency)}</>
          )}
        </p>

        {step.documentId && (
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
            {step.type === "ISSUE_ESF" && (
              <label className="block mb-3">
                <span className={labelClass}>Номер и дата ЭСФ</span>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ЭСФ № 4417 от 05.10.2026"
                  autoFocus
                />
              </label>
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

            {(step.type === "ISSUE_ACT" || step.type === "ISSUE_INVOICE") && (
              <p className="text-sm text-[var(--color-text-secondary)] mb-3">
                {step.documentId
                  ? "Черновик уже создан. Проверьте его и отметьте выставленным — документ получит статус «Финальный»."
                  : "Шаблона этого типа в Конструкторе не нашлось, поэтому черновик не создан. Создайте документ вручную и отметьте шаг."}
              </p>
            )}

            {error && <p className="text-xs text-[var(--color-danger)] mb-2">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Отмена</Button>
              <Button type="submit" loading={busy} loadingText="Сохраняю…">
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
  const { data: esf } = useQuery({
    queryKey: ["esf", "settlement", settlementId],
    queryFn: () => esfApi.list().then((all) => all.filter((i) => i.settlementId === settlementId)),
    enabled: step.type === "ISSUE_ESF",
  });
  const portal = esf?.find((i) => i.fileAssetId === step.fileAssetId) ?? esf?.[0];

  if (!step.fileAssetId && !portal) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-1">
      {step.fileAssetId && (
        <Button
          size="sm"
          variant="secondary"
          disabled={opening}
          onClick={async () => {
            setOpening(true);
            try {
              await openFile(step.fileAssetId!);
            } finally {
              setOpening(false);
            }
          }}
        >
          <FileText className="w-3.5 h-3.5" />
          {step.type === "ISSUE_ESF" ? "Открыть PDF" : "Открыть файл"}
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
    </div>
  );
}
