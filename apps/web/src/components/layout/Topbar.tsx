"use client";

import { Menu, Vault } from "lucide-react";

interface TopbarProps {
  title?: string;
  onMenuClick: () => void;
}

export function Topbar({ title, onMenuClick }: TopbarProps) {
  return (
    <header className="flex items-center gap-4 px-4 h-[var(--topbar-height)] bg-[var(--color-bg-surface)] border-b border-[var(--color-border)] shrink-0 md:hidden">
      <button
        onClick={onMenuClick}
        aria-label="Открыть меню"
        className="p-1.5 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
      >
        <Menu className="w-5 h-5" strokeWidth={2} />
      </button>

      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] flex items-center justify-center shrink-0">
          <Vault className="w-3.5 h-3.5 text-white" strokeWidth={2} />
        </div>
        <span
          className={
            title
              ? "font-semibold text-[var(--color-text-primary)] text-sm"
              : "font-semibold text-sm bg-gradient-to-r from-[var(--color-text-primary)] to-[var(--color-accent-2)] bg-clip-text text-transparent"
          }
        >
          {title ?? "Vault"}
        </span>
      </div>
    </header>
  );
}
