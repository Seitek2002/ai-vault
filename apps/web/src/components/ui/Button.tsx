import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

const VARIANTS = {
  primary:
    "bg-[var(--color-accent)] text-[#0F172A] shadow-[0_1px_2px_rgba(0,0,0,0.25)] hover:bg-[var(--color-accent-hover)] hover:shadow-[0_4px_16px_-4px_var(--color-accent-border)]",
  secondary:
    "border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] hover:border-[var(--color-border-light)]",
  ghost:
    "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]",
  danger:
    "bg-[var(--color-danger)] text-white hover:brightness-110 shadow-[0_1px_2px_rgba(0,0,0,0.25)]",
} as const;

const SIZES = {
  sm: "px-2.5 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-4 py-2.5 text-sm gap-2",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  loading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      loadingText,
      fullWidth,
      disabled,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
          VARIANTS[variant],
          SIZES[size],
          fullWidth && "w-full",
          className,
        )}
        {...rest}
      >
        {loading && <Spinner size="sm" />}
        {loading && loadingText ? loadingText : children}
      </button>
    );
  },
);
Button.displayName = "Button";
