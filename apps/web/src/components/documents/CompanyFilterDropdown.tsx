"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui";
import { counterpartiesApi } from "@/lib/api/counterparties";

export function CompanyFilterDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const { data: allCompanies = [] } = useQuery({
    queryKey: ["companies"],
    queryFn: () => counterpartiesApi.list(),
    staleTime: 60_000,
  });

  const displayed = filterSearch
    ? allCompanies.filter((c) =>
        c.name.toLowerCase().includes(filterSearch.toLowerCase())
      )
    : allCompanies;

  const selectedName = allCompanies.find((c) => c.id === value)?.name;

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors",
          value
            ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10"
            : "border-[var(--color-border)] text-[var(--color-text-primary)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-hover)]",
        ].join(" ")}
      >
        <Building2 className="w-3.5 h-3.5 shrink-0" />
        <span className="max-w-[120px] truncate">
          {selectedName ?? "Компания"}
        </span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 w-56 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden animate-scale-in">
          <div className="p-2 border-b border-[var(--color-border)]">
            <Input
              type="text"
              placeholder="Поиск компании…"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              autoFocus
              className="py-1.5"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            <button
              onClick={() => { onChange(""); setOpen(false); setFilterSearch(""); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--color-bg-elevated)] ${!value ? "text-[var(--color-accent)] font-medium" : "text-[var(--color-text-secondary)]"}`}
            >
              Все компании
            </button>
            {displayed.map((c) => (
              <button
                key={c.id}
                onClick={() => { onChange(c.id); setOpen(false); setFilterSearch(""); }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--color-bg-elevated)] truncate ${value === c.id ? "text-[var(--color-accent)] font-medium" : "text-[var(--color-text-primary)]"}`}
              >
                {c.name}
              </button>
            ))}
            {displayed.length === 0 && (
              <p className="px-3 py-2 text-sm text-[var(--color-text-muted)]">Не найдено</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
