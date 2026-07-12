"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getAccessToken, getRefreshToken, clearTokens, saveTokens } from "@/lib/tokens";
import { settingsApi } from "@/lib/api/settings";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      if (getAccessToken()) {
        setReady(true);
        return;
      }

      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearTokens();
        window.location.href = "/login";
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });

        if (!res.ok) throw new Error("refresh failed");

        const data = await res.json() as { accessToken: string; refreshToken: string };
        saveTokens(data.accessToken, data.refreshToken);
        setReady(true);
      } catch {
        clearTokens();
        window.location.href = "/login";
      }
    }

    void init();
  }, []);

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: settingsApi.getMe,
    enabled: ready,
  });

  // Accounts not yet attached to an organization can only use Settings
  // (to create/join one) — everything else needs an organizationId.
  useEffect(() => {
    if (ready && me && !me.organizationId && pathname !== "/settings") {
      router.replace("/settings");
    }
  }, [ready, me, pathname, router]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--color-bg-base)]">
        <div className="w-6 h-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
