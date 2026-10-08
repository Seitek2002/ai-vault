export interface PageLayout {
  paperSize: 'A4' | 'A5';
  orientation: 'portrait' | 'landscape';
  backgroundId: string;
  backgroundPage: number;
  margins: { top: number; bottom: number; left: number; right: number };
}
export function readPageLayout(meta: unknown): PageLayout {
  const raw = (meta as { pageLayout?: Partial<PageLayout> } | null)?.pageLayout ?? {};
  const margin = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : fallback;
  return {
    paperSize: raw.paperSize === 'A5' ? 'A5' : 'A4', orientation: raw.orientation === 'landscape' ? 'landscape' : 'portrait',
    backgroundId: typeof raw.backgroundId === 'string' ? raw.backgroundId : '',
    backgroundPage: Number.isInteger(raw.backgroundPage) && Number(raw.backgroundPage) > 0 ? Number(raw.backgroundPage) : 1,
    margins: { top: margin(raw.margins?.top, 15), bottom: margin(raw.margins?.bottom, 15), left: margin(raw.margins?.left, 15), right: margin(raw.margins?.right, 15) },
  };
}
export function pageDimensions(layout: Pick<PageLayout, 'paperSize' | 'orientation'>) {
  const [short, long] = layout.paperSize === 'A5' ? [148, 210] : [210, 297];
  return layout.orientation === 'landscape' ? { width: long!, height: short! } : { width: short!, height: long! };
}
