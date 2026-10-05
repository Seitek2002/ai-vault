ALTER TABLE "Contract" ADD COLUMN "number" TEXT;
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY "createdAt", "id") AS n
  FROM "Contract"
)
UPDATE "Contract" c SET "number" = 'ДГ-' || LPAD(numbered.n::TEXT, GREATEST(6, LENGTH(numbered.n::TEXT)), '0')
FROM numbered WHERE c."id" = numbered."id";
ALTER TABLE "Contract" ALTER COLUMN "number" SET NOT NULL;
CREATE UNIQUE INDEX "Contract_organizationId_number_key" ON "Contract"("organizationId", "number");
CREATE TABLE "ContractNumberCounter" (
  "organizationId" TEXT NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ContractNumberCounter_pkey" PRIMARY KEY ("organizationId")
);
ALTER TABLE "ContractNumberCounter" ADD CONSTRAINT "ContractNumberCounter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "ContractNumberCounter" ("organizationId", "lastNumber")
SELECT "organizationId", COUNT(*)::INTEGER FROM "Contract" GROUP BY "organizationId";
