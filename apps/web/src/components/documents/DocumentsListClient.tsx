"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  X,
  ChevronLeft,
  ChevronDown,
  Check,
  Wand2,
  Building2,
  FileText,
  Trash2,
} from "lucide-react";
import { Button, Input, Select, Modal, Card, EmptyState, PageHeader, Spinner, Badge } from "@/components/ui";
import { documentsApi } from "@/lib/api/documents";
import { templatesApi } from "@/lib/api/templates";
import type { TemplateDto } from "@/lib/api/templates";
import { counterpartiesApi, type CounterpartyFormData } from "@/lib/api/counterparties";
import { DOCUMENT_TEMPLATES, DOCUMENT_TYPE_LIST, BUILTIN_DOCUMENT_TYPE_LIST } from "@/lib/templates";
import { syncDateInBody, syncNumberInBody, injectCounterpartyInBody, injectProviderInBody } from "@/lib/docBody";
import { todayISO } from "@/lib/docBody";
import {
  substitutePlaceholders,
  substituteVariables,
  extractManualVariables,
  usesCompanyPlaceholders,
  usesOrgPlaceholders,
} from "@/lib/placeholders";
import { computeInvoiceAutoFields, type InvoiceAutoFields } from "@/lib/invoiceAuto";
import { settingsApi } from "@/lib/api/settings";
import { documentCategoriesApi } from "@/lib/api/documentCategories";
import { DocumentType, DocumentStatus } from "@ai-vault/types";
import type { DocumentDto, CounterpartyDto } from "@ai-vault/types";

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
type ModalStep = "type" | "company" | "company-details" | "template-pick" | "variables" | "title";

