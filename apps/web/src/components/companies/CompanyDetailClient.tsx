"use client";

import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { counterpartiesApi } from "@/lib/api/counterparties";
import { documentsApi } from "@/lib/api/documents";
import { DOCUMENT_TEMPLATES } from "@/lib/templates";
import { DocumentType, DocumentStatus } from "@ai-vault/types";
import type { DocumentDto, DocumentMetaAvr, DocumentMetaInvoicePayment } from "@ai-vault/types";

// ── Date helpers ───────────────────────────────────────────────────────────────

const RU_MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function ruDate(d: Date): string {
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()} г.`;
}

function formatButtonDate(d: Date): string {
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function getNextAutoDate(lastDate: Date): Date {
  const today = new Date();
  const day = lastDate.getDate();
  if (today.getDate() <= day) {
    return new Date(today.getFullYear(), today.getMonth(), day);
  }
  return new Date(today.getFullYear(), today.getMonth() + 1, day);
}

function replaceDateInBody(bodyJson: unknown, oldDate: Date, newDate: Date): unknown {
  let text = JSON.stringify(bodyJson);
  const oldFull = ruDate(oldDate);
  const newFull = ruDate(newDate);
  text = text.split(oldFull).join(newFull);
  // also try without "г."
  const oldShort = `${oldDate.getDate()} ${RU_MONTHS[oldDate.getMonth()]} ${oldDate.getFullYear()}`;
  const newShort = `${newDate.getDate()} ${RU_MONTHS[newDate.getMonth()]} ${newDate.getFullYear()}`;
  text = text.split(oldShort).join(newShort);
  return JSON.parse(text) as unknown;
}

function getDocDate(doc: DocumentDto, type: DocumentType): Date | null {
  try {
    if (type === DocumentType.AVR) {
      const dateStr = (doc.meta as DocumentMetaAvr).actDate;
      if (dateStr) return new Date(dateStr);
    }
    if (type === DocumentType.INVOICE_PAYMENT) {
      const dateStr = (doc.meta as DocumentMetaInvoicePayment).invoiceDate;
      if (dateStr) return new Date(dateStr);
    }
  } catch {
    // ignore
  }
  return null;
}

// ── Status display ─────────────────────────────────────────────────────────────

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

// ── Monthly card ───────────────────────────────────────────────────────────────

function MonthlyDocCard({
  type,
  lastDoc,
  companyId,
  onCreated,
}: {
  type: DocumentType.AVR | DocumentType.INVOICE_PAYMENT;
  lastDoc: DocumentDto | undefined;
  companyId: string;
  onCreated: (doc: DocumentDto) => void;
}) {
  const qc = useQueryClient();
  const tpl = DOCUMENT_TEMPLATES[type];
  const lastDate = lastDoc ? getDocDate(lastDoc, type) : null;
  const nextDate = lastDate ? getNextAutoDate(lastDate) : null;

  const createMutation = useMutation({
    mutationFn: () => {
      if (!lastDoc || !lastDate || !nextDate) {
        return documentsApi.create({
          type,
          title: tpl.label,
          counterpartyId: companyId,
          meta: tpl.metaDefaults as Record<string, unknown>,
          bodyJson: tpl.bodyJson,
        });
      }

      const newBodyJson = replaceDateInBody(lastDoc.bodyJson, lastDate, nextDate);
      const newMeta = { ...(lastDoc.meta as unknown as Record<string, unknown>) };
      if (type === DocumentType.AVR) {
        newMeta.actDate = nextDate.toISOString().split("T")[0];
      } else {
        newMeta.invoiceDate = nextDate.toISOString().split("T")[0];
      }

      return documentsApi.create({
        type,
        title: lastDoc.title,
        counterpartyId: companyId,
        meta: newMeta,
        bodyJson: newBodyJson,
      });
    },
    onSuccess: (doc) => {
      void qc.invalidateQueries({ queryKey: ["company-docs", companyId] });
      onCreated(doc);
    },
  });

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-bold px-2 py-0.5 rounded"
          style={{ background: tpl.color + "22", color: tpl.color }}
        >
          {tpl.shortLabel}
        </span>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{tpl.label}</p>
      </div>

      {lastDoc ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-secondary)] truncate">{lastDoc.title}</p>
            {lastDate && (
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Последний: {formatButtonDate(lastDate)}
              </p>
            )}
          </div>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-[#0F172A] text-xs font-semibold hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"
          >
            {createMutation.isPending ? (
              <span className="w-3 h-3 rounded-full border-2 border-[#0F172A] border-t-transparent animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
            {nextDate ? `Создать для ${formatButtonDate(nextDate)}` : "Создать копию"}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--color-text-muted)]">Нет документов этого типа</p>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-hover)] disabled:opacity-50 transition-colors"
          >
            {createMutation.isPending ? (
              <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
            Создать первый
          </button>
        </div>
      )}
    </div>
  );
}

// ── Doc row ────────────────────────────────────────────────────────────────────

function DocRow({ doc }: { doc: DocumentDto }) {
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
      className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-elevated)] transition-all"
    >
      <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: tpl.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
            style={{ background: tpl.color + "22", color: tpl.color }}
          >
            {tpl.shortLabel}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-medium ${STATUS_COLORS[doc.status]}`}>
            {STATUS_LABELS[doc.status]}
          </span>
        </div>
        <p className="text-sm text-[var(--color-text-primary)] truncate">{doc.title}</p>
      </div>
      <time className="text-xs text-[var(--color-text-muted)] shrink-0">{date}</time>
    </button>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function CompanyDetailClient({ companyId }: { companyId: string }) {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: company, isLoading: loadingCompany, isError: errorCompany } = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => counterpartiesApi.get(companyId),
  });

  const { data: docsData, isLoading: loadingDocs } = useQuery({
    queryKey: ["company-docs", companyId],
    queryFn: () => documentsApi.list({ counterpartyId: companyId, limit: 100 }),
    enabled: !!companyId,
  });

  const docs = docsData?.data ?? [];
  const lastAvr = docs.find((d) => d.type === DocumentType.AVR);
  const lastInvoice = docs.find((d) => d.type === DocumentType.INVOICE_PAYMENT);

  function handleCreated(doc: DocumentDto) {
    void qc.invalidateQueries({ queryKey: ["company-docs", companyId] });
    router.push(`/documents/${doc.id}`);
  }

  if (loadingCompany) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (errorCompany || !company) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-[var(--color-text-secondary)]">Компания не найдена</p>
        <button
          onClick={() => router.push("/companies")}
          className="text-sm text-[var(--color-accent)] hover:underline"
        >
          ← Вернуться к списку
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] shrink-0">
        <button
          onClick={() => router.push("/companies")}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors shrink-0"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[var(--color-text-primary)] truncate">
            {company.name}
          </h1>
          {company.inn && (
            <p className="text-xs text-[var(--color-text-muted)]">ИНН: {company.inn}</p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Company info */}
        {(company.address ?? company.bankName ?? company.phone ?? company.email) && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {company.address && (
              <div className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
                <p className="text-xs text-[var(--color-text-muted)] mb-1">Адрес</p>
                <p className="text-sm text-[var(--color-text-primary)]">{company.address}</p>
              </div>
            )}
            {company.bankName && (
              <div className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
                <p className="text-xs text-[var(--color-text-muted)] mb-1">Банк</p>
                <p className="text-sm text-[var(--color-text-primary)]">{company.bankName}</p>
                {company.bankAccount && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">р/с {company.bankAccount}</p>
                )}
              </div>
            )}
            {(company.phone ?? company.email) && (
              <div className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
                <p className="text-xs text-[var(--color-text-muted)] mb-1">Контакты</p>
                {company.phone && <p className="text-sm text-[var(--color-text-primary)]">{company.phone}</p>}
                {company.email && <p className="text-sm text-[var(--color-text-primary)]">{company.email}</p>}
              </div>
            )}
          </div>
        )}

        {/* Monthly automation */}
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            Регулярные документы
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MonthlyDocCard
              type={DocumentType.AVR}
              lastDoc={lastAvr}
              companyId={companyId}
              onCreated={handleCreated}
            />
            <MonthlyDocCard
              type={DocumentType.INVOICE_PAYMENT}
              lastDoc={lastInvoice}
              companyId={companyId}
              onCreated={handleCreated}
            />
          </div>
        </div>

        {/* All docs */}
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            Все документы {docs.length > 0 && `(${docs.length})`}
          </p>

          {loadingDocs && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-[var(--color-bg-elevated)] animate-pulse" />
              ))}
            </div>
          )}

          {!loadingDocs && docs.length === 0 && (
            <div className="py-10 text-center border border-dashed border-[var(--color-border)] rounded-xl">
              <p className="text-sm text-[var(--color-text-muted)]">Нет документов</p>
            </div>
          )}

          {!loadingDocs && docs.length > 0 && (
            <div className="space-y-2">
              {docs.map((doc) => (
                <DocRow key={doc.id} doc={doc} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
