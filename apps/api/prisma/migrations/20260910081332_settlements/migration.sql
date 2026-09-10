-- CreateEnum
CREATE TYPE "SettlementStepType" AS ENUM ('ISSUE_ACT', 'ISSUE_INVOICE', 'SEND', 'ISSUE_ESF', 'RECEIVE_SIGNED', 'RECEIVE_PAYMENT');

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "actCounter" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "actCounterYear" INTEGER,
ADD COLUMN     "actPrefix" TEXT NOT NULL DEFAULT 'АВР',
ADD COLUMN     "invoiceCounter" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "invoiceCounterYear" INTEGER,
ADD COLUMN     "invoicePrefix" TEXT NOT NULL DEFAULT 'СЧ';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "settlementId" TEXT,
ADD COLUMN     "sourceDocumentId" TEXT;

-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN     "settlementId" TEXT;

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "documentId" TEXT,
    "title" TEXT NOT NULL,
    "defaultAmount" DECIMAL(14,2) NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "currency" TEXT NOT NULL DEFAULT 'KGS',
    "billingDay" INTEGER NOT NULL DEFAULT 1,
    "paymentDueDays" INTEGER NOT NULL DEFAULT 10,
    "esfRequired" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KGS',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementStep" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "type" "SettlementStepType" NOT NULL,
    "order" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "documentId" TEXT,
    "fileAssetId" TEXT,
    "paymentId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "settlementId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "fileAssetId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_documentId_key" ON "Contract"("documentId");

-- CreateIndex
CREATE INDEX "Contract_organizationId_idx" ON "Contract"("organizationId");

-- CreateIndex
CREATE INDEX "Contract_organizationId_active_idx" ON "Contract"("organizationId", "active");

-- CreateIndex
CREATE INDEX "Contract_counterpartyId_idx" ON "Contract"("counterpartyId");

-- CreateIndex
CREATE INDEX "Settlement_organizationId_year_month_idx" ON "Settlement"("organizationId", "year", "month");

-- CreateIndex
CREATE INDEX "Settlement_counterpartyId_idx" ON "Settlement"("counterpartyId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_contractId_year_month_key" ON "Settlement"("contractId", "year", "month");

-- CreateIndex
CREATE INDEX "SettlementStep_settlementId_idx" ON "SettlementStep"("settlementId");

-- CreateIndex
CREATE INDEX "SettlementStep_dueDate_idx" ON "SettlementStep"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementStep_settlementId_type_key" ON "SettlementStep"("settlementId", "type");

-- CreateIndex
CREATE INDEX "Payment_organizationId_idx" ON "Payment"("organizationId");

-- CreateIndex
CREATE INDEX "Payment_settlementId_idx" ON "Payment"("settlementId");

-- CreateIndex
CREATE INDEX "Payment_counterpartyId_idx" ON "Payment"("counterpartyId");

-- CreateIndex
CREATE INDEX "Document_settlementId_idx" ON "Document"("settlementId");

-- CreateIndex
CREATE INDEX "Document_sourceDocumentId_idx" ON "Document"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "FileAsset_settlementId_idx" ON "FileAsset"("settlementId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementStep" ADD CONSTRAINT "SettlementStep_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementStep" ADD CONSTRAINT "SettlementStep_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementStep" ADD CONSTRAINT "SettlementStep_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementStep" ADD CONSTRAINT "SettlementStep_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementStep" ADD CONSTRAINT "SettlementStep_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
