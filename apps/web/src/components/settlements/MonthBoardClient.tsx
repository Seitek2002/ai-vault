"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Plus, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { Button, Card, EmptyState, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  MONTH_NAMES,
  STEP_LABELS,
  STEP_ORDER,
  formatMoney,
  settlementsApi,
  settlementSetLabel,
  type Settlement,
  type SettlementStep,
} from "@/lib/api/settlements";
import { esfApi } from "@/lib/api/esf";
import { settingsApi } from "@/lib/api/settings";
import { EsfInbox } from "./EsfInbox";
import { StepCell, StepChip } from "./StepBadge";
import { AmountEditor } from "./AmountEditor";

const StepActionModal = dynamic(() => import('./StepActionModal').then((m) => m.StepActionModal));
const AddSettlementModal = dynamic(() => import('./AddSettlementModal').then((m) => m.AddSettlementModal));
const DeleteSettlementModal = dynamic(() => import('./DeleteSettlementModal').then((m) => m.DeleteSettlementModal));
const DeletedSettlements = dynamic(() => import('./DeletedSettlements').then((m) => m.DeletedSettlements));

const STATUS_META: Record<Settlement["status"], { label: string; className: string }> = {
  closed: { label: "Закрыт", className: "bg-[rgba(74,222,128,0.12)] text-[#4ADE80]" },
  overdue: { label: "Просрочен", className: "bg-[rgba(248,113,113,0.12)] text-[#F87171]" },
  waiting_partner: { label: "Ждём партнёра", className: "bg-[rgba(251,191,36,0.12)] text-[#FBBF24]" },
  waiting_us: {
    label: "За нами",
    className: "bg-[var(--color-accent-dim)] text-[var(--color-accent)]",
  },
};

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "danger" | "warning";
}) {
  const valueColor =
    accent === "danger"
      ? "text-[#F87171]"
      : accent === "warning"
        ? "text-[#FBBF24]"
        : "text-[var(--color-text-primary)]";
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold", valueColor)}>{value}</p>
    </Card>
  );
}

