BEGIN;
CREATE TYPE "ContractBillingPeriod" AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME');
ALTER TABLE "Contract"
  ADD COLUMN "billingPeriod" "ContractBillingPeriod" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "terminationDate" TIMESTAMP(3),
  ADD COLUMN "terminationPdfId" TEXT;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_terminationPdfId_fkey"
  FOREIGN KEY ("terminationPdfId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_termination_notice_check"
  CHECK ("terminationDate" IS NULL OR "terminationPdfId" IS NOT NULL);
COMMIT;
