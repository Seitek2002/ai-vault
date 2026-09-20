import { api } from './client';

export type EsfStatus = 'NEW' | 'SENT' | 'ACCEPTED' | 'REVOKED' | 'REJECTED' | 'UNKNOWN';

export interface EsfInvoice {
  id: string;
  uuid: string;
  number: string | null;
  status: EsfStatus;
  deliveryDate: string | null;
  issuedOn: string | null;
  buyerInn: string | null;
  buyerName: string;
  amount: number;
  crmRef: string | null;
  note: string | null;
  counterpartyId: string | null;
  counterpartyName: string | null;
  settlementId: string | null;
  fileAssetId: string | null;
  matchNote: string | null;
  hiddenAt: string | null;
  importedAt: string;
}

export interface EsfSyncReport {
  fetched: number;
  created: number;
  updated: number;
  matched: number;
  unmatched: number;
  errors: string[];
}

export const ESF_STATUS_LABELS: Record<EsfStatus, string> = {
  NEW: 'Черновик',
  SENT: 'Отправлена',
  ACCEPTED: 'Принята',
  REVOKED: 'Отозвана',
  REJECTED: 'Отклонена',
  UNKNOWN: 'Неизвестно',
};

const pinHeader = (pin: string): Record<string, string> => (pin ? { 'x-esf-hidden-pin': pin } : {});

export const esfApi = {
  list: (params?: { unmatchedOnly?: boolean; year?: number; month?: number }) => {
    const q = new URLSearchParams();
    if (params?.unmatchedOnly) q.set('unmatchedOnly', 'true');
    if (params?.year) q.set('year', String(params.year));
    if (params?.month) q.set('month', String(params.month));
    const qs = q.toString();
    return api.get<EsfInvoice[]>(`/esf/invoices${qs ? `?${qs}` : ''}`);
  },
  /** Скрытые — только с PIN из настроек (заголовком, чтобы не светить в URL). */
  listHidden: (pin: string) => api.get<EsfInvoice[]>('/esf/invoices?hiddenOnly=true', pinHeader(pin)),
  hiddenCount: () => api.get<{ count: number }>('/esf/invoices/hidden-count'),
  sync: () => api.post<EsfSyncReport>('/esf/sync', {}),
  /** Черновик на портале для расчёта — подписать и отправить нужно на портале. */
  createDraft: (settlementId: string) =>
    api.post<EsfInvoice>(`/esf/settlements/${settlementId}/draft`, {}),
  portalListUrl: 'https://esf.salyk.kg/esf/view/document/realization_list.xhtml',
  checkConnection: (login: string, password: string) =>
    api.post<{ ok: true }>('/esf/check-connection', { login, password }),
  attach: (id: string, settlementId: string) =>
    api.post<EsfInvoice>(`/esf/invoices/${id}/attach`, { settlementId }),
  detach: (id: string) => api.post<EsfInvoice>(`/esf/invoices/${id}/detach`, {}),
  hide: (id: string) => api.post<EsfInvoice>(`/esf/invoices/${id}/hide`, {}),
  unhide: (id: string, pin: string) =>
    api.post<EsfInvoice>(`/esf/invoices/${id}/unhide`, {}, pinHeader(pin)),
  /** Официальный PDF на портале — публичная страница проверки по QR. */
  portalPdfUrl: (uuid: string) => `https://esf.salyk.kg/esf/check-esf?documentUUID=${uuid}`,
};