const EMPTY_COMPANY_DETAILS: Omit<CounterpartyFormData, "name"> = {
  inn: "",
  bin: "",
  address: "",
  bankAccount: "",
  bankName: "",
  bankBik: "",
};

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
  // Реквизиты новой компании (шаг company-details, пока только для Счёта на оплату)
  const [companyDetails, setCompanyDetails] =
    useState<Omit<CounterpartyFormData, "name">>(EMPTY_COMPANY_DETAILS);

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

      // Fetch org settings once — используется для авто-заполнения раздела «Поставщик»
      const orgSettings = await settingsApi.getSettings().catch(() => null);

      if (selectedTemplate) {
        bodyJson = substituteVariables(selectedTemplate.bodyJson, variableValues);
        meta = (selectedTemplate.metaDefaults as Record<string, unknown>) ?? {};
      }

      let cpId = resolvedCompanyId;
      let cpData: CounterpartyDto | null = null;

      if (companyToCreate) {
        // Собираем только заполненные реквизиты — пустые строки не отправляем
        const details = Object.fromEntries(
          Object.entries(companyDetails).filter(([, v]) => v && v.trim()),
        );
        const cp = await counterpartiesApi.create({ name: companyToCreate, ...details });
        cpId = cp.id;
        cpData = cp;
        void qc.invalidateQueries({ queryKey: ["companies"] });
        void qc.invalidateQueries({ queryKey: ["companies-search"] });
        void qc.invalidateQueries({ queryKey: ["counterparties"] });
      } else if (resolvedCompanyId) {
        const found = (await counterpartiesApi.list()).find((c) => c.id === resolvedCompanyId);
        cpData = found ?? null;
      }

      // Кастомные шаблоны (конструктор) заполняются через переменные-чипы в самом
      // документе — системные {{...}}-плейсхолдеры и авто-дата/номер тут не нужны.
      if (selectedType !== DocumentType.CUSTOM) {
        // Автополя счёта: следующий номер (005 → 006 → …) и период по последнему счёту
        let invoiceAuto: InvoiceAutoFields | null = null;
        if (selectedType === DocumentType.INVOICE_PAYMENT) {
          invoiceAuto = await computeInvoiceAutoFields();
          meta = {
            ...meta,
            invoiceNumber: invoiceAuto.number,
            periodStart: invoiceAuto.periodStartIso,
            periodEnd: invoiceAuto.periodEndIso,
          };
        }

        // Актуальная дата и номер — для любого способа создания
        const today = todayISO();
        const dateKey =
          selectedType === DocumentType.AVR ? "actDate" :
          selectedType === DocumentType.CONTRACT ? "startDate" : "invoiceDate";
        meta = { ...meta, [dateKey]: today };
        bodyJson = syncDateInBody(bodyJson, "", today);
        bodyJson = syncNumberInBody(bodyJson, "", (meta.invoiceNumber as string) ?? "");

        // Запоминаем ДО подстановки: использует ли шаблон именованные плейсхолдеры
        const hasCompanyPh = usesCompanyPlaceholders(bodyJson);
        const hasOrgPh = usesOrgPlaceholders(bodyJson);

        // Системные плейсхолдеры: {{company.*}}, {{org.*}}, даты, номер, сумма, период
        const docNumber = (meta.invoiceNumber ?? meta.actNumber ?? meta.contractNumber ?? "") as string;
        bodyJson = substitutePlaceholders(bodyJson, {
          company: cpData,
          org: orgSettings,
          number: docNumber,
          amount: Number(meta.totalAmount ?? 0),
          periodStart: invoiceAuto?.periodStart,
          periodEnd: invoiceAuto?.periodEnd,
        });

        // Старые эвристики по ключевым словам — только для шаблонов без плейсхолдеров
        if (cpData && !hasCompanyPh) {
          bodyJson = injectCounterpartyInBody(bodyJson, selectedType, cpData);
        }
        if (orgSettings?.name && !hasOrgPh) {
          bodyJson = injectProviderInBody(bodyJson, orgSettings);
        }
      } else {
        meta = { type: DocumentType.CUSTOM };
      }

      return documentsApi.create({
        type: selectedType,
        title: title.trim() || (selectedTemplate ? selectedTemplate.name : tpl.label),
        bodyJson,
        meta,
        ...(cpId ? { counterpartyId: cpId } : {}),
        ...(selectedTemplate?.categoryId ? { categoryId: selectedTemplate.categoryId } : {}),
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

  const needsCompanyDetails = (createName: string | null) =>
    !!createName && selectedType === DocumentType.INVOICE_PAYMENT;

  function stepAfterCompany(): ModalStep {
    return mode === "template" ? "template-pick" : "title";
  }

  function advanceFromCompany(cpId: string | null, createName: string | null) {
    setResolvedCompanyId(cpId);
    setCompanyToCreate(createName);
    if (needsCompanyDetails(createName)) {
      setStep("company-details");
    } else {
      setStep(stepAfterCompany());
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
    const vars = extractManualVariables(selectedTemplate.bodyJson);
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
    else if (step === "company-details") setStep("company");
    else if (step === "template-pick") {
      setStep(needsCompanyDetails(companyToCreate) ? "company-details" : "company");
    }
    else if (step === "variables") setStep("template-pick");
    else if (step === "title") {
      if (mode === "template" && selectedTemplate) {
        const vars = extractManualVariables(selectedTemplate.bodyJson);
        setStep(vars.length > 0 ? "variables" : "template-pick");
      } else {
        setStep(needsCompanyDetails(companyToCreate) ? "company-details" : "company");
      }
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
            {step === "type" && "Новый документ"}
            {step === "company" && "Выберите компанию"}
            {step === "company-details" && "Реквизиты компании"}
            {step === "template-pick" && "Выберите шаблон"}
            {step === "variables" && "Заполните переменные"}
            {step === "title" && "Название документа"}
          </h2>
        </div>
        <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* ── Step 1: type ── */}
        {step === "type" && (
          <>
            <div>
              <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
                Тип документа
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BUILTIN_DOCUMENT_TYPE_LIST.map((tpl) => (
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
                    <Badge color={tpl.color}>{tpl.shortLabel}</Badge>
                    <span className="text-xs text-[var(--color-text-secondary)] leading-tight">
                      {tpl.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setSelectedType(DocumentType.CUSTOM);
                setMode("template");
                setStep("company");
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-[var(--color-border)] text-left text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-hover)] transition-colors"
            >
              <Wand2 className="w-4 h-4 shrink-0" />
              Использовать свой шаблон из конструктора
            </button>
          </>
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

        {/* ── Step 2.5: company details (новая компания, Счёт на оплату) ── */}
        {step === "company-details" && (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            <p className="text-xs text-[var(--color-text-muted)]">
              Реквизиты компании{" "}
              <span className="text-[var(--color-text-primary)] font-medium">«{companyToCreate}»</span>{" "}
              будут подставлены в счёт на оплату. Поля можно оставить пустыми — в документе останутся прочерки.
            </p>
            {(
              [
                ["inn", "ИНН", "01234567891234"],
                ["bin", "ОКПО", "12345678"],
                ["address", "Юридический адрес", "г. Бишкек, ул. ______, д. __"],
                ["bankAccount", "Расчётный счёт (р/с)", "1234567890123456"],
                ["bankName", "Банк", "ОАО «Бакай Банк»"],
                ["bankBik", "БИК", "124012"],
              ] as const
            ).map(([field, label, placeholder]) => (
              <div key={field}>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-1">
                  {label}
                </label>
                <Input
                  type="text"
                  value={companyDetails[field] ?? ""}
                  onChange={(e) =>
                    setCompanyDetails((prev) => ({ ...prev, [field]: e.target.value }))
                  }
                  placeholder={placeholder}
                />
              </div>
            ))}
          </div>
        )}

        {/* ── Step 3: template pick ── */}
        {step === "template-pick" && (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {templates.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-[var(--color-text-muted)]">
                  Пока нет своих шаблонов
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Создайте шаблон в разделе «Конструктор»
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

        {/* ── Step 4: variables ── */}
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

        {/* ── Step 5: title ── */}
        {step === "title" && (
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1.5">
              Название <span className="normal-case font-normal">(необязательно)</span>
            </label>
            <Input
              type="text"
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
            <Button variant="secondary" onClick={handleCompanySkip}>
              Пропустить
            </Button>
          )}
        </div>

        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>

          {step === "type" && (
            <Button onClick={handleTypeNext} disabled={!selectedType}>
              Далее
            </Button>
          )}

          {step === "company" && (
            <Button onClick={handleCompanyNext} disabled={!canAdvanceCompany}>
              Далее
            </Button>
          )}

          {step === "company-details" && (
            <Button onClick={() => setStep(stepAfterCompany())}>
              Далее
            </Button>
          )}

          {step === "template-pick" && (
            <Button onClick={handleTemplateNext} disabled={!selectedTemplate}>
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
        <Building2 className="w-3.5 h-3.5 shrink-0" />
        <span className="max-w-[120px] truncate">
          {selectedName ?? "Компания"}
        </span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 w-56 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden animate-scale-in">
          <div className="p-2 border-b border-[var(--color-border)]">
            <Input
              type="text"
              placeholder="Поиск компании…"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              autoFocus
              className="py-1.5"
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
                : "Создайте первый документ или импортируйте файл"
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
