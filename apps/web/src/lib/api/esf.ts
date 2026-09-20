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

export const esfApi = {
  list: (params?: { unmatchedOnly?: boolean; hiddenOnly?: boolean; year?: number; month?: number }) => {
    const q = new URLSearchParams();
    if (params?.unmatchedOnly) q.set('unmatchedOnly', 'true');
    if (params?.hiddenOnly) q.set('hiddenOnly', 'true');
    if (params?.year) q.set('year', String(params.year));
    if (params?.month) q.set('month', String(params.month));
    const qs = q.toString();
    return api.get<EsfInvoice[]>(`/esf/invoices${qs ? `?${qs}` : ''}`);
  },
  sync: () => api.post<EsfSyncReport>('/esf/sync', {}),
  checkConnection: (login: string, password: string) =>
    api.post<{ ok: true }>('/esf/check-connection', { login, password }),
  attach: (id: string, settlementId: string) =>
    api.post<EsfInvoice>(`/esf/invoices/${id}/attach`, { settlementId }),
  detach: (id: string) => api.post<EsfInvoice>(`/esf/invoices/${id}/detach`, {}),
  hide: (id: string) => api.post<EsfInvoice>(`/esf/invoices/${id}/hide`, {}),
  unhide: (id: string) => api.post<EsfInvoice>(`/esf/invoices/${id}/unhide`, {}),
  /** Официальный PDF на портале — публичная страница проверки по QR. */
  portalPdfUrl: (uuid: string) => `https://esf.salyk.kg/esf/check-esf?documentUUID=${uuid}`,
};
