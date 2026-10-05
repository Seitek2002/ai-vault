ALTER TABLE "Settlement"
  ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "label" TEXT;

ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_sequence_positive" CHECK ("sequence" > 0);

DROP INDEX "Settlement_contractId_year_month_key";
CREATE UNIQUE INDEX "Settlement_contractId_year_month_sequence_key"
  ON "Settlement"("contractId", "year", "month", "sequence");
