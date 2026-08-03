'use client';

import { useState, useRef, FormEvent, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import {
  settingsApi,
  type UpdateSettingsDto,
  type UpdateMeDto,
  type AddMemberDto,
  type CreateMemberDto,
  type UserProfile,
  type CompanySettings,
} from '@/lib/api/settings';
import { positionsApi, Permission, PERMISSION_LABELS, type Position } from '@/lib/api/positions';
import { hasPermission } from '@/lib/permissions';
import { useBackgroundEditStore } from '@/stores/backgroundEdit.store';
import { ApiError } from '@/lib/api/client';
import { saveTokens } from '@/lib/tokens';
import { Button, Input, Select, Card, Badge, Spinner, Modal } from '@/components/ui';

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
      <Input
        id={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
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
      <Card className="p-6">
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
            <Button type="submit" disabled={!name.trim()} loading={mutation.isPending} loadingText="Создание…">
              Создать организацию
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ── Requisites tab ─────────────────────────────────────────────────────────────

function LogoUpload({ settings }: { settings: CompanySettings | undefined }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (file: File) => settingsApi.uploadLogo(file),
    onSuccess: () => {
      setError('');
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Ошибка загрузки'),
  });

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]"
        title="Изменить логотип"
      >
        {settings?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={settings.logoUrl} alt={settings.name} className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">Нет лого</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          Изменить
        </span>
      </button>
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          loading={mutation.isPending}
          loadingText="Загрузка…"
        >
          Загрузить логотип
        </Button>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) mutation.mutate(file);
        }}
      />
    </div>
  );
}

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
    // Optional fields left blank must be omitted, not sent as '' — inn/email
    // etc. still get validated (@MinLength/@IsEmail) even under @IsOptional()
    // since an empty string is neither undefined nor null.
    mutationFn: () => {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== ''),
      ) as UpdateSettingsDto;
      return settingsApi.updateSettings(payload);
    },
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
        <SectionTitle>Логотип</SectionTitle>
        <LogoUpload settings={data} />
      </div>

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
        <Button type="submit" loading={mutation.isPending} loadingText="Сохранение…">
          Сохранить
        </Button>
      </div>
    </form>
  );
}

// ── Positions tab ──────────────────────────────────────────────────────────────

