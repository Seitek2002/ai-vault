"use client";

import { create } from "zustand";

interface ReauthStore {
  /** True while an expired access token is being silently refreshed and the failed request retried. */
  active: boolean;
  setActive: (active: boolean) => void;
}

export const useReauthStore = create<ReauthStore>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));
