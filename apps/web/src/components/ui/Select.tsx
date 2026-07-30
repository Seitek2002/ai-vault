"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { fieldClassName } from "./Input";

export interface SelectOption {
  value: string;
  label: string;
}
export interface SelectGroup {
  group: string;
  items: SelectOption[];
}
type SelectItem = SelectOption | SelectGroup;

function isGroup(item: SelectItem): item is SelectGroup {
  return "items" in item;
}

function flatten(items: SelectItem[]): SelectOption[] {
  return items.flatMap((i) => (isGroup(i) ? i.items : [i]));
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectItem[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  className,
  disabled,
  title,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const flat = flatten(options);
  const selected = flat.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setHighlight(Math.max(0, flat.findIndex((o) => o.value === value)));
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function select(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = flat[highlight];
      if (opt) select(opt.value);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={title}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={cn(
          fieldClassName,
          "flex items-center justify-between gap-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed",
          className,
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 min-w-full w-max max-w-xs max-h-64 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] shadow-xl py-1 animate-scale-in">
          {options.map((item, i) =>
            isGroup(item) ? (
              <div key={item.group} className={i > 0 ? "mt-1 border-t border-[var(--color-border)] pt-1" : ""}>
                <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {item.group}
                </p>
                {item.items.map((opt) => (
                  <Option
                    key={opt.value}
                    opt={opt}
                    selected={opt.value === value}
                    highlighted={flat.indexOf(opt) === highlight}
                    onSelect={() => select(opt.value)}
                  />
                ))}
              </div>
            ) : (
              <Option
                key={item.value}
                opt={item}
                selected={item.value === value}
                highlighted={flat.indexOf(item) === highlight}
                onSelect={() => select(item.value)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function Option({
  opt,
  selected,
  highlighted,
  onSelect,
}: {
  opt: SelectOption;
  selected: boolean;
  highlighted: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left transition-colors",
        highlighted && "bg-[var(--color-bg-elevated)]",
        selected ? "text-[var(--color-accent)] font-medium" : "text-[var(--color-text-primary)]",
      )}
    >
      <span className="truncate">{opt.label}</span>
      {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
    </button>
  );
}
