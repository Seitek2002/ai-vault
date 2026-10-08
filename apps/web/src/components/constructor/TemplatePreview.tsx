"use client";
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Modal } from '@/components/ui';
import { api } from '@/lib/api/client';

export function TemplatePreview({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const preview = useQuery({ queryKey: ['template-preview', id], queryFn: async ({ signal }) => {
    const blob = await api.getBlob(`/templates/${id}/preview/pdf`);
    if (signal.aborted) throw new Error('Предпросмотр закрыт');
    return URL.createObjectURL(blob);
  }, staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: false });
  useEffect(() => { const url = preview.data; return () => { if (url) URL.revokeObjectURL(url); }; }, [preview.data]);
  return <Modal onClose={onClose} className="max-w-4xl"><section className="flex h-[85dvh] flex-col">
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Button size="sm" variant="ghost" onClick={onClose}>Закрыть</Button></div>
    <p className="px-4 pb-3 text-xs text-[var(--color-text-secondary)]">Предпросмотр шаблона. Незаданные данные показаны прочерками. Документ и номер не создаются.</p>
    {preview.isPending ? <p role="status" className="p-4">Готовлю PDF…</p> : preview.isError ? <div role="alert" className="p-4"><p className="mb-3 text-[var(--color-danger)]">{preview.error.message}</p><Button onClick={() => void preview.refetch()}>Повторить</Button></div> : <iframe title="Предпросмотр шаблона" src={preview.data} className="min-h-0 w-full flex-1 border-0 bg-white" />}
  </section></Modal>;
}
