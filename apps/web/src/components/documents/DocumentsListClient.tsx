"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  X,
  ChevronLeft,
  Check,
  FileText,
  Trash2,
} from "lucide-react";
import { Button, Input, Select, Modal, Card, EmptyState, PageHeader, Spinner, Badge } from "@/components/ui";
import { CompanyFilterDropdown } from "./CompanyFilterDropdown";
import { documentsApi } from "@/lib/api/documents";
import { templatesApi } from "@/lib/api/templates";
import type { TemplateDto } from "@/lib/api/templates";
import { counterpartiesApi } from "@/lib/api/counterparties";
import { DOCUMENT_TEMPLATES, DOCUMENT_TYPE_LIST } from "@/lib/templates";
import { substituteVariables, extractManualVariables } from "@/lib/placeholders";
import { documentCategoriesApi } from "@/lib/api/documentCategories";
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

// ─── Create modal ──────────────────────────────────────────────────────────────
type ModalStep = "template" | "company" | "variables" | "title";

function CreateDocumentModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState<ModalStep>("template");
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

  // "Тип документа" is now driven entirely by templates created in the Конструктор —
  // there is no more fixed list of built-in document types to pick from.
  const { data: templates = [] } = useQuery({
    queryKey: ["templates", DocumentType.CUSTOM],
    queryFn: () => templatesApi.list(DocumentType.CUSTOM),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error("No template");
      const bodyJson = substituteVariables(selectedTemplate.bodyJson, variableValues);
      const meta = (selectedTemplate.metaDefaults as Record<string, unknown>) ?? {};

      let cpId = resolvedCompanyId;
      if (companyToCreate) {
        const cp = await counterpartiesApi.quickCreate(companyToCreate);
        cpId = cp.id;
        void qc.invalidateQueries({ queryKey: ["companies"] });
        void qc.invalidateQueries({ queryKey: ["companies-search"] });
        void qc.invalidateQueries({ queryKey: ["counterparties"] });
      }

      return documentsApi.create({
        type: DocumentType.CUSTOM,
        title: title.trim() || selectedTemplate.name,
        bodyJson,
        meta,
        ...(cpId ? { counterpartyId: cpId } : {}),
        ...(selectedTemplate.categoryId ? { categoryId: selectedTemplate.categoryId } : {}),
      });
    },
    onSuccess: (doc) => {
      void qc.invalidateQueries({ queryKey: ["documents"] });
      router.push(`/documents/${doc.id}`);
    },
  });

  function handleTemplateNext() {
    if (!selectedTemplate) return;
    setStep("company");
  }

  function afterCompany() {
    const vars = selectedTemplate ? extractManualVariables(selectedTemplate.bodyJson) : [];
    if (vars.length > 0) {
      const initial: Record<string, string> = {};
      for (const v of vars) initial[v] = "";
      setVariableValues(initial);
      setStep("variables");
    } else {
      setStep("title");
    }
  }

  function handleCompanyNext() {
    if (selectedExistingCompanyId) {
      setResolvedCompanyId(selectedExistingCompanyId);
      setCompanyToCreate(null);
      afterCompany();
    } else if (companySearch.trim()) {
      setResolvedCompanyId(null);
      setCompanyToCreate(companySearch.trim());
      afterCompany();
    }
  }

  function handleCompanySkip() {
    setResolvedCompanyId(null);
    setCompanyToCreate(null);
    afterCompany();
  }

  const canGoBack = step !== "template";

  function goBack() {
    if (step === "company") setStep("template");
    else if (step === "variables") setStep("company");
    else if (step === "title") {
      const vars = selectedTemplate ? extractManualVariables(selectedTemplate.bodyJson) : [];
      setStep(vars.length > 0 ? "variables" : "company");
    }
  }

  const canAdvanceCompany =
    !!selectedExistingCompanyId || companySearch.trim().length > 0;

  return (
    <Modal onClose={onClose} size="lg">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          {canGoBack && (
            <button
              onClick={goBack}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            {step === "template" && "Выберите шаблон"}
            {step === "company" && "Выберите компанию"}
            {step === "variables" && "Заполните переменные"}
            {step === "title" && "Название документа"}
          </h2>
        </div>
        <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* ── Step 1: template (шаблоны из конструктора вместо фиксированных типов) ── */}
        {step === "template" && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {templates.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Пока нет своих шаблонов
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Создайте шаблон в разделе «Конструктор», чтобы он появился здесь
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { onClose(); router.push("/builder"); }}
                >
                  Перейти в конструктор
                </Button>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                        {tpl.name}
                      </p>
                      {tpl.category && (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ background: `${tpl.category.color}26`, color: tpl.category.color }}
                        >
                          {tpl.category.name}
                        </span>
                      )}
                    </div>
                    {tpl.description && (
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)] truncate">
                        {tpl.description}
                      </p>
                    )}
                    {extractManualVariables(tpl.bodyJson).length > 0 && (
                      <p className="mt-1 text-xs text-[var(--color-accent)]">
                        {extractManualVariables(tpl.bodyJson).length} переменных
                      </p>
                    )}
                  </div>
                  {tpl.isDefault && (
                    <Badge className="shrink-0 rounded-full bg-emerald-900/30 text-emerald-400">
                      По умолчанию
                    </Badge>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {/* ── Step 2: company ── */}
        {step === "company" && (
          <div className="space-y-3">
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
                    {c.inn && (
                      <p className="text-xs text-[var(--color-text-muted)]">ИНН: {c.inn}</p>
                    )}
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
          </div>
        )}

        {/* ── Step 3: variables ── */}
        {step === "variables" && selectedTemplate && (
          <div className="space-y-3 max-h-72 overflow-y-auto">
            <p className="text-xs text-[var(--color-text-muted)]">
              Заполните переменные для шаблона «{selectedTemplate.name}»
            </p>
            {extractManualVariables(selectedTemplate.bodyJson).map((v) => (
              <div key={v}>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-1">
                  <code className="font-mono text-[var(--color-accent)]">{`{{${v}}}`}</code>
                </label>
                <Input
                  type="text"
                  value={variableValues[v] ?? ""}
                  onChange={(e) =>
                    setVariableValues((prev) => ({ ...prev, [v]: e.target.value }))
                  }
                  placeholder={v}
                />
              </div>
            ))}
          </div>
        )}

        {/* ── Step 4: title ── */}
        {step === "title" && (
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1.5">
              Название <span className="normal-case font-normal">(необязательно)</span>
            </label>
            <Input
              type="text"
              placeholder={selectedTemplate?.name ?? "Введите название…"}
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
            <Button variant="secondary" onClick={handleCompanySkip}>
              Пропустить
            </Button>
          )}
        </div>

        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>

          {step === "template" && (
            <Button onClick={handleTemplateNext} disabled={!selectedTemplate}>
              Далее
            </Button>
          )}

          {step === "company" && (
            <Button onClick={handleCompanyNext} disabled={!canAdvanceCompany}>
              Далее
            </Button>
          )}

          {step === "variables" && (
            <Button onClick={() => setStep("title")}>
              Далее
            </Button>
          )}

          {step === "title" && (
            <Button
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
            >
              Создать
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── Document card ─────────────────────────────────────────────────────────────
function DocCard({ doc }: { doc: DocumentDto }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const tpl = DOCUMENT_TEMPLATES[doc.type];
  const badgeColor = doc.category?.color ?? tpl.color;
  const badgeLabel = doc.category?.shortLabel ?? tpl.shortLabel;
  const date = new Date(doc.updatedAt).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const deleteMutation = useMutation({
    mutationFn: () => documentsApi.delete(doc.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["documents"] }),
  });

  return (
    <Card hoverable className="group w-full flex items-start gap-3 px-4 py-4">
      <div
        className="mt-0.5 w-1 self-stretch rounded-full shrink-0"
        style={{ background: badgeColor }}
      />

      {/* Clickable content area */}
      <button
        onClick={() => router.push(`/documents/${doc.id}`)}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
          <Badge color={badgeColor} className="shrink-0">{badgeLabel}</Badge>
          <Badge className={`rounded-full font-medium shrink-0 ${STATUS_COLORS[doc.status]}`}>
            {STATUS_LABELS[doc.status]}
          </Badge>
          {doc.counterparty && (
            <span className="text-xs text-[var(--color-text-muted)] truncate max-w-[160px] sm:max-w-[120px]">
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
      </button>

      <div className="flex items-center gap-3 shrink-0">
        <time className="text-xs text-[var(--color-text-muted)]">{date}</time>

        {confirming ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[var(--color-text-muted)]">Удалить?</span>
            <Button
              variant="danger"
              size="sm"
              onClick={() => { deleteMutation.mutate(); setConfirming(false); }}
              disabled={deleteMutation.isPending}
            >
              Да
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
              Нет
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            title="Удалить"
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </Card>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function DocumentsListClient() {
  const [showCreate, setShowCreate] = useState(false);
  const [typeFilter, setTypeFilter] = useState<DocumentType | "">("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "">("");
  const [companyFilter, setCompanyFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data: categories = [] } = useQuery({
    queryKey: ["document-categories"],
    queryFn: documentCategoriesApi.list,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["documents", typeFilter, categoryFilter, statusFilter, search, companyFilter],
    queryFn: () =>
      documentsApi.list({
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(categoryFilter ? { categoryId: categoryFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(search ? { search } : {}),
        ...(companyFilter ? { counterpartyId: companyFilter } : {}),
        limit: 50,
      }),
  });

  const docs = data?.data ?? [];
  const hasFilters = !!(typeFilter || categoryFilter || statusFilter || search || companyFilter);

  return (
    <div className="p-6 lg:p-8 h-full flex flex-col">
      <PageHeader
        title="Документы"
        subtitle="КП, договоры, счета, акты выполненных работ"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Создать
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5 shrink-0">
        <div className="relative w-full sm:w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          <Input
            type="text"
            placeholder="Поиск…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 py-1.5"
          />
        </div>

        <Select
          value={categoryFilter ? `cat:${categoryFilter}` : typeFilter}
          onChange={(v) => {
            if (v.startsWith("cat:")) {
              setTypeFilter(DocumentType.CUSTOM);
              setCategoryFilter(v.slice(4));
            } else {
              setTypeFilter(v as DocumentType | "");
              setCategoryFilter("");
            }
          }}
          className="w-auto py-1.5"
          options={[
            { value: "", label: "Все типы" },
            ...DOCUMENT_TYPE_LIST.map((tpl) => ({
              value: tpl.type,
              label: `${tpl.shortLabel} — ${tpl.label}`,
            })),
            ...(categories.length > 0
              ? [
                  {
                    group: "Мои категории",
                    items: categories.map((c) => ({ value: `cat:${c.id}`, label: c.name })),
                  },
                ]
              : []),
          ]}
        />

        <Select
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as DocumentStatus | "")}
          className="w-auto py-1.5"
          options={[
            { value: "", label: "Все статусы" },
            ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v })),
          ]}
        />

        <CompanyFilterDropdown value={companyFilter} onChange={setCompanyFilter} />

        {hasFilters && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setTypeFilter(""); setCategoryFilter(""); setStatusFilter(""); setSearch(""); setCompanyFilter(""); }}
          >
            Сбросить
          </Button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto -mx-6 px-6 lg:-mx-8 lg:px-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-[var(--color-accent)]">
            <Spinner size="lg" />
          </div>
        ) : docs.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-6 h-6" strokeWidth={1.5} />}
            title={hasFilters ? "Ничего не найдено" : "Документов пока нет"}
            description={
              hasFilters
                ? "Попробуйте изменить фильтры"
                : "Создайте первый документ или загрузите файл в архив"
            }
            action={
              !hasFilters && (
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                  Создать документ
                </Button>
              )
            }
          />
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
