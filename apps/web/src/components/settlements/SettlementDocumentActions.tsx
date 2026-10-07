"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DocumentType } from '@ai-vault/types';
import { FilePlus2, Download, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { fieldClassName } from '@/components/ui/Input';
import { settlementsApi, MONTH_NAMES, type Settlement, type SettlementStep } from '@/lib/api/settlements';
import { documentsApi } from '@/lib/api/documents';
import { templatesApi } from '@/lib/api/templates';
import { exportPdf, exportDocx } from '@/lib/api/export';

export function SettlementDocumentActions({ settlement, step, disabled, onBusyChange }: {
  settlement: Settlement; step: SettlementStep; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const qc = useQueryClient();
  const [created, setCreated] = useState<{ id: string; title: string; number: string | null } | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<'pdf' | 'docx' | null>(null);
  const act = step.type === 'ISSUE_ACT';
  const type = act ? DocumentType.AVR : DocumentType.INVOICE_PAYMENT;
  const documentId = created?.id || step.documentId;
  const documentQuery = useQuery({ queryKey: ['document', documentId], queryFn: () => documentsApi.get(documentId!), enabled: !!documentId });
  const templates = useQuery({ queryKey: ['templates', type], queryFn: () => templatesApi.list(type), enabled: !documentId });
  const document = created ?? documentQuery.data;
  const create = useMutation({
    mutationFn: () => settlementsApi.generateStepDocument(settlement.id, step.id, templateId || undefined),
    onMutate: () => { setError(''); onBusyChange(true); },
    onSuccess: data => {
      setCreated(data);
      void qc.invalidateQueries({ queryKey: ['settlements'] });
      void qc.invalidateQueries({ queryKey: ['settlement', settlement.id] });
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: e => setError(e instanceof Error ? e.message : 'Не удалось создать документ. Повторите попытку.'),
    onSettled: () => onBusyChange(false),
  });
  const busy = disabled || create.isPending || !!downloading;
  async function download(format: 'pdf' | 'docx') {
    if (!documentId || !document) return;
    setError(''); setDownloading(format); onBusyChange(true);
    try {
      if (format === 'pdf') await exportPdf(documentId, document.title);
      else await exportDocx(documentId, document.title);
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось скачать документ. Повторите попытку.'); }
    finally { setDownloading(null); onBusyChange(false); }
  }
  return <section className="mb-5 space-y-3 border-b border-[var(--color-border)] pb-4" aria-label="Создание документа">
    <p className="text-sm text-[var(--color-text-secondary)]">{MONTH_NAMES[settlement.month - 1]} {settlement.year} · Комплект №{settlement.sequence ?? 1}</p>
    {documentId ? <>
      <p className="text-sm font-medium text-[var(--color-text-primary)]">{act ? 'Акт' : 'Счёт'}{document?.number ? ` № ${document.number}` : ''} создан</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/documents/${documentId}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-[var(--color-accent)] hover:underline focus-visible:outline-2">
          Открыть редактор<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Button type="button" variant="secondary" disabled={busy || !document} onClick={() => void download('pdf')} loading={downloading === 'pdf'} loadingText="Готовлю PDF…"><Download className="h-4 w-4" aria-hidden="true" />Скачать PDF</Button>
        <Button type="button" variant="ghost" disabled={busy || !document} onClick={() => void download('docx')} loading={downloading === 'docx'} loadingText="Готовлю DOCX…">Скачать DOCX</Button>
      </div>
      <p className="text-sm text-[var(--color-text-secondary)]">Проверьте реквизиты и услуги в редакторе. Затем загрузите PDF выставленного документа ниже, чтобы завершить шаг.</p>
    </> : <>
      <p className="text-sm text-[var(--color-text-secondary)]">Создадим черновик с реквизитами сторон, номером договора, суммой и периодом этого расчёта. Названия услуг и таблицу можно изменить в редакторе.</p>
      {!!templates.data?.length && <label className="block text-sm text-[var(--color-text-secondary)]">Шаблон
        <select value={templateId} disabled={busy} onChange={e => setTemplateId(e.target.value)} className={`${fieldClassName} mt-1`}>
          <option value="">Шаблон по умолчанию</option>
          {templates.data.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>}
      <Button type="button" variant="secondary" disabled={busy} onClick={() => create.mutate()} loading={create.isPending} loadingText="Создаю документ…"><FilePlus2 className="h-4 w-4" aria-hidden="true" />{act ? 'Создать акт' : 'Создать счёт на оплату'}</Button>
      <p className="text-xs text-[var(--color-text-secondary)]">Можно также сразу загрузить готовый PDF ниже.</p>
    </>}
    {(error || documentQuery.error) && <p role="alert" className="text-sm text-[var(--color-danger)]">{error || 'Не удалось загрузить документ. Закройте окно и попробуйте снова.'}</p>}
  </section>;
}
