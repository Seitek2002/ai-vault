"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Modal } from '@/components/ui';
import { letterheadsApi } from '@/lib/api/letterheads';
import { uploadFile } from '@/lib/api/files';
import { StepFilePreview } from '@/components/settlements/StepFilePreview';

export function PdfBackgrounds() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ id: string; title: string } | null>(null);
  const { data = [] } = useQuery({ queryKey: ['letterheads'], queryFn: () => letterheadsApi.list() });
  const backgrounds = data.filter(b => (b.bodyJson as { kind?: string })?.kind === 'pdf-background');
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) throw new Error('Выберите PDF-бланк');
      const asset = await uploadFile(file);
      return letterheadsApi.create({ name: name.trim() || file.name, bodyJson: { kind: 'pdf-background', fileId: asset.id } });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['letterheads'] }); setFile(null); setName(''); },
  });
  return <section className="mt-8 border-t border-[var(--color-border)] pt-5" aria-label="PDF-бланки">
    <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Фон документов</h2>
    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Загрузите PDF-бланк отдельно и выбирайте его в параметрах шаблона. До 100 МБ.</p>
    <form className="mt-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={e => { e.preventDefault(); upload.mutate(); }}>
      <label className="min-w-0 flex-1 text-sm text-[var(--color-text-secondary)]">Название бланка<Input value={name} onChange={e => setName(e.target.value)} className="mt-1" placeholder="Фирменный бланк" /></label>
      <label className="min-w-0 flex-1 text-sm text-[var(--color-text-secondary)]">PDF-файл<input key={file?.name ?? 'empty'} type="file" accept=".pdf,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" /></label>
      <Button type="submit" disabled={!file || upload.isPending} loading={upload.isPending} loadingText="Загружаю…">Загрузить бланк</Button>
    </form>
    {upload.error && <p role="alert" className="mt-3 text-sm text-[var(--color-danger)]">{upload.error.message}</p>}
    <ul className="mt-4 divide-y divide-[var(--color-border)]">{backgrounds.map(b => <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
      <span className="min-w-0 break-words text-[var(--color-text-primary)]">{b.name}<span className="ml-2 text-[var(--color-text-secondary)]">{Number((b.bodyJson as { pageCount?: number }).pageCount)} стр.</span></span>
      <Button variant="ghost" size="sm" onClick={() => setPreview({ id: (b.bodyJson as { fileId: string }).fileId, title: b.name })}>Посмотреть PDF</Button>
    </li>)}</ul>
    {preview && <Modal onClose={() => setPreview(null)} className="max-w-4xl"><StepFilePreview fileId={preview.id} title={preview.title} onClose={() => setPreview(null)} /></Modal>}
  </section>;
}
