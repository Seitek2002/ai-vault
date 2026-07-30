import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-24 text-center border border-dashed border-[var(--color-border)] rounded-xl",
        className,
      )}
    >
      {icon && (
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[var(--color-accent-dim)] to-[var(--color-accent-border)] flex items-center justify-center mb-4 text-[var(--color-accent)]">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-[var(--color-text-secondary)]">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
