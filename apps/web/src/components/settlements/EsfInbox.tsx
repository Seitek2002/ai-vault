"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ExternalLink, Eye, EyeOff, Link2, Link2Off, Lock } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { Button, Card, Input, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ESF_STATUS_LABELS, esfApi, type EsfInvoice } from "@/lib/api/esf";
import { settingsApi } from "@/lib/api/settings";
import { MONTH_NAMES, formatMoney, settlementsApi } from "@/lib/api/settlements";

const STATUS_CLASS: Record<EsfInvoice["status"], string> = {
  ACCEPTED: "text-[#4ADE80]",
  SENT: "text-[var(--color-accent)]",
  NEW: "text-[var(--color-text-muted)]",
  REVOKED: "text-[#F87171]",
  REJECTED: "text-[#F87171]",
  UNKNOWN: "text-[var(--color-text-muted)]",
};

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("ru-RU") : "—";
}

/** Месяц ЭСФ — по дате поставки; без неё — по дате оформления; иначе по импорту. */
function monthKey(inv: EsfInvoice): { year: number; month: number } {
  const iso = inv.deliveryDate ?? inv.issuedOn ?? inv.importedAt;
  const d = new Date(iso);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/**
 * Одна группа-месяц. Расчёты на выбор подгружаются для этого же месяца —
 * августовскую ЭСФ нет смысла предлагать привязать к сентябрьскому расчёту.
 */
function MonthGroup({
  year,
  month,
  items,
  defaultOpen,
  onError,
}: {
  year: number;
  month: number;
  items: EsfInvoice[];
  defaultOpen: boolean;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  // Переключили месяц стрелками на дашборде — раскрываем его группу.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const [choice, setChoice] = useState<Record<string, string>>({});

  const { data: board } = useQuery({
    queryKey: ["settlements", year, month],
    queryFn: () => settlementsApi.board(year, month),
    enabled: open,
  });

  const attach = useMutation({
    mutationFn: ({ id, settlementId }: { id: string; settlementId: string }) =>
      esfApi.attach(id, settlementId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["esf"] });
      void qc.invalidateQueries({ queryKey: ["settlements"] });
      onError("");
    },
    onError: (err) => onError(err instanceof ApiError ? err.message : "Не удалось привязать"),
  });

  const hide = useMutation({
    mutationFn: (id: string) => esfApi.hide(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["esf"] });
      onError("");
    },
    onError: (err) => onError(err instanceof ApiError ? err.message : "Не удалось скрыть"),
  });

  const options = (board?.settlements ?? [])
    .filter((s) => s.steps.some((st) => st.type === "ISSUE_ESF"))
    .map((s) => ({
      value: s.id,
      label: `${s.counterpartyName} · ${formatMoney(s.amount, s.currency)}`,
    }));

  const total = items.reduce((sum, i) => sum + i.amount, 0);

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 py-2 text-left"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
        )}
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {items.length} шт · {formatMoney(total)}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 mb-3">
          {items.map((inv) => (
            <Card key={inv.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                      {inv.buyerName}
                    </span>
                    <span className={cn("text-xs shrink-0", STATUS_CLASS[inv.status])}>
                      {ESF_STATUS_LABELS[inv.status]}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {inv.number ? `№ ${inv.number}` : "без номера"} · поставка {fmtDate(inv.deliveryDate)} ·{" "}
                    {formatMoney(inv.amount)}
                    {inv.crmRef ? ` · ${inv.crmRef}` : ""}
                    {inv.note ? ` · ${inv.note}` : ""}
                  </p>
                  {inv.matchNote && <p className="text-xs text-[#FBBF24] mt-0.5">{inv.matchNote}</p>}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={esfApi.portalPdfUrl(inv.uuid)}
                    target="_blank"
                    rel="noreferrer"
                    title="Открыть PDF на портале"
                    className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <div className="w-64">
                    <Select
                      value={choice[inv.id] ?? ""}
                      onChange={(v) => setChoice((c) => ({ ...c, [inv.id]: v }))}
                      options={[
                        {
                          value: "",
                          label: options.length ? "— расчёт за этот месяц —" : "— расчётов за месяц нет —",
                        },
                        ...options,
                      ]}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!choice[inv.id] || attach.isPending}
                    onClick={() => attach.mutate({ id: inv.id, settlementId: choice[inv.id]! })}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Привязать
                  </Button>
                  <button
                    onClick={() => hide.mutate(inv.id)}
                    disabled={hide.isPending}
                    title="Скрыть — не наша, розница и т.п."
                    className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    <EyeOff className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Скрытые ЭСФ. Список закрыт PIN-кодом из настроек: без кода сервер отдаёт
 * только количество. Код живёт в памяти вкладки — при перезагрузке спросим снова.
 */
function HiddenEsf() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pin, setPin] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsApi.getSettings(),
  });
  const pinRequired = settings?.esfHiddenPinSet ?? true;

  const { data: count } = useQuery({
    queryKey: ["esf", "hidden-count"],
    queryFn: () => esfApi.hiddenCount().then((r) => r.count),
  });

  const unlocked = open && (!pinRequired || pin !== null);
  const { data: hidden, error: listError } = useQuery({
    queryKey: ["esf", "hidden", pin],
    queryFn: () => esfApi.listHidden(pin ?? ""),
    enabled: unlocked,
    retry: false,
  });

  useEffect(() => {
    if (!listError) return;
    // Неверный код — сбрасываем и просим снова.
    setPin(null);
    setError(listError instanceof ApiError ? listError.message : "Не удалось открыть скрытые");
  }, [listError]);

  const unhide = useMutation({
    mutationFn: (id: string) => esfApi.unhide(id, pin ?? ""),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["esf"] });
      setError("");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Не удалось вернуть"),
  });

  if (!count) return null;

  function submitPin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPin(pinInput);
    setPinInput("");
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        {pinRequired && <Lock className="w-3 h-3" />}
        {open ? "Спрятать скрытые" : `Скрытые (${count})`}
      </button>

      {open && !unlocked && (
        <form onSubmit={submitPin} className="mt-2 flex items-center gap-2">
          <div className="w-40">
            <Input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Код доступа"
              autoComplete="off"
              autoFocus
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" disabled={!pinInput}>
            Открыть
          </Button>
          {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
        </form>
      )}

      {unlocked && hidden && (
        <div className="mt-2 flex flex-col gap-1.5">
          {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
          {hidden.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-muted)]"
            >
              <span className="flex-1 min-w-0 truncate">
                {inv.buyerName} · {inv.number ? `№ ${inv.number}` : "без номера"} · поставка{" "}
                {fmtDate(inv.deliveryDate)} · {formatMoney(inv.amount)}
              </span>
              <button
                onClick={() => unhide.mutate(inv.id)}
                disabled={unhide.isPending}
                title="Вернуть в список"
                className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors shrink-0"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ЭСФ, вытянутые из кабинета, но не привязанные к расчёту — по месяцам,
 * свежие сверху. Текущий месяц дашборда раскрыт, остальные свёрнуты.
 */
export function EsfInbox({ year, month }: { year: number; month: number }) {
  const [error, setError] = useState("");

  const { data: unmatched } = useQuery({
    queryKey: ["esf", "unmatched"],
    queryFn: () => esfApi.list({ unmatchedOnly: true }),
  });

  const groups = useMemo(() => {
    const map = new Map<string, { year: number; month: number; items: EsfInvoice[] }>();
    for (const inv of unmatched ?? []) {
      const k = monthKey(inv);
      const key = `${k.year}-${k.month}`;
      const g = map.get(key) ?? { ...k, items: [] };
      g.items.push(inv);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.year - a.year || b.month - a.month);
  }, [unmatched]);

  const items = unmatched ?? [];
  if (items.length === 0) {
    return (
      <section className="mt-6 shrink-0">
        <HiddenEsf />
      </section>
    );
  }

  return (
    <section className="mt-6 shrink-0">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          ЭСФ без расчёта{" "}
          <span className="text-[var(--color-text-muted)] font-normal">({items.length})</span>
        </h2>
        <p className="text-xs text-[var(--color-text-muted)]">
          Пришли из кабинета, но к расчёту не подошли — привяжите вручную
        </p>
      </div>

      {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}

      <div className="divide-y divide-[var(--color-border)]">
        {groups.map((g) => (
          <MonthGroup
            key={`${g.year}-${g.month}`}
            year={g.year}
            month={g.month}
            items={g.items}
            defaultOpen={g.year === year && g.month === month}
            onError={setError}
          />
        ))}
      </div>

      <HiddenEsf />
    </section>
  );
}

/** Строка с ЭСФ внутри карточки расчёта. */
export function EsfOnSettlement({ settlementId }: { settlementId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["esf", "settlement", settlementId],
    queryFn: () => esfApi.list().then((all) => all.filter((i) => i.settlementId === settlementId)),
  });
  const detach = useMutation({
    mutationFn: (id: string) => esfApi.detach(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["esf"] });
      void qc.invalidateQueries({ queryKey: ["settlement", settlementId] });
      void qc.invalidateQueries({ queryKey: ["settlements"] });
    },
  });

  const inv = data?.[0];
  if (!inv) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)]">
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-[var(--color-text-primary)]">
          ЭСФ № {inv.number ?? "—"}{" "}
          <span className={cn("text-xs", STATUS_CLASS[inv.status])}>{ESF_STATUS_LABELS[inv.status]}</span>
        </span>
        <span className="block text-xs text-[var(--color-text-muted)]">
          оформлена {fmtDate(inv.issuedOn)} · {formatMoney(inv.amount)}
        </span>
      </span>
      <a
        href={esfApi.portalPdfUrl(inv.uuid)}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-[var(--color-accent)] hover:underline shrink-0"
      >
        PDF
      </a>
      <button
        onClick={() => detach.mutate(inv.id)}
        disabled={detach.isPending}
        title="Отвязать от расчёта"
        className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors shrink-0"
      >
        <Link2Off className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
