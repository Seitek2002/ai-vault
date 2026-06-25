"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

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
            className="absolute inset-0 bg-black/60"
            onClick={closeDrawer}
          />
          <aside
            className="absolute top-0 left-0 bottom-0 flex flex-col z-50 shadow-2xl"
            style={{ width: "var(--sidebar-width)" }}
          >
            <Sidebar onClose={closeDrawer} />
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onMenuClick={openDrawer} />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
