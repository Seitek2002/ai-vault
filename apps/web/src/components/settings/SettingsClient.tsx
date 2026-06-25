'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  settingsApi,
  type UpdateSettingsDto,
  type UpdateMeDto,
} from '@/lib/api/settings';
import { ApiError } from '@/lib/api/client';

// ── Helpers ────────────────────────────────────────────────────────────────────

function Field({
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium text-[var(--color-text-secondary)]">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        id={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
      />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
      {children}
    </h3>
  );
}

// ── Requisites tab ─────────────────────────────────────────────────────────────

function RequisitesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.getSettings,
  });

  const [form, setForm] = useState<UpdateSettingsDto>({});
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name ?? '',
        inn: data.inn ?? '',
        bin: data.bin ?? '',
        address: data.address ?? '',
        phone: data.phone ?? '',
        email: data.email ?? '',
        bankAccount: data.bankAccount ?? '',
        bankName: data.bankName ?? '',
        bankBik: data.bankBik ?? '',
        currency: data.currency ?? 'KGS',
      });
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => settingsApi.updateSettings(form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] });
      setSuccess(true);
      setError('');
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    },
  });

  const set = (key: keyof UpdateSettingsDto) => (val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-[var(--color-bg-elevated)]" />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <SectionTitle>Основная информация</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Наименование организации" name="name" value={form.name ?? ''} onChange={set('name')} required />
          <Field label="ИНН" name="inn" value={form.inn ?? ''} onChange={set('inn')} placeholder="00000000000000" />
          <Field label="ОКПО / ОГРН" name="bin" value={form.bin ?? ''} onChange={set('bin')} placeholder="ОКПО / ОГРН" />
          <Field label="Адрес" name="address" value={form.address ?? ''} onChange={set('address')} placeholder="г. Бишкек, ул. ..." />
        </div>
      </div>

      <div>
        <SectionTitle>Банковские реквизиты</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Расчётный счёт" name="bankAccount" value={form.bankAccount ?? ''} onChange={set('bankAccount')} placeholder="1250000000000000" />
          <Field label="Банк" name="bankName" value={form.bankName ?? ''} onChange={set('bankName')} placeholder="ОАО «Банк»" />
          <Field label="БИК / МФО" name="bankBik" value={form.bankBik ?? ''} onChange={set('bankBik')} placeholder="109007" />
          <Field label="Валюта" name="currency" value={form.currency ?? 'KGS'} onChange={set('currency')} placeholder="KGS" />
        </div>
      </div>

      <div>
        <SectionTitle>Контакты</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Телефон" name="phone" value={form.phone ?? ''} onChange={set('phone')} type="tel" placeholder="+996 700 000 000" />
          <Field label="E-mail" name="settingsEmail" value={form.email ?? ''} onChange={set('email')} type="email" placeholder="info@company.kg" />
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">Реквизиты сохранены</p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </form>
  );
}

// ── Profile tab ────────────────────────────────────────────────────────────────

function ProfileTab() {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: settingsApi.getMe,
  });

  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (me) setName(me.name);
  }, [me]);

  const mutation = useMutation({
    mutationFn: (dto: UpdateMeDto) => settingsApi.updateMe(dto),
    onSuccess: () => {
      setSuccess('Изменения сохранены');
      setError('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    const dto: UpdateMeDto = {};
    if (name !== me?.name) dto.name = name;
    if (newPassword) {
      dto.newPassword = newPassword;
      dto.currentPassword = currentPassword;
    }
    if (Object.keys(dto).length === 0) return;
    mutation.mutate(dto);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <SectionTitle>Личные данные</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Имя" name="profileName" value={name} onChange={setName} required />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--color-text-secondary)]">E-mail</label>
            <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
              {me?.email ?? '—'}
            </p>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>Изменить пароль</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Текущий пароль"
            name="currentPassword"
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder="••••••••"
          />
          <div />
          <Field
            label="Новый пароль"
            name="newPassword"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            placeholder="Минимум 8 символов"
          />
          <Field
            label="Подтвердите пароль"
            name="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Повторите пароль"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">{success}</p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </form>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

type Tab = 'requisites' | 'profile';

const TABS: { id: Tab; label: string }[] = [
  { id: 'requisites', label: 'Реквизиты организации' },
  { id: 'profile', label: 'Профиль' },
];

export function SettingsClient() {
  const [tab, setTab] = useState<Tab>('requisites');

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border)] px-6 py-5">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Настройки</h1>
      </div>

      <div className="flex flex-1 gap-0 overflow-hidden">
        {/* Tab nav */}
        <nav className="w-56 shrink-0 border-r border-[var(--color-border)] p-4">
          <ul className="space-y-1">
            {TABS.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setTab(t.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    tab === t.id
                      ? 'bg-[var(--color-accent)]/10 font-medium text-[var(--color-accent)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-2xl">
            {tab === 'requisites' ? <RequisitesTab /> : <ProfileTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
