'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Plus, Search, X, Pencil, Trash2, Building2, Landmark, FileText, Phone, Mail, ChevronDown, ArrowUpDown } from 'lucide-react';
import { Button, Input, Modal, EmptyState } from '@/components/ui';
import { counterpartiesApi, type CounterpartyFormData } from '@/lib/api/counterparties';
import { contractsApi, type Contract } from '@/lib/api/contracts';
import { formatMoney } from '@/lib/api/settlements';
import type { CounterpartyDto } from '@ai-vault/types';
import { CONTRACT_AMOUNT_LABELS } from '@ai-vault/doc-placeholders';
import { ApiError } from '@/lib/api/client';
import { CompanyRequisitesModal } from './CompanyRequisitesModal';
import palette from './CompaniesPalette.module.css';

const ContractModal = dynamic(() => import('@/components/contracts/ContractsClient').then((m) => m.ContractModal));

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
    if (mutation.isPending) return;
    setError('');
    mutation.mutate();
  }

  const lbl = 'block text-xs font-medium text-[var(--color-text-secondary)] mb-1';

  return (
    <Modal onClose={() => { if (!mutation.isPending) onClose(); }} className="overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          {editing ? 'Редактировать компанию' : 'Новая компания'}
        </h2>
        <button
          onClick={onClose}
          aria-label="Закрыть форму компании"
          disabled={mutation.isPending}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <p className="mb-3 text-xs text-[var(--color-text-secondary)]">Телефон и email необязательны — можно заполнить позже.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={lbl} htmlFor="company-phone">Телефон (необязательно)</label>
                <Input
                  id="company-phone"
                  type="tel"
                  placeholder="+996 700 000 000"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                />
              </div>
              <div>
                <label className={lbl} htmlFor="company-email">Email (необязательно)</label>
                <Input
                  id="company-email"
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
          <Button type="button" variant="secondary" disabled={mutation.isPending} onClick={onClose}>
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

interface CompanyRowProps {
  cp: CounterpartyDto;
  contracts: Contract[];
  contractsLoading: boolean;
  contractsError: boolean;
  onRetryContracts: () => void;
  onOpenContract: (contract: Contract) => void;
  onEdit: (cp: CounterpartyDto) => void;
  onDelete: (cp: CounterpartyDto) => void;
}

const contractDate = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC' });

function contractPeriod(contract: Contract): string {
  const start = contract.startDate ? `С ${contractDate.format(new Date(contract.startDate))}` : 'Начало не указано';
  const endDate = contract.effectiveEndDate ?? contract.endDate;
  const end = endDate ? `до ${contractDate.format(new Date(endDate))}${contract.autoRenew ? ' · автопродление' : ''}` : 'без срока окончания';
  return `${start} · ${end}`;
}

function CompanyRow({ cp, contracts, contractsLoading, contractsError, onRetryContracts, onOpenContract, onEdit, onDelete }: CompanyRowProps) {
  const [requisitesOpen, setRequisitesOpen] = useState(false);
  const [contractsExpanded, setContractsExpanded] = useState(false);
  const contractsId = `company-contracts-${cp.id}`;
  const contractsHeadingId = `${contractsId}-heading`;

  return (
    <li className="group border-b border-[var(--color-border)] even:bg-[var(--company-row-alt)] last:border-b-0">
      <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:px-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.7fr)_auto] xl:items-center transition-colors hover:bg-[var(--color-bg-elevated)]/40">
        <div className="min-w-0">
          <Link href={`/companies/${cp.id}`} className="inline-block text-sm sm:text-base font-semibold leading-snug text-[var(--color-text-primary)] hover:text-[var(--color-accent)] underline-offset-4 hover:underline [overflow-wrap:anywhere]">
            {cp.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-secondary)] tabular-nums">
            {cp.inn ? <span>ИНН <span className="text-[var(--color-text-primary)]">{cp.inn}</span></span> : <span>ИНН не указан</span>}
            {cp.bin && <span>ОКПО {cp.bin}</span>}
            <Button type="button" size="sm" variant="ghost" className="min-h-10 bg-[var(--company-contract-bg)] px-2 text-xs text-[var(--company-contract-text)] hover:bg-[var(--company-contract-hover)] hover:text-[var(--company-contract-text)]"
              title="Действующие договоры" aria-label={`Действующие договоры ${cp.name}`} aria-expanded={contractsExpanded} aria-controls={contractsId}
              onClick={() => setContractsExpanded(!contractsExpanded)}>
              <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Договоры
              {!contractsLoading && !contractsError && <span className="tabular-nums">({contracts.length})</span>}
              <ChevronDown className={`w-4 h-4 shrink-0 transition-transform motion-reduce:transition-none ${contractsExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 text-sm text-[var(--company-contact-text)]">
          {cp.phone && <a href={`tel:${cp.phone.replace(/[^+\d]/g, '')}`} className="flex w-fit max-w-full items-center gap-2 hover:text-[var(--color-accent)] underline-offset-4 hover:underline">
            <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><span className="break-all tabular-nums">{cp.phone}</span>
          </a>}
          {cp.email && <a href={`mailto:${cp.email}`} className="flex w-fit max-w-full items-center gap-2 hover:text-[var(--color-accent)] underline-offset-4 hover:underline">
            <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><span className="break-all">{cp.email}</span>
          </a>}
          {!cp.phone && !cp.email && <span className="text-xs">Контакты не указаны</span>}
        </div>

        <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-1 xl:justify-end xl:w-72">
          <Button size="sm" variant="ghost" className="min-h-10 bg-[var(--company-action-bg)] px-3 text-[var(--company-action-text)] hover:bg-[var(--company-action-hover)] hover:text-[var(--company-action-text)]" aria-haspopup="dialog"
            onClick={() => setRequisitesOpen(true)}>
            <Landmark className="h-3.5 w-3.5" aria-hidden="true" /> Реквизиты
          </Button>
          <Button size="sm" variant="secondary" className="min-h-10 px-3" onClick={() => onEdit(cp)} aria-label={`Изменить ${cp.name}`}>
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> Изменить
          </Button>
          <button type="button" onClick={() => onDelete(cp)} title={`Удалить ${cp.name}`} aria-label={`Удалить ${cp.name}`}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-red-300 hover:text-red-200 hover:bg-red-950/50 transition-colors">
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div id={contractsId} role="region" aria-labelledby={contractsHeadingId} hidden={!contractsExpanded} className="px-4 pb-3 sm:px-5">
        <div className="border-t border-[var(--color-border)] bg-[var(--company-contract-surface)] px-3">
          <h3 id={contractsHeadingId} className="sr-only">Действующие договоры {cp.name}</h3>
          {contractsLoading ? <p role="status" className="py-3 text-sm text-[var(--color-text-secondary)]">Загрузка договоров…</p>
            : contractsError ? <div role="alert" className="flex flex-wrap items-center gap-3 py-3">
              <p className="text-sm text-[var(--color-danger)]">Не удалось загрузить договоры.</p>
              <Button type="button" size="sm" variant="secondary" className="min-h-10" onClick={onRetryContracts}>Повторить загрузку</Button>
            </div>
            : contracts.length === 0 ? <p className="py-3 text-sm text-[var(--color-text-secondary)]">У компании нет действующих договоров.</p>
            : <ul className="divide-y divide-[var(--color-border)]">
              {contracts.map((contract) => <li key={contract.id} className="grid grid-cols-1 gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="flex min-w-0 items-start gap-2.5">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-secondary)]" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
                      <span className="text-xs font-medium tabular-nums text-[var(--company-contract-text)]">№ {contract.number}</span>
                      <span className="font-medium">{contract.title}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-secondary)] tabular-nums [overflow-wrap:anywhere]">{contractPeriod(contract)}</p>
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 pl-[26px] sm:justify-end sm:gap-4 sm:pl-0">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-sm">
                    <span className="font-medium tabular-nums text-[var(--color-text-primary)] [overflow-wrap:anywhere]">{formatMoney(contract.defaultAmount, contract.currency)}</span>
                            <span className="text-xs text-[var(--color-text-secondary)]">{CONTRACT_AMOUNT_LABELS[contract.billingPeriod ?? 'MONTHLY']}</span>
                  </div>
                  <Button type="button" size="sm" variant="ghost" className="min-h-10 shrink-0 px-2"
                    aria-label={`Открыть договор № ${contract.number} ${contract.title}`} onClick={() => onOpenContract(contract)}>Открыть</Button>
                </div>
              </li>)}
            </ul>}
        </div>
      </div>

      {requisitesOpen && <CompanyRequisitesModal cp={cp} onClose={() => setRequisitesOpen(false)} />}
    </li>
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
    <Modal onClose={() => { if (!mutation.isPending) onClose(); }} size="sm">
      <div className="p-6">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">
          Удалить компанию?
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-5">
          <span className="font-medium text-[var(--color-text-primary)]">{cp.name}</span> будет удалена. Это действие нельзя отменить.
        </p>
        {mutation.isError && <p role="alert" className="text-sm text-[var(--color-danger)] mb-4">
          {mutation.error instanceof ApiError ? mutation.error.message : 'Не удалось удалить компанию. Попробуйте ещё раз.'}
        </p>}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" onClick={() => mutation.mutate()} loading={mutation.isPending} loadingText="Удаление…">
            Удалить
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function CompaniesClient() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'asc' | 'desc'>('asc');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CounterpartyDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CounterpartyDto | null>(null);
  const [contractTarget, setContractTarget] = useState<Contract | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['companies'],
    queryFn: () => counterpartiesApi.list(),
  });
  const contractsQuery = useQuery({
    queryKey: ['contracts'],
    queryFn: () => contractsApi.list(),
  });
  const contractsByCompany = new Map<string, Contract[]>();
  for (const contract of contractsQuery.data ?? []) {
    if (!contract.active) continue;
    const companyContracts = contractsByCompany.get(contract.counterpartyId) ?? [];
    companyContracts.push(contract);
    contractsByCompany.set(contract.counterpartyId, companyContracts);
  }
  const query = search.trim().toLocaleLowerCase('ru');
  const compactQuery = query.replace(/[\s()-]/g, '');
  const companies = (data ?? []).filter((cp) => {
    const fields = [cp.name, cp.inn, cp.bin, cp.phone, cp.email, cp.address, cp.bankName, cp.bankAccount, cp.bankBik];
    return fields.some((value) => value?.toLocaleLowerCase('ru').includes(query) ||
      (compactQuery && value?.replace(/[\s()-]/g, '').toLocaleLowerCase('ru').includes(compactQuery)));
  }).sort((a, b) => (sort === 'asc' ? 1 : -1) * a.name.localeCompare(b.name, 'ru'));

  return (
    <div className={`p-4 sm:p-6 lg:p-8 h-full min-h-0 flex flex-col ${palette.list}`}>
      <header className="mb-6 flex flex-col gap-4 shrink-0 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-xl font-semibold">Компании</h1><p className="mt-1 text-sm text-[var(--color-text-secondary)]">Организации и партнёры</p></div>
        <Button className="min-h-11 w-full sm:w-auto" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" aria-hidden="true" />Добавить компанию</Button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5 shrink-0">
        <div className="relative w-full sm:max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-secondary)]" aria-hidden="true" />
          <Input type="search" aria-label="Поиск компаний" placeholder="Название, ИНН, телефон или email" value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-10 min-h-11 placeholder:text-[var(--color-text-secondary)] caret-[var(--color-accent)]" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="Очистить поиск"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>}
        </div>
        <div className="flex items-center justify-between gap-4 shrink-0">
          <p className="text-sm text-[var(--color-text-secondary)] tabular-nums" role="status">
            {isLoading ? 'Загрузка…' : isError ? 'Данные недоступны' : query ? `Найдено ${companies.length} из ${data?.length ?? 0}` : `Всего ${companies.length}`}
          </p>
          <Button size="sm" variant="secondary" className="min-h-10" onClick={() => setSort(sort === 'asc' ? 'desc' : 'asc')}
            aria-label={sort === 'asc' ? 'Сортировать от Я до А' : 'Сортировать от А до Я'}>
            <ArrowUpDown className="w-4 h-4" aria-hidden="true" />{sort === 'asc' ? 'А → Я' : 'Я → А'}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-4">
        {isLoading && <div aria-label="Загрузка компаний" className="divide-y divide-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border)]">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="p-5 space-y-3 motion-safe:animate-pulse">
            <div className="h-4 w-2/5 rounded bg-[var(--color-bg-elevated)]" /><div className="h-3 w-1/3 rounded bg-[var(--color-bg-elevated)]" />
          </div>)}
        </div>}
        {isError && <EmptyState icon={<Building2 className="w-6 h-6" />} title="Не удалось загрузить компании"
          description="Проверьте соединение и попробуйте снова" action={<Button variant="secondary" onClick={() => void refetch()}>Повторить загрузку</Button>} />}
        {!isLoading && !isError && companies.length === 0 && <EmptyState icon={<Building2 className="w-6 h-6" />}
          title={query ? 'Компании не найдены' : 'Нет компаний'}
          description={query ? 'Попробуйте название, ИНН или контакт компании' : 'Добавьте компанию, чтобы создавать для неё договоры и документы'}
          action={query ? <Button variant="secondary" onClick={() => setSearch('')}>Сбросить поиск</Button> : <Button onClick={() => setCreateOpen(true)}>Добавить компанию</Button>} />}
        {!isLoading && !isError && companies.length > 0 && <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div aria-hidden="true" className="hidden rounded-t-xl bg-[var(--company-heading-bg)] xl:grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.7fr)_auto] gap-4 px-5 py-3 border-b border-[var(--color-border)] text-xs font-medium text-[var(--company-contact-text)]">
            <span>Компания / ИНН</span><span>Контакты</span><span className="w-72 text-right">Действия</span>
          </div>
          <ul aria-label="Компании и партнёры">
            {companies.map((cp) => <CompanyRow key={cp.id} cp={cp} contracts={contractsByCompany.get(cp.id) ?? []}
              contractsLoading={contractsQuery.isPending} contractsError={contractsQuery.isError}
              onRetryContracts={() => void contractsQuery.refetch()} onOpenContract={setContractTarget}
              onEdit={setEditTarget} onDelete={setDeleteTarget} />)}
          </ul>
        </div>}
      </div>

      {(createOpen || editTarget) && <CompanyModal editing={editTarget}
        onClose={() => { setCreateOpen(false); setEditTarget(null); }}
        onSaved={() => { setCreateOpen(false); setEditTarget(null); }} />}
      {deleteTarget && <DeleteModal cp={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => setDeleteTarget(null)} />}
      {contractTarget && <ContractModal key={contractTarget.id} editing={contractTarget} onClose={() => setContractTarget(null)} />}
    </div>
  );
}
