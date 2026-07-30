"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { settingsApi } from "@/lib/api/settings";
import { getBackgroundPreset, backgroundFilterCss, DEFAULT_BACKGROUND_FILTER } from "@/lib/backgrounds";
import { useBackgroundEditStore } from "@/stores/backgroundEdit.store";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: settingsApi.getMe });
  const editActive = useBackgroundEditStore((s) => s.active);
  const previewId = useBackgroundEditStore((s) => s.previewId);
  const previewImageUrl = useBackgroundEditStore((s) => s.previewImageUrl);
  const previewFilter = useBackgroundEditStore((s) => s.previewFilter);

  // While the picker is open, the live (unsaved) choice wins over the persisted value.
  const backgroundPreset = getBackgroundPreset(editActive ? previewId : me?.backgroundId);
  const imageUrl = editActive ? previewImageUrl : me?.backgroundImageUrl;
  const imageFilter = editActive ? previewFilter : (me?.backgroundFilter ?? DEFAULT_BACKGROUND_FILTER);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col shrink-0"
        style={{ width: "var(--sidebar-width)" }}
      >
        <Sidebar />
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          aria-hidden="true"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={closeDrawer}
          />
          <aside
            className="absolute top-0 left-0 bottom-0 flex flex-col z-50 shadow-2xl animate-slide-in-left"
            style={{ width: "var(--sidebar-width)" }}
          >
            <Sidebar onClose={closeDrawer} />
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onMenuClick={openDrawer} />
        <main
          className="relative flex-1 overflow-hidden"
          style={backgroundPreset?.css ? { backgroundImage: backgroundPreset.css } : undefined}
        >
          {imageUrl && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-16 bg-cover bg-center"
              style={{
                backgroundImage: `url(${imageUrl})`,
                opacity: imageFilter.opacity / 100,
                filter: backgroundFilterCss(imageFilter),
              }}
            />
          )}
          <div className="relative h-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
