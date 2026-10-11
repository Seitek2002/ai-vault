"use client";

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui';
import { type CreateEsfDraft } from '@/lib/api/esf';
import { EsfDraftModal } from './EsfDraftModal';

/**
 * Карточка шага остаётся короткой: строки услуг заполняются в отдельном окне,
 * где помещаются период, дата поставки и длинные названия услуг.
 */
export function EsfDraftEditor({ settlementId, actPdfId, creating, error, onCreate, onPreviewAct }: {
  settlementId: string; actPdfId: string | null; creating: boolean; error: string;
  onCreate: (data: CreateEsfDraft) => void;
  onPreviewAct: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!actPdfId) return <p className="text-sm text-[var(--color-text-secondary)]">Сначала загрузите PDF акта в шаге «Выставить акт» этого расчёта. После загрузки создание ЭСФ станет доступно.</p>;

  return <div className="mb-3 space-y-2 text-sm">
    <Button type="button" variant="secondary" onClick={() => setOpen(true)} disabled={creating}>
      <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />Заполнить новую ЭСФ
    </Button>
    <p className="text-[var(--color-text-secondary)]">Откроем отдельное окно: услуги из прошлой ЭСФ партнёра, период по умолчанию — предыдущий месяц. Проверьте строки по PDF акта перед созданием.</p>
    {error && !open && <p role="alert" className="text-[var(--color-danger-text)]">{error}</p>}
    {open && <EsfDraftModal settlementId={settlementId} creating={creating} error={error}
      onCreate={onCreate} onPreviewAct={onPreviewAct} onClose={() => setOpen(false)} />}
  </div>;
}
