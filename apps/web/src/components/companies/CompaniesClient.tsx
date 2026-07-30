'use client';

import { useState, useCallback, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Search, X, Pencil, Trash2, Building2 } from 'lucide-react';
import { Button, Input, Modal, Card, EmptyState, PageHeader } from '@/components/ui';
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

  const lbl = 'block text-xs font-medium text-[var(--color-text-secondary)] mb-1';

  return (
    <Modal onClose={onClose} className="overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          {editing ? 'Редактировать компанию' : 'Новая компания'}
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
        >
          <X className="w-4 h-4" />
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
                <Input
                  required
                  placeholder='ОсОО «Название компании»'
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>ИНН</label>
                  <Input
                    placeholder="01703202510204"
                    value={form.inn}
                    onChange={(e) => set('inn', e.target.value)}
                  />
                </div>
                <div>
                  <label className={lbl}>ОКПО</label>
                  <Input
                    placeholder="33748819"
                    value={form.bin}
                    onChange={(e) => set('bin', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className={lbl}>Юридический адрес</label>
                <Input
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
                <Input
                  placeholder="1240020001943137"
                  value={form.bankAccount}
                  onChange={(e) => set('bankAccount', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Банк</label>
                  <Input
                    placeholder='ОАО «Бакай Банк»'
                    value={form.bankName}
                    onChange={(e) => set('bankName', e.target.value)}
                  />
                </div>
                <div>
                  <label className={lbl}>БИК</label>
                  <Input
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
                <Input
                  type="tel"
                  placeholder="+996 700 000 000"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                />
              </div>
              <div>
                <label className={lbl}>Email</label>
                <Input
                  type="email"
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
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={mutation.isPending} loadingText="Сохранение…">
            {editing ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </form>
    </Modal>
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
    <Card
      hoverable
      onClick={() => router.push(`/companies/${cp.id}`)}
      className="flex flex-col gap-3 p-4 cursor-pointer"
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
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(cp); }}
            title="Удалить"
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
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
    </Card>
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
    <Modal onClose={onClose} size="sm" className="p-6">
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">
        Удалить компанию?
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)] mb-5">
        <span className="font-medium text-[var(--color-text-primary)]">{cp.name}</span> будет удалена. Это действие нельзя отменить.
      </p>
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button variant="danger" onClick={() => mutation.mutate()} loading={mutation.isPending} loadingText="Удаление…">
          Удалить
        </Button>
      </div>
    </Modal>
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
    <div className="p-6 lg:p-8 h-full flex flex-col">
      <PageHeader
        title="Компании"
        subtitle="Организации и партнёры"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Добавить
          </Button>
        }
      />

      <div className="relative max-w-sm mb-5 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
        <Input
          type="text"
          placeholder="Поиск по названию…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex-1 overflow-y-auto -mx-6 px-6 lg:-mx-8 lg:px-8">
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
          <EmptyState
            icon={<Building2 className="w-6 h-6" strokeWidth={1.5} />}
            title={debouncedSearch ? 'Компании не найдены' : 'Нет компаний'}
            description={debouncedSearch ? 'Попробуйте изменить поисковый запрос' : 'Добавьте первую компанию'}
            action={
              !debouncedSearch && (
                <Button onClick={() => setCreateOpen(true)}>
                  Добавить компанию
                </Button>
              )
            }
          />
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
