"use client";

import { Menu } from "lucide-react";

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
        <div className="w-6 h-6 rounded-md bg-[var(--color-accent)] flex items-center justify-center shrink-0">
          <span className="text-[#0F172A] font-bold text-[10px]">AI</span>
        </div>
        <span className="font-semibold text-[var(--color-text-primary)] text-sm">
          {title ?? "AI Vault"}
        </span>
      </div>
    </header>
  );
}
