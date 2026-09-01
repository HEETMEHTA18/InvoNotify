-- Keep prediction and payment settlement separate. Prior versions reused
-- RecoveryCase.expectedRecovery (a model forecast) as a "recovered" total.
-- That made a sent reminder look like cash collected. These two amounts form
-- the recovery settlement ledger: a case starts with amountAtRisk and only
-- confirmed, idempotent payment records may increase recoveredAmount.

ALTER TABLE "RecoveryCase"
  ADD COLUMN IF NOT EXISTS "amountAtRisk" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "recoveredAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Existing records predate a reliable attribution snapshot. Populate the
-- at-risk denominator conservatively from the current outstanding balance;
-- leave recoveredAmount at zero rather than retroactively claiming money that
-- cannot be proven to have followed a recovery action. Re-seeding the demo
-- creates explicitly tagged, truthful settled examples.
UPDATE "RecoveryCase" rc
SET "amountAtRisk" = GREATEST(0, COALESCE(i."balance", 0))
FROM "Invoice" i
WHERE i.id = rc."invoiceId"
  AND rc."amountAtRisk" = 0;

-- Provider callbacks must be idempotent across event types. Preserve legacy
-- rows rather than deleting them, but make repeated historic references
-- explicit so a real uniqueness guarantee can be introduced safely.
UPDATE "Payment"
SET "transactionId" = NULL
WHERE "transactionId" IS NOT NULL
  AND BTRIM("transactionId") = '';

WITH ranked_payments AS (
  SELECT
    id,
    "transactionId",
    ROW_NUMBER() OVER (PARTITION BY "transactionId" ORDER BY id) AS duplicate_rank
  FROM "Payment"
  WHERE "transactionId" IS NOT NULL
)
UPDATE "Payment" payment
SET "transactionId" = payment."transactionId" || ':legacy-duplicate-' || payment.id
FROM ranked_payments ranked
WHERE payment.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_transactionId_key"
  ON "Payment"("transactionId");

CREATE TABLE IF NOT EXISTS "RecoverySettlement" (
  "id" SERIAL NOT NULL,
  "recoveryCaseId" INTEGER NOT NULL,
  "paymentId" INTEGER NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "attribution" TEXT NOT NULL DEFAULT 'UNATTRIBUTED',
  "attributedAgentRunId" INTEGER,
  "attributedAgentActionId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RecoverySettlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RecoverySettlement_paymentId_key"
  ON "RecoverySettlement"("paymentId");
CREATE INDEX IF NOT EXISTS "RecoverySettlement_recoveryCaseId_createdAt_idx"
  ON "RecoverySettlement"("recoveryCaseId", "createdAt");
CREATE INDEX IF NOT EXISTS "RecoverySettlement_attributedAgentRunId_idx"
  ON "RecoverySettlement"("attributedAgentRunId");
CREATE INDEX IF NOT EXISTS "RecoverySettlement_attributedAgentActionId_idx"
  ON "RecoverySettlement"("attributedAgentActionId");

ALTER TABLE "RecoverySettlement"
  ADD CONSTRAINT "RecoverySettlement_recoveryCaseId_fkey"
  FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoverySettlement"
  ADD CONSTRAINT "RecoverySettlement_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
