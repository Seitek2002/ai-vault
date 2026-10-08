'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Building2, Landmark, Copy, Check, X } from 'lucide-react';
import type { CounterpartyDto } from '@ai-vault/types';
import { Button, Modal } from '@/components/ui';

export function CompanyRequisitesModal({ cp, onClose }: { cp: CounterpartyDto; onClose: () => void }) {
  const titleId = useId();
  const companyId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const details = [
    ['ИНН', cp.inn], ['ОКПО', cp.bin], ['Юридический адрес', cp.address],
    ['Банк', cp.bankName], ['Расчётный счёт', cp.bankAccount], ['БИК', cp.bankBik],
  ] as const;
  const groups = [
    { title: 'Регистрационные данные', icon: Building2, fields: details.slice(0, 3), wideLabel: 'Юридический адрес' },
    { title: 'Банковские реквизиты', icon: Landmark, fields: details.slice(3), wideLabel: 'Банк' },
  ];

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    const first = buttons?.[0], last = buttons?.[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText([cp.name, ...details.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`)].join('\n'));
      setCopyState('copied');
    } catch { setCopyState('error'); }
  }

  return <Modal onClose={onClose} className="max-w-2xl">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={companyId}
      onKeyDown={trapFocus} className="flex max-h-[85dvh] flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold">Реквизиты компании</h2>
          <p id={companyId} className="mt-1 text-sm text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">{cp.name}</p>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Закрыть реквизиты"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 overflow-y-auto px-5 py-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
          {groups.map(({ title, icon: Icon, fields, wideLabel }) => <section key={title}>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)]">
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {title}
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              {fields.map(([label, value]) => <div key={label} className={`min-w-0 ${label === wideLabel ? 'col-span-2' : ''}`}>
                <dt className="mb-1 text-xs text-[var(--color-text-secondary)]">{label}</dt>
                <dd className="text-sm tabular-nums text-[var(--color-text-primary)] [overflow-wrap:anywhere]">{value || 'Не указано'}</dd>
              </div>)}
            </dl>
          </section>)}
        </div>
        <p role="status" className={copyState === 'idle' ? 'sr-only' : 'mt-4 text-xs text-[var(--color-text-secondary)]'}>
          {copyState === 'error' ? 'Не удалось скопировать. Выделите реквизиты и скопируйте вручную.' : copyState === 'copied' ? 'Название и реквизиты скопированы' : ''}
        </p>
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
        <Button type="button" variant="ghost" className="min-h-10" onClick={onClose}>Закрыть</Button>
        <Button type="button" size="sm" className="min-h-10" onClick={() => void copyDetails()}>
          {copyState === 'copied' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copyState === 'copied' ? 'Скопировано' : 'Копировать реквизиты'}
        </Button>
      </footer>
    </section>
  </Modal>;
}
