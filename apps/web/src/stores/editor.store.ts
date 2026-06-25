"use client";

import { create } from 'zustand';
import type { DocumentDto, DocumentMeta } from '@ai-vault/types';

interface EditorStore {
  document: DocumentDto | null;
  isDirty: boolean;
  isSaving: boolean;
  metaOverride: Partial<DocumentMeta> | null;

  setDocument: (doc: DocumentDto) => void;
  setBodyJson: (body: unknown) => void;
  setMeta: (meta: Partial<DocumentMeta>) => void;
  setSaving: (v: boolean) => void;
  markClean: () => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  document: null,
  isDirty: false,
  isSaving: false,
  metaOverride: null,

  setDocument: (doc) =>
    set({ document: doc, isDirty: false, metaOverride: null }),

  setBodyJson: (body) =>
    set((s) => ({
      document: s.document ? { ...s.document, bodyJson: body } : null,
      isDirty: true,
    })),

  setMeta: (meta) =>
    set((s) => ({
      metaOverride: { ...(s.metaOverride ?? {}), ...meta } as Partial<DocumentMeta>,
      isDirty: true,
    })),

  setSaving: (v) => set({ isSaving: v }),
  markClean: () => set({ isDirty: false }),
}));
