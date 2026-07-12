'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  settingsApi,
  type UpdateSettingsDto,
  type UpdateMeDto,
  type AddMemberDto,
  type CreateMemberDto,
} from '@/lib/api/settings';
import { ApiError } from '@/lib/api/client';
import { saveTokens } from '@/lib/tokens';

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

// ── Organization setup (no organization yet) ────────────────────────────────────

function OrganizationSetupTab() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => settingsApi.createOrganization({ name }),
    onSuccess: (tokens) => {
      saveTokens(tokens.accessToken, tokens.refreshToken);
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Ошибка создания организации');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    mutation.mutate();
  };

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-6">
        <h2 className="mb-1 text-base font-semibold text-[var(--color-text-primary)]">
          Ваш аккаунт пока не привязан к организации
        </h2>
        <p className="mb-5 text-sm text-[var(--color-text-muted)]">
          Создайте свою организацию, чтобы начать работу с документами. Либо попросите
          администратора существующей организации добавить вас по email в разделе «Сотрудники».
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field
            label="Название организации"
            name="orgName"
            value={name}
            onChange={setName}
            placeholder="ООО «Моя компания»"
            required
          />
          {error && (
            <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={mutation.isPending || !name.trim()}
              className="rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {mutation.isPending ? 'Создание…' : 'Создать организацию'}
            </button>
          </div>
        </form>
      </div>
    </div>
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

// ── Team tab ─────────────────────────────────────────────────────────────────

type AddMemberMode = 'existing' | 'create';

function AddExistingMemberForm({ onDone }: { onDone: (email: string) => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (dto: AddMemberDto) => settingsApi.addMember(dto),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ['members'] });
      setError('');
      setEmail('');
      onDone(created.email);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? err.status === 404
            ? 'Пользователь с таким email не найден — он должен сначала зарегистрироваться'
            : err.status === 409
              ? 'Этот пользователь уже состоит в вашей организации'
              : err.message
          : 'Ошибка добавления сотрудника',
      );
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({ email });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="E-mail" name="memberEmail" type="email" value={email} onChange={setEmail} placeholder="employee@company.kg" required />
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Сотрудник должен уже иметь аккаунт в системе (зарегистрированный на этот email). Он будет перенесён в вашу организацию и получит доступ к её документам.
      </p>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending ? 'Добавление…' : 'Добавить сотрудника'}
        </button>
      </div>
    </form>
  );
}

function CreateMemberForm({ onDone }: { onDone: (email: string) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateMemberDto>({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (dto: CreateMemberDto) => settingsApi.createMember(dto),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ['members'] });
      setError('');
      setForm({ name: '', email: '', password: '' });
      onDone(created.email);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? err.status === 409
            ? 'Этот email уже зарегистрирован — используйте режим «Существующий аккаунт»'
            : err.message
          : 'Ошибка создания сотрудника',
      );
    },
  });

  const set = (key: keyof CreateMemberDto) => (val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) {
      setError('Пароль должен содержать минимум 8 символов');
      return;
    }
    mutation.mutate(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Имя" name="newMemberName" value={form.name} onChange={set('name')} required />
        <Field label="E-mail" name="newMemberEmail" type="email" value={form.email} onChange={set('email')} placeholder="employee@company.kg" required />
        <Field label="Пароль" name="newMemberPassword" type="password" value={form.password} onChange={set('password')} placeholder="Минимум 8 символов" required />
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Создаст новый аккаунт сразу в вашей организации. Сообщите сотруднику email и пароль для входа.
      </p>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending ? 'Создание…' : 'Создать и добавить'}
        </button>
      </div>
    </form>
  );
}

function TeamTab() {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: settingsApi.getMe });
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['members'],
    queryFn: settingsApi.listMembers,
  });

  const [mode, setMode] = useState<AddMemberMode>('existing');
  const [success, setSuccess] = useState('');

  const handleDone = (email: string) => {
    setSuccess(`Сотрудник ${email} добавлен`);
    setTimeout(() => setSuccess(''), 3000);
  };

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle>Сотрудники организации</SectionTitle>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--color-bg-elevated)]" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                    {m.name}
                    {m.id === me?.id && (
                      <span className="ml-2 text-xs text-[var(--color-text-muted)]">(вы)</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">{m.email}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--color-bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                  {m.role === 'ADMIN' ? 'Администратор' : 'Сотрудник'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <SectionTitle>Добавить сотрудника</SectionTitle>

        <div className="mb-4 flex rounded-lg border border-[var(--color-border)] p-1">
          {(
            [
              ['existing', 'Существующий аккаунт'],
              ['create', 'Создать аккаунт'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === id
                  ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'existing' ? (
          <AddExistingMemberForm onDone={handleDone} />
        ) : (
          <CreateMemberForm onDone={handleDone} />
        )}

        {success && (
          <p className="mt-4 rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">{success}</p>
        )}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

type Tab = 'requisites' | 'team' | 'profile';

const TABS: { id: Tab; label: string }[] = [
  { id: 'requisites', label: 'Реквизиты организации' },
  { id: 'team', label: 'Сотрудники' },
  { id: 'profile', label: 'Профиль' },
];

export function SettingsClient() {
  const [tab, setTab] = useState<Tab>('requisites');
  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ['me'], queryFn: settingsApi.getMe });

  if (meLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
      </div>
    );
  }

  if (me && !me.organizationId) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-[var(--color-border)] px-6 py-5">
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Настройки</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <OrganizationSetupTab />
        </div>
      </div>
    );
  }

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
            {tab === 'requisites' && <RequisitesTab />}
            {tab === 'team' && <TeamTab />}
            {tab === 'profile' && <ProfileTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
