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
        <div className="w-12 h-12 rounded-xl bg-[var(--color-bg-surface)] flex items-center justify-center mb-4 border border-[var(--color-border)] text-[var(--color-text-muted)]">
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
