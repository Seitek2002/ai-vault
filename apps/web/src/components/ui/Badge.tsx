import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Badge({
  color,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { color?: string }) {
  return (
    <span
      className={cn("text-xs font-bold px-1.5 py-0.5 rounded", className)}
      style={color ? { background: color + "22", color } : undefined}
      {...rest}
    >
      {children}
    </span>
  );
}
