"use client";

import type { SVGProps } from "react";

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

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
        <MenuIcon className="w-5 h-5" />
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
