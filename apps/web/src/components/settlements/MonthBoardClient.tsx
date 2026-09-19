"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  MONTH_NAMES,
  STEP_LABELS,
  STEP_ORDER,
  formatMoney,
  settlementsApi,
  type Settlement,
  type SettlementStep,
} from "@/lib/api/settlements";
import { esfApi } from "@/lib/api/esf";
import { settingsApi } from "@/lib/api/settings";
import { EsfInbox } from "./EsfInbox";
import { StepActionModal } from "./StepActionModal";
import { StepCell, StepChip } from "./StepBadge";

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
      <PageHeader
        title="Этот месяц"
        subtitle="Расчёты с партнёрами: акты, счета, ЭСФ, оплаты"
        actions={
          <>
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
            <Button
              onClick={() => generate.mutate()}
              loading={generate.isPending}
              loadingText="Формирую…"
            >
              Сформировать месяц
            </Button>
          </>
        }
      />

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
          <Card className="hidden lg:block shrink-0 overflow-hidden p-0">
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
                    </td>
                    <td className="px-3 py-2 text-right">
                      <p className="text-sm text-[var(--color-text-primary)] whitespace-nowrap">
                        {formatMoney(s.amount, s.currency)}
                      </p>
                      {s.dueAmount > 0 && s.paidAmount > 0 && (
                        <p className="text-xs text-[#FBBF24] whitespace-nowrap">
                          остаток {formatMoney(s.dueAmount, s.currency)}
                        </p>
                      )}
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
                <p className="text-xs text-[var(--color-text-muted)] mb-3">
                  {formatMoney(s.amount, s.currency)}
                  {s.dueAmount > 0 && s.paidAmount > 0 && (
                    <> · остаток {formatMoney(s.dueAmount, s.currency)}</>
                  )}
                </p>
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
        <EsfInbox year={year} month={month} />
      )}

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
