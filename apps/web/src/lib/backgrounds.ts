export interface BackgroundPreset {
  id: string;
  label: string;
  category: "Градиенты" | "Однотонные" | "Тёмные";
  css: string;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: "default", label: "По умолчанию", category: "Градиенты", css: "" },
  {
    id: "blue-violet",
    label: "Сине-фиолетовый",
    category: "Градиенты",
    css: "radial-gradient(ellipse 900px 600px at 10% -10%, rgba(91, 157, 255, 0.22), transparent 60%), radial-gradient(ellipse 700px 500px at 100% 0%, rgba(167, 139, 250, 0.18), transparent 60%)",
  },
  {
    id: "emerald-teal",
    label: "Изумрудный",
    category: "Градиенты",
    css: "radial-gradient(ellipse 900px 600px at 10% -10%, rgba(16, 185, 129, 0.2), transparent 60%), radial-gradient(ellipse 700px 500px at 100% 0%, rgba(20, 184, 166, 0.16), transparent 60%)",
  },
  {
    id: "amber-rose",
    label: "Янтарно-розовый",
    category: "Градиенты",
    css: "radial-gradient(ellipse 900px 600px at 10% -10%, rgba(245, 158, 11, 0.18), transparent 60%), radial-gradient(ellipse 700px 500px at 100% 0%, rgba(244, 63, 94, 0.16), transparent 60%)",
  },
  {
    id: "solid-slate",
    label: "Графитовый",
    category: "Однотонные",
    css: "linear-gradient(var(--color-bg-base), var(--color-bg-base))",
  },
  {
    id: "solid-navy",
    label: "Тёмно-синий",
    category: "Однотонные",
    css: "linear-gradient(#0b1220, #0b1220)",
  },
  {
    id: "midnight",
    label: "Полночь",
    category: "Тёмные",
    css: "radial-gradient(ellipse 1000px 700px at 50% -20%, rgba(30, 27, 75, 0.6), transparent 65%), linear-gradient(#05060a, #05060a)",
  },
  {
    id: "obsidian",
    label: "Обсидиан",
    category: "Тёмные",
    css: "radial-gradient(ellipse 900px 600px at 90% 100%, rgba(51, 65, 85, 0.35), transparent 60%), linear-gradient(#020409, #020409)",
  },
];

export function getBackgroundPreset(id: string | null | undefined): BackgroundPreset | undefined {
  if (!id) return undefined;
  return BACKGROUND_PRESETS.find((b) => b.id === id);
}

export interface BackgroundFilter {
  /** 0–100, how visible the photo is over the color layer beneath it. */
  opacity: number;
  /** 0–20 (px). */
  blur: number;
  /** 50–150 (%). */
  brightness: number;
  /** 0–200 (%). */
  saturate: number;
}

export const DEFAULT_BACKGROUND_FILTER: BackgroundFilter = {
  opacity: 100,
  blur: 0,
  brightness: 100,
  saturate: 100,
};

export function backgroundFilterCss(f: BackgroundFilter): string {
  return `blur(${f.blur}px) brightness(${f.brightness}%) saturate(${f.saturate}%)`;
}