function PositionModal({ position, onClose }: { position: Position | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(position?.name ?? '');
  const [permissions, setPermissions] = useState<Permission[]>(position?.permissions ?? []);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      position
        ? positionsApi.update(position.id, { name, permissions })
        : positionsApi.create({ name, permissions }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['positions'] });
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Ошибка сохранения'),
  });

  const toggle = (p: Permission) =>
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    mutation.mutate();
  };

  return (
    <Modal onClose={onClose} size="md">
      <form onSubmit={handleSubmit} className="space-y-5 p-6">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          {position ? 'Редактировать должность' : 'Новая должность'}
        </h2>
        <Field
          label="Название"
          name="positionName"
          value={name}
          onChange={setName}
          placeholder="Например, Менеджер по продажам"
          required
        />
        <div>
          <p className="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">Права</p>
          <div className="space-y-2">
            {Object.values(Permission).map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                <input
                  type="checkbox"
                  checked={permissions.includes(p)}
                  onChange={() => toggle(p)}
                  className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                />
                {PERMISSION_LABELS[p]}
              </label>
            ))}
          </div>
        </div>
        {error && (
          <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={mutation.isPending} loadingText="Сохранение…">
            Сохранить
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PositionsTab() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: settingsApi.getMe });
  const { data: positions = [], isLoading } = useQuery({
    queryKey: ['positions'],
    queryFn: positionsApi.list,
  });
  const [editing, setEditing] = useState<Position | 'new' | null>(null);
  const canManage = hasPermission(me, Permission.MANAGE_POSITIONS);

  const removeMutation = useMutation({
    mutationFn: (id: string) => positionsApi.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['positions'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionTitle>Должности</SectionTitle>
        {canManage && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />
            Создать должность
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-[var(--color-bg-elevated)]" />
          ))}
        </div>
      ) : positions.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          Пока нет ни одной должности. Должности задают набор прав, которые можно назначить сотруднику.
        </p>
      ) : (
        <Card className="divide-y divide-[var(--color-border)] overflow-hidden">
          {positions.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{p.name}</p>
                <p className="truncate text-xs text-[var(--color-text-muted)]">
                  {p.permissions.length === 0
                    ? 'Без прав'
                    : p.permissions.map((perm) => PERMISSION_LABELS[perm]).join(', ')}
                </p>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                    Изменить
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeMutation.mutate(p.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {editing && (
        <PositionModal
          position={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ── Profile tab ────────────────────────────────────────────────────────────────

function AvatarUpload({ me }: { me: UserProfile | undefined }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (file: File) => settingsApi.uploadAvatar(file),
    onSuccess: () => {
      setError('');
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Ошибка загрузки'),
  });

  const initials = me?.name
    ? me.name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)]"
        title="Изменить аватар"
      >
        {me?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt={me.name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-[var(--color-text-secondary)]">
            {initials}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          Изменить
        </span>
      </button>
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          loading={mutation.isPending}
          loadingText="Загрузка…"
        >
          Загрузить фото
        </Button>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) mutation.mutate(file);
        }}
      />
    </div>
  );
}

function ProfileTab() {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: settingsApi.getMe,
  });
  const enterBackgroundEdit = useBackgroundEditStore((s) => s.enter);

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
        <SectionTitle>Фото профиля</SectionTitle>
        <AvatarUpload me={me} />
      </div>

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

      <div>
        <SectionTitle>Фон рабочей области</SectionTitle>
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">
          Настройте фон, который отображается в рабочей области справа.
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            enterBackgroundEdit({
              backgroundId: me?.backgroundId ?? null,
              backgroundImageUrl: me?.backgroundImageUrl,
              backgroundFilter: me?.backgroundFilter,
              backgroundImageScope: me?.backgroundImageScope,
              sidebarBackgroundId: me?.sidebarBackgroundId,
              sidebarImageUrl: me?.sidebarImageUrl,
              sidebarImageFilter: me?.sidebarImageFilter,
            })
          }
        >
          Настроить фон
        </Button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">{success}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={mutation.isPending} loadingText="Сохранение…">
          Сохранить
        </Button>
      </div>
    </form>
  );
}

// ── Team tab ─────────────────────────────────────────────────────────────────

type AddMemberMode = 'existing' | 'create';

function PositionPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: positions = [] } = useQuery({ queryKey: ['positions'], queryFn: positionsApi.list });
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-[var(--color-text-secondary)]">Должность</label>
      <Select
        value={value}
        onChange={onChange}
        placeholder="Без должности"
        options={[
          { value: '', label: 'Без должности' },
          ...positions.map((p) => ({ value: p.id, label: p.name })),
        ]}
      />
    </div>
  );
}

function AddExistingMemberForm({ onDone }: { onDone: (email: string) => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [positionId, setPositionId] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (dto: AddMemberDto) => settingsApi.addMember(dto),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ['members'] });
      setError('');
      setEmail('');
      setPositionId('');
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
    mutation.mutate({ email, ...(positionId ? { positionId } : {}) });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="E-mail" name="memberEmail" type="email" value={email} onChange={setEmail} placeholder="employee@company.kg" required />
        <PositionPicker value={positionId} onChange={setPositionId} />
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Сотрудник должен уже иметь аккаунт в системе (зарегистрированный на этот email). Он будет перенесён в вашу организацию и получит доступ к её документам.
      </p>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={mutation.isPending} loadingText="Добавление…">
          Добавить сотрудника
        </Button>
      </div>
    </form>
  );
}

