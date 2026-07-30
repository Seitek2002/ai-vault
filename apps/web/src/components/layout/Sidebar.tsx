"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Building2, Wand2, Upload, Settings, LogOut, Vault } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { settingsApi, type UserProfile } from "@/lib/api/settings";
import { useBackgroundEditStore } from "@/stores/backgroundEdit.store";
import { BACKGROUND_PRESETS, type BackgroundPreset } from "@/lib/backgrounds";
import { Button } from "@/components/ui";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/documents", label: "Документы", icon: FileText },
  { href: "/companies", label: "Компании", icon: Building2 },
  { href: "/builder", label: "Конструктор", icon: Wand2 },
  { href: "/import", label: "Импорт", icon: Upload },
  { href: "/settings", label: "Настройки", icon: Settings },
];

interface SidebarProps {
  onClose?: () => void;
}

const CATEGORIES: Array<BackgroundPreset["category"] | "Все"> = ["Все", "Градиенты", "Однотонные", "Тёмные"];

function BackgroundPicker({ me }: { me: UserProfile | undefined }) {
  const qc = useQueryClient();
  const setActive = useBackgroundEditStore((s) => s.setActive);
  const [selected, setSelected] = useState(me?.backgroundId ?? "default");
  const [filter, setFilter] = useState<BackgroundPreset["category"] | "Все">("Все");

  const mutation = useMutation({
    mutationFn: () => settingsApi.updateMe({ backgroundId: selected === "default" ? null : selected }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["me"] });
      setActive(false);
    },
  });

  const shown = filter === "Все" ? BACKGROUND_PRESETS : BACKGROUND_PRESETS.filter((b) => b.category === filter);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-[var(--color-border)] shrink-0">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">Фон интерфейса</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Применяется к рабочей области</p>
      </div>

      <div className="flex gap-1 px-3 py-2 overflow-x-auto shrink-0">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={[
              "shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
              filter === c
                ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]",
            ].join(" ")}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="grid grid-cols-2 gap-2">
          {shown.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelected(b.id)}
              className={[
                "flex flex-col gap-1.5 p-1.5 rounded-lg border transition-all",
                selected === b.id
                  ? "border-[var(--color-accent)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-border-light)]",
              ].join(" ")}
            >
              <div
                className="h-10 rounded-md border border-[var(--color-border)] relative"
                style={{ background: b.css || "var(--color-bg-base)" }}
              >
                {selected === b.id && (
                  <Check className="absolute top-1 right-1 w-3.5 h-3.5 text-[var(--color-accent)]" strokeWidth={2.5} />
                )}
              </div>
              <span className="text-[11px] text-[var(--color-text-secondary)] truncate">{b.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 border-t border-[var(--color-border)] shrink-0 flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setActive(false)} fullWidth>
          Отмена
        </Button>
        <Button size="sm" onClick={() => mutation.mutate()} loading={mutation.isPending} fullWidth>
          Готово
        </Button>
      </div>
    </div>
  );
}

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: settingsApi.getMe });
  const backgroundEditActive = useBackgroundEditStore((s) => s.active);

  const initials = me?.name
    ? me.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()
    : "U";
  const roleLabel = me?.role === "ADMIN" ? "Администратор" : (me?.position?.name ?? "Сотрудник");

  async function handleLogout() {
    await authApi.logout();
    router.push('/login');
    router.refresh();
  }

  return (
    <nav className="flex flex-col h-full bg-[var(--color-bg-surface)] border-r border-[var(--color-border)]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-[var(--topbar-height)] shrink-0 border-b border-[var(--color-border)]">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] flex items-center justify-center shrink-0">
          <Vault className="w-4 h-4 text-white" strokeWidth={2} />
        </div>
        <span className="font-semibold bg-gradient-to-r from-[var(--color-text-primary)] to-[var(--color-accent-2)] bg-clip-text text-transparent tracking-tight">
          Vault
        </span>
      </div>

      {/* Nav links — swapped for the background picker while customizing */}
      {backgroundEditActive ? (
        <div className="flex-1 min-h-0">
          <BackgroundPicker me={me} />
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5 px-3 py-4 flex-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  {...(onClose ? { onClick: onClose } : {})}
                  className={[
                    "relative overflow-hidden flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    active
                      ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)] border border-[var(--color-accent-border)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]",
                  ].join(" ")}
                >
                  {active && (
                    <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[var(--color-accent)] to-[var(--color-accent-2)]" />
                  )}
                  <Icon className="w-4.5 h-4.5 shrink-0" strokeWidth={1.75} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Bottom user area */}
      <div className="px-4 py-4 border-t border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] flex items-center justify-center text-xs text-[var(--color-text-muted)] shrink-0 overflow-hidden">
            {me?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.avatarUrl} alt={me.name} className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{me?.name ?? "Пользователь"}</p>
            <p className="text-[11px] text-[var(--color-text-muted)] truncate">{roleLabel}</p>
          </div>
          <button
            onClick={() => void handleLogout()}
            title="Выйти"
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </nav>
  );
}
