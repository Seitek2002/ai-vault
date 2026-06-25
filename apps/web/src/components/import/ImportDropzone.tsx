"use client";

import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { uploadFile } from "@/lib/api/files";
import { api } from "@/lib/api/client";
import { DOCUMENT_TYPE_LIST } from "@/lib/templates";
import { DocumentType } from "@ai-vault/types";
import type { DocumentDto } from "@ai-vault/types";

const ACCEPTED = ".pdf,.docx,.doc,.txt";
const ACCEPT_LABEL = "PDF, DOCX, TXT";
const MAX_MB = 20;

function FileIcon() {
  return (
    <svg className="w-10 h-10 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

type Step = "pick-type" | "drop-file" | "processing";

export function ImportDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("pick-type");
  const [docType, setDocType] = useState<DocumentType | null>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importMutation = useMutation({
    mutationFn: async (f: File) => {
      if (!docType) throw new Error("No type selected");
      setStep("processing");
      setError(null);

      const uploaded = await uploadFile(f);
      const doc = await api.post<DocumentDto>("/documents/import", {
        fileId: uploaded.id,
        type: docType,
      });
      return doc;
    },
    onSuccess: (doc) => {
      router.push(`/documents/${doc.id}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Ошибка импорта");
      setStep("drop-file");
    },
  });

  const handleFile = useCallback(
    (f: File) => {
      if (f.size > MAX_MB * 1024 * 1024) {
        setError(`Файл слишком большой. Максимум ${MAX_MB} МБ.`);
        return;
      }
      setFile(f);
      importMutation.mutate(f);
    },
    [importMutation],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  /* ── Step 1: type selector ── */
  if (step === "pick-type") {
    return (
      <div className="max-w-lg mx-auto">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-4">
          Выберите тип документа
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {DOCUMENT_TYPE_LIST.map((tpl) => (
            <button
              key={tpl.type}
              onClick={() => {
                setDocType(tpl.type);
                setStep("drop-file");
              }}
              className={[
                "flex flex-col items-start gap-1.5 px-4 py-4 rounded-xl border text-left transition-all",
                docType === tpl.type
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                  : "border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-light)]",
              ].join(" ")}
            >
              <span
                className="text-xs font-bold px-2 py-0.5 rounded"
                style={{ background: tpl.color + "22", color: tpl.color }}
              >
                {tpl.shortLabel}
              </span>
              <span className="text-xs text-[var(--color-text-secondary)] leading-tight">
                {tpl.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ── Step 2: drop zone ── */
  if (step === "drop-file") {
    const tpl = docType ? DOCUMENT_TYPE_LIST.find((t) => t.type === docType) : null;
    return (
      <div className="max-w-lg mx-auto space-y-4">
        {/* Back + type badge */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setStep("pick-type"); setFile(null); setError(null); }}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          {tpl && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded"
              style={{ background: tpl.color + "22", color: tpl.color }}
            >
              {tpl.label}
            </span>
          )}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={[
            "flex flex-col items-center justify-center gap-4 px-8 py-16 rounded-2xl border-2 border-dashed cursor-pointer transition-all",
            dragging
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
              : "border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-light)] hover:bg-[var(--color-bg-elevated)]",
          ].join(" ")}
        >
          <FileIcon />
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              Перетащите файл сюда
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              или нажмите для выбора · {ACCEPT_LABEL} · до {MAX_MB} МБ
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={onInputChange}
          />
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-900/20 border border-red-700/30 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>
    );
  }

  /* ── Step 3: processing ── */
  return (
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center gap-6 py-16">
      <div className="w-12 h-12 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
      <div className="text-center">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">
          Обрабатываю файл…
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {file?.name ?? ""}
        </p>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          Это может занять несколько секунд.
        </p>
      </div>
    </div>
  );
}
