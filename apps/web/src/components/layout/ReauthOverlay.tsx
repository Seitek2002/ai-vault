"use client";

import { useReauthStore } from "@/stores/reauth.store";
import { Spinner } from "@/components/ui";

/**
 * Full-screen overlay shown while an expired access token is being silently
 * refreshed and the request that triggered it retried (see lib/api/client.ts).
 * Without this, a 401-triggered refresh is invisible and the UI just looks
 * frozen/unresponsive for the moment it takes.
 */
export function ReauthOverlay() {
  const active = useReauthStore((s) => s.active);
  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-8 py-6 shadow-2xl">
        <Spinner size="lg" />
        <p className="text-sm text-[var(--color-text-secondary)]">Ожидайте, идёт обработка данных…</p>
      </div>
    </div>
  );
}
