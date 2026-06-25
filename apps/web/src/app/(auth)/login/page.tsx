'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

export default function LoginPage() {
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
        <div className="w-9 h-9 rounded-xl bg-[var(--color-accent)] flex items-center justify-center">
          <span className="text-[#0F172A] font-bold text-sm">AI</span>
        </div>
        <span className="text-xl font-semibold text-[var(--color-text-primary)]">AI Vault</span>
      </div>

      <div className="bg-[var(--color-bg-surface)] rounded-2xl border border-[var(--color-border)] p-8 shadow-xl">
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
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.kg"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Пароль
            </label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors"
            />
          </div>

          {error && (
            <div className="px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm font-semibold rounded-lg bg-[var(--color-accent)] text-[#0F172A] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-1"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Вход…
              </span>
            ) : (
              'Войти'
            )}
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-[var(--color-text-muted)] mt-6">
        Нет аккаунта?{' '}
        <Link href="/register" className="text-[var(--color-accent)] hover:underline font-medium">
          Зарегистрироваться
        </Link>
      </p>
    </div>
  );
}
