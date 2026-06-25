export enum DocumentType {
  KP = 'KP',
  CONTRACT = 'CONTRACT',
  INVOICE_FACTURA = 'INVOICE_FACTURA',
  INVOICE_PAYMENT = 'INVOICE_PAYMENT',
  AVR = 'AVR',
}

export enum DocumentStatus {
  DRAFT = 'DRAFT',
  FINAL = 'FINAL',
  SENT = 'SENT',
  SIGNED = 'SIGNED',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
}

export enum ChangeAuthor {
  AI = 'AI',
  USER = 'USER',
}

export enum ChangeStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export enum ChangeType {
  INSERT = 'INSERT',
  DELETE = 'DELETE',
}

export interface CounterpartyDto {
  id: string;
  name: string;
  inn?: string;
  bin?: string;
  address?: string;
  phone?: string;
  email?: string;
  bankAccount?: string;
  bankName?: string;
  bankBik?: string;
}

export interface DocumentMetaKp {
  type: DocumentType.KP;
  validUntil?: string;
  currency: string;
  vatRate: number;
  totalAmount: number;
  totalVat: number;
}

export interface DocumentMetaContract {
  type: DocumentType.CONTRACT;
  contractNumber?: string;
  startDate?: string;
  endDate?: string;
  currency: string;
  totalAmount?: number;
}

export interface DocumentMetaInvoiceFactura {
  type: DocumentType.INVOICE_FACTURA;
  invoiceNumber?: string;
  invoiceDate?: string;
  currency: string;
  vatRate: number;
  totalAmount: number;
  totalVat: number;
}

export interface DocumentMetaInvoicePayment {
  type: DocumentType.INVOICE_PAYMENT;
  invoiceNumber?: string;
  invoiceDate?: string;
  currency: string;
  totalAmount: number;
}

export interface DocumentMetaAvr {
  type: DocumentType.AVR;
  actNumber?: string;
  actDate?: string;
  currency: string;
  totalAmount: number;
}

export type DocumentMeta =
  | DocumentMetaKp
  | DocumentMetaContract
  | DocumentMetaInvoiceFactura
  | DocumentMetaInvoicePayment
  | DocumentMetaAvr;

export interface FileAssetDto {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  s3Url: string;
}

export interface DocumentDto {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  title: string;
  number?: string;
  counterpartyId?: string;
  counterparty?: CounterpartyDto;
  meta: DocumentMeta;
  bodyJson: unknown;
  fileAssets?: FileAssetDto[];
  createdAt: string;
  updatedAt: string;
  createdById: string;
}

export interface DocumentChangeDto {
  id: string;
  documentId: string;
  versionId: string;
  type: ChangeType;
  author: ChangeAuthor;
  status: ChangeStatus;
  from: number;
  to: number;
  content: string;
  createdAt: string;
}

export interface DocumentVersionDto {
  id: string;
  documentId: string;
  version: number;
  bodyJson: unknown;
  createdAt: string;
  createdById: string;
  changes: DocumentChangeDto[];
}
