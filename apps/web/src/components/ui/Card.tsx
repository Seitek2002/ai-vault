import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({
  hoverable = false,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { hoverable?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border)]",
        hoverable &&
          "transition-all hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-elevated)] hover:shadow-lg hover:-translate-y-0.5",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
