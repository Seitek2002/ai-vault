BEGIN;
LOCK TABLE "Contract" IN SHARE ROW EXCLUSIVE MODE;
-- Keep manual MMYY suffixes. Prisma timestamps are stored in UTC; use Bishkek
-- time only for the fallback creation timestamp, not for calendar start dates.
UPDATE "Contract"
SET "number" = regexp_replace(btrim("number"), '/+$', '') || '/' ||
  to_char(COALESCE("startDate", "createdAt" + interval '6 hours'), 'MMYY')
WHERE btrim("number") !~ '/(0[1-9]|1[0-2])[0-9]{2}$';
COMMIT;
