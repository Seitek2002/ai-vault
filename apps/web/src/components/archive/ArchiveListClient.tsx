"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, FileText, Trash2, Eye, ExternalLink, ChevronLeft, ChevronRight, X, Download } from "lucide-react";
import { Button, Input, Card, EmptyState, Spinner, Modal } from "@/components/ui";
import { CompanyFilterDropdown } from "@/components/documents/CompanyFilterDropdown";
import { documentsApi } from "@/lib/api/documents";
import { getOriginalFileUrl, downloadOriginalFile } from "@/lib/api/export";
import { ArchiveUploadModal } from "./ArchiveUploadModal";
import type { DocumentSummaryDto } from "@ai-vault/types";

function ArchiveCard({ doc, onDeleted }: { doc: DocumentSummaryDto; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [opening, setOpening] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const date = new Date(doc.createdAt).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const deleteMutation = useMutation({
    mutationFn: () => documentsApi.delete(doc.id),
    onSuccess: () => {
      onDeleted();
      void qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Не удалось удалить документ"),
  });

  const downloadMutation = useMutation({
    mutationFn: () => downloadOriginalFile(doc.id, `${doc.title}.pdf`),
    onError: (err) => setError(err instanceof Error ? err.message : "Не удалось скачать PDF"),
  });

  async function handleOpen() {
    if (opening) return;
    setError("");
    setOpening(true);
    try {
      setPreviewUrl(await getOriginalFileUrl(doc.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть файл");
    } finally {
      setOpening(false);
    }
  }

  return (
    <>
    <Card hoverable className="group w-full min-w-0 px-4 py-4">
      <div className="flex items-start gap-3">
      <div className="mt-0.5 w-9 h-9 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4 text-[var(--color-text-muted)]" />
      </div>

      <button
        type="button"
        onClick={() => void handleOpen()}
        disabled={opening}
        className="flex-1 min-w-0 text-left disabled:opacity-60"
      >
        <p className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors flex items-center gap-1.5">
          <span className="truncate">{doc.title}</span>
          {opening ? <Spinner size="sm" /> : <Eye className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />}
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)] truncate" title={doc.counterparty?.name}>
          {doc.counterparty?.name ?? "Без компании"}
        </p>
        <time dateTime={doc.createdAt} className="mt-1 block text-xs text-[var(--color-text-muted)]">PDF · {date}</time>
      </button>
      <button
        type="button"
        onClick={() => { setError(""); setConfirming(true); }}
        aria-label={`Удалить ${doc.title}`}
        title="Удалить документ"
        disabled={deleteMutation.isPending}
        className="shrink-0 p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-red-400 hover:border-red-400/50 transition-colors disabled:opacity-50"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      </div>
      {confirming && (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-border)] pt-3">
            <span className="text-xs text-[var(--color-text-secondary)] mr-auto">Удалить документ из архива?</span>
            <Button
              variant="danger"
              size="sm"
              onClick={() => { setError(""); deleteMutation.mutate(); }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Удаление…" : "Удалить"}
            </Button>
            <Button variant="secondary" size="sm" disabled={deleteMutation.isPending} onClick={() => setConfirming(false)}>
              Отмена
            </Button>
          </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-400 break-words">{error}</p>}
    </Card>
      {previewUrl && <Modal onClose={() => setPreviewUrl("")} className="max-w-5xl h-[85dvh] flex flex-col">
        <div role="dialog" aria-modal="true" aria-label={`Просмотр PDF: ${doc.title}`} className="flex flex-col flex-1 min-h-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)] truncate" title={doc.title}>{doc.title}</h2>
              <p className="text-xs text-[var(--color-text-secondary)] truncate">{doc.counterparty?.name ?? "PDF-документ"}</p>
            </div>
            <Button variant="secondary" size="sm" disabled={downloadMutation.isPending} onClick={() => { setError(""); downloadMutation.mutate(); }}>
              <Download className="w-4 h-4" />{downloadMutation.isPending ? "Скачивание…" : "Скачать PDF"}
            </Button>
            <button type="button" aria-label="Закрыть просмотр PDF" onClick={() => setPreviewUrl("")} className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"><X className="w-5 h-5" /></button>
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline">
              <ExternalLink className="w-3.5 h-3.5" />Открыть PDF в новой вкладке
            </a>
            <p className="w-full text-xs text-[var(--color-text-secondary)]">Если просмотр недоступен, скачайте PDF или откройте его в новой вкладке.</p>
          </div>
          {error && <p role="alert" className="px-4 py-2 text-sm text-red-400 break-words">{error}</p>}
          <iframe src={previewUrl} title={`PDF: ${doc.title}`} className="w-full flex-1 min-h-0 border-0 bg-white" />
        </div>
      </Modal>}
    </>
  );
}

export function ArchiveListClient() {
  const [showUpload, setShowUpload] = useState(false);
  const [companyFilter, setCompanyFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["documents", "archive", companyFilter, search, page],
    queryFn: () =>
      documentsApi.listSummaries({
        archived: true,
        ...(companyFilter ? { counterpartyId: companyFilter } : {}),
        ...(search ? { search } : {}),
        limit: 50,
        page,
      }),
  });

  const docs = data?.data ?? [];
  const hasFilters = !!(companyFilter || search);
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 50));

  return (
    <div className="p-4 sm:p-6 lg:p-8 h-full min-h-0 min-w-0 flex flex-col">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Архив</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">PDF-документы компаний: договоры, счета, акты и другие файлы</p>
        </div>
          <Button onClick={() => setShowUpload(true)}>
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Загрузить документ
          </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5 shrink-0">
        <div className="relative w-full sm:w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          <Input
            type="text"
            placeholder="Поиск…"
            aria-label="Поиск документов в архиве"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 py-1.5"
          />
        </div>

        <CompanyFilterDropdown value={companyFilter} onChange={(id) => { setCompanyFilter(id); setPage(1); }} />

        {hasFilters && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setSearch(""); setCompanyFilter(""); setPage(1); }}
          >
            Сбросить
          </Button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-[var(--color-accent)]">
            <Spinner size="lg" />
          </div>
        ) : isError ? (
          <div role="alert" className="rounded-xl border border-red-400/30 p-6 text-center">
            <p className="text-sm text-[var(--color-text-primary)]">Не удалось загрузить архив</p>
            <p className="mt-1 mb-4 text-sm text-[var(--color-text-secondary)]">Проверьте соединение и попробуйте ещё раз.</p>
            <Button variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Повторить загрузку</Button>
          </div>
        ) : docs.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-6 h-6" strokeWidth={1.5} />}
            title={hasFilters ? "Ничего не найдено" : "В архиве пока пусто"}
            description={
              hasFilters
                ? "Попробуйте изменить фильтры"
                : "Загрузите PDF, чтобы прикрепить его к компании"
            }
            action={
              !hasFilters && (
                <Button onClick={() => setShowUpload(true)}>
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                  Загрузить документ
                </Button>
              )
            }
          />
        ) : (
          <div className="grid gap-2">
            {docs.map((doc) => (
              <ArchiveCard key={doc.id} doc={doc} onDeleted={() => {
                if (docs.length === 1 && page > 1) setPage(page - 1);
              }} />
            ))}
          </div>
        )}

      </div>
      {data && !isError && data.total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 shrink-0 border-t border-[var(--color-border)] pt-4">
          <p className="text-xs text-[var(--color-text-muted)]">
            {(page - 1) * 50 + 1}–{Math.min(page * 50, data.total)} из {data.total}
          </p>
          {totalPages > 1 && <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" aria-label="Предыдущая страница" disabled={page <= 1 || isFetching} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-xs text-[var(--color-text-secondary)]">{page} / {totalPages}</span>
            <Button variant="secondary" size="sm" aria-label="Следующая страница" disabled={page >= totalPages || isFetching} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>}
        </div>
      )}

      {showUpload && <ArchiveUploadModal onClose={() => setShowUpload(false)} onUploaded={() => {
        setPage(1); setSearch(""); setCompanyFilter("");
      }} />}
    </div>
  );
}
