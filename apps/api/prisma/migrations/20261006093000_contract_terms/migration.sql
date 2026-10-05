CREATE TYPE "ContractTermUnit" AS ENUM ('MONTHS', 'YEARS');
ALTER TABLE "Contract" ADD COLUMN "termValue" INTEGER, ADD COLUMN "termUnit" "ContractTermUnit";
-- Convert existing exact calendar terms; retain other end dates unchanged.
WITH terms AS (
  SELECT "id", "startDate", "endDate",
    ((EXTRACT(YEAR FROM "endDate") - EXTRACT(YEAR FROM "startDate")) * 12
      + EXTRACT(MONTH FROM "endDate") - EXTRACT(MONTH FROM "startDate"))::INTEGER AS months
  FROM "Contract" WHERE "startDate" IS NOT NULL AND "endDate" IS NOT NULL
)
UPDATE "Contract" c SET
  "termValue" = CASE WHEN t.months % 12 = 0 THEN t.months / 12 ELSE t.months END,
  "termUnit" = CASE WHEN t.months % 12 = 0 THEN 'YEARS'::"ContractTermUnit" ELSE 'MONTHS'::"ContractTermUnit" END
FROM terms t WHERE c."id" = t."id" AND t.months BETWEEN 1 AND 1200
  AND (t."startDate" + t.months * INTERVAL '1 month') = t."endDate";
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_term_check" CHECK (
  ("termValue" IS NULL AND "termUnit" IS NULL) OR
  ("termValue" IS NOT NULL AND "termUnit" IS NOT NULL AND "termValue" >= 1 AND
    (("termUnit" = 'MONTHS' AND "termValue" <= 1200) OR ("termUnit" = 'YEARS' AND "termValue" <= 100)))
);