export function MonthBoardClient() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selected, setSelected] = useState<{ settlement: Settlement; step: SettlementStep } | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState<{ contractId?: string } | null>(null);
  const [removing, setRemoving] = useState<Settlement | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["settlements", year, month],
    queryFn: () => settlementsApi.board(year, month),
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsApi.getSettings(),
  });

  const syncEsf = useMutation({
    mutationFn: () => esfApi.sync(),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["settlements"] });
      void qc.invalidateQueries({ queryKey: ["esf"] });
      void qc.invalidateQueries({ queryKey: ["settings"] });
      setNotice(
        `ЭСФ: получено ${r.fetched}, новых ${r.created}, привязано ${r.matched}, без расчёта ${r.unmatched}` +
          (r.errors.length ? ` · ошибок ${r.errors.length}` : ""),
      );
    },
    onError: (err) =>
      setNotice(err instanceof ApiError ? err.message : "Не удалось синхронизировать ЭСФ"),
  });

  const generate = useMutation({
    mutationFn: () => settlementsApi.generate(year, month),
    onSuccess: (result) => {
      setNotice("");
      void qc.invalidateQueries({ queryKey: ["settlements"] });
      void qc.invalidateQueries({ queryKey: ["documents"] });
      if (result.created === 0) {
        setNotice(
          result.skipped > 0
            ? "Все расчёты за этот месяц уже созданы."
            : "Нет активных договоров — сначала заведите договор.",
        );
      }
    },
    onError: (err) =>
      setNotice(err instanceof ApiError ? err.message : "Не удалось сформировать"),
  });

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth() + 1);
  }

  const settlements = data?.settlements ?? [];
  const totals = data?.totals;

  return (
    <div className="p-6 lg:p-8 h-full flex flex-col overflow-y-auto">
      <div className="mb-6 flex flex-col gap-4 shrink-0 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Этот месяц</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            Расчёты с партнёрами: акты, счета, ЭСФ, оплаты
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
            <button
              onClick={() => shiftMonth(-1)}
              aria-label="Предыдущий месяц"
              className="px-2 py-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-sm font-medium text-[var(--color-text-primary)] min-w-[130px] text-center">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button
              onClick={() => shiftMonth(1)}
              aria-label="Следующий месяц"
              className="px-2 py-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {settings?.esfConfigured && (
            <Button
              variant="secondary"
              onClick={() => syncEsf.mutate()}
              loading={syncEsf.isPending}
              loadingText="Тяну ЭСФ…"
              title="Забрать выставленные ЭСФ из кабинета esf.salyk.kg"
            >
              <RefreshCw className="w-4 h-4" />
              ЭСФ
            </Button>
          )}
          <Button variant="secondary" onClick={() => setAdding({})}>
            <Plus className="w-4 h-4" /> Добавить акт и счёт
          </Button>
          <Button
            onClick={() => generate.mutate()}
            loading={generate.isPending}
            loadingText="Формирую…"
          >
            Сформировать месяц
          </Button>
        </div>
      </div>

      {notice && (
        <p className="mb-4 text-sm text-[var(--color-text-secondary)] shrink-0">{notice}</p>
      )}

      {totals && settlements.length > 0 && (
        <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
          <StatCard
            label="Выставить"
            value={String(totals.toIssue)}
            {...(totals.toIssue > 0 ? { accent: "warning" as const } : {})}
          />
          <StatCard label="Ждём подписи" value={String(totals.waitingSigned)} />
          <StatCard label="Ждём ЭСФ" value={String(totals.waitingEsf)} />
          <StatCard
            label="Не оплачено"
            value={formatMoney(totals.unpaidAmount)}
            {...(totals.unpaidAmount > 0 ? { accent: "danger" as const } : {})}
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : settlements.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="w-6 h-6" />}
          title={`За ${MONTH_NAMES[month - 1]?.toLowerCase()} ${year} расчётов нет`}
          description="Нажмите «Сформировать месяц» — расчёты создадутся по активным договорам"
          action={
            <Link href="/contracts">
              <Button variant="secondary">К договорам</Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Десктоп: таблица «партнёр × шаги» */}
          <Card className="hidden lg:block shrink-0 overflow-x-auto p-0">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[var(--color-bg-elevated)]">
                  <th className="text-left text-xs font-medium text-[var(--color-text-muted)] px-4 py-2.5">
                    Партнёр
                  </th>
                  <th className="text-right text-xs font-medium text-[var(--color-text-muted)] px-3 py-2.5">
                    Сумма
                  </th>
                  {STEP_ORDER.map((type) => (
                    <th
                      key={type}
                      className="text-center text-xs font-medium text-[var(--color-text-muted)] px-1 py-2.5 w-[80px]"
                    >
                      {STEP_LABELS[type]}
                    </th>
                  ))}
                  <th className="text-left text-xs font-medium text-[var(--color-text-muted)] px-3 py-2.5">
                    Статус
                  </th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)] transition-colors"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/settlements/${s.id}`}
                        className="text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors"
                      >
                        {s.counterpartyName}
                      </Link>
                      <p className="text-xs text-[var(--color-text-muted)] truncate max-w-[220px]">
                        {s.contractTitle}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)] max-w-[250px] break-words">{settlementSetLabel(s)}</p>
                      <button type="button" onClick={() => setAdding({ contractId: s.contractId })}
                        aria-label={`Добавить акт и счёт: ${s.counterpartyName}`}
                        className="mt-1 text-xs text-[var(--color-accent)] hover:underline focus-visible:outline-2">+ Ещё акт и счёт</button>
                      <button type="button" onClick={() => setRemoving(s)} aria-label={`Удалить ${settlementSetLabel(s)}: ${s.counterpartyName}`}
                        className="ml-3 inline-flex min-h-8 items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)] focus-visible:outline-2"><Trash2 className="size-3" /> Удалить</button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <AmountEditor settlement={s} compact />
                    </td>
                    {STEP_ORDER.map((type) => {
                      const step = s.steps.find((x) => x.type === type);
                      return (
                        <td key={type} className="px-1 py-2">
                          {step ? (
                            <StepCell
                              step={step}
                              onClick={() => setSelected({ settlement: s, step })}
                            />
                          ) : (
                            <span
                              className="block text-center text-xs text-[var(--color-text-muted)]"
                              title="Шаг не требуется по этому договору"
                            >
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap",
                          STATUS_META[s.status].className,
                        )}
                      >
                        {STATUS_META[s.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Мобильный: карточка на партнёра */}
          <div className="lg:hidden shrink-0 flex flex-col gap-3">
            {settlements.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <Link
                    href={`/settlements/${s.id}`}
                    className="text-sm font-medium text-[var(--color-text-primary)]"
                  >
                    {s.counterpartyName}
                    <span className="block text-xs font-normal text-[var(--color-text-muted)]">
                      {s.contractTitle}
                    </span>
                    <span className="block text-xs font-normal text-[var(--color-text-secondary)]">{settlementSetLabel(s)}</span>
                  </Link>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium shrink-0",
                      STATUS_META[s.status].className,
                    )}
                  >
                    {STATUS_META[s.status].label}
                  </span>
                </div>
                <div className="mb-3">
                  <AmountEditor settlement={s} compact />
                </div>
                <button type="button" onClick={() => setAdding({ contractId: s.contractId })}
                  aria-label={`Добавить акт и счёт: ${s.counterpartyName}`}
                  className="mb-3 min-h-9 text-xs text-[var(--color-accent)] hover:underline focus-visible:outline-2">+ Ещё акт и счёт</button>
                <button type="button" onClick={() => setRemoving(s)} aria-label={`Удалить ${settlementSetLabel(s)}: ${s.counterpartyName}`}
                  className="ml-3 inline-flex min-h-9 items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)] focus-visible:outline-2"><Trash2 className="size-3.5" /> Удалить</button>
                <div className="flex flex-wrap gap-1.5">
                  {s.steps.map((step) => (
                    <StepChip
                      key={step.id}
                      step={step}
                      onClick={() => setSelected({ settlement: s, step })}
                    />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {settings?.esfConfigured && (
        <EsfInbox
          year={year}
          month={month}
          onPickMonth={(y, m) => {
            setYear(y);
            setMonth(m);
          }}
        />
      )}

      <details className="mt-5 shrink-0 border-t border-[var(--color-border)] pt-3" onToggle={(event) => setShowDeleted(event.currentTarget.open)}>
        <summary className="cursor-pointer text-xs text-[var(--color-text-secondary)] focus-visible:outline-2">Удалённые комплекты · {MONTH_NAMES[month - 1]} {year}</summary>
        {showDeleted && <DeletedSettlements year={year} month={month} />}
      </details>

      {removing && <DeleteSettlementModal settlement={removing} onClose={() => setRemoving(null)} onDeleted={() => { setNotice(`${settlementSetLabel(removing)} удалён. Его можно восстановить в «Удалённых комплектах».`); setRemoving(null); }} />}

      {adding && <AddSettlementModal year={year} month={month} {...adding} onClose={() => setAdding(null)}
        onCreated={(created) => { setAdding(null); setNotice(`${settlementSetLabel(created)} добавлен: ${created.counterpartyName}`); }} />}

      {selected && (
        <StepActionModal
          settlement={
            settlements.find((s) => s.id === selected.settlement.id) ?? selected.settlement
          }
          step={
            settlements
              .find((s) => s.id === selected.settlement.id)
              ?.steps.find((x) => x.id === selected.step.id) ?? selected.step
          }
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
