"use client";

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { esfLineAmounts } from '@ai-vault/doc-placeholders';
import { Button, Input } from '@/components/ui';
import { fieldClassName } from '@/components/ui/Input';
import { esfApi, type CreateEsfDraft, type EsfDraftPreview } from '@/lib/api/esf';
import { formatMoney } from '@/lib/api/settlements';
import { reviewEsfLines, type EditableEsfLine } from '@/lib/esf-draft';

export function EsfDraftEditor({ settlementId, actPdfId, creating, error, onCreate, onPreviewAct }: {
  settlementId: string; actPdfId: string | null; creating: boolean; error: string;
  onCreate: (data: CreateEsfDraft) => void;
  onPreviewAct: () => void;
}) {
  const [preview, setPreview] = useState<EsfDraftPreview | null>(null);
  const [edited, setEdited] = useState<EditableEsfLine[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const load = useMutation({
    mutationFn: () => esfApi.draftPreview(settlementId),
    onSuccess: data => {
      setPreview(data);
      setEdited(data.lines.map(line => ({ name: line.name, quantity: String(line.quantity), price: String(line.price) })));
      setConfirmed(false);
    },
  });
  const reviewed = preview ? reviewEsfLines(preview.lines, edited, preview.amount) : null;
  const busy = creating || load.isPending;
  function change(index: number, field: keyof EditableEsfLine, value: string) {
    setEdited(rows => rows.map((row, i) => i === index ? { ...row, [field]: value } : row));
    setConfirmed(false);
  }

  if (!actPdfId) return <p className="text-sm text-[var(--color-text-secondary)]">Сначала загрузите PDF акта в шаге «Выставить акт» этого расчёта. После загрузки создание ЭСФ станет доступно.</p>;

  return <div className="mb-3 space-y-4 text-sm">
    {!preview ? <>
      <Button type="button" variant="secondary" onClick={() => load.mutate()} loading={load.isPending} loadingText="Загружаю услуги…">
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />Подготовить строки ЭСФ
      </Button>
      <p className="text-[var(--color-text-secondary)]">Загрузим услуги из предыдущей ЭСФ партнёра и обновим период. Проверьте их по PDF акта перед созданием.</p>
    </> : <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-base font-semibold text-[var(--color-text-primary)]">Услуги за {preview.period}</h4>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => load.mutate()}>Загрузить заново</Button>
      </div>
      <div className="space-y-1">
        <p className="text-[var(--color-text-primary)] break-words">Образец: {preview.sourceNumber ? `ЭСФ № ${preview.sourceNumber}` : 'ЭСФ без номера'}</p>
        <p className="text-[var(--color-text-secondary)]">ID ЭСФ на портале: <span className="font-mono break-all select-all text-[var(--color-text-primary)]">{preview.sourceUuid}</span></p>
        <p className="text-[var(--color-text-secondary)]">Единицы, ГКЭД и налоговые ставки сохранены из образца.</p>
      </div>
      <fieldset disabled={busy} className="min-w-0 divide-y divide-[var(--color-border)]">
        <legend className="sr-only">Строки услуг ЭСФ</legend>
        {edited.map((line, index) => <div key={index} className="min-w-0 py-4 first:pt-0">
          <label className="block text-[var(--color-text-secondary)]">
            Услуга {index + 1}
            <textarea rows={2} maxLength={150} value={line.name} onChange={e => change(index, 'name', e.target.value)} className={`${fieldClassName} mt-1 resize-y text-base leading-relaxed`} />
          </label>
          <p className="mt-1 text-[var(--color-text-secondary)]">{preview.lines[index]!.unit} · ГКЭД {preview.lines[index]!.gked} · НДС {preview.lines[index]!.vatRate}% · НСП {preview.lines[index]!.salesTaxRate}%</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-[var(--color-text-secondary)]">Количество<Input inputMode="decimal" value={line.quantity} onChange={e => change(index, 'quantity', e.target.value)} className="mt-1 text-base tabular-nums" /></label>
            <label className="block text-[var(--color-text-secondary)]">Цена {preview.lines[index]!.priceIncludesTaxes ? 'с налогами' : 'без налогов'}<Input inputMode="decimal" value={line.price} onChange={e => change(index, 'price', e.target.value)} className="mt-1 text-base tabular-nums" /></label>
          </div>
          {reviewed?.lines[index] && <p className="mt-2 text-right text-base tabular-nums text-[var(--color-text-primary)]">Сумма: {formatMoney(esfLineAmounts(reviewed.lines[index]!).total, preview.currency)}</p>}
        </div>)}
      </fieldset>
      <div aria-live="polite" className="border-t border-[var(--color-border)] pt-3 text-base tabular-nums">
        <div className="flex flex-wrap justify-between gap-2"><span>Итого ЭСФ</span><strong>{reviewed?.total != null ? formatMoney(reviewed.total, preview.currency) : 'Проверьте строки'}</strong></div>
        <div className="mt-1 flex flex-wrap justify-between gap-2 text-sm text-[var(--color-text-secondary)]"><span>Сумма расчёта</span><span>{formatMoney(preview.amount, preview.currency)}</span></div>
        {reviewed?.error && <p className="mt-2 text-sm text-[var(--color-danger)]">{reviewed.error}</p>}
      </div>
      <Button type="button" variant="ghost" disabled={busy} onClick={onPreviewAct}>Открыть PDF акта для сверки</Button>
      <label className="flex items-start gap-2 text-base text-[var(--color-text-primary)]">
        <input type="checkbox" checked={confirmed} disabled={busy || !!reviewed?.error} onChange={e => setConfirmed(e.target.checked)} className="mt-1 accent-[var(--color-accent)]" />
        Строки и суммы совпадают с PDF акта
      </label>
      <Button type="button" variant="secondary" disabled={!confirmed || !reviewed || !!reviewed.error || busy || error.includes('уже создан на портале')} loading={creating} loadingText="Создаю на портале…" onClick={() => {
        if (reviewed && !reviewed.error && confirmed) onCreate({ sourceUuid: preview.sourceUuid, sourceSignature: preview.sourceSignature,
          lines: reviewed.lines.map(({ name, quantity, price }) => ({ name, quantity, price })) });
      }}><FileText className="h-4 w-4 shrink-0" aria-hidden="true" />Создать черновик ЭСФ на портале</Button>
      <p className="text-[var(--color-text-secondary)]">Номер учётной системы: <span className="break-all">{preview.crmRef}</span>. Подпись и отправка — на портале.</p>
    </>}
    {(load.error || error) && <p role="alert" className="text-[var(--color-danger)]">{error || (load.error instanceof Error ? load.error.message : 'Не удалось загрузить строки. Повторите попытку.')}</p>}
  </div>;
}
