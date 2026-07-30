"use client";

import { create } from "zustand";

interface BackgroundEditStore {
  active: boolean;
  /** Live, unsaved preset id being previewed while `active` — null when not editing. */
  previewId: string | null;
  enter: (currentId: string | null) => void;
  setPreview: (id: string) => void;
  exit: () => void;
}

export const useBackgroundEditStore = create<BackgroundEditStore>((set) => ({
  active: false,
  previewId: null,
  enter: (currentId) => set({ active: true, previewId: currentId ?? "default" }),
  setPreview: (id) => set({ previewId: id }),
  exit: () => set({ active: false, previewId: null }),
}));
