"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, FileText, ExternalLink, Check } from "lucide-react";
import { CONTRACT_AMOUNT_LABELS } from "@ai-vault/doc-placeholders";
import { contractsApi, type Contract, type ContractAttachment } from "@/lib/api/contracts";
import type { HistoryFile, HistorySettlement } from "@/lib/api/contract-history";
import { MONTH_NAMES, STEP_LABELS, formatMoney } from "@/lib/api/settlements";
import { ESF_STATUS_LABELS, esfApi } from "@/lib/api/esf";
import { Button, Modal, Spinner } from "@/components/ui";
import { StepFilePreview } from "@/components/settlements/StepFilePreview";

export function historyDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("ru-RU", { timeZone: "UTC" }) : "Не указана";
}
const period = (year: number, month: number) => `${MONTH_NAMES[month - 1]} ${year}`;
const STATUS = { closed: "Завершён", overdue: "Есть просрочка", waiting_partner: "Ждём партнёра", waiting_us: "В работе" };
const DOC_STATUS: Record<string, string> = { DRAFT: "Черновик", FINAL: "Готов", SENT: "Отправлен", SIGNED: "Подписан" };

export function ContractHistory({ contract }: { contract: Contract }) {
  const [preview, setPreview] = useState<ContractAttachment | null>(null);
  const query = useQuery({ queryKey: ["contract-history", contract.id], queryFn: () => contractsApi.history(contract.id), staleTime: 30_000 });
  const FileButton = ({ file, label }: { file: ContractAttachment; label?: string }) => (
    <button onClick={() => setPreview(file)} className="inline-flex max-w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-bg-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]" title={file.originalName}>
      <FileText className="size-3.5 shrink-0" /><span className="truncate">{label ?? file.originalName}</span>
    </button>
  );
  const attachments = [
    ...(contract.contractPdf ? [{ file: contract.contractPdf, label: "PDF договора" }] : []),
    ...(contract.ndaPdf ? [{ file: contract.ndaPdf, label: "Соглашение о конфиденциальности" }] : []),
    ...contract.additionalPdfs.map((file) => ({ file, label: file.originalName })),
    ...(contract.terminationPdf ? [{ file: contract.terminationPdf, label: "Уведомление о расторжении" }] : []),
  ];
  const months = new Map<string, HistorySettlement[]>();
  for (const settlement of query.data?.settlements ?? []) {
    const key = `${settlement.year}-${settlement.month}`;
    months.set(key, [...(months.get(key) ?? []), settlement]);
  }
  return (
    <div className="border-t border-[var(--color-border)]">
      <div className="bg-[var(--color-bg-base)] px-4 py-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Условия договора</h3>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-xs lg:grid-cols-4">
          <Info label="Дата начала / подписания" value={historyDate(contract.startDate)} />
          <Info label="Дата окончания" value={contract.effectiveEndDate || contract.endDate ? historyDate(contract.effectiveEndDate ?? contract.endDate) : "Без ограничения"} />
          <Info label="Платёж" value={`${formatMoney(contract.defaultAmount, contract.currency)} ${CONTRACT_AMOUNT_LABELS[contract.billingPeriod ?? "MONTHLY"]}`} />
          <Info label="Выставление счёта" value={`${contract.billingDay}-го числа · оплата +${contract.paymentDueDays} дн. от конца периода`} />
          <Info label="Срок договора" value={contract.termValue ? `${contract.termUnit === "YEARS" ? contract.termValue * 12 : contract.termValue} мес.` : "По указанным датам"} />
          <Info label="Автопродление" value={contract.autoRenew ? "Включено" : "Выключено"} />
          <Info label="ЭСФ" value={contract.esfRequired ? "Требуется" : "Не требуется"} />
          <Info label="Состояние" value={contract.terminationDate ? `Расторгнут ${historyDate(contract.terminationDate)}` : contract.active ? "Действующий" : "Не действует"} />
        </dl>
        {contract.effectiveEndDate && contract.endDate && contract.effectiveEndDate.slice(0, 10) !== contract.endDate.slice(0, 10) && <p className="mt-3 text-xs text-[var(--color-text-muted)]">Первоначальное окончание: {historyDate(contract.endDate)}. Срок продлён автоматически.</p>}
        {(attachments.length > 0 || contract.documentId) && <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-[var(--color-border)] pt-2">
          {attachments.map(({ file, label }) => <FileButton key={file.id} file={file} label={label} />)}
          {contract.documentId && <Link className="px-2 py-1 text-xs text-[var(--color-accent)] hover:underline" href={`/documents/${contract.documentId}`}>Документ договора ↗</Link>}
        </div>}
      </div>
      <div className="px-4 py-4">
        <h3 className="text-sm font-semibold">Документы и оплаты по месяцам</h3>
        {query.isPending ? <div role="status" className="flex items-center gap-2 py-5 text-xs text-[var(--color-text-secondary)]"><Spinner /> Загружаем историю…</div> : query.isError ? <div role="alert" className="py-4 text-sm text-[var(--color-danger)]">Не удалось загрузить историю. <Button size="sm" variant="secondary" onClick={() => void query.refetch()}>Повторить</Button></div> : query.data?.settlements.length === 0 ? <p className="py-4 text-sm text-[var(--color-text-muted)]">По этому договору ещё нет расчётов и привязанных документов.</p> : <>
          {query.data?.totals.map((total) => <dl key={total.currency} className="my-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Info label="Начислено" value={formatMoney(total.billed, total.currency)} />
            <Info label="Оплачено" value={formatMoney(total.paid, total.currency)} />
            <Info label="К оплате" value={formatMoney(total.due, total.currency)} />
            <Info label="Переплата" value={formatMoney(total.overpaid, total.currency)} />
          </dl>)}
          <p className="mb-2 text-xs text-[var(--color-text-muted)]">Показаны все расчётные месяцы. Удалённые комплекты сохранены в истории и исключены из итогов. Переплата отображается отдельно от долга.</p>
          {[...months.entries()].map(([key, sets], index) => <details key={key} open={index === 0} className="group/month border-t border-[var(--color-border)]">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-3 text-sm focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]">
              <ChevronDown className="size-4 shrink-0 text-[var(--color-text-muted)] transition-transform group-open/month:rotate-180" />
              <span className="font-medium">{period(sets[0]!.year, sets[0]!.month)}</span>
              <span className="ml-auto text-xs text-[var(--color-text-muted)]">Комплектов: {sets.length}</span>
            </summary>
            <div className="space-y-4 pb-4">{sets.map((set) => <SettlementHistory key={set.id} set={set} contractId={contract.id} onFile={setPreview} />)}</div>
          </details>)}
        </>}
      </div>
      {preview && <Modal onClose={() => setPreview(null)} className="max-w-5xl overflow-clip"><StepFilePreview fileId={preview.id} title={preview.originalName} onClose={() => setPreview(null)} /></Modal>}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="mb-1 text-[var(--color-text-muted)]">{label}</dt><dd className="break-words font-medium text-[var(--color-text-primary)]">{value}</dd></div>;
}

