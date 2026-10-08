"use client";
import { useQuery } from '@tanstack/react-query';
import { readPageLayout, pageDimensions, type PageLayout } from '@ai-vault/doc-placeholders';
import { letterheadsApi } from '@/lib/api/letterheads';
import { fieldClassName } from '@/components/ui/Input';

export function PageLayoutFields({ meta, onChange }: { meta: unknown; onChange: (meta: Record<string, unknown>) => void }) {
  const layout = readPageLayout(meta);
  const { data = [], error } = useQuery({ queryKey: ['letterheads'], queryFn: () => letterheadsApi.list() });
  const backgrounds = data.filter(b => (b.bodyJson as { kind?: string })?.kind === 'pdf-background');
  const background = backgrounds.find(b => b.id === layout.backgroundId);
  const pages = Number((background?.bodyJson as { pageCount?: number })?.pageCount ?? 1);
  const set = (value: Partial<PageLayout>) => onChange({ ...(meta as Record<string, unknown>), pageLayout: { ...layout, ...value } });
  function resize(value: Partial<PageLayout>) {
    const previous = pageDimensions(layout), next = pageDimensions({ ...layout, ...value });
    set({ ...value, ...(layout.backgroundId ? { margins: {
      top: Math.round(layout.margins.top * next.height / previous.height), bottom: Math.round(layout.margins.bottom * next.height / previous.height),
      left: layout.margins.left, right: layout.margins.right,
    } } : {}) });
  }
  return <fieldset className="space-y-3 text-sm">
    <legend className="mb-2 font-semibold text-[var(--color-text-primary)]">Страница и фон</legend>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-[var(--color-text-secondary)]">Формат<select className={`${fieldClassName} mt-1`} value={layout.paperSize} onChange={e => resize({ paperSize: e.target.value as PageLayout['paperSize'] })}><option value="A4">А4</option><option value="A5">А5</option></select></label>
      <label className="text-[var(--color-text-secondary)]">Ориентация<select className={`${fieldClassName} mt-1`} value={layout.orientation} onChange={e => resize({ orientation: e.target.value as PageLayout['orientation'] })}><option value="portrait">Книжная</option><option value="landscape">Альбомная</option></select></label>
    </div>
    <label className="block text-[var(--color-text-secondary)]">PDF-бланк<select className={`${fieldClassName} mt-1`} value={layout.backgroundId} onChange={e => set({ backgroundId: e.target.value, backgroundPage: 1 })}>
      <option value="">Без фона</option>{layout.backgroundId && !background && <option value={layout.backgroundId}>Бланк недоступен — выберите другой</option>}{backgrounds.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select></label>
    {background && pages > 1 && <label className="block text-[var(--color-text-secondary)]">Страница бланка<select className={`${fieldClassName} mt-1`} value={layout.backgroundPage} onChange={e => set({ backgroundPage: Number(e.target.value) })}>{Array.from({ length: pages }, (_, i) => <option key={i} value={i + 1}>Страница {i + 1}</option>)}</select></label>}
    <div className="grid grid-cols-2 gap-3">{(['top', 'bottom', 'left', 'right'] as const).map((key, i) => <label key={key} className="text-[var(--color-text-secondary)]">{['Сверху', 'Снизу', 'Слева', 'Справа'][i]}, мм<input className={`${fieldClassName} mt-1`} type="number" min={0} max={100} value={layout.margins[key]} onChange={e => set({ margins: { ...layout.margins, [key]: Number(e.target.value) } })} /></label>)}</div>
    <p className="text-xs text-[var(--color-text-secondary)]">Формат, поля и фон применяются к PDF и DOCX. Выбранная страница бланка повторяется под текстом. Подберите поля по шапке и подвалу бланка.</p>
    {error && <p role="alert" className="text-xs text-[var(--color-danger)]">Не удалось загрузить бланки. Обновите страницу.</p>}
  </fieldset>;
}
