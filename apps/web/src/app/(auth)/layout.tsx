export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex items-center justify-center bg-[var(--color-bg-base)] px-4 py-12">
      {children}
    </div>
  );
}
