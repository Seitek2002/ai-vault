'use client';

import { useState, useCallback, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { counterpartiesApi, type CounterpartyFormData } from '@/lib/api/counterparties';
import type { CounterpartyDto } from '@ai-vault/types';
import { ApiError } from '@/lib/api/client';

const EMPTY_FORM: CounterpartyFormData = {
  name: '',
  inn: '',
  bin: '',
  address: '',
  phone: '',
  email: '',
  bankAccount: '',
  bankName: '',
  bankBik: '',
};

function toForm(cp: CounterpartyDto): CounterpartyFormData {
  return {
    name: cp.name,
    inn: cp.inn ?? '',
    bin: cp.bin ?? '',
    address: cp.address ?? '',
    phone: cp.phone ?? '',
    email: cp.email ?? '',
    bankAccount: cp.bankAccount ?? '',
    bankName: cp.bankName ?? '',
    bankBik: cp.bankBik ?? '',
  };
}

interface ModalProps {
  editing: CounterpartyDto | null;
  onClose: () => void;
  onSaved: () => void;
}

function CompanyModal({ editing, onClose, onSaved }: ModalProps) {
  const [form, setForm] = useState<CounterpartyFormData>(
    editing ? toForm(editing) : EMPTY_FORM,
  );
  const [error, setError] = useState('');

  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? counterpartiesApi.update(editing.id, form)
        : counterpartiesApi.create(form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['companies'] });
      onSaved();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const msg = Array.isArray(err.message) ? err.message[0] : err.message;
        setError(msg ?? 'Ошибка сохранения');
      } else {
        setError('Не удалось подключиться к серверу');
      }
    },
  });

  function set(field: keyof CounterpartyFormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    mutation.mutate();
  }

  const inp =
    'w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors';
  const lbl = 'block text-xs font-medium text-[var(--color-text-secondary)] mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[var(--color-bg-surface)] rounded-2xl border border-[var(--color-border)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            {editing ? 'Редактировать компанию' : 'Новая компания'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[70vh]">
          <div className="px-6 py-5 flex flex-col gap-5">
            <div>
              <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
                Основная информация
              </p>
              <div className="flex flex-col gap-3">
                <div>
                  <label className={lbl}>Название организации *</label>
                  <input
                    required
                    className={inp}
                    placeholder='ОсОО «Название компании»'
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>ИНН</label>
                    <input
                      className={inp}
                      placeholder="01703202510204"
                      value={form.inn}
                      onChange={(e) => set('inn', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={lbl}>ОКПО</label>
                    <input
                      className={inp}
                      placeholder="33748819"
                      value={form.bin}
                      onChange={(e) => set('bin', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className={lbl}>Юридический адрес</label>
                  <input
                    className={inp}
                    placeholder="КР, г. Бишкек, ул. Гоголя, 179-62"
                    value={form.address}
                    onChange={(e) => set('address', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
                Банковские реквизиты
              </p>
              <div className="flex flex-col gap-3">
                <div>
                  <label className={lbl}>Расчётный счёт (р/с)</label>
                  <input
                    className={inp}
                    placeholder="1240020001943137"
                    value={form.bankAccount}
                    onChange={(e) => set('bankAccount', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Банк</label>
                    <input
                      className={inp}
                      placeholder='ОАО «Бакай Банк»'
                      value={form.bankName}
                      onChange={(e) => set('bankName', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={lbl}>БИК</label>
                    <input
                      className={inp}
                      placeholder="124012"
                      value={form.bankBik}
                      onChange={(e) => set('bankBik', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
                Контакты
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Телефон</label>
                  <input
                    type="tel"
                    className={inp}
                    placeholder="+996 700 000 000"
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                  />
                </div>
                <div>
                  <label className={lbl}>Email</label>
                  <input
                    type="email"
                    className={inp}
                    placeholder="info@company.kg"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-[var(--color-accent)] text-[#0F172A] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? 'Сохранение…' : editing ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CardProps {
  cp: CounterpartyDto;
  onEdit: (cp: CounterpartyDto) => void;
  onDelete: (cp: CounterpartyDto) => void;
}

function CompanyCard({ cp, onEdit, onDelete }: CardProps) {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push(`/companies/${cp.id}`)}
      className="flex flex-col gap-3 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-elevated)] transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{cp.name}</p>
          {cp.inn && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              ИНН: {cp.inn}{cp.bin ? ` · ОКПО: ${cp.bin}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(cp); }}
            title="Редактировать"
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(cp); }}
            title="Удалить"
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
        {cp.address && <span className="truncate">{cp.address}</span>}
        {cp.bankName && (
          <span className="truncate text-[var(--color-text-muted)]">
            {cp.bankName}{cp.bankAccount ? ` · р/с ${cp.bankAccount}` : ''}
          </span>
        )}
        {(cp.phone ?? cp.email) && (
          <span className="text-[var(--color-text-muted)]">
            {[cp.phone, cp.email].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
    </div>
  );
}

function DeleteModal({
  cp,
  onClose,
  onDeleted,
}: {
  cp: CounterpartyDto;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => counterpartiesApi.remove(cp.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['companies'] });
      onDeleted();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[var(--color-bg-surface)] rounded-2xl border border-[var(--color-border)] shadow-2xl p-6">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">
          Удалить компанию?
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-5">
          <span className="font-medium text-[var(--color-text-primary)]">{cp.name}</span> будет удалена. Это действие нельзя отменить.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Удаление…' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CompaniesClient() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CounterpartyDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CounterpartyDto | null>(null);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    clearTimeout((handleSearch as { _t?: ReturnType<typeof setTimeout> })._t);
    (handleSearch as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(
      () => setDebouncedSearch(value),
      300,
    );
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['companies', debouncedSearch],
    queryFn: () => counterpartiesApi.list(debouncedSearch || undefined),
  });

  const companies = data ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] shrink-0">
        <div>
          <h1 className="text-base font-semibold text-[var(--color-text-primary)]">Компании</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Организации и партнёры</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-[var(--color-accent)] text-[#0F172A] hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Добавить
        </button>
      </div>

      <div className="px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] shrink-0">
        <div className="relative max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Поиск по названию…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-[var(--color-bg-elevated)] animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center h-48">
            <p className="text-sm text-[var(--color-text-muted)]">Не удалось загрузить компании</p>
          </div>
        )}

        {!isLoading && !isError && companies.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-bg-elevated)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                {debouncedSearch ? 'Компании не найдены' : 'Нет компаний'}
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                {debouncedSearch ? 'Попробуйте изменить поисковый запрос' : 'Добавьте первую компанию'}
              </p>
            </div>
            {!debouncedSearch && (
              <button
                onClick={() => setCreateOpen(true)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-[#0F172A] hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                Добавить компанию
              </button>
            )}
          </div>
        )}

        {!isLoading && !isError && companies.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {companies.map((cp) => (
              <CompanyCard
                key={cp.id}
                cp={cp}
                onEdit={setEditTarget}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      {(createOpen || editTarget) && (
        <CompanyModal
          editing={editTarget}
          onClose={() => { setCreateOpen(false); setEditTarget(null); }}
          onSaved={() => { setCreateOpen(false); setEditTarget(null); }}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          cp={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
