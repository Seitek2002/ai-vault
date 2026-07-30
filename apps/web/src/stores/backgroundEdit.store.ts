"use client";

import { create } from "zustand";
import { DEFAULT_BACKGROUND_FILTER, type BackgroundFilter } from "@/lib/backgrounds";

interface CurrentBackground {
  backgroundId: string | null;
  backgroundImageUrl?: string | null | undefined;
  backgroundFilter?: BackgroundFilter | null | undefined;
}

interface BackgroundEditStore {
  active: boolean;
  /** Live, unsaved preset id being previewed while `active` — null when not editing. */
  previewId: string | null;
  /** Local object URL (new pick) or the saved photo URL (untouched) — null means no photo. */
  previewImageUrl: string | null;
  /** Set only when the user picked a *new*, not-yet-uploaded file this session. */
  previewFile: File | null;
  previewFilter: BackgroundFilter;

  enter: (current: CurrentBackground) => void;
  setPreviewPreset: (id: string) => void;
  setPreviewImage: (file: File | null) => void;
  setPreviewFilter: (patch: Partial<BackgroundFilter>) => void;
  exit: () => void;
}

function revokeIfBlob(store: Pick<BackgroundEditStore, "previewFile" | "previewImageUrl">) {
  if (store.previewFile && store.previewImageUrl) URL.revokeObjectURL(store.previewImageUrl);
}

export const useBackgroundEditStore = create<BackgroundEditStore>((set, get) => ({
  active: false,
  previewId: null,
  previewImageUrl: null,
  previewFile: null,
  previewFilter: DEFAULT_BACKGROUND_FILTER,

  enter: (current) =>
    set({
      active: true,
      previewId: current.backgroundId ?? "default",
      previewImageUrl: current.backgroundImageUrl ?? null,
      previewFile: null,
      previewFilter: current.backgroundFilter ?? DEFAULT_BACKGROUND_FILTER,
    }),

  setPreviewPreset: (id) => set({ previewId: id }),

  setPreviewImage: (file) => {
    revokeIfBlob(get());
    if (!file) {
      set({ previewImageUrl: null, previewFile: null });
      return;
    }
    set({ previewImageUrl: URL.createObjectURL(file), previewFile: file });
  },

  setPreviewFilter: (patch) => set((s) => ({ previewFilter: { ...s.previewFilter, ...patch } })),

  exit: () => {
    revokeIfBlob(get());
    set({ active: false, previewId: null, previewImageUrl: null, previewFile: null, previewFilter: DEFAULT_BACKGROUND_FILTER });
  },
}));
