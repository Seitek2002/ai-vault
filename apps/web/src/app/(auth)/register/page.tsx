'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { Button, Input, Card } from '@/components/ui';

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const trimmedOrgName = organizationName.trim();
      await authApi.register({ name, email, password, ...(trimmedOrgName ? { organizationName: trimmedOrgName } : {}) });
      router.push('/documents');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const msg = Array.isArray(err.message) ? err.message[0] : err.message;
        setError(msg ?? 'Ошибка регистрации');
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

      <Card className="p-8 shadow-xl">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
          Создать аккаунт
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">
          Зарегистрируйтесь и начните работу
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Ваше имя
            </label>
            <Input
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Айбек Иванов"
              className="py-2.5"
            />
          </div>

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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 8 символов"
              className="py-2.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Название организации <span className="font-normal text-[var(--color-text-muted)]">(необязательно)</span>
            </label>
            <Input
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="ООО «Моя компания»"
              className="py-2.5"
            />
            <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
              Можно оставить пустым и создать или присоединиться к организации позже в настройках.
            </p>
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
            loadingText="Создание аккаунта…"
            className="mt-1"
          >
            Зарегистрироваться
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-[var(--color-text-muted)] mt-6">
        Уже есть аккаунт?{' '}
        <Link href="/login" className="text-[var(--color-accent)] hover:underline font-medium">
          Войти
        </Link>
      </p>
    </div>
  );
}
