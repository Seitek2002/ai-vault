"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ImageOff, FileText, Building2, Wand2, Archive, Upload, Settings, LogOut, Vault } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { settingsApi } from "@/lib/api/settings";
import { ApiError } from "@/lib/api/client";
import { useBackgroundEditStore } from "@/stores/backgroundEdit.store";
import {
  BACKGROUND_PRESETS,
  BACKGROUND_IMAGE_SCOPE_OPTIONS,
  backgroundFilterCss,
  getBackgroundPreset,
  DEFAULT_BACKGROUND_FILTER,
  type BackgroundPreset,
} from "@/lib/backgrounds";
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
  { href: "/archive", label: "Архив", icon: Archive },
  { href: "/settings", label: "Настройки", icon: Settings },
];

interface SidebarProps {
  onClose?: () => void;
}

const CATEGORIES: Array<BackgroundPreset["category"] | "Все"> = ["Все", "Градиенты", "Однотонные", "Тёмные"];

const FILTER_SLIDERS: Array<{ key: "opacity" | "blur" | "brightness" | "saturate"; label: string; min: number; max: number; unit: string }> = [
  { key: "opacity", label: "Прозрачность", min: 0, max: 100, unit: "%" },
  { key: "blur", label: "Блюр", min: 0, max: 20, unit: "px" },
  { key: "brightness", label: "Яркость", min: 50, max: 150, unit: "%" },
  { key: "saturate", label: "Насыщенность", min: 0, max: 200, unit: "%" },
];

