"use client";

import { useState, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, FileText, Check, Plus, X } from "lucide-react";
import { Button, Input, Spinner, Modal } from "@/components/ui";
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB, uploadFile } from "@/lib/api/files";
import { api } from "@/lib/api/client";
import { counterpartiesApi } from "@/lib/api/counterparties";
import { DocumentType } from "@ai-vault/types";
import type { DocumentDto } from "@ai-vault/types";

type Step = "company" | "drop-file" | "processing";

/**
 * Archive upload: the simplest possible way to get a PDF into the system —
 * pick or create a company, drop a file, done. No type/category picking;
 * every archived file is a plain CUSTOM document attached to that company.
 * Lives in a modal over the archive list — on success it just closes, it
 * never routes into the (empty) document editor.
 */
export function ArchiveUploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  const uploadedRef = useRef<{ file: File; id: string } | null>(null);
  const companyIdRef = useRef<string | null>(null);
  const [step, setStep] = useState<Step>("company");
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [companySearch, setCompanySearch] = useState("");
  const [selectedExistingCompanyId, setSelectedExistingCompanyId] = useState<string | null>(null);
  const [companyToCreate, setCompanyToCreate] = useState<string | null>(null);
  const [activeCompanyName, setActiveCompanyName] = useState("");

  const { data: searchedCompanies = [], isLoading: companiesLoading, isError: companiesError, isFetching: companiesFetching, refetch: refetchCompanies } = useQuery({
    queryKey: ["companies-search", companySearch],
    queryFn: () => counterpartiesApi.list(companySearch || undefined),
    enabled: step === "company",
    staleTime: 30_000,
  });

  const archiveMutation = useMutation({
    mutationFn: async (f: File) => {
      setStep("processing");
      setError(null);

      let counterpartyId = companyIdRef.current;
      if (!counterpartyId && companyToCreate) {
        const cp = await counterpartiesApi.quickCreate(companyToCreate);
        counterpartyId = cp.id;
        companyIdRef.current = cp.id;
        setSelectedExistingCompanyId(cp.id);
        setCompanyToCreate(null);
        void qc.invalidateQueries({ queryKey: ["companies"] });
        void qc.invalidateQueries({ queryKey: ["companies-search"] });
        void qc.invalidateQueries({ queryKey: ["counterparties"] });
      }
      if (!counterpartyId) throw new Error("Выберите компанию");

      let uploaded = uploadedRef.current?.file === f ? uploadedRef.current : null;
      if (!uploaded) {
        const pdf = f.type ? f : new File([f], f.name, { type: "application/pdf" });
        const result = await uploadFile(pdf);
        uploaded = { file: f, id: result.id };
        uploadedRef.current = uploaded;
      }
      const doc = await api.post<DocumentDto>("/documents/import", {
        fileId: uploaded.id,
        type: DocumentType.CUSTOM,
        counterpartyId,
      });
      return doc;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documents"] });
      onUploaded();
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
      setStep("drop-file");
    },
    onSettled: () => { pendingRef.current = false; },
  });

  const handleFile = useCallback(
    (f: File) => {
      if (pendingRef.current) return;
      if (f.type !== "application/pdf" && !(!f.type && /\.pdf$/i.test(f.name))) {
        setFile(null);
        setError("Принимаются только PDF-файлы.");
        return;
      }
      if (f.size === 0) {
        setFile(null);
        setError("PDF-файл пуст. Выберите скан документа.");
        return;
      }
      if (f.size > MAX_UPLOAD_SIZE_BYTES) {
        setFile(null);
        setError(`Файл слишком большой. Максимум ${MAX_UPLOAD_SIZE_MB} МБ.`);
        return;
      }
      setFile(f);
      pendingRef.current = true;
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
      e.target.value = "";
      if (f) handleFile(f);
    },
    [handleFile],
  );

  function handleCompanyNext() {
    setError(null);
    setFile(null);
    uploadedRef.current = null;
    if (selectedExistingCompanyId) {
      companyIdRef.current = selectedExistingCompanyId;
      setActiveCompanyName(companySearch);
      setCompanyToCreate(null);
      setStep("drop-file");
    } else if (companySearch.trim() && !companiesLoading && !companiesError) {
      companyIdRef.current = null;
      setCompanyToCreate(companySearch.trim());
      setActiveCompanyName(companySearch.trim());
      setStep("drop-file");
    }
  }

  const isProcessing = step === "processing";
  function handleClose() {
    if (!pendingRef.current) onClose();
  }

  return (
    <Modal onClose={handleClose} size="lg" className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {step === "drop-file" && !isProcessing && (
            <button
              onClick={() => { setStep("company"); setError(null); }}
              aria-label="Вернуться к выбору компании"
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Загрузить документ
          </h2>
          {activeCompanyName && step !== "company" && (
            <p className="mt-1 text-sm text-[var(--color-text-secondary)] truncate" title={activeCompanyName}>{activeCompanyName}</p>
          )}
          </div>
        </div>
        {!isProcessing && (
          <button onClick={handleClose} aria-label="Закрыть загрузку" className="shrink-0 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="px-6 py-5">
        {/* ── Step 1: company (mandatory) ── */}
        {step === "company" && (
          <div className="space-y-4">
            <Input
              type="text"
              placeholder="Поиск или название новой компании…"
              aria-label="Компания для документа"
              value={companySearch}
              onChange={(e) => {
                setCompanySearch(e.target.value);
                setSelectedExistingCompanyId(null);
              }}
              autoFocus
            />

            <div className="space-y-1 max-h-52 overflow-y-auto">
              {companiesLoading && <div className="flex justify-center py-6"><Spinner size="sm" /></div>}
              {companiesError && <div role="alert" className="py-3 text-sm text-red-400">
                <p className="mb-2">Не удалось загрузить компании</p>
                <Button variant="secondary" size="sm" disabled={companiesFetching} onClick={() => void refetchCompanies()}>Повторить загрузку компаний</Button>
              </div>}
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

              {companySearch.trim() && !selectedExistingCompanyId && !companiesLoading && !companiesError && (
                <div className="px-3 py-2.5 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)] flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[var(--color-accent)] shrink-0" strokeWidth={2.5} />
                  <p className="text-sm text-[var(--color-text-secondary)] min-w-0 break-words">
                    Создать компанию{" "}
                    <span className="text-[var(--color-text-primary)] font-medium">«{companySearch.trim()}»</span>
                  </p>
                </div>
              )}

              {!companySearch.trim() && searchedCompanies.length === 0 && !companiesLoading && !companiesError && (
                <div className="py-8 text-center">
                  <p className="text-sm text-[var(--color-text-muted)]">Компаний пока нет</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">Введите название, чтобы создать новую</p>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleCompanyNext}
                disabled={!selectedExistingCompanyId && (!companySearch.trim() || companiesLoading || companiesError)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-2)] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Далее
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: drop zone ── */}
        {step === "drop-file" && (
          <div className="space-y-4">
            <div
              role="button"
              tabIndex={0}
              aria-label="Выбрать PDF для архива"
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault(); inputRef.current?.click();
                }
              }}
              className={[
                "flex flex-col items-center justify-center gap-4 px-6 py-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]",
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
                  или нажмите для выбора · PDF · до {MAX_UPLOAD_SIZE_MB} МБ
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
              <div role="alert" className="p-3 rounded-lg bg-red-900/20 border border-red-700/30 text-sm text-red-300 break-words">
                {error}
              </div>
            )}
            {file && error && <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 text-xs text-[var(--color-text-secondary)] break-all">{file.name}</p>
              <Button onClick={() => handleFile(file)}>Повторить загрузку PDF</Button>
            </div>}
          </div>
        )}

        {/* ── Step 3: processing ── */}
        {isProcessing && (
          <div className="flex flex-col items-center justify-center gap-6 py-16 text-[var(--color-accent)]">
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
        )}
      </div>
    </Modal>
  );
}
