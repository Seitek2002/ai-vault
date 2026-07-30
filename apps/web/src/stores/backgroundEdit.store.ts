"use client";

import { create } from "zustand";
import { DEFAULT_BACKGROUND_FILTER, type BackgroundFilter, type BackgroundImageScope } from "@/lib/backgrounds";

interface CurrentBackground {
  backgroundId: string | null;
  backgroundImageUrl?: string | null | undefined;
  backgroundFilter?: BackgroundFilter | null | undefined;
  backgroundImageScope?: BackgroundImageScope | null | undefined;
  sidebarBackgroundId?: string | null | undefined;
  sidebarImageUrl?: string | null | undefined;
  sidebarImageFilter?: BackgroundFilter | null | undefined;
}

export interface PhotoSlot {
  /** Local object URL (new pick) or the saved photo URL (untouched) — null means no photo. */
  imageUrl: string | null;
  /** Set only when the user picked a *new*, not-yet-uploaded file this session. */
  file: File | null;
  filter: BackgroundFilter;
}

const EMPTY_SLOT: PhotoSlot = { imageUrl: null, file: null, filter: DEFAULT_BACKGROUND_FILTER };

interface BackgroundEditStore {
  active: boolean;
  previewId: string | null;
  previewSidebarId: string | null;
  previewScope: BackgroundImageScope;
  right: PhotoSlot;
  left: PhotoSlot;

  enter: (current: CurrentBackground) => void;
  setPreviewPreset: (id: string) => void;
  setPreviewSidebarPreset: (id: string) => void;
  setPreviewScope: (scope: BackgroundImageScope) => void;
  setSlotImage: (side: "left" | "right", file: File | null) => void;
  setSlotFilter: (side: "left" | "right", patch: Partial<BackgroundFilter>) => void;
  exit: () => void;
}

function revokeSlot(slot: PhotoSlot) {
  if (slot.file && slot.imageUrl) URL.revokeObjectURL(slot.imageUrl);
}

export const useBackgroundEditStore = create<BackgroundEditStore>((set, get) => ({
  active: false,
  previewId: null,
  previewSidebarId: null,
  previewScope: "right",
  right: EMPTY_SLOT,
  left: EMPTY_SLOT,

  enter: (current) =>
    set({
      active: true,
      previewId: current.backgroundId ?? "default",
      previewSidebarId: current.sidebarBackgroundId ?? "default",
      previewScope: current.backgroundImageScope ?? "right",
      right: {
        imageUrl: current.backgroundImageUrl ?? null,
        file: null,
        filter: current.backgroundFilter ?? DEFAULT_BACKGROUND_FILTER,
      },
      left: {
        imageUrl: current.sidebarImageUrl ?? null,
        file: null,
        filter: current.sidebarImageFilter ?? DEFAULT_BACKGROUND_FILTER,
      },
    }),

  setPreviewPreset: (id) => set({ previewId: id }),
  setPreviewSidebarPreset: (id) => set({ previewSidebarId: id }),
  setPreviewScope: (scope) => set({ previewScope: scope }),

  setSlotImage: (side, file) => {
    const slot = get()[side];
    revokeSlot(slot);
    if (!file) {
      set({ [side]: { ...slot, imageUrl: null, file: null } } as Partial<BackgroundEditStore>);
      return;
    }
    set({ [side]: { ...slot, imageUrl: URL.createObjectURL(file), file } } as Partial<BackgroundEditStore>);
  },

  setSlotFilter: (side, patch) =>
    set((s) => ({ [side]: { ...s[side], filter: { ...s[side].filter, ...patch } } } as Partial<BackgroundEditStore>)),

  exit: () => {
    revokeSlot(get().right);
    revokeSlot(get().left);
    set({
      active: false,
      previewId: null,
      previewSidebarId: null,
      previewScope: "right",
      right: EMPTY_SLOT,
      left: EMPTY_SLOT,
    });
  },
}));
