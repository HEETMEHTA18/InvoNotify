-- Close the enumerable-ID hole on the public pay routes (OWASP API1:2023 BOLA).
--
-- The customer-facing pay page used to be keyed on Invoice.id, a sequential
-- primary key, on an endpoint with no authentication. Anyone could walk
-- /api/public/invoices/1..N and read every merchant's customer names, amounts
-- and line items. The public routes are now keyed on this unguessable token
-- instead, so possession of the link *is* the authorization.

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "publicToken" TEXT;

-- Backfill every existing row with a distinct 256-bit random token rendered as
-- 64 lowercase hex chars. gen_random_bytes needs pgcrypto, which may not be
-- available on every host, so fall back to a md5-of-random chain that still
-- yields 64 hex chars from two independent random draws per row.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    UPDATE "Invoice"
    SET "publicToken" = encode(gen_random_bytes(32), 'hex')
    WHERE "publicToken" IS NULL;
  EXCEPTION WHEN OTHERS THEN
    UPDATE "Invoice"
    SET "publicToken" = md5(random()::text || clock_timestamp()::text || id::text)
                     || md5(random()::text || clock_timestamp()::text || id::text)
    WHERE "publicToken" IS NULL;
  END;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_publicToken_key" ON "Invoice"("publicToken");

-- Tenant column for agent sweeps. /api/ai/metrics listed recent AgentRun rows
-- with no owner filter, exposing every other merchant's sweep totals and
-- recovered amounts.
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

-- Best-effort backfill: a run's owner is the owner of the invoices it acted on.
UPDATE "AgentRun" r
SET "ownerUserId" = sub."ownerUserId"
FROM (
  SELECT a."agentRunId" AS run_id,
         COALESCE(i."ownerUserId", i."userId") AS "ownerUserId"
  FROM "AgentAction" a
  JOIN "Invoice" i ON i.id = a."invoiceId"
  WHERE a."agentRunId" IS NOT NULL
    AND COALESCE(i."ownerUserId", i."userId") IS NOT NULL
  GROUP BY a."agentRunId", COALESCE(i."ownerUserId", i."userId")
) AS sub
WHERE r.id = sub.run_id
  AND r."ownerUserId" IS NULL;

CREATE INDEX IF NOT EXISTS "AgentRun_ownerUserId_startedAt_idx"
  ON "AgentRun"("ownerUserId", "startedAt");