function SettlementHistory({ set, contractId, onFile }: { set: HistorySettlement; contractId: string; onFile: (file: HistoryFile) => void }) {
  const documents = [...new Map([...set.documents, ...set.steps.flatMap((s) => s.document ? [s.document] : [])].map((d) => [d.id, d])).values()];
  const used = new Set([...documents.flatMap((d) => d.files.map((f) => f.id)), ...set.steps.flatMap((s) => s.file ? [s.file.id] : []), ...set.payments.flatMap((p) => p.file ? [p.file.id] : []), ...set.esfInvoices.flatMap((i) => i.file ? [i.file.id] : [])]);
  const FileLink = ({ file, label }: { file: HistoryFile; label?: string }) => <button className="inline-flex max-w-full items-center gap-1 text-xs text-[var(--color-accent)] hover:underline" onClick={() => onFile(file)} title={file.originalName}><FileText className="size-3 shrink-0" /><span className="truncate">{label ?? file.originalName}</span></button>;
  return <section className="min-w-0 border-l-2 border-[var(--color-border)] pl-3">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <Link href={`/settlements/${set.id}`} className="font-semibold text-[var(--color-accent)] hover:underline">Комплект №{set.sequence}{set.label ? ` · ${set.label}` : ""} ↗</Link>
      <span className={!set.deletedAt && set.status === "overdue" ? "text-[var(--color-danger)]" : "text-[var(--color-text-secondary)]"}>{set.deletedAt ? "Удалён · можно восстановить" : STATUS[set.status]}</span>
      <span className="ml-auto font-medium">{formatMoney(set.amount, set.currency)}</span>
    </div>
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-secondary)]">
      <span>Оплачено: {formatMoney(set.paidAmount, set.currency)}</span><span>К оплате: {formatMoney(set.dueAmount, set.currency)}</span>
      {set.overpaidAmount > 0 && <span>Переплата: {formatMoney(set.overpaidAmount, set.currency)}</span>}
      {set.closedAt && <span>Закрыт {historyDate(set.closedAt)}</span>}
    </div>
    <div className="mt-3 grid min-w-0 gap-4 lg:grid-cols-2">
      <div className="min-w-0">
        <h4 className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">Акты, счета и шаги</h4>
        <ul className="space-y-2 text-xs">{set.steps.map((step) => <li key={step.type} className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="inline-flex items-center gap-1 font-medium">{step.doneAt && <Check className="size-3 text-[var(--color-success)]" />}{STEP_LABELS[step.type]}</span><span className="text-[var(--color-text-muted)]">{step.doneAt ? historyDate(step.doneAt) : step.dueDate ? `Не выполнен · срок ${historyDate(step.dueDate)}` : "Не выполнен"}{step.doneByName && ` · ${step.doneByName}`}</span>{step.file && <FileLink file={step.file} label="Скан" />}{step.evidenceUrl && /^https?:\/\//i.test(step.evidenceUrl) && <a href={step.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">Ссылка ↗</a>}</div>
          {step.note && <p className="mt-0.5 break-words text-[var(--color-text-muted)]">{step.note}</p>}
        </li>)}</ul>
        <ul className="mt-2 space-y-2 text-xs">{documents.map((doc) => <li key={doc.id} className="min-w-0"><Link href={`/documents/${doc.id}`} className="break-words text-[var(--color-accent)] hover:underline">{doc.number ? `№ ${doc.number} · ` : ""}{doc.title} ↗</Link><span className="ml-2 text-[var(--color-text-muted)]">{DOC_STATUS[doc.status] ?? doc.status}{doc.isArchived ? " · В архиве" : ""}</span><div className="flex flex-wrap gap-2">{doc.files.map((f) => <FileLink key={f.id} file={f} />)}</div></li>)}</ul>
        {set.files.filter((f) => !used.has(f.id)).map((f) => <div key={f.id} className="mt-2"><FileLink file={f} /></div>)}
      </div>
      <div className="min-w-0 space-y-3">
        <div><h4 className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">Привязанные ЭСФ</h4>
          {set.esfInvoices.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">Нет ЭСФ из кабинета. Ссылки и сканы указаны в шагах.</p> : <ul className="space-y-3 text-xs">{set.esfInvoices.map((invoice) => <li key={invoice.id} className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><span className="break-all font-medium">№ {invoice.number ?? "Без номера"}</span><span className="text-[var(--color-text-muted)]">{ESF_STATUS_LABELS[invoice.status]} · {historyDate(invoice.issuedOn ?? invoice.deliveryDate)}</span></div>
            <p className="mt-0.5 text-[var(--color-text-secondary)]">Полная сумма ЭСФ: {formatMoney(invoice.amount)}</p>
            <p className="mt-0.5 break-words text-[var(--color-text-muted)]">Периоды: {invoice.periods.map((p) => `${period(p.year, p.month)} · №${p.sequence}${p.contractId !== contractId ? ` · договор ${p.contractNumber}` : ""}`).join("; ") || "Не указаны"}</p>
            {invoice.note && <p className="mt-1 break-words text-[var(--color-text-secondary)]">{invoice.note}</p>}
            <details className="mt-1"><summary className="cursor-pointer text-[var(--color-text-muted)]">ID и просмотр ЭСФ</summary><p className="my-1 break-all text-[var(--color-text-muted)]">ID на портале: {invoice.uuid}</p><div className="flex gap-3">{invoice.file && <FileLink file={invoice.file} label="PDF ЭСФ" />}<a href={esfApi.portalPdfUrl(invoice.uuid)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline">На портале <ExternalLink className="size-3" /></a></div></details>
          </li>)}</ul>}
        </div>
        <div className="border-t border-[var(--color-border)] pt-2"><h4 className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">Оплаты</h4>
          {set.payments.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">Платежи не зарегистрированы.</p> : <ul className="space-y-2 text-xs">{set.payments.map((payment) => <li key={payment.id}><div className="flex flex-wrap gap-2"><span className="font-medium">{formatMoney(payment.amount, set.currency)}</span><span className="text-[var(--color-text-muted)]">{historyDate(payment.paidAt)}</span>{payment.file && <FileLink file={payment.file} label="Подтверждение" />}</div>{payment.reference && <p className="mt-0.5 break-words text-[var(--color-text-secondary)]">{payment.reference}</p>}</li>)}</ul>}
        </div>
      </div>
    </div>
  </section>;
}
