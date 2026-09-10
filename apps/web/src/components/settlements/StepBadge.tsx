"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SettlementStep } from "@/lib/api/settlements";
import { STEP_LABELS, formatDueDate } from "@/lib/api/settlements";

export type StepState = "done" | "overdue" | "pending";

export function stepState(step: SettlementStep): StepState {
  if (step.doneAt) return "done";
  return step.overdue ? "overdue" : "pending";
}

const STATE_STYLES: Record<StepState, string> = {
  done: "bg-[rgba(74,222,128,0.12)] text-[#4ADE80] border-[rgba(74,222,128,0.3)]",
  overdue: "bg-[rgba(248,113,113,0.12)] text-[#F87171] border-[rgba(248,113,113,0.35)]",
  pending:
    "bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] border-[var(--color-border)]",
};

function Glyph({ state }: { state: StepState }) {
  if (state === "done") return <Check className="w-3 h-3" strokeWidth={3} />;
  if (state === "overdue") return <span className="w-2 h-2 rounded-full bg-current" aria-hidden />;
  return <span className="w-2 h-2 rounded-full border border-current" aria-hidden />;
}

/**
 * Ячейка шага в таблице месяца. Кнопка, а не span: любое состояние шага
 * открывает действие, поэтому вся сетка доступна и с клавиатуры.
 */
export function StepCell({ step, onClick }: { step: SettlementStep; onClick: () => void }) {
  const state = stepState(step);
  const title = step.doneAt
    ? `${STEP_LABELS[step.type]} — готово${step.doneByName ? `, ${step.doneByName}` : ""}`
    : `${STEP_LABELS[step.type]} — до ${formatDueDate(step.dueDate)}`;

  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "w-full flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-lg border transition-colors",
        "hover:border-[var(--color-accent-border)] hover:text-[var(--color-accent)]",
        STATE_STYLES[state],
      )}
    >
      <Glyph state={state} />
      <span className="text-[10px] leading-none font-medium">
        {state === "done" ? "" : formatDueDate(step.dueDate)}
      </span>
    </button>
  );
}

/** Компактный чип для мобильных карточек — с подписью шага. */
export function StepChip({ step, onClick }: { step: SettlementStep; onClick: () => void }) {
  const state = stepState(step);
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors",
        STATE_STYLES[state],
      )}
    >
      <Glyph state={state} />
      {STEP_LABELS[step.type]}
      {state !== "done" && step.dueDate && (
        <span className="opacity-70">· {formatDueDate(step.dueDate)}</span>
      )}
    </button>
  );
}
