'use client';

import { useState, FormEvent, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { Vault } from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';

// useSearchParams() forces client-side rendering, so the form must sit inside a
// Suspense boundary or the production build fails with a CSR-bailout error.
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-sm" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authApi.login({ email, password });
      const redirect = searchParams.get('redirect') ?? '/documents';
      router.push(redirect);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 401 ? 'Неверный email или пароль' : err.message);
      } else {
        setError('Не удалось подключиться к серверу');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="flex items-center justify-center gap-2.5 mb-8">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] flex items-center justify-center">
          <Vault className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
        <span className="text-xl font-semibold bg-gradient-to-r from-[var(--color-text-primary)] to-[var(--color-accent-2)] bg-clip-text text-transparent">Vault</span>
      </div>

      <Card className="p-8 shadow-xl">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
          Добро пожаловать
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">
          Войдите в свой аккаунт
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Email
            </label>
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.kg"
              className="py-2.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Пароль
            </label>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="py-2.5"
            />
          </div>

          {error && (
            <div className="px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            fullWidth
            disabled={loading}
            loading={loading}
            loadingText="Вход…"
            className="mt-1"
          >
            Войти
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-[var(--color-text-muted)] mt-6">
        Нет аккаунта?{' '}
        <Link href="/register" className="text-[var(--color-accent)] hover:underline font-medium">
          Зарегистрироваться
        </Link>
      </p>
    </div>
  );
}
