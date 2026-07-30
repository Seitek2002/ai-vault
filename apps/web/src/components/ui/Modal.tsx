"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
} as const;

export function Modal({
  onClose,
  children,
  size = "lg",
  className,
}: {
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof SIZES;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 w-full bg-[var(--color-bg-surface)] rounded-2xl border border-[var(--color-border)] shadow-2xl animate-scale-in",
          SIZES[size],
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
