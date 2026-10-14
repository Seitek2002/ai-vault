"use client";

import { Check, FilePenLine, Send, CircleX, CircleHelp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SettlementStep } from "@/lib/api/settlements";
import { STEP_LABELS } from "@/lib/api/settlements";

export type StepState = "done" | "overdue" | "pending";
type DisplayStepState = StepState | "draft" | "sent" | "accepted" | "rejected" | "revoked" | "unknown";

const PORTAL_STATES = { NEW: 'draft', SENT: 'sent', ACCEPTED: 'accepted', REJECTED: 'rejected', REVOKED: 'revoked', UNKNOWN: 'unknown' } as const;
const PORTAL_LABELS: Partial<Record<DisplayStepState, string>> = {
  draft: 'Черновик', sent: 'Отправлена', accepted: 'Принята', rejected: 'Отклонена', revoked: 'Отозвана', unknown: 'Неизвестно',
};

export function stepState(step: SettlementStep): StepState {
  if (step.doneAt) return "done";
  return step.overdue ? "overdue" : "pending";
}

function displayState(step: SettlementStep): DisplayStepState {
  return step.type === 'ISSUE_ESF' && step.esfStatus ? PORTAL_STATES[step.esfStatus] : stepState(step);
}

const STATE_STYLES: Record<DisplayStepState, string> = {
  done: "bg-[rgba(74,222,128,0.12)] text-[#4ADE80] border-[rgba(74,222,128,0.3)]",
  overdue: "bg-[rgba(248,113,113,0.12)] text-[#F87171] border-[rgba(248,113,113,0.35)]",
  pending:
    "bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] border-[var(--color-border)]",
  draft: "bg-[rgba(251,191,36,0.12)] text-[#FBBF24] border-[rgba(251,191,36,0.3)]",
  sent: "bg-[var(--color-accent-dim)] text-[var(--color-accent)] border-[var(--color-accent-border)]",
  accepted: "bg-[rgba(74,222,128,0.12)] text-[#4ADE80] border-[rgba(74,222,128,0.3)]",
  rejected: "bg-[rgba(248,113,113,0.12)] text-[#F87171] border-[rgba(248,113,113,0.35)]",
  revoked: "bg-[rgba(248,113,113,0.12)] text-[#F87171] border-[rgba(248,113,113,0.35)]",
  unknown: "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border-[var(--color-border)]",
};

function Glyph({ state }: { state: DisplayStepState }) {
  if (state === "done" || state === 'accepted') return <Check className="w-3 h-3" strokeWidth={3} aria-hidden="true" />;
  const Icon = { draft: FilePenLine, sent: Send, rejected: CircleX, revoked: CircleX, unknown: CircleHelp }[state as 'draft' | 'sent' | 'rejected' | 'revoked' | 'unknown'];
  if (Icon) return <Icon className="w-3 h-3" aria-hidden="true" />;
  if (state === "overdue") return <span className="w-2 h-2 rounded-full bg-current" aria-hidden />;
  return <span className="w-2 h-2 rounded-full border border-current" aria-hidden />;
}

function stepTitle(step: SettlementStep, state: DisplayStepState) {
  const portal = PORTAL_LABELS[state];
  if (portal) return `ЭСФ — ${portal}`;
  return step.doneAt
    ? `${STEP_LABELS[step.type]} — готово${step.doneByName ? `, ${step.doneByName}` : ''}`
    : `${STEP_LABELS[step.type]} — ${step.overdue ? 'просрочено' : 'ожидает выполнения'}`;
}

/**
 * Ячейка шага в таблице месяца. Кнопка, а не span: любое состояние шага
 * открывает действие, поэтому вся сетка доступна и с клавиатуры.
 */
export function StepCell({ step, onClick }: { step: SettlementStep; onClick: () => void }) {
  const state = displayState(step);
  const title = stepTitle(step, state);
  const portal = PORTAL_LABELS[state];

  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "h-10 w-full flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 rounded-lg border transition-colors",
        "hover:border-[var(--color-accent-border)] hover:text-[var(--color-accent)]",
        STATE_STYLES[state],
      )}
    >
      <span className="flex items-center justify-center gap-0.5 whitespace-nowrap [&>svg]:shrink-0">
        <Glyph state={state} />
        {portal && state !== 'accepted' && <span className="text-[10px] leading-none font-medium">{portal}</span>}
      </span>
    </button>
  );
}

/** Компактный чип для мобильных карточек — с подписью шага. */
export function StepChip({ step, onClick }: { step: SettlementStep; onClick: () => void }) {
  const state = displayState(step);
  return (
    <button
      onClick={onClick}
      title={stepTitle(step, state)}
      aria-label={stepTitle(step, state)}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors",
        STATE_STYLES[state],
      )}
    >
      <Glyph state={state} />
      {STEP_LABELS[step.type]}
      {PORTAL_LABELS[state] && state !== 'accepted' && <span>· {PORTAL_LABELS[state]}</span>}
    </button>
  );
}
