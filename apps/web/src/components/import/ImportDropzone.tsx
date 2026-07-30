"use client";

import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ChevronLeft, FileText } from "lucide-react";
import { Badge, Spinner } from "@/components/ui";
import { uploadFile } from "@/lib/api/files";
import { api } from "@/lib/api/client";
import { BUILTIN_DOCUMENT_TYPE_LIST } from "@/lib/templates";
import { DocumentType } from "@ai-vault/types";
import type { DocumentDto } from "@ai-vault/types";

const ACCEPTED = ".pdf,.docx,.doc,.txt";
const ACCEPT_LABEL = "PDF, DOCX, TXT";
const MAX_MB = 20;

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
          {BUILTIN_DOCUMENT_TYPE_LIST.map((tpl) => (
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
              <Badge color={tpl.color}>{tpl.shortLabel}</Badge>
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
    const tpl = docType ? BUILTIN_DOCUMENT_TYPE_LIST.find((t) => t.type === docType) : null;
    return (
      <div className="max-w-lg mx-auto space-y-4">
        {/* Back + type badge */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setStep("pick-type"); setFile(null); setError(null); }}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {tpl && <Badge color={tpl.color}>{tpl.label}</Badge>}
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
          <FileText className="w-10 h-10 text-[var(--color-text-muted)]" strokeWidth={1.2} />
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
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center gap-6 py-16 text-[var(--color-accent)]">
      <Spinner size="lg" className="w-12 h-12" />
      <div className="text-center text-[var(--color-text-primary)]">
        <p className="text-sm font-medium">
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