function PresetPicker({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<BackgroundPreset["category"] | "Все">("Все");
  const shown = filter === "Все" ? BACKGROUND_PRESETS : BACKGROUND_PRESETS.filter((b) => b.category === filter);

  return (
    <div>
      <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">{label}</p>
      <div className="flex gap-1 -mx-1 px-1 pb-2 overflow-x-auto">
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
      <div className="grid grid-cols-2 gap-2">
        {shown.map((b) => (
          <button
            key={b.id}
            onClick={() => onSelect(b.id)}
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
  );
}

function PhotoSlotEditor({ side, label }: { side: "left" | "right"; label: string }) {
  const slot = useBackgroundEditStore((s) => s[side]);
  const setSlotImage = useBackgroundEditStore((s) => s.setSlotImage);
  const setSlotFilter = useBackgroundEditStore((s) => s.setSlotFilter);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">{label}</p>
      {slot.imageUrl ? (
        <div className="space-y-2">
          <div
            className="h-20 rounded-lg border border-[var(--color-border)] bg-cover bg-center"
            style={{
              backgroundImage: `url(${slot.imageUrl})`,
              opacity: slot.filter.opacity / 100,
              filter: backgroundFilterCss(slot.filter),
            }}
          />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} fullWidth>
              Заменить
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSlotImage(side, null)}>
              <ImageOff className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} fullWidth>
          <Upload className="w-3.5 h-3.5" />
          Загрузить фото
        </Button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setSlotImage(side, file);
        }}
      />

      {slot.imageUrl && (
        <div className="mt-3 space-y-2.5">
          {FILTER_SLIDERS.map((s) => (
            <div key={s.key}>
              <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)] mb-1">
                <span>{s.label}</span>
                <span>{slot.filter[s.key]}{s.unit}</span>
              </div>
              <input
                type="range"
                min={s.min}
                max={s.max}
                value={slot.filter[s.key]}
                onChange={(e) => setSlotFilter(side, { [s.key]: Number(e.target.value) })}
                className="w-full accent-[var(--color-accent)]"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BackgroundPicker() {
  const qc = useQueryClient();
  const previewId = useBackgroundEditStore((s) => s.previewId);
  const previewSidebarId = useBackgroundEditStore((s) => s.previewSidebarId);
  const previewScope = useBackgroundEditStore((s) => s.previewScope);
  const setPreviewPreset = useBackgroundEditStore((s) => s.setPreviewPreset);
  const setPreviewSidebarPreset = useBackgroundEditStore((s) => s.setPreviewSidebarPreset);
  const setPreviewScope = useBackgroundEditStore((s) => s.setPreviewScope);
  const right = useBackgroundEditStore((s) => s.right);
  const left = useBackgroundEditStore((s) => s.left);
  const exit = useBackgroundEditStore((s) => s.exit);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (right.file) await settingsApi.uploadBackgroundImage(right.file);
      if (left.file) await settingsApi.uploadSidebarImage(left.file);

      return settingsApi.updateMe({
        backgroundId: previewId === "default" ? null : previewId,
        sidebarBackgroundId: previewSidebarId === "default" ? null : previewSidebarId,
        backgroundImageScope: previewScope,
        backgroundFilter: right.filter,
        sidebarImageFilter: left.filter,
        ...(right.file === null && right.imageUrl === null ? { removeBackgroundImage: true } : {}),
        ...(left.file === null && left.imageUrl === null ? { removeSidebarImage: true } : {}),
      });
    },
    onSuccess: () => {
      setError("");
      void qc.invalidateQueries({ queryKey: ["me"] });
      exit();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить фон");
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-[var(--color-border)] shrink-0">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">Фон интерфейса</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Применяется к рабочей области и сайдбару</p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {/* Photo scope */}
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
            Где показывать фото
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {BACKGROUND_IMAGE_SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPreviewScope(opt.value)}
                className={[
                  "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                  previewScope === opt.value
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                    : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Photo slot(s) — which one(s) depend on scope */}
        {previewScope === "split" ? (
          <>
            <PhotoSlotEditor side="left" label="Фото слева (сайдбар)" />
            <PhotoSlotEditor side="right" label="Фото справа" />
          </>
        ) : previewScope === "left" ? (
          <PhotoSlotEditor side="left" label="Своё фото" />
        ) : (
          <PhotoSlotEditor side="right" label="Своё фото" />
        )}

        <PresetPicker label="Цвет / градиент (рабочая область)" selected={previewId ?? "default"} onSelect={setPreviewPreset} />
        <PresetPicker label="Цвет сайдбара" selected={previewSidebarId ?? "default"} onSelect={setPreviewSidebarPreset} />
      </div>

      <div className="px-4 py-4 border-t border-[var(--color-border)] shrink-0 flex flex-col gap-2">
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={exit} fullWidth>
            Отмена
          </Button>
          <Button size="sm" onClick={() => mutation.mutate()} loading={mutation.isPending} fullWidth>
            Готово
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: settingsApi.getMe });
  const backgroundEditActive = useBackgroundEditStore((s) => s.active);
  const previewSidebarId = useBackgroundEditStore((s) => s.previewSidebarId);
  const previewScope = useBackgroundEditStore((s) => s.previewScope);
  const previewLeft = useBackgroundEditStore((s) => s.left);
  const previewRight = useBackgroundEditStore((s) => s.right);

  const initials = me?.name
    ? me.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()
    : "U";
  const roleLabel = me?.role === "ADMIN" ? "Администратор" : (me?.position?.name ?? "Сотрудник");

  async function handleLogout() {
    await authApi.logout();
    router.push('/login');
    router.refresh();
  }

  const sidebarPreset = getBackgroundPreset(backgroundEditActive ? previewSidebarId : me?.sidebarBackgroundId);
  const scope = backgroundEditActive ? previewScope : (me?.backgroundImageScope ?? "right");
  // 'all' spans one photo across sidebar+main via matching fixed-position layers;
  // 'left'/'split' show the sidebar's own photo scoped to just this box.
  const spanningImage = scope === "all" ? (backgroundEditActive ? previewRight : { imageUrl: me?.backgroundImageUrl ?? null, filter: me?.backgroundFilter ?? DEFAULT_BACKGROUND_FILTER }) : null;
  const ownImage =
    scope === "left" || scope === "split"
      ? (backgroundEditActive ? previewLeft : { imageUrl: me?.sidebarImageUrl ?? null, filter: me?.sidebarImageFilter ?? DEFAULT_BACKGROUND_FILTER })
      : null;

  return (
    <nav
      className="relative flex flex-col h-full overflow-hidden bg-[var(--color-bg-surface)] border-r border-[var(--color-border)]"
      style={sidebarPreset?.css ? { backgroundImage: sidebarPreset.css } : undefined}
    >
      {spanningImage?.imageUrl && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0"
          style={{
            backgroundImage: `url(${spanningImage.imageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: spanningImage.filter.opacity / 100,
            filter: backgroundFilterCss(spanningImage.filter),
          }}
        />
      )}
      {ownImage?.imageUrl && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-16 bg-cover bg-center"
          style={{
            backgroundImage: `url(${ownImage.imageUrl})`,
            opacity: ownImage.filter.opacity / 100,
            filter: backgroundFilterCss(ownImage.filter),
          }}
        />
      )}
      <div className="relative flex flex-col h-full">
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
          <BackgroundPicker />
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
      </div>
    </nav>
  );
}
