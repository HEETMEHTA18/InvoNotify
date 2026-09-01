-- Complete the persisted evidence and idempotent execution foundation required
-- by the recovery module APIs. Existing merchants remain administrators until a
-- role is explicitly assigned.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'ADMIN';

ALTER TABLE "RecoveryDecision"
  ADD COLUMN IF NOT EXISTS "policyVersion" TEXT NOT NULL DEFAULT 'default-v1',
  ADD COLUMN IF NOT EXISTS "strategyVersion" TEXT NOT NULL DEFAULT 'baseline-v1';

ALTER TABLE "RecoveryAction"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "policyVersion" TEXT NOT NULL DEFAULT 'default-v1';

CREATE UNIQUE INDEX IF NOT EXISTS "RecoveryAction_idempotencyKey_key"
  ON "RecoveryAction"("idempotencyKey");

CREATE TABLE IF NOT EXISTS "RiskAssessment" (
  "id" SERIAL PRIMARY KEY,
  "recoveryCaseId" INTEGER NOT NULL,
  "riskScore" DECIMAL(5,4) NOT NULL,
  "recoverabilityProbability" DECIMAL(5,4) NOT NULL,
  "priority" TEXT NOT NULL,
  "estimatedRecoverableAmount" DECIMAL(12,2) NOT NULL,
  "modelName" TEXT NOT NULL,
  "modelVersion" TEXT NOT NULL,
  "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "explanation" JSONB,
  CONSTRAINT "RiskAssessment_recoveryCaseId_fkey"
    FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RiskAssessment_recoveryCaseId_scoredAt_idx"
  ON "RiskAssessment"("recoveryCaseId", "scoredAt");
CREATE INDEX IF NOT EXISTS "RiskAssessment_priority_scoredAt_idx"
  ON "RiskAssessment"("priority", "scoredAt");

CREATE TABLE IF NOT EXISTS "FeatureSnapshot" (
  "id" SERIAL PRIMARY KEY,
  "riskAssessmentId" INTEGER NOT NULL,
  "features" JSONB NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeatureSnapshot_riskAssessmentId_fkey"
    FOREIGN KEY ("riskAssessmentId") REFERENCES "RiskAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FeatureSnapshot_riskAssessmentId_idx"
  ON "FeatureSnapshot"("riskAssessmentId");
