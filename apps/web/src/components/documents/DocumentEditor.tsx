"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { RichEditor } from "@/components/editor/RichEditor";
import { MetaFields } from "./MetaFields";
import { useEditorStore } from "@/stores/editor.store";
import { documentsApi } from "@/lib/api/documents";
import { templatesApi } from "@/lib/api/templates";
import { DOCUMENT_TEMPLATES } from "@/lib/templates";
import { ExportMenu } from "./ExportMenu";
import { uploadFile } from "@/lib/api/files";
import { DocumentType } from "@ai-vault/types";
import type { DocumentMeta } from "@ai-vault/types";
import { syncDateInBody, syncNumberInBody } from "@/lib/docBody";

const AUTOSAVE_DELAY = 2000;

// ── Save as template modal ────────────────────────────────────────────────────

function SaveAsTemplateModal({
  docType,
  bodyJson,
  meta,
  onClose,
}: {
  docType: DocumentType;
  bodyJson: unknown;
  meta: Record<string, unknown>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(DOCUMENT_TEMPLATES[docType].label);

  const mutation = useMutation({
    mutationFn: () =>
      templatesApi.create({
        type: docType,
        name: name.trim() || DOCUMENT_TEMPLATES[docType].label,
        bodyJson,
        metaDefaults: meta,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      onClose();
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-xl p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
          Сохранить как шаблон
        </h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название шаблона"
          autoFocus
          className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] mb-3"
        />
        {mutation.isError && (
          <p className="text-xs text-red-400 mb-2">
            {mutation.error instanceof Error ? mutation.error.message : "Ошибка сохранения"}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !name.trim()}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-[var(--color-accent)] text-[#0F172A] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 transition-colors"
          >
            {mutation.isPending ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function getMetaDateKey(type: DocumentType): string {
  if (type === DocumentType.AVR) return "actDate";
  if (type === DocumentType.CONTRACT) return "startDate";
  return "invoiceDate";
}

function getMetaNumberKey(type: DocumentType): string {
  if (type === DocumentType.AVR) return "actNumber";
  if (type === DocumentType.CONTRACT) return "contractNumber";
  return "invoiceNumber";
}

interface DocumentEditorProps {
  documentId: string;
}

function DocTypeBadge({ type }: { type: DocumentType }) {
  const tpl = DOCUMENT_TEMPLATES[type];
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: tpl.color + "22", color: tpl.color }}
    >
      {tpl.shortLabel}
    </span>
  );
}

function AutoSaveToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none group">
      <span className="text-xs text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)] transition-colors">
        Автосохранение
      </span>
      <span
        className="relative inline-flex w-8 h-4 rounded-full transition-colors duration-200"
        style={{ background: enabled ? "var(--color-accent)" : "var(--color-border)" }}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform duration-200"
          style={{ transform: enabled ? "translateX(16px)" : "translateX(0)" }}
        />
      </span>
    </label>
  );
}

export function DocumentEditor({ documentId }: DocumentEditorProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDateRef = useRef<string | null>(null);
  const prevNumberRef = useRef<string | null>(null);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const [autoSave, setAutoSave] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("autoSave") !== "false";
  });

  const handleAutoSaveToggle = useCallback((val: boolean) => {
    setAutoSave(val);
    localStorage.setItem("autoSave", val ? "true" : "false");
  }, []);

  const {
    document,
    isDirty,
    isSaving,
    setDocument,
    setBodyJson,
    setMeta,
    setSaving,
    markClean,
    metaOverride,
  } = useEditorStore();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => documentsApi.get(documentId),
  });

  useEffect(() => {
    if (data) setDocument(data);
  }, [data, setDocument]);

  // Reset sync refs on document switch
  useEffect(() => {
    prevDateRef.current = null;
    prevNumberRef.current = null;
  }, [documentId]);

  // Sync date/number from meta panel into the body text
  useEffect(() => {
    if (!document) return;

    const dateKey = getMetaDateKey(document.type);
    const numberKey = getMetaNumberKey(document.type);
    const meta = metaOverride as Record<string, unknown> | null;
    const docMeta = document.meta as unknown as Record<string, unknown>;
    const currentDate = (meta?.[dateKey] as string | undefined) ??
      (docMeta[dateKey] as string | undefined) ?? "";
    const currentNumber = (meta?.[numberKey] as string | undefined) ??
      (docMeta[numberKey] as string | undefined) ?? "";

    // First render for this document — just capture initial values
    if (prevDateRef.current === null || prevNumberRef.current === null) {
      prevDateRef.current = currentDate;
      prevNumberRef.current = currentNumber;
      return;
    }

    let newBody = document.bodyJson;
    let changed = false;

    if (currentDate && currentDate !== prevDateRef.current) {
      newBody = syncDateInBody(newBody, prevDateRef.current, currentDate);
      prevDateRef.current = currentDate;
      changed = true;
    }

    if (currentNumber !== prevNumberRef.current) {
      newBody = syncNumberInBody(newBody, prevNumberRef.current, currentNumber);
      prevNumberRef.current = currentNumber;
      changed = true;
    }

    if (changed) setBodyJson(newBody);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaOverride, document?.type, document?.id]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!document) throw new Error("No document");
      return documentsApi.update(document.id, {
        bodyJson: document.bodyJson,
        ...(metaOverride ? { meta: metaOverride as Record<string, unknown> } : {}),
      });
    },
    onMutate: () => setSaving(true),
    onSuccess: (updated) => {
      setDocument(updated);
      markClean();
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onSettled: () => setSaving(false),
  });

  // Auto-save: trigger AUTOSAVE_DELAY ms after last change
  useEffect(() => {
    if (!isDirty || !autoSave || isSaving) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }

    autoSaveTimerRef.current = setTimeout(() => {
      saveMutation.mutate();
    }, AUTOSAVE_DELAY);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [isDirty, autoSave, isSaving, saveMutation]);

  const titleMutation = useMutation({
    mutationFn: (newTitle: string) => {
      if (!document) throw new Error("No document");
      return documentsApi.update(document.id, { title: newTitle });
    },
    onSuccess: (updated) => {
      setDocument(updated);
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const replaceFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await uploadFile(file);
      return documentsApi.replaceFile(documentId, uploaded.id);
    },
    onSuccess: (updated) => {
      setDocument(updated);
      markClean();
      setReplaceError(null);
      qc.invalidateQueries({ queryKey: ["document", documentId] });
    },
    onError: (err) => {
      setReplaceError(err instanceof Error ? err.message : "Ошибка замены файла");
    },
  });

  const handleBodyChange = useCallback(
    (json: unknown) => setBodyJson(json),
    [setBodyJson],
  );

  const handleMetaChange = useCallback(
    (meta: Partial<DocumentMeta>) => setMeta(meta),
    [setMeta],
  );

  const handleReplaceFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) replaceFileMutation.mutate(file);
      e.target.value = "";
    },
    [replaceFileMutation],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (isError || !document) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-[var(--color-text-secondary)]">Документ не найден</p>
        <button
          onClick={() => router.push("/documents")}
          className="text-sm text-[var(--color-accent)] hover:underline"
        >
          ← Вернуться к списку
        </button>
      </div>
    );
  }

  const effectiveMeta = metaOverride
    ? { ...(document.meta as object), ...metaOverride }
    : (document.meta as Partial<DocumentMeta>);

  const hasOriginalFile =
    Array.isArray(document.fileAssets) && document.fileAssets.length > 0;

  const statusLabel = isSaving
    ? "сохраняю…"
    : isDirty
      ? autoSave
        ? "• изменено"
        : "• не сохранено"
      : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: metadata panel ─────────────────────── */}
      <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg-surface)] overflow-y-auto">
        <div className="px-4 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-1">
            <DocTypeBadge type={document.type} />
            <span className="text-xs text-[var(--color-text-muted)]">{document.status}</span>
          </div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
            {document.title}
          </h2>
        </div>

        <div className="flex-1 px-4 py-4">
          <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            Реквизиты
          </p>
          <MetaFields
            type={document.type}
            meta={effectiveMeta}
            onChange={handleMetaChange}
          />
        </div>

        {/* Replace file section */}
        <div className="px-4 py-4 border-t border-[var(--color-border)]">
          <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
            Файл документа
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mb-3 leading-snug">
            {hasOriginalFile
              ? "Загрузите новый файл, чтобы заменить содержимое документа"
              : "Загрузите файл Word или PDF, чтобы заменить содержимое"}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            className="hidden"
            onChange={handleReplaceFile}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={replaceFileMutation.isPending}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-hover)] transition-colors disabled:opacity-50"
          >
            {replaceFileMutation.isPending ? (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : (
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
            {replaceFileMutation.isPending ? "Загружаю…" : "Заменить файл"}
          </button>
          {replaceError && (
            <p className="mt-2 text-xs text-red-400">{replaceError}</p>
          )}
        </div>
      </aside>

      {/* ── Editor ───────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => router.push("/documents")}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors shrink-0"
              title="Назад"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  setEditingTitle(false);
                  const trimmed = titleDraft.trim();
                  if (trimmed && trimmed !== document.title) titleMutation.mutate(trimmed);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="text-sm font-medium text-[var(--color-text-primary)] bg-transparent border-b border-[var(--color-accent)] focus:outline-none min-w-0 max-w-xs"
              />
            ) : (
              <span
                onClick={() => { setTitleDraft(document.title); setEditingTitle(true); }}
                title="Нажмите, чтобы переименовать"
                className="text-sm font-medium text-[var(--color-text-primary)] truncate cursor-text hover:bg-[var(--color-bg-elevated)] rounded px-1 -mx-1 transition-colors"
              >
                {document.title}
              </span>
            )}
            {statusLabel && (
              <span className="text-xs text-[var(--color-text-muted)] shrink-0">
                {statusLabel}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <AutoSaveToggle enabled={autoSave} onChange={handleAutoSaveToggle} />

            <ExportMenu
              documentId={documentId}
              documentTitle={document.title}
              hasOriginalFile={hasOriginalFile}
            />

            <button
              onClick={() => setShowSaveTemplate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)] transition-colors"
              title="Сохранить как шаблон"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M12 8v8m-4-4h8" />
              </svg>
              Шаблон
            </button>

            <button
              onClick={() => saveMutation.mutate()}
              disabled={!isDirty || isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-[var(--color-accent)] text-[#0F172A] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-[#0F172A] border-t-transparent animate-spin" />
              ) : (
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
              )}
              Сохранить
            </button>
          </div>
        </div>

        {/* TipTap */}
        <div className="flex-1 overflow-hidden bg-[var(--color-bg-base)]">
          <RichEditor
            initialContent={document.bodyJson}
            onChange={handleBodyChange}
            placeholder="Начните редактировать документ..."
          />
        </div>
      </div>

      {showSaveTemplate && (
        <SaveAsTemplateModal
          docType={document.type}
          bodyJson={document.bodyJson}
          meta={(metaOverride ?? document.meta) as Record<string, unknown>}
          onClose={() => setShowSaveTemplate(false)}
        />
      )}
    </div>
  );
}
