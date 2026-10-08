'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button, Spinner } from "@/components/ui";
import {
  MONTH_NAMES,
  STEP_FULL_LABELS,
  formatMoney,
  settlementsApi,
  settlementSetLabel,
  type SettlementStep,
} from '@/lib/api/settlements';
import { AmountEditor } from './AmountEditor';
import { EsfOnSettlement } from './EsfInbox';
import { openFile } from '@/lib/api/files';
import { StepActionModal } from './StepActionModal';
import { stepState } from './StepBadge';
import { DeleteSettlementModal } from './DeleteSettlementModal';

const DOC_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  FINAL: 'Финальный',
  SENT: 'Отправлен',
  SIGNED: 'Подписан',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

const STATE_DOT: Record<ReturnType<typeof stepState>, string> = {
  done: 'bg-[#4ADE80]',
  overdue: 'bg-[#F87171]',
  pending: 'bg-[var(--color-border-light)]',
};

export function SettlementDetailClient({ settlementId }: { settlementId: string }) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const restore = useMutation({
    mutationFn: () => settlementsApi.restore(settlementId),
    onSuccess: () => { for (const key of ['settlements', 'settlement', 'contract-history', 'esf']) void qc.invalidateQueries({ queryKey: [key] }); },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['settlement', settlementId],
    queryFn: () => settlementsApi.get(settlementId),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!data) {
    return <p className="p-6 text-sm text-[var(--color-text-muted)]">Расчёт не найден.</p>;
  }

  const selectedStep: SettlementStep | undefined = data.steps.find((s) => s.id === selectedStepId);

  return (
    <div className="p-6 lg:p-8 h-full overflow-y-auto">
      <Link
        href="/month"
        className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
      >
        ← К месяцу
      </Link>

      <div className="mt-2 mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {data.counterpartyName}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            {data.contractTitle} · {MONTH_NAMES[data.month - 1]} {data.year}
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{settlementSetLabel(data)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {data.deletedAt ? <span className="text-sm font-medium">{formatMoney(data.amount, data.currency)}</span> : <AmountEditor settlement={data} />}
          {data.deletedAt ? <Button variant="secondary" size="sm" loading={restore.isPending} loadingText="Восстанавливаю…" onClick={() => restore.mutate()}>Восстановить комплект</Button> : <Button variant="secondary" size="sm" onClick={() => setRemoving(true)}>Удалить комплект</Button>}
        </div>
      </div>

      {data.deletedAt && <p className="mb-4 text-sm text-[var(--color-text-secondary)]">Комплект удалён {new Date(data.deletedAt).toLocaleDateString('ru-RU')}. Документы и оплаты сохранены; комплект не учитывается в итогах. Для изменения шагов восстановите его.</p>}
      {restore.isError && <p role="alert" className="mb-4 text-sm text-[var(--color-danger)]">{restore.error instanceof Error ? restore.error.message : 'Не удалось восстановить комплект.'}</p>}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Чек-лист */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Шаги</h2>
          <ul className="flex flex-col gap-1.5">
            {data.steps.map((step) => {
              const state = stepState(step);
              return (
                <li key={step.id}>
                  <button
                    disabled={!!data.deletedAt}
                    onClick={() => setSelectedStepId(step.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent-border)] transition-colors text-left"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATE_DOT[state]}`} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-[var(--color-text-primary)]">
                        {STEP_FULL_LABELS[step.type]}
                      </span>
                      {step.note && (
                        <span className="block text-xs text-[var(--color-text-muted)] truncate">
                          {step.note}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)] shrink-0">
                      {step.doneAt
                        ? new Date(step.doneAt).toLocaleDateString('ru-RU')
                        : step.dueDate
                          ? `до ${new Date(step.dueDate).toLocaleDateString('ru-RU')}`
                          : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex flex-col gap-6">
          {/* Документы */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
              Документы
            </h2>
            <div className="mb-1.5">
              <EsfOnSettlement settlementId={data.id} readOnly={!!data.deletedAt} />
            </div>
            {data.documents.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">Документов нет.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.documents.map((doc) => (
                  <li key={doc.id}>
                    <Link
                      href={`/documents/${doc.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent-border)] transition-colors"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-[var(--color-text-primary)] truncate">
                          {doc.title}
                        </span>
                        {doc.number && (
                          <span className="block text-xs text-[var(--color-text-muted)]">
                            № {doc.number}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)] shrink-0">
                        {DOC_STATUS_LABELS[doc.status] ?? doc.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Платежи */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Платежи</h2>
            {data.payments.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">Оплат пока нет.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)]"
                  >
                    <span className="text-sm text-[var(--color-text-primary)]">
                      {formatMoney(p.amount, data.currency)}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {new Date(p.paidAt).toLocaleDateString('ru-RU')}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Сканы */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
              Сканы и вложения
            </h2>
            {data.fileAssets.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">Файлов нет.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.fileAssets.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)]"
                  >
                    <button
                      onClick={() => void openFile(f.id)}
                      className="text-sm text-[var(--color-text-primary)] truncate text-left hover:text-[var(--color-accent)] transition-colors"
                      title="Открыть"
                    >
                      {f.originalName}
                    </button>
                    <span className="text-xs text-[var(--color-text-muted)] shrink-0">
                      {formatSize(f.size)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {removing && <DeleteSettlementModal settlement={data} onClose={() => setRemoving(false)} onDeleted={() => router.push('/month')} />}
      {selectedStep && !data.deletedAt && (
        <StepActionModal
          settlement={data}
          step={selectedStep}
          onClose={() => setSelectedStepId(null)}
        />
      )}
    </div>
  );
}
