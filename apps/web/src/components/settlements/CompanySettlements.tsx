'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from "@/components/ui";
import {
  MONTH_NAMES,
  formatMoney,
  settlementsApi,
  type Settlement,
} from '@/lib/api/settlements';

const STATUS_META: Record<Settlement['status'], { label: string; className: string }> = {
  closed: { label: 'Закрыт', className: 'bg-[rgba(74,222,128,0.12)] text-[#4ADE80]' },
  overdue: { label: 'Просрочен', className: 'bg-[rgba(248,113,113,0.12)] text-[#F87171]' },
  waiting_partner: { label: 'Ждём партнёра', className: 'bg-[rgba(251,191,36,0.12)] text-[#FBBF24]' },
  waiting_us: { label: 'За нами', className: 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' },
};

/** История расчётов по месяцам на карточке партнёра. */
export function CompanySettlements({ counterpartyId }: { counterpartyId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['settlements', 'counterparty', counterpartyId],
    queryFn: () => settlementsApi.byCounterparty(counterpartyId),
  });

  const settlements = data ?? [];
  const totalDue = settlements.reduce((sum, s) => sum + s.dueAmount, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Расчёты {settlements.length > 0 && `(${settlements.length})`}
        </p>
        {totalDue > 0 && (
          <p className="text-xs text-[#FBBF24]">долг {formatMoney(totalDue)}</p>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : settlements.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-[var(--color-border)] rounded-xl">
          <p className="text-sm text-[var(--color-text-muted)]">Расчётов нет</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Заведите{' '}
            <Link href="/contracts" className="text-[var(--color-accent)] hover:underline">
              договор
            </Link>{' '}
            — расчёты будут создаваться каждый месяц
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {settlements.map((s) => {
            const done = s.steps.filter((step) => step.doneAt).length;
            return (
              <li key={s.id}>
                <Link
                  href={`/settlements/${s.id}`}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:border-[var(--color-accent-border)] transition-colors"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-[var(--color-text-primary)]">
                      {MONTH_NAMES[s.month - 1]} {s.year}
                    </span>
                    <span className="block text-xs text-[var(--color-text-muted)]">
                      шагов пройдено {done} из {s.steps.length}
                    </span>
                  </span>
                  <span className="text-sm text-[var(--color-text-primary)] whitespace-nowrap shrink-0">
                    {formatMoney(s.amount, s.currency)}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_META[s.status].className}`}
                  >
                    {STATUS_META[s.status].label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
