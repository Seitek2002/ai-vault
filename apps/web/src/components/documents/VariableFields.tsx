"use client";

import { useState } from "react";
import { extractVariables } from "@/lib/variableTokens";

interface VariableFieldsProps {
  bodyJson: unknown;
  onChangeValue: (key: string, value: string) => void;
  onChangeLabel: (key: string, label: string) => void;
}

const inputCls =
  "w-full px-3 py-1.5 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors";

function VariableLabel({ variableKey, label, onRename }: { variableKey: string; label: string; onRename: (label: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const trimmed = draft.trim();
          if (trimmed && trimmed !== label) onRename(trimmed);
          else setDraft(label);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setDraft(label); setEditing(false); }
        }}
        className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide bg-transparent border-b border-[var(--color-accent)] focus:outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(label); setEditing(true); }}
      title="Переименовать поле"
      className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide hover:text-[var(--color-text-secondary)] transition-colors w-fit"
    >
      {label || variableKey}
      <svg className="w-3 h-3 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    </button>
  );
}

export function VariableFields({ bodyJson, onChangeValue, onChangeLabel }: VariableFieldsProps) {
  const variables = extractVariables(bodyJson);

  if (variables.length === 0) {
    return (
      <p className="text-xs text-[var(--color-text-muted)] leading-snug">
        В этом документе нет переменных. Добавьте их в конструкторе шаблона через кнопку «Добавить переменную» в редакторе.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {variables.map((v) => (
        <div key={v.key} className="flex flex-col gap-1 group">
          <VariableLabel
            variableKey={v.key}
            label={v.label}
            onRename={(label) => onChangeLabel(v.key, label)}
          />
          <input
            type={v.varType === "date" ? "date" : "text"}
            className={inputCls}
            value={v.value}
            onChange={(e) => onChangeValue(v.key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
