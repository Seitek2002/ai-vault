"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Sheet({
  onClose,
  title,
  children,
  className,
}: {
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 w-full max-h-[85vh] flex flex-col overflow-hidden bg-[var(--color-bg-surface)] border-t border-[var(--color-border)] rounded-t-2xl shadow-2xl animate-slide-in-bottom",
          className,
        )}
      >
        <div className="h-0.5 shrink-0 bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-2)]" />
        <div className="flex items-center justify-center pt-2.5 pb-1 shrink-0">
          <span className="w-9 h-1 rounded-full bg-[var(--color-border-light)]" />
        </div>
        {title && (
          <div className="px-5 pb-3 shrink-0">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
