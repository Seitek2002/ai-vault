"use client";

import { useState, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ChevronLeft, FileText, Check, Plus } from "lucide-react";
import { Input, Spinner } from "@/components/ui";
import { uploadFile } from "@/lib/api/files";
import { api } from "@/lib/api/client";
import { counterpartiesApi } from "@/lib/api/counterparties";
import { DocumentType } from "@ai-vault/types";
import type { DocumentDto } from "@ai-vault/types";

const MAX_MB = 20;

type Step = "company" | "drop-file" | "processing";

/**
 * Archive: the simplest possible way to get a PDF into the system — pick or
 * create a company, drop a file, done. No type/category picking; every
 * archived file is a plain CUSTOM document attached to that company.
 */
export function ArchiveDropzone() {
  const router = useRouter();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("company");
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [companySearch, setCompanySearch] = useState("");
  const [selectedExistingCompanyId, setSelectedExistingCompanyId] = useState<string | null>(null);
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(null);
  const [companyToCreate, setCompanyToCreate] = useState<string | null>(null);

  const { data: searchedCompanies = [] } = useQuery({
    queryKey: ["companies-search", companySearch],
    queryFn: () => counterpartiesApi.list(companySearch || undefined),
    enabled: step === "company",
    staleTime: 30_000,
  });

  const archiveMutation = useMutation({
    mutationFn: async (f: File) => {
      setStep("processing");
      setError(null);

      let counterpartyId = resolvedCompanyId;
      if (companyToCreate) {
        const cp = await counterpartiesApi.quickCreate(companyToCreate);
        counterpartyId = cp.id;
        void qc.invalidateQueries({ queryKey: ["companies"] });
        void qc.invalidateQueries({ queryKey: ["companies-search"] });
        void qc.invalidateQueries({ queryKey: ["counterparties"] });
      }
      if (!counterpartyId) throw new Error("No company selected");

      const uploaded = await uploadFile(f);
      const doc = await api.post<DocumentDto>("/documents/import", {
        fileId: uploaded.id,
        type: DocumentType.CUSTOM,
        counterpartyId,
      });
      return doc;
    },
    onSuccess: (doc) => {
      void qc.invalidateQueries({ queryKey: ["documents"] });
      router.push(`/documents/${doc.id}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
      setStep("drop-file");
    },
  });

  const handleFile = useCallback(
    (f: File) => {
      if (f.type !== "application/pdf") {
        setError("Принимаются только PDF-файлы.");
        return;
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        setError(`Файл слишком большой. Максимум ${MAX_MB} МБ.`);
        return;
      }
      setFile(f);
      archiveMutation.mutate(f);
    },
    [archiveMutation],
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

  function handleCompanyNext() {
    if (selectedExistingCompanyId) {
      setResolvedCompanyId(selectedExistingCompanyId);
      setCompanyToCreate(null);
      setStep("drop-file");
    } else if (companySearch.trim()) {
      setResolvedCompanyId(null);
      setCompanyToCreate(companySearch.trim());
      setStep("drop-file");
    }
  }

  const activeCompanyName = companyToCreate ?? searchedCompanies.find((c) => c.id === resolvedCompanyId)?.name;

  /* ── Step 1: company (mandatory) ── */
  if (step === "company") {
    const canAdvance = !!selectedExistingCompanyId || companySearch.trim().length > 0;
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          Выберите компанию
        </h2>

        <Input
          type="text"
          placeholder="Поиск или название новой компании…"
          value={companySearch}
          onChange={(e) => {
            setCompanySearch(e.target.value);
            setSelectedExistingCompanyId(null);
          }}
          autoFocus
        />

        <div className="space-y-1 max-h-52 overflow-y-auto">
          {searchedCompanies.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSelectedExistingCompanyId(c.id);
                setCompanySearch(c.name);
              }}
              className={[
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all",
                selectedExistingCompanyId === c.id
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                  : "border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-border-hover)]",
              ].join(" ")}
            >
              <div className="w-7 h-7 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-[var(--color-text-secondary)]">
                  {c.name[0]?.toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--color-text-primary)] truncate">{c.name}</p>
                {c.inn && <p className="text-xs text-[var(--color-text-muted)]">ИНН: {c.inn}</p>}
              </div>
              {selectedExistingCompanyId === c.id && (
                <Check className="w-4 h-4 text-[var(--color-accent)] shrink-0" strokeWidth={2.5} />
              )}
            </button>
          ))}

          {companySearch.trim() && !selectedExistingCompanyId && (
            <div className="px-3 py-2.5 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)] flex items-center gap-2">
              <Plus className="w-4 h-4 text-[var(--color-accent)] shrink-0" strokeWidth={2.5} />
              <p className="text-sm text-[var(--color-text-secondary)]">
                Создать компанию{" "}
                <span className="text-[var(--color-text-primary)] font-medium">«{companySearch.trim()}»</span>
              </p>
            </div>
          )}

          {!companySearch.trim() && searchedCompanies.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">Компаний пока нет</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">Введите название, чтобы создать новую</p>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleCompanyNext}
            disabled={!canAdvance}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-2)] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Далее
          </button>
        </div>
      </div>
    );
  }

  /* ── Step 2: drop zone ── */
  if (step === "drop-file") {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setStep("company")}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {activeCompanyName && (
            <span className="text-sm text-[var(--color-text-secondary)]">{activeCompanyName}</span>
          )}
        </div>

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
              или нажмите для выбора · PDF · до {MAX_MB} МБ
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
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
          Сохраняю файл…
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {file?.name ?? ""}
        </p>
      </div>
    </div>
  );
}
