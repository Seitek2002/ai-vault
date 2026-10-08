"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui";
import { getFileUrl } from "@/lib/api/files";

export function StepFilePreview({ fileId, title, onClose }: { fileId: string; title: string; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const file = useQuery({
    queryKey: ["step-file-preview", fileId], queryFn: () => getFileUrl(fileId),
    staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) panel.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [fileId]);

  return <section ref={panel} aria-label={title} className="flex h-[70dvh] min-w-0 flex-col border-t border-[var(--color-border)] bg-[var(--color-bg)] lg:h-[85dvh] lg:border-t-0 lg:border-l">
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
      <h4 className="min-w-0 flex-1 text-sm font-semibold text-[var(--color-text-primary)]">{title}</h4>
      <Button type="button" variant="ghost" size="sm" disabled={file.isFetching} onClick={() => void file.refetch()} aria-label="Обновить просмотр документа">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Закрыть просмотр документа">
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
      {file.data && <a href={file.data} target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-1.5 text-xs text-[var(--color-accent)] underline-offset-4 hover:underline">
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />Открыть в новой вкладке
      </a>}
    </div>
    {file.isPending ? <p role="status" className="p-4 text-sm text-[var(--color-text-secondary)]">Загружаю документ…</p>
      : file.isError ? <div role="alert" className="space-y-3 p-4 text-sm">
        <p className="text-[var(--color-danger)]">{file.error instanceof Error ? file.error.message : "Не удалось открыть документ."}</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => void file.refetch()} disabled={file.isFetching}>Повторить</Button>
      </div>
      : <>
        <p className="px-4 py-2 text-xs text-[var(--color-text-secondary)]">Если браузер не показывает документ, откройте его в новой вкладке. Если ссылка истекла, обновите просмотр.</p>
        <iframe key={file.dataUpdatedAt} src={`${file.data}#view=FitH`} title={title} className="min-h-0 w-full flex-1 border-0 bg-white" />
      </>}
  </section>;
}