function CreateMemberForm({ onDone }: { onDone: (email: string) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateMemberDto>({ name: '', email: '', password: '' });
  const [positionId, setPositionId] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (dto: CreateMemberDto) => settingsApi.createMember(dto),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ['members'] });
      setError('');
      setForm({ name: '', email: '', password: '' });
      setPositionId('');
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
    mutation.mutate({ ...form, ...(positionId ? { positionId } : {}) });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Имя" name="newMemberName" value={form.name} onChange={set('name')} required />
        <Field label="E-mail" name="newMemberEmail" type="email" value={form.email} onChange={set('email')} placeholder="employee@company.kg" required />
        <Field label="Пароль" name="newMemberPassword" type="password" value={form.password} onChange={set('password')} placeholder="Минимум 8 символов" required />
        <PositionPicker value={positionId} onChange={setPositionId} />
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Создаст новый аккаунт сразу в вашей организации. Сообщите сотруднику email и пароль для входа.
      </p>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={mutation.isPending} loadingText="Создание…">
          Создать и добавить
        </Button>
      </div>
    </form>
  );
}

function TeamTab() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: settingsApi.getMe });
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['members'],
    queryFn: settingsApi.listMembers,
  });
  const { data: positions = [] } = useQuery({ queryKey: ['positions'], queryFn: positionsApi.list });

  const [mode, setMode] = useState<AddMemberMode>('existing');
  const [success, setSuccess] = useState('');
  const canManage = hasPermission(me, Permission.MANAGE_EMPLOYEES);

  const assignMutation = useMutation({
    mutationFn: ({ id, positionId }: { id: string; positionId: string }) =>
      settingsApi.updateMember(id, { positionId: positionId || null }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['members'] }),
  });

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
          <Card className="divide-y divide-[var(--color-border)]">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                    {m.name}
                    {m.id === me?.id && (
                      <span className="ml-2 text-xs text-[var(--color-text-muted)]">(вы)</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">{m.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {m.role === 'ADMIN' ? (
                    <Badge className="rounded-full bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] font-medium">
                      Администратор
                    </Badge>
                  ) : canManage ? (
                    <div className="w-40">
                      <Select
                        value={m.position?.id ?? ''}
                        onChange={(positionId) => assignMutation.mutate({ id: m.id, positionId })}
                        placeholder="Без должности"
                        options={[
                          { value: '', label: 'Без должности' },
                          ...positions.map((p) => ({ value: p.id, label: p.name })),
                        ]}
                      />
                    </div>
                  ) : (
                    <Badge className="rounded-full bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] font-medium">
                      {m.position?.name ?? 'Без должности'}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {!canManage && (
        <p className="text-xs text-[var(--color-text-muted)]">
          У вас нет прав на управление сотрудниками — обратитесь к администратору.
        </p>
      )}

      {canManage && (
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
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

type Tab = 'requisites' | 'team' | 'positions' | 'profile';

const TABS: { id: Tab; label: string }[] = [
  { id: 'requisites', label: 'Реквизиты организации' },
  { id: 'team', label: 'Сотрудники' },
  { id: 'positions', label: 'Должности' },
  { id: 'profile', label: 'Профиль' },
];

export function SettingsClient() {
  const [tab, setTab] = useState<Tab>('requisites');
  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ['me'], queryFn: settingsApi.getMe });

  if (meLoading) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--color-accent)]">
        <Spinner size="lg" />
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

      <div className="flex flex-col md:flex-row flex-1 gap-0 overflow-hidden">
        {/* Tab nav — horizontal scroll bar on mobile, vertical rail from md: up */}
        <nav className="w-full md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-[var(--color-border)] p-2 md:p-4 overflow-x-auto">
          <ul className="flex md:flex-col gap-1">
            {TABS.map((t) => (
              <li key={t.id} className="shrink-0 md:shrink">
                <button
                  onClick={() => setTab(t.id)}
                  className={`w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors ${
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
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-2xl">
            {tab === 'requisites' && <RequisitesTab />}
            {tab === 'team' && <TeamTab />}
            {tab === 'positions' && <PositionsTab />}
            {tab === 'profile' && <ProfileTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
