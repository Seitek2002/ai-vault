"use client";

import { create } from "zustand";

interface BackgroundEditStore {
  active: boolean;
  setActive: (v: boolean) => void;
}

export const useBackgroundEditStore = create<BackgroundEditStore>((set) => ({
  active: false,
  setActive: (v) => set({ active: v }),
}));
