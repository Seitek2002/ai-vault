"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { FileText, Building2, Wand2, Upload, Settings, LogOut } from "lucide-react";
import { authApi } from "@/lib/api/auth";

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

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

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
          <span className="text-white font-bold text-xs leading-none">AI</span>
        </div>
        <span className="font-semibold text-[var(--color-text-primary)] tracking-tight">
          AI Vault
        </span>
      </div>

      {/* Nav links */}
      <ul className="flex flex-col gap-0.5 px-3 py-4 flex-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                {...(onClose ? { onClick: onClose } : {})}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)] border border-[var(--color-accent-border)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]",
                ].join(" ")}
              >
                <Icon className="w-4.5 h-4.5 shrink-0" strokeWidth={1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Bottom user area */}
      <div className="px-4 py-4 border-t border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] flex items-center justify-center text-xs text-[var(--color-text-muted)] shrink-0">
            U
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">Пользователь</p>
            <p className="text-[11px] text-[var(--color-text-muted)] truncate">Менеджер</p>
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
