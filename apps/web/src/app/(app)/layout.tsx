import { AppShell } from "@/components/layout/AppShell";
import { QueryProvider } from "@/components/layout/QueryProvider";
import { AuthGuard } from "@/components/layout/AuthGuard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthGuard>
        <AppShell>{children}</AppShell>
      </AuthGuard>
    </QueryProvider>
  );
}
