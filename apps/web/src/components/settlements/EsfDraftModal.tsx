"use client";

import { useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, X } from 'lucide-react';
import { esfDeliveryDate, esfLineAmounts, type EsfLineAmounts } from '@ai-vault/doc-placeholders';
import { Button, Input, Modal, Select, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fieldClassName } from '@/components/ui/Input';
import { esfApi, type CreateEsfDraft, type EsfDraftPreview } from '@/lib/api/esf';
import { formatMoney } from '@/lib/api/settlements';
import { applyEsfPeriod, esfPeriodOptions, parsePeriodValue, periodValue, reviewEsfLines, type EditableEsfLine } from '@/lib/esf-draft';

interface Props {
  settlementId: string;
  creating: boolean;
  error: string;
  onCreate: (data: CreateEsfDraft) => void;
  onPreviewAct: () => void;
  onClose: () => void;
}

const ruDate = (iso: string) => iso.split('-').reverse().join('.');
const money = (value: number) => value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Отдельное окно для новой ЭСФ: строки услуг, период и дата поставки заполняются
 * здесь, а не в тесной карточке шага. Образец берём с портала, период по
 * умолчанию — предыдущий завершившийся месяц, реквизиты договора — наши.
 */
export function EsfDraftModal({ settlementId, creating, error, onCreate, onPreviewAct, onClose }: Props) {
  const preview = useQuery({
    queryKey: ['esf-draft-preview', settlementId],
    queryFn: () => esfApi.draftPreview(settlementId),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  function close() {
    if (!creating) onClose();
  }

  // Escape закрывает только это окно — карточка шага под ним остаётся открытой.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  return <Modal onClose={close} className="max-w-5xl flex max-h-[92vh] flex-col">
    <div onKeyDown={onKeyDown} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Новая ЭСФ на портале</h3>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">
            {preview.data ? `${preview.data.contractTitle} · расчёт за ${preview.data.settlementPeriod}` : 'Готовим строки услуг…'}
          </p>
        </div>
        <button type="button" onClick={close} aria-label="Закрыть"
          className="rounded-lg p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {preview.isPending && <div className="flex items-center gap-3 px-5 py-10 text-sm text-[var(--color-text-secondary)]">
        <Spinner /> Загружаем услуги из прошлой ЭСФ партнёра…
      </div>}

      {preview.isError && <div className="space-y-3 px-5 py-6 text-sm">
        <p role="alert" className="text-[var(--color-danger)]">{preview.error instanceof Error ? preview.error.message : 'Не удалось загрузить строки услуг.'}</p>
        <Button type="button" variant="secondary" onClick={() => void preview.refetch()}>Повторить</Button>
      </div>}

      {preview.data && <DraftForm key={preview.dataUpdatedAt} preview={preview.data} creating={creating} error={error}
        reloading={preview.isFetching} onReload={() => void preview.refetch()}
        onCreate={onCreate} onPreviewAct={onPreviewAct} />}
    </div>
  </Modal>;
}

function DraftForm({ preview, creating, error, reloading, onReload, onCreate, onPreviewAct }: {
  preview: EsfDraftPreview; creating: boolean; error: string; reloading: boolean;
  onReload: () => void; onCreate: (data: CreateEsfDraft) => void; onPreviewAct: () => void;
}) {
  const [period, setPeriod] = useState({ year: preview.periodYear, month: preview.periodMonth });
  const [delivery, setDelivery] = useState(preview.deliveryDate);
  const [edited, setEdited] = useState<EditableEsfLine[]>(
    preview.lines.map(line => ({ name: line.name, quantity: String(line.quantity), price: String(line.price) })));
  const [confirmed, setConfirmed] = useState(false);

  const reviewed = reviewEsfLines(preview.lines, edited, preview.amount);
  const rowAmounts = edited.map((_, index) => reviewed.lines[index] ? esfLineAmounts(reviewed.lines[index]!) : null);
  const counted = rowAmounts.filter((amounts): amounts is EsfLineAmounts => amounts !== null);
  const totals = counted.length === rowAmounts.length && counted.length > 0
    ? counted.reduce((sum, amounts) => ({
      net: sum.net + amounts.net, vat: sum.vat + amounts.vat,
      salesTax: sum.salesTax + amounts.salesTax, total: sum.total + amounts.total,
    }))
    : null;
  const busy = creating || reloading;
  // Самый поздний допустимый период — расчётный месяц, но не будущий.
  const now = new Date();
  const latest = Math.min(now.getUTCFullYear() * 12 + now.getUTCMonth(), preview.settlementYear * 12 + preview.settlementMonth - 1);
  const periods = esfPeriodOptions({ year: Math.floor(latest / 12), month: (latest % 12) + 1 });
  const periodName = periods.find(option => option.value === periodValue(period))?.label ?? preview.period;

  function changePeriod(value: string) {
    const next = parsePeriodValue(value);
    setPeriod(next);
    setEdited(rows => applyEsfPeriod(rows, next));
    setDelivery(esfDeliveryDate(next));
    setConfirmed(false);
  }

  function change(index: number, field: keyof EditableEsfLine, value: string) {
    setEdited(rows => rows.map((row, i) => i === index ? { ...row, [field]: value } : row));
    setConfirmed(false);
  }

  const blocked = !confirmed || !!reviewed.error || busy || error.includes('уже создан на портале');

  return <>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-[var(--color-text-secondary)]">Период услуг</p>
          <span className="mt-1 block">
            <Select value={periodValue(period)} onChange={changePeriod} disabled={busy} options={periods} title="Период услуг" />
          </span>
        </div>
        <label className="block text-[var(--color-text-secondary)]">
          Дата поставки
          <Input type="date" value={delivery} disabled={busy} max={esfDeliveryDate(period)}
            onChange={e => { setDelivery(e.target.value); setConfirmed(false); }} className="mt-1 text-base tabular-nums" />
        </label>
      </div>
      <p className="mt-2 text-[var(--color-text-secondary)]">
        ЭСФ выставляем за завершившийся месяц — по умолчанию {preview.period}. Выбранный период подставляется в названия услуг.
      </p>

      <dl className="mt-4 space-y-1 rounded-lg bg-[var(--color-bg-elevated)] px-3 py-3 text-[var(--color-text-secondary)]">
        <div className="flex flex-wrap gap-x-2">
          <dt>Договор:</dt>
          <dd className="text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
            № {preview.contractNumber}{preview.contractDate ? ` от ${ruDate(preview.contractDate)}` : ''}
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt>Номер учётной системы:</dt>
          <dd className="select-all text-[var(--color-text-primary)] [overflow-wrap:anywhere]">{preview.crmRef}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt>Образец:</dt>
          <dd className="text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
            {preview.sourceNumber ? `ЭСФ № ${preview.sourceNumber}` : 'ЭСФ без номера'} · <span className="select-all font-mono">{preview.sourceUuid}</span>
          </dd>
        </div>
        <p className="pt-1">Номер договора и номер учётной системы Vault подставит свои; единицы, ГКЭД и налоговые ставки сохранены из образца.</p>
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-semibold text-[var(--color-text-primary)]">Услуги за {periodName}</h4>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onReload}>Загрузить заново</Button>
      </div>

      <fieldset disabled={busy} className="mt-3 min-w-0">
        <legend className="sr-only">Строки услуг ЭСФ</legend>

        {/* Те же колонки, что в кабинете ЭСФ, — сверять строки построчно. */}
        <div className="hidden overflow-x-auto rounded-lg border border-[var(--color-border)] lg:block">
          <table className="w-full min-w-[880px] border-collapse">
            <thead>
              <tr className="bg-[var(--color-bg-elevated)] text-left align-bottom text-xs text-[var(--color-text-secondary)]">
                <th scope="col" className="px-2 py-2 font-medium">Номер</th>
                <th scope="col" className="px-2 py-2 font-medium">Услуги</th>
                <th scope="col" className="px-2 py-2 font-medium">Единицы измерения</th>
                <th scope="col" className="px-2 py-2 font-medium">Код ГКЭД</th>
                <th scope="col" className="px-2 py-2 font-medium">Факт. кол-во</th>
                <th scope="col" className="px-2 py-2 font-medium">Цена</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Сумма НДС</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">НСП</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Сумма НСП</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Стоимость без НДС и НсП</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Общая стоимость</th>
              </tr>
            </thead>
            <tbody>
              {edited.map((line, index) => {
                const source = preview.lines[index]!;
                const amounts = rowAmounts[index];
                return <tr key={index} className="border-t border-[var(--color-border)] align-top">
                  <td className="px-2 py-3 tabular-nums text-[var(--color-text-secondary)]">{index + 1}</td>
                  <td className="px-2 py-3">
                    <textarea rows={3} maxLength={150} value={line.name} aria-label={`Название услуги ${index + 1}`}
                      onChange={e => change(index, 'name', e.target.value)}
                      className={cn(fieldClassName, 'w-48 resize-y leading-relaxed')} />
                  </td>
                  <td className="px-2 py-3 text-[var(--color-text-secondary)]">{source.unit}</td>
                  <td className="px-2 py-3 tabular-nums text-[var(--color-text-secondary)]">{source.gked}</td>
                  <td className="px-2 py-3">
                    <Input inputMode="decimal" value={line.quantity} aria-label={`Количество, услуга ${index + 1}`}
                      onChange={e => change(index, 'quantity', e.target.value)} className="w-20 tabular-nums" />
                  </td>
                  <td className="px-2 py-3">
                    <Input inputMode="decimal" value={line.price} aria-label={`Цена, услуга ${index + 1}`}
                      onChange={e => change(index, 'price', e.target.value)} className="w-28 tabular-nums" />
                    <span className="mt-1 block text-xs text-[var(--color-text-secondary)]">{source.priceIncludesTaxes ? 'с налогами' : 'без налогов'}</span>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">{amounts ? money(amounts.vat) : '—'}
                    <span className="mt-1 block text-xs text-[var(--color-text-secondary)]">{source.vatRate}%</span>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-[var(--color-text-secondary)]">{source.salesTaxRate}%</td>
                  <td className="px-2 py-3 text-right tabular-nums">{amounts ? money(amounts.salesTax) : '—'}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{amounts ? money(amounts.net) : '—'}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{amounts ? money(amounts.total) : '—'}</td>
                </tr>;
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] font-semibold">
                <td colSpan={6} className="px-2 py-2 text-right">Всего:</td>
                <td className="px-2 py-2 text-right tabular-nums">{totals ? money(totals.vat) : '—'}</td>
                <td />
                <td className="px-2 py-2 text-right tabular-nums">{totals ? money(totals.salesTax) : '—'}</td>
                <td className="px-2 py-2 text-right tabular-nums">{totals ? money(totals.net) : '—'}</td>
                <td className="px-2 py-2 text-right tabular-nums">{totals ? money(totals.total) : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* На узком экране та же строка — карточкой. */}
        <div className="divide-y divide-[var(--color-border)] lg:hidden">
          {edited.map((line, index) => <div key={index} className="min-w-0 py-4">
            <label className="block text-[var(--color-text-secondary)]">
              Услуга {index + 1}
              <textarea rows={2} maxLength={150} value={line.name} onChange={e => change(index, 'name', e.target.value)}
                className={`${fieldClassName} mt-1 resize-y text-base leading-relaxed`} />
            </label>
            <p className="mt-1 text-[var(--color-text-secondary)]">
              {preview.lines[index]!.unit} · ГКЭД {preview.lines[index]!.gked} · НДС {preview.lines[index]!.vatRate}% · НСП {preview.lines[index]!.salesTaxRate}%
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-[var(--color-text-secondary)]">Факт. кол-во
                <Input inputMode="decimal" value={line.quantity} onChange={e => change(index, 'quantity', e.target.value)} className="mt-1 text-base tabular-nums" />
              </label>
              <label className="block text-[var(--color-text-secondary)]">Цена {preview.lines[index]!.priceIncludesTaxes ? 'с налогами' : 'без налогов'}
                <Input inputMode="decimal" value={line.price} onChange={e => change(index, 'price', e.target.value)} className="mt-1 text-base tabular-nums" />
              </label>
            </div>
            {rowAmounts[index] && <p className="mt-2 text-right text-base tabular-nums text-[var(--color-text-primary)]">
              Общая стоимость: {formatMoney(rowAmounts[index]!.total, preview.currency)}
            </p>}
          </div>)}
        </div>
      </fieldset>

      <Button type="button" variant="ghost" disabled={busy} onClick={onPreviewAct}>Открыть PDF акта для сверки</Button>
    </div>

    <div className="shrink-0 space-y-3 border-t border-[var(--color-border)] px-5 py-4 text-sm">
      <div aria-live="polite" className="text-base tabular-nums">
        <div className="flex flex-wrap justify-between gap-2">
          <span>Итого ЭСФ</span>
          <strong>{reviewed.total != null ? formatMoney(reviewed.total, preview.currency) : 'Проверьте строки'}</strong>
        </div>
        <div className="mt-1 flex flex-wrap justify-between gap-2 text-sm text-[var(--color-text-secondary)]">
          <span>Сумма расчёта</span>
          <span>{formatMoney(preview.amount, preview.currency)}</span>
        </div>
        {reviewed.error && <p className="mt-2 text-sm text-[var(--color-danger)]">{reviewed.error}</p>}
      </div>
      <label className="flex items-start gap-2 text-base text-[var(--color-text-primary)]">
        <input type="checkbox" checked={confirmed} disabled={busy || !!reviewed.error}
          onChange={e => setConfirmed(e.target.checked)} className="mt-1 accent-[var(--color-accent)]" />
        Строки и суммы совпадают с PDF акта
      </label>
      <Button type="button" variant="secondary" disabled={blocked} loading={creating} loadingText="Создаю на портале…"
        onClick={() => {
          if (blocked) return;
          onCreate({
            sourceUuid: preview.sourceUuid, sourceSignature: preview.sourceSignature,
            periodYear: period.year, periodMonth: period.month, deliveryDate: delivery,
            lines: reviewed.lines.map(({ name, quantity, price }) => ({ name, quantity, price })),
          });
        }}>
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />Создать черновик ЭСФ на портале
      </Button>
      <p className="text-[var(--color-text-secondary)]">Черновик останется в статусе «Новый». Подпись и отправка — на портале.</p>
      {error && <p role="alert" className="text-[var(--color-danger)]">{error}</p>}
    </div>
  </>;
}
