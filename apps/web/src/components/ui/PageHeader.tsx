import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4 shrink-0">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </div>
  );
}
