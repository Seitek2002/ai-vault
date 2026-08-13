"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Pencil, Trash2, Wand2 } from "lucide-react";
import { templatesApi } from "@/lib/api/templates";
import type { TemplateDto, CreateTemplateRequest } from "@/lib/api/templates";
import { documentCategoriesApi } from "@/lib/api/documentCategories";
import { settingsApi, type CompanySettings } from "@/lib/api/settings";
import { buildLetterheadNode } from "@/lib/letterhead";
import { RichEditor } from "@/components/editor/RichEditor";
import { extractVariables, setVariableLabelInBody } from "@/lib/variableTokens";
import { Button, Input, Select, Modal, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { DocumentType } from "@ai-vault/types";

const CATEGORY_COLORS = ["#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];

function CategoryCreatePopover({ onClose }: { onClose: (id?: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState(CATEGORY_COLORS[0]);

  const mutation = useMutation({
    mutationFn: () =>
      documentCategoriesApi.create({
        name: name.trim(),
        shortLabel: name.trim().slice(0, 12),
        color: color ?? CATEGORY_COLORS[0]!,
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["document-categories"] });
      onClose(created.id);
    },
  });

  return (
    <div className="absolute z-20 mt-2 w-64 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3 shadow-xl animate-scale-in">
      <p className="mb-2 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
        Новая категория
      </p>
      <Input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Например, Накладная"
        autoFocus
        className="mb-2"
      />
      <div className="mb-3 flex gap-1.5">
        {CATEGORY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`h-6 w-6 rounded-full border-2 transition-transform ${color === c ? "scale-110 border-white" : "border-transparent"}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => onClose()}>
          Отмена
        </Button>
        <Button
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={!name.trim()}
          loading={mutation.isPending}
        >
          Создать
        </Button>
      </div>
    </div>
  );
}

const EMPTY_BODY = { type: "doc", content: [{ type: "paragraph" }] };

/** Default letterhead (logo + org name/address) prefilled into every new template. */
function buildDefaultTemplateBody(settings: CompanySettings | undefined): unknown {
  const letterhead = buildLetterheadNode(settings);
  if (!letterhead) return EMPTY_BODY;
  return { type: "doc", content: [letterhead, { type: "paragraph" }] };
}

// ─── Variable badge list (live preview, label renameable) ─────────────────────

function VariablePreview({
  bodyJson,
  onRelabel,
}: {
  bodyJson: unknown;
  onRelabel: (key: string, label: string) => void;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const variables = extractVariables(bodyJson);

  if (variables.length === 0) {
    return (
      <p className="text-xs text-[var(--color-text-muted)] leading-snug">
        Переменных пока нет. Нажмите «Добавить переменную» в тулбаре редактора, чтобы вставить её в текст.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {variables.map((v) => (
        <div
          key={v.key}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-accent)]/30"
        >
          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-mono shrink-0">
            {v.varType === "date" ? "дата" : "текст"}
          </span>
          {editingKey === v.key ? (
            <input
              autoFocus
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                const trimmed = draft.trim();
                if (trimmed && trimmed !== v.label) onRelabel(v.key, trimmed);
                setEditingKey(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditingKey(null);
              }}
              className="text-sm bg-transparent border-b border-[var(--color-accent)] focus:outline-none text-[var(--color-text-primary)] w-32"
            />
          ) : (
            <button
              type="button"
              onClick={() => { setEditingKey(v.key); setDraft(v.label); }}
              title="Переименовать"
              className="text-sm text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors"
            >
              {v.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Create / Edit modal ───────────────────────────────────────────────────────

function ConstructorModal({ initial, onClose }: { initial?: TemplateDto; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [bodyJson, setBodyJson] = useState<unknown>(initial?.bodyJson ?? EMPTY_BODY);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [showCategoryCreate, setShowCategoryCreate] = useState(false);
  const [defaultHeaderApplied, setDefaultHeaderApplied] = useState(false);
  const isEdit = !!initial;

  const { data: categories = [] } = useQuery({
    queryKey: ["document-categories"],
    queryFn: documentCategoriesApi.list,
  });

  const { data: companySettings } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getSettings,
    enabled: !isEdit,
  });

  // New templates start with the org's letterhead (logo + name/address) prefilled.
  useEffect(() => {
    if (!isEdit && companySettings && !defaultHeaderApplied) {
      setBodyJson(buildDefaultTemplateBody(companySettings));
      setDefaultHeaderApplied(true);
    }
  }, [isEdit, companySettings, defaultHeaderApplied]);

  const mutation = useMutation({
    mutationFn: () => {
      // NB: PATCH /templates uses forbidNonWhitelisted — UpdateTemplateDto has no
      // `type` field, so the update payload must omit it (only create carries type).
      const base = {
        name: name.trim() || "Свой шаблон",
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(categoryId ? { categoryId } : {}),
        bodyJson,
      };
      return isEdit
        ? templatesApi.update(initial.id, base)
        : templatesApi.create({ type: DocumentType.CUSTOM, ...base } satisfies CreateTemplateRequest);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["constructor-templates"] });
      onClose();
    },
  });

  const handleRelabel = (key: string, label: string) => {
    setBodyJson((prev: unknown) => setVariableLabelInBody(prev, key, label));
  };

  return (
    <Modal onClose={onClose} className="max-w-3xl flex flex-col max-h-[90vh]">
      <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          {isEdit ? "Редактировать шаблон" : "Новый шаблон"}
        </h2>
        <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1.5">
              Название шаблона
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Свой шаблон"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1.5">
              Описание <span className="normal-case font-normal">(необязательно)</span>
            </label>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Краткое описание шаблона"
            />
          </div>
        </div>

        <div className="relative">
          <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1.5">
            Категория <span className="normal-case font-normal">(необязательно)</span>
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Select
                value={categoryId}
                onChange={setCategoryId}
                placeholder="Без категории"
                options={[
                  { value: "", label: "Без категории" },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => setShowCategoryCreate((v) => !v)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {showCategoryCreate && (
            <CategoryCreatePopover
              onClose={(id) => {
                setShowCategoryCreate(false);
                if (id) setCategoryId(id);
              }}
            />
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1.5">
            Содержимое документа
          </label>
          <div className="rounded-xl border border-[var(--color-border)] overflow-hidden" style={{ height: 320 }}>
            <RichEditor
              initialContent={bodyJson}
              onChange={setBodyJson}
              variablesEnabled
              placeholder="Введите содержимое шаблона. Вставляйте переменные через кнопку «Добавить переменную» в тулбаре..."
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider block mb-2">
            Переменные
          </label>
          <VariablePreview bodyJson={bodyJson} onRelabel={handleRelabel} />
        </div>
      </div>

      <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-end gap-3 shrink-0">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
          {isEdit ? "Сохранить" : "Создать"}
        </Button>
      </div>
    </Modal>
  );
}

// ─── Template card ──────────────────────────────────────────────────────────────

function ConstructorCard({
  template,
  onEdit,
  onDelete,
}: {
  template: TemplateDto;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const variables = extractVariables(template.bodyJson);
  const categoryColor = template.category?.color ?? "#8B5CF6";

  return (
    <Card hoverable className="group flex items-start gap-4 px-5 py-4">
      <div className="mt-0.5 w-1 self-stretch rounded-full shrink-0" style={{ background: categoryColor }} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{template.name}</p>
          {template.category && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ background: `${categoryColor}26`, color: categoryColor }}
            >
              {template.category.name}
            </span>
          )}
        </div>
        {template.description && (
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)] truncate">{template.description}</p>
        )}
        {variables.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {variables.map((v) => (
              <span key={v.key} className="px-2 py-0.5 rounded bg-[var(--color-bg-elevated)] text-xs text-[var(--color-accent)]">
                {v.label}
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
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          title="Удалить"
          className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-900/20 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────────

export function ConstructorClient() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<TemplateDto | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["constructor-templates"],
    queryFn: () => templatesApi.list(DocumentType.CUSTOM),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => templatesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["constructor-templates"] }),
  });

  return (
    <div className="p-6 lg:p-8 h-full flex flex-col">
      <PageHeader
        title="Конструктор шаблонов"
        subtitle="Создавайте свои документы с переменными полями, которые появляются слева при заполнении"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Создать шаблон
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto -mx-6 px-6 lg:-mx-8 lg:px-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-[var(--color-accent)]">
            <Spinner size="lg" />
          </div>
        ) : templates.length === 0 ? (
          <EmptyState
            icon={<Wand2 className="w-6 h-6" strokeWidth={1.5} />}
            title="Своих шаблонов пока нет"
            description="Создайте документ с переменными полями"
            action={
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4" strokeWidth={2.5} />
                Создать шаблон
              </Button>
            }
          />
        ) : (
          <div className="grid gap-2">
            {templates.map((tpl) => (
              <ConstructorCard
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

      {showCreate && <ConstructorModal onClose={() => setShowCreate(false)} />}
      {editing && <ConstructorModal initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
