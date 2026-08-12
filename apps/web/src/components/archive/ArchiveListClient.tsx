"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, FileText, Trash2, ExternalLink } from "lucide-react";
import { Button, Input, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { CompanyFilterDropdown } from "@/components/documents/CompanyFilterDropdown";
import { documentsApi } from "@/lib/api/documents";
import { ArchiveUploadModal } from "./ArchiveUploadModal";
import type { DocumentDto } from "@ai-vault/types";

function ArchiveCard({ doc }: { doc: DocumentDto }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const fileUrl = doc.fileAssets?.[0]?.s3Url;
  const date = new Date(doc.createdAt).toLocaleDateString("ru-RU", {
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
      <div className="mt-0.5 w-9 h-9 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4 text-[var(--color-text-muted)]" />
      </div>

      <a
        href={fileUrl}
        target="_blank"
        rel="noreferrer"
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
          {doc.counterparty && (
            <span className="text-xs text-[var(--color-text-muted)] truncate max-w-[200px]">
              {doc.counterparty.name}
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors flex items-center gap-1.5">
          {doc.title}
          <ExternalLink className="w-3 h-3 text-[var(--color-text-muted)] shrink-0" />
        </p>
      </a>

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

export function ArchiveListClient() {
  const [showUpload, setShowUpload] = useState(false);
  const [companyFilter, setCompanyFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["documents", "archive", companyFilter, search],
    queryFn: () =>
      documentsApi.list({
        archived: true,
        ...(companyFilter ? { counterpartyId: companyFilter } : {}),
        ...(search ? { search } : {}),
        limit: 50,
      }),
  });

  const docs = data?.data ?? [];
  const hasFilters = !!(companyFilter || search);

  return (
    <div className="p-6 lg:p-8 h-full flex flex-col">
      <PageHeader
        title="Архив"
        subtitle="Загруженные документы, привязанные к компаниям"
        actions={
          <Button onClick={() => setShowUpload(true)}>
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Загрузить документ
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

        <CompanyFilterDropdown value={companyFilter} onChange={setCompanyFilter} />

        {hasFilters && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setSearch(""); setCompanyFilter(""); }}
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
              <ArchiveCard key={doc.id} doc={doc} />
            ))}
          </div>
        )}

        {data && data.total > docs.length && (
          <p className="text-center text-xs text-[var(--color-text-muted)] py-4">
            Показано {docs.length} из {data.total}
          </p>
        )}
      </div>

      {showUpload && <ArchiveUploadModal onClose={() => setShowUpload(false)} />}
    </div>
  );
}
