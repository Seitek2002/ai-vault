CREATE TABLE "EsfSettlementLink" (
    "invoiceId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EsfSettlementLink_pkey" PRIMARY KEY ("invoiceId", "settlementId")
);

CREATE UNIQUE INDEX "EsfSettlementLink_settlementId_key" ON "EsfSettlementLink"("settlementId");
ALTER TABLE "EsfSettlementLink" ADD CONSTRAINT "EsfSettlementLink_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "EsfInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EsfSettlementLink" ADD CONSTRAINT "EsfSettlementLink_settlementId_fkey"
    FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "EsfSettlementLink" ("invoiceId", "settlementId", "createdAt")
SELECT "id", "settlementId", "importedAt" FROM "EsfInvoice" WHERE "settlementId" IS NOT NULL;
