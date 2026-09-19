-- CreateEnum
CREATE TYPE "EsfStatus" AS ENUM ('NEW', 'SENT', 'ACCEPTED', 'REVOKED', 'REJECTED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "esfLastSyncAt" TIMESTAMP(3),
ADD COLUMN     "esfLastSyncError" TEXT,
ADD COLUMN     "esfLogin" TEXT,
ADD COLUMN     "esfPasswordEnc" TEXT;

-- CreateTable
CREATE TABLE "EsfInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "number" TEXT,
    "status" "EsfStatus" NOT NULL DEFAULT 'UNKNOWN',
    "createdOn" TIMESTAMP(3),
    "deliveryDate" TIMESTAMP(3),
    "issuedOn" TIMESTAMP(3),
    "buyerInn" TEXT,
    "buyerName" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "crmRef" TEXT,
    "note" TEXT,
    "counterpartyId" TEXT,
    "settlementId" TEXT,
    "fileAssetId" TEXT,
    "matchNote" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EsfInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EsfInvoice_uuid_key" ON "EsfInvoice"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "EsfInvoice_fileAssetId_key" ON "EsfInvoice"("fileAssetId");

-- CreateIndex
CREATE INDEX "EsfInvoice_organizationId_idx" ON "EsfInvoice"("organizationId");

-- CreateIndex
CREATE INDEX "EsfInvoice_organizationId_settlementId_idx" ON "EsfInvoice"("organizationId", "settlementId");

-- CreateIndex
CREATE INDEX "EsfInvoice_counterpartyId_idx" ON "EsfInvoice"("counterpartyId");

-- AddForeignKey
ALTER TABLE "EsfInvoice" ADD CONSTRAINT "EsfInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsfInvoice" ADD CONSTRAINT "EsfInvoice_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsfInvoice" ADD CONSTRAINT "EsfInvoice_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsfInvoice" ADD CONSTRAINT "EsfInvoice_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

