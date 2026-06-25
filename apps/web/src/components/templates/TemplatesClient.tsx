"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { templatesApi } from "@/lib/api/templates";
import type { TemplateDto, CreateTemplateRequest } from "@/lib/api/templates";
import { RichEditor } from "@/components/editor/RichEditor";
import { DOCUMENT_TEMPLATES, DOCUMENT_TYPE_LIST } from "@/lib/templates";
import { DocumentType } from "@ai-vault/types";

// ─── Variable helper ──────────────────────────────────────────────────────────

function extractVariables(bodyJson: unknown): string[] {
  const text = JSON.stringify(bodyJson);
  const matches = text.match(/\{\{([^}]+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2).trim()))];
}

// ─── Create / Edit modal ──────────────────────────────────────────────────────

interface TemplateModalProps {
  initial?: TemplateDto;
  onClose: () => void;
}

function TemplateModal({ initial, onClose }: TemplateModalProps) {
  const qc = useQueryClient();
  const [type, setType] = useState<DocumentType>(initial?.type ?? DocumentType.CONTRACT);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [bodyJson, setBodyJson] = useState<unknown>(
    initial?.bodyJson ?? { type: "doc", content: [{ type: "paragraph" }] },
  );
  const [tab, setTab] = useState<"editor" | "variables">("editor");

  const isEdit = !!initial;

  const mutation = useMutation({
    mutationFn: () => {
      const payload: CreateTemplateRequest = {
        type,
        name: name.trim() || DOCUMENT_TEMPLATES[type].label,
        ...(description.trim() ? { description: description.trim() } : {}),
        bodyJson,
      };
      return isEdit
        ? templatesApi.update(initial.id, payload)
        : templatesApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      onClose();
    },
  });

  const variables = extractVariables(bodyJson);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-3xl bg-[var(--color-bg-surface)] rounded-2xl border border-[var(--color-border)] shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            {isEdit ? "Редактировать шаблон" : "Новый шаблон"}
          </h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Type + Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1.5">
                Тип документа
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as DocumentType)}
                disabled={isEdit}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-50"
              >
                {DOCUMENT_TYPE_LIST.map((tpl) => (
                  <option key={tpl.type} value={tpl.type}>
                    {tpl.shortLabel} — {tpl.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1.5">
                Название шаблона
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={DOCUMENT_TEMPLATES[type].label}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1.5">
              Описание <span className="normal-case font-normal">(необязательно)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Краткое описание шаблона"
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
          </div>

          {/* Tabs */}
          <div>
            <div className="flex gap-1 mb-3 border-b border-[var(--color-border)]">
              {(["editor", "variables"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={[
                    "px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2",
                    tab === t
                      ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                      : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
                  ].join(" ")}
                >
                  {t === "editor" ? "Редактор" : `Переменные${variables.length > 0 ? ` (${variables.length})` : ""}`}
                </button>
              ))}
            </div>

            {tab === "editor" && (
              <div className="rounded-xl border border-[var(--color-border)] overflow-hidden" style={{ height: 320 }}>
                <RichEditor
                  initialContent={bodyJson}
                  onChange={setBodyJson}
                  placeholder="Введите содержимое шаблона. Используйте {{переменная}} для создания переменных полей..."
                />
              </div>
            )}

            {tab === "variables" && (
              <div className="space-y-3">
                <p className="text-xs text-[var(--color-text-muted)] leading-snug">
                  Переменные обнаруживаются автоматически из текста шаблона. Используйте синтаксис{" "}
                  <code className="px-1 py-0.5 rounded bg-[var(--color-bg-elevated)] text-[var(--color-accent)] font-mono text-xs">
                    {"{{имя_переменной}}"}
                  </code>
                  {" "}в редакторе.
                </p>
                {variables.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-[var(--color-border)]">
                    <p className="text-sm text-[var(--color-text-muted)]">Переменных не найдено</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      Добавьте {"{{переменная}}"} в текст шаблона
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {variables.map((v) => (
                      <span
                        key={v}
                        className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-accent)]/30 text-sm text-[var(--color-accent)] font-mono"
                      >
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[#0F172A] text-sm font-semibold hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {mutation.isPending && (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[#0F172A] border-t-transparent animate-spin" />
            )}
            {isEdit ? "Сохранить" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: TemplateDto;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tpl = DOCUMENT_TEMPLATES[template.type];
  const variables = extractVariables(template.bodyJson);

  return (
    <div className="flex items-start gap-4 px-5 py-4 rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] transition-colors group">
      <div
        className="mt-0.5 w-1 self-stretch rounded-full shrink-0"
        style={{ background: tpl.color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
            style={{ background: tpl.color + "22", color: tpl.color }}
          >
            {tpl.shortLabel}
          </span>
          {template.isDefault && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 font-medium shrink-0">
              По умолчанию
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{template.name}</p>
        {template.description && (
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)] truncate">{template.description}</p>
        )}
        {variables.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {variables.map((v) => (
              <span
                key={v}
                className="px-2 py-0.5 rounded bg-[var(--color-bg-elevated)] text-xs text-[var(--color-accent)] font-mono"
              >
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          title="Редактировать"
          className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button
          onClick={onDelete}
          title="Удалить"
          className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-900/20 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function TemplatesClient() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<TemplateDto | null>(null);
  const [typeFilter, setTypeFilter] = useState<DocumentType | "">("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["templates", typeFilter],
    queryFn: () => templatesApi.list(typeFilter || undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => templatesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });

  return (
    <div className="p-6 lg:p-8 h-full flex flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Шаблоны</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            Создавайте шаблоны с переменными для быстрого заполнения документов
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[#0F172A] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors shrink-0"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Создать шаблон
        </button>
      </div>

      {/* Filter */}
      <div className="mb-5 shrink-0">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as DocumentType | "")}
          className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        >
          <option value="">Все типы</option>
          {DOCUMENT_TYPE_LIST.map((tpl) => (
            <option key={tpl.type} value={tpl.type}>
              {tpl.shortLabel} — {tpl.label}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto -mx-6 px-6 lg:-mx-8 lg:px-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-[var(--color-border)] rounded-xl">
            <div className="w-12 h-12 rounded-xl bg-[var(--color-bg-surface)] flex items-center justify-center mb-4 border border-[var(--color-border)]">
              <svg className="w-6 h-6 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 9h6M9 13h6M9 17h4" />
              </svg>
            </div>
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">Шаблонов пока нет</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Создайте первый шаблон с переменными
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[#0F172A] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              + Создать шаблон
            </button>
          </div>
        ) : (
          <div className="grid gap-2">
            {templates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onEdit={() => setEditing(tpl)}
                onDelete={() => {
                  if (confirm(`Удалить шаблон "${tpl.name}"?`)) {
                    deleteMutation.mutate(tpl.id);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && <TemplateModal onClose={() => setShowCreate(false)} />}
      {editing && <TemplateModal initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
