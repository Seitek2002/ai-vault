"use client";

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { api } from '@/lib/api/client';
import { readPageLayout } from '@ai-vault/doc-placeholders';

export function DraftTemplatePreview({ name, bodyJson, metaDefaults }: {
  name: string; bodyJson: unknown; metaDefaults: Record<string, unknown>;
}) {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<{ key: string; error: string }>();
  const [retry, setRetry] = useState(0);
  const revision = useRef(0);
  const currentUrl = useRef('');
  const queue = useRef<Promise<void>>(Promise.resolve());
  const payload = JSON.stringify({ name, bodyJson, metaDefaults });
  const key = JSON.stringify([payload, retry]);
  const busy = result?.key !== key;
  const error = !busy ? result?.error : '';
  const layout = readPageLayout(metaDefaults);

  useEffect(() => {
    const version = ++revision.current;
    let cancelled = false;
    // Serialize PDF renders and skip superseded drafts so typing never launches
    // a Chromium process per keystroke or allows an old response to replace a new one.
    const timer = setTimeout(() => {
      queue.current = queue.current.then(async () => {
        if (cancelled || version !== revision.current) return;
        try {
          const blob = await api.postBlob('/templates/preview/pdf', JSON.parse(payload));
          if (cancelled || version !== revision.current) return;
          const next = URL.createObjectURL(blob);
          const previous = currentUrl.current;
          currentUrl.current = next; setUrl(next);
          if (previous) URL.revokeObjectURL(previous);
          setResult({ key, error: '' });
        } catch (e) {
          if (!cancelled && version === revision.current) setResult({ key, error: e instanceof Error && e.message ? e.message : 'Не удалось обновить превью. Повторите попытку.' });
        }
      });
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [payload, key]);

  useEffect(() => () => { if (currentUrl.current) URL.revokeObjectURL(currentUrl.current); }, []);

  return <section aria-label="Превью шаблона" className="flex min-h-0 flex-col bg-[var(--color-bg-base)] lg:h-full">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
      <div><h3 className="text-sm font-semibold">Превью</h3><p className="text-xs text-[var(--color-text-secondary)]">{layout.paperSize} · {layout.orientation === 'landscape' ? 'Альбомная' : 'Книжная'}</p></div>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRetry(v => v + 1)}><RefreshCw className="h-4 w-4" aria-hidden="true" />Обновить</Button>
    </div>
    <div aria-live="polite" className="px-4 py-2 text-xs text-[var(--color-text-secondary)]">
      {busy ? 'Обновляю превью…' : error ? 'Превью не обновлено' : 'Изменения отображены. Шаблон ещё не сохранён.'}
    </div>
    {error && <div role="alert" className="px-4 pb-3 text-sm"><p className="mb-2 text-[var(--color-danger)]">{error}</p><Button size="sm" variant="secondary" onClick={() => setRetry(v => v + 1)}>Повторить</Button></div>}
    {url ? <iframe src={`${url}#toolbar=0&view=FitH`} title="PDF-превью шаблона" className="min-h-[420px] w-full flex-1 border-0 bg-white lg:min-h-0" /> : <div className="flex min-h-[420px] flex-1 items-center justify-center p-6 text-center text-sm text-[var(--color-text-secondary)] lg:min-h-0">{busy ? 'Готовлю PDF с вашим текстом и бланком…' : 'Здесь появится PDF-превью шаблона.'}</div>}
    <p className="px-4 py-2 text-xs text-[var(--color-text-secondary)]">Незаполненные данные показаны прочерками. Документ и номер не создаются.</p>
  </section>;
}
