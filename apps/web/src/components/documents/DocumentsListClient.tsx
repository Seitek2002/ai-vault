"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { documentsApi } from "@/lib/api/documents";
import { templatesApi } from "@/lib/api/templates";
import type { TemplateDto } from "@/lib/api/templates";
import { counterpartiesApi } from "@/lib/api/counterparties";
import { DOCUMENT_TEMPLATES, DOCUMENT_TYPE_LIST } from "@/lib/templates";
import { syncDateInBody, syncNumberInBody, injectCounterpartyInBody, todayISO } from "@/lib/docBody";
import { DocumentType, DocumentStatus } from "@ai-vault/types";
import type { DocumentDto } from "@ai-vault/types";

// ─── Status label map ──────────────────────────────────────────────────────────
const STATUS_LABELS: Record<DocumentStatus, string> = {
  [DocumentStatus.DRAFT]: "Черновик",
  [DocumentStatus.FINAL]: "Финальный",
  [DocumentStatus.SENT]: "Отправлен",
  [DocumentStatus.SIGNED]: "Подписан",
};

const STATUS_COLORS: Record<DocumentStatus, string> = {
  [DocumentStatus.DRAFT]: "text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)]",
  [DocumentStatus.FINAL]: "text-amber-400 bg-amber-900/30",
  [DocumentStatus.SENT]: "text-blue-400 bg-blue-900/30",
  [DocumentStatus.SIGNED]: "text-emerald-400 bg-emerald-900/30",
};

// ─── Variable helpers ──────────────────────────────────────────────────────────
function extractVariables(bodyJson: unknown): string[] {
  const text = JSON.stringify(bodyJson);
  const matches = text.match(/\{\{([^}]+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2).trim()))];
}

function substituteVariables(bodyJson: unknown, values: Record<string, string>): unknown {
  let text = JSON.stringify(bodyJson);
  for (const [key, value] of Object.entries(values)) {
    text = text.split(`{{${key}}}`).join(value);
  }
  return JSON.parse(text) as unknown;
}

// ─── Create modal ──────────────────────────────────────────────────────────────
type ModalStep = "type" | "company" | "template-pick" | "variables" | "title";

function CreateDocumentModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState<ModalStep>("type");
  const [mode, setMode] = useState<"blank" | "template">("blank");
  const [selectedType, setSelectedType] = useState<DocumentType | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDto | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");

  // Company step state
  const [companySearch, setCompanySearch] = useState("");
  const [selectedExistingCompanyId, setSelectedExistingCompanyId] = useState<string | null>(null);
  // Resolved after leaving the company step:
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(null);
  const [companyToCreate, setCompanyToCreate] = useState<string | null>(null);

  const { data: searchedCompanies = [] } = useQuery({
    queryKey: ["companies-search", companySearch],
    queryFn: () => counterpartiesApi.list(companySearch || undefined),
    enabled: step === "company",
    staleTime: 30_000,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["templates", selectedType],
    queryFn: () => templatesApi.list(selectedType ?? undefined),
    enabled: !!selectedType && mode === "template",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedType) throw new Error("No type");
      const tpl = DOCUMENT_TEMPLATES[selectedType];

      let bodyJson: unknown = tpl.bodyJson;
      let meta: Record<string, unknown> = tpl.metaDefaults as Record<string, unknown>;

      if (selectedTemplate) {
        bodyJson = substituteVariables(selectedTemplate.bodyJson, variableValues);
        meta = (selectedTemplate.metaDefaults as Record<string, unknown>) ?? {};
      }

      let cpId = resolvedCompanyId;
      let cpName: string | null = null;

      if (companyToCreate) {
        const cp = await counterpartiesApi.quickCreate(companyToCreate);
        cpId = cp.id;
        cpName = cp.name;
        void qc.invalidateQueries({ queryKey: ["companies"] });
        void qc.invalidateQueries({ queryKey: ["companies-search"] });
      } else if (resolvedCompanyId) {
        const found = (await counterpartiesApi.list()).find((c) => c.id === resolvedCompanyId);
        cpName = found?.name ?? null;
      }

      // For blank docs: inject today's date and company into body
      if (!selectedTemplate) {
        const today = todayISO();
        const dateKey =
          selectedType === DocumentType.AVR ? "actDate" :
          selectedType === DocumentType.CONTRACT ? "startDate" : "invoiceDate";
        meta = { ...meta, [dateKey]: today };
        bodyJson = syncDateInBody(bodyJson, "", today);
        bodyJson = syncNumberInBody(bodyJson, "", meta.invoiceNumber as string ?? "");
        if (cpName) {
          bodyJson = injectCounterpartyInBody(bodyJson, cpName);
        }
      }

      return documentsApi.create({
        type: selectedType,
        title: title.trim() || (selectedTemplate ? selectedTemplate.name : tpl.label),
        bodyJson,
        meta,
        ...(cpId ? { counterpartyId: cpId } : {}),
      });
    },
    onSuccess: (doc) => {
      void qc.invalidateQueries({ queryKey: ["documents"] });
      router.push(`/documents/${doc.id}`);
    },
  });

  function handleTypeNext() {
    if (!selectedType) return;
    setStep("company");
  }

  function advanceFromCompany(cpId: string | null, createName: string | null) {
    setResolvedCompanyId(cpId);
    setCompanyToCreate(createName);
    if (mode === "template") {
      setStep("template-pick");
    } else {
      setStep("title");
    }
  }

  function handleCompanyNext() {
    if (selectedExistingCompanyId) {
      advanceFromCompany(selectedExistingCompanyId, null);
    } else if (companySearch.trim()) {
      advanceFromCompany(null, companySearch.trim());
    }
  }

  function handleCompanySkip() {
    advanceFromCompany(null, null);
  }

  function handleTemplateNext() {
    if (!selectedTemplate) return;
    const vars = extractVariables(selectedTemplate.bodyJson);
    if (vars.length > 0) {
      const initial: Record<string, string> = {};
      for (const v of vars) initial[v] = "";
      setVariableValues(initial);
      setStep("variables");
    } else {
      setStep("title");
    }
  }

  const canGoBack = step !== "type";

  function goBack() {
    if (step === "company") setStep("type");
    else if (step === "template-pick") setStep("company");
    else if (step === "variables") setStep("template-pick");
    else if (step === "title") {
      if (mode === "template" && selectedTemplate) {
        const vars = extractVariables(selectedTemplate.bodyJson);
        setStep(vars.length > 0 ? "variables" : "template-pick");
      } else {
        setStep("company");
      }
    }
  }

  const canAdvanceCompany =
    !!selectedExistingCompanyId || companySearch.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg bg-[var(--color-bg-surface)] rounded-2xl border border-[var(--color-border)] shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            {canGoBack && (
              <button
                onClick={goBack}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              {step === "type" && "Новый документ"}
              {step === "company" && "Выберите компанию"}
              {step === "template-pick" && "Выберите шаблон"}
              {step === "variables" && "Заполните переменные"}
              {step === "title" && "Название документа"}
            </h2>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* ── Step 1: type + mode ── */}
          {step === "type" && (
            <>
              <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
                {(["blank", "template"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={[
                      "flex-1 py-2 text-sm font-medium transition-colors",
                      mode === m
                        ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                        : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]",
                    ].join(" ")}
                  >
                    {m === "blank" ? "Пустой документ" : "Из шаблона"}
                  </button>
                ))}
              </div>

              <div>
                <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
                  Тип документа
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {DOCUMENT_TYPE_LIST.map((tpl) => (
                    <button
                      key={tpl.type}
                      onClick={() => setSelectedType(tpl.type)}
                      className={[
                        "flex flex-col items-start gap-1 px-3 py-3 rounded-xl border text-left transition-all",
                        selectedType === tpl.type
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                          : "border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-border-hover)]",
                      ].join(" ")}
                    >
                      <span
                        className="text-xs font-bold px-1.5 py-0.5 rounded"
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
            </>
          )}

          {/* ── Step 2: company ── */}
          {step === "company" && (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Поиск или название новой компании…"
                value={companySearch}
                onChange={(e) => {
                  setCompanySearch(e.target.value);
                  setSelectedExistingCompanyId(null);
                }}
                autoFocus
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
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
                      {c.inn && (
                        <p className="text-xs text-[var(--color-text-muted)]">ИНН: {c.inn}</p>
                      )}
                    </div>
                    {selectedExistingCompanyId === c.id && (
                      <svg className="w-4 h-4 text-[var(--color-accent)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                ))}

                {companySearch.trim() && !selectedExistingCompanyId && (
                  <div className="px-3 py-2.5 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)] flex items-center gap-2">
                    <svg className="w-4 h-4 text-[var(--color-accent)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path d="M12 5v14M5 12h14" />
                    </svg>
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
            </div>
          )}

          {/* ── Step 3: template pick ── */}
          {step === "template-pick" && (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {templates.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Нет шаблонов для этого типа
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Создайте шаблоны в разделе «Шаблоны»
                  </p>
                </div>
              ) : (
                templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => setSelectedTemplate(tpl)}
                    className={[
                      "w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-all",
                      selectedTemplate?.id === tpl.id
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                        : "border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-border-hover)]",
                    ].join(" ")}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                        {tpl.name}
                      </p>
                      {tpl.description && (
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)] truncate">
                          {tpl.description}
                        </p>
                      )}
                      {extractVariables(tpl.bodyJson).length > 0 && (
                        <p className="mt-1 text-xs text-[var(--color-accent)]">
                          {extractVariables(tpl.bodyJson).length} переменных
                        </p>
                      )}
                    </div>
                    {tpl.isDefault && (
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400">
                        По умолчанию
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {/* ── Step 4: variables ── */}
          {step === "variables" && selectedTemplate && (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              <p className="text-xs text-[var(--color-text-muted)]">
                Заполните переменные для шаблона «{selectedTemplate.name}»
              </p>
              {extractVariables(selectedTemplate.bodyJson).map((v) => (
                <div key={v}>
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-1">
                    <code className="font-mono text-[var(--color-accent)]">{`{{${v}}}`}</code>
                  </label>
                  <input
                    type="text"
                    value={variableValues[v] ?? ""}
                    onChange={(e) =>
                      setVariableValues((prev) => ({ ...prev, [v]: e.target.value }))
                    }
                    placeholder={v}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Step 5: title ── */}
          {step === "title" && (
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1.5">
                Название <span className="normal-case font-normal">(необязательно)</span>
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                placeholder={
                  selectedTemplate
                    ? selectedTemplate.name
                    : selectedType
                    ? DOCUMENT_TEMPLATES[selectedType].label
                    : "Введите название…"
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") createMutation.mutate();
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-between gap-3">
          <div>
            {step === "company" && (
              <button
                onClick={handleCompanySkip}
                className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-lg transition-colors"
              >
                Пропустить
              </button>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Отмена
            </button>

            {step === "type" && (
              <button
                onClick={handleTypeNext}
                disabled={!selectedType}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[#0F172A] text-sm font-semibold hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Далее
              </button>
            )}

            {step === "company" && (
              <button
                onClick={handleCompanyNext}
                disabled={!canAdvanceCompany}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[#0F172A] text-sm font-semibold hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Далее
              </button>
            )}

            {step === "template-pick" && (
              <button
                onClick={handleTemplateNext}
                disabled={!selectedTemplate}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[#0F172A] text-sm font-semibold hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Далее
              </button>
            )}

            {step === "variables" && (
              <button
                onClick={() => setStep("title")}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[#0F172A] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                Далее
              </button>
            )}

            {step === "title" && (
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[#0F172A] text-sm font-semibold hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {createMutation.isPending && (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-[#0F172A] border-t-transparent animate-spin" />
                )}
                Создать
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Company filter dropdown ───────────────────────────────────────────────────
function CompanyFilterDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const { data: allCompanies = [] } = useQuery({
    queryKey: ["companies"],
    queryFn: () => counterpartiesApi.list(),
    staleTime: 60_000,
  });

  const displayed = filterSearch
    ? allCompanies.filter((c) =>
        c.name.toLowerCase().includes(filterSearch.toLowerCase())
      )
    : allCompanies;

  const selectedName = allCompanies.find((c) => c.id === value)?.name;

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors",
          value
            ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10"
            : "border-[var(--color-border)] text-[var(--color-text-primary)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-hover)]",
        ].join(" ")}
      >
        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 9h18M3 15h18M8 3v18M16 3v18" strokeWidth={0} />
          <rect x="2" y="7" width="20" height="10" rx="2" />
          <path d="M6 12h12" />
        </svg>
        <span className="max-w-[120px] truncate">
          {selectedName ?? "Компания"}
        </span>
        <svg className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 w-56 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-[var(--color-border)]">
            <input
              type="text"
              placeholder="Поиск компании…"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              autoFocus
              className="w-full px-2 py-1.5 rounded-lg bg-[var(--color-bg-elevated)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none border border-[var(--color-border)] focus:border-[var(--color-accent)] transition-colors"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            <button
              onClick={() => { onChange(""); setOpen(false); setFilterSearch(""); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--color-bg-elevated)] ${!value ? "text-[var(--color-accent)] font-medium" : "text-[var(--color-text-secondary)]"}`}
            >
              Все компании
            </button>
            {displayed.map((c) => (
              <button
                key={c.id}
                onClick={() => { onChange(c.id); setOpen(false); setFilterSearch(""); }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--color-bg-elevated)] truncate ${value === c.id ? "text-[var(--color-accent)] font-medium" : "text-[var(--color-text-primary)]"}`}
              >
                {c.name}
              </button>
            ))}
            {displayed.length === 0 && (
              <p className="px-3 py-2 text-sm text-[var(--color-text-muted)]">Не найдено</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Document card ─────────────────────────────────────────────────────────────
function DocCard({ doc }: { doc: DocumentDto }) {
  const router = useRouter();
  const tpl = DOCUMENT_TEMPLATES[doc.type];
  const date = new Date(doc.updatedAt).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <button
      onClick={() => router.push(`/documents/${doc.id}`)}
      className="w-full text-left flex items-start gap-3 px-4 py-4 rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-elevated)] transition-all group"
    >
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
          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-medium ${STATUS_COLORS[doc.status]}`}>
            {STATUS_LABELS[doc.status]}
          </span>
          {doc.counterparty && (
            <span className="text-xs text-[var(--color-text-muted)] shrink-0 truncate max-w-[120px]">
              {doc.counterparty.name}
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors">
          {doc.title}
        </p>
        {doc.number && (
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">№ {doc.number}</p>
        )}
      </div>
      <time className="text-xs text-[var(--color-text-muted)] shrink-0 mt-0.5">{date}</time>
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function DocumentsListClient() {
  const [showCreate, setShowCreate] = useState(false);
  const [typeFilter, setTypeFilter] = useState<DocumentType | "">("");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "">("");
  const [companyFilter, setCompanyFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["documents", typeFilter, statusFilter, search, companyFilter],
    queryFn: () =>
      documentsApi.list({
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(search ? { search } : {}),
        ...(companyFilter ? { counterpartyId: companyFilter } : {}),
        limit: 50,
      }),
  });

  const docs = data?.data ?? [];
  const hasFilters = !!(typeFilter || statusFilter || search || companyFilter);

  return (
    <div className="p-6 lg:p-8 h-full flex flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Документы</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            КП, договоры, счета, акты выполненных работ
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[#0F172A] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors shrink-0"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Создать
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5 shrink-0">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Поиск…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors w-48"
          />
        </div>

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

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | "")}
          className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        >
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <CompanyFilterDropdown value={companyFilter} onChange={setCompanyFilter} />

        {hasFilters && (
          <button
            onClick={() => { setTypeFilter(""); setStatusFilter(""); setSearch(""); setCompanyFilter(""); }}
            className="px-3 py-1.5 rounded-lg text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] transition-colors"
          >
            Сбросить
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto -mx-6 px-6 lg:-mx-8 lg:px-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-[var(--color-border)] rounded-xl">
            <div className="w-12 h-12 rounded-xl bg-[var(--color-bg-surface)] flex items-center justify-center mb-4 border border-[var(--color-border)]">
              <svg className="w-6 h-6 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">
              {hasFilters ? "Ничего не найдено" : "Документов пока нет"}
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {hasFilters
                ? "Попробуйте изменить фильтры"
                : "Создайте первый документ или импортируйте файл"}
            </p>
            {!hasFilters && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[#0F172A] text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                + Создать документ
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-2">
            {docs.map((doc) => (
              <DocCard key={doc.id} doc={doc} />
            ))}
          </div>
        )}

        {data && data.total > docs.length && (
          <p className="text-center text-xs text-[var(--color-text-muted)] py-4">
            Показано {docs.length} из {data.total}
          </p>
        )}
      </div>

      {showCreate && <CreateDocumentModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
