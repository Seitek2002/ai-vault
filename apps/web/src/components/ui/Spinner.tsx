import { cn } from "@/lib/cn";

const SIZES = {
  sm: "w-3.5 h-3.5 border-2",
  md: "w-4 h-4 border-2",
  lg: "w-6 h-6 border-2",
} as const;

export function Spinner({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full border-current border-t-transparent animate-spin",
        SIZES[size],
        className,
      )}
    />
  );
}
