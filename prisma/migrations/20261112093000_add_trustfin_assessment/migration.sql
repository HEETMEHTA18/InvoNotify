-- Audit trail for the optional TrustFin-SLM verifier (HEETMEHTA18/trust_fin).
--
-- The verifier can only tighten a policy ALLOW into a human review, so every
-- evaluation is persisted — including the case where the service was down and
-- the existing policy decision stood. That keeps "was this decision verified?"
-- answerable after the fact without reading application logs.
CREATE TABLE "TrustFinAssessment" (
    "id" SERIAL NOT NULL,
    "recoveryCaseId" INTEGER NOT NULL,
    "actionId" INTEGER,
    "source" TEXT NOT NULL,
    "modelVersion" TEXT,
    "risk" DECIMAL(5,4),
    "threshold" DECIMAL(5,4),
    "abstained" BOOLEAN NOT NULL DEFAULT false,
    "verdict" TEXT NOT NULL,
    "reasons" JSONB,
    "features" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustFinAssessment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrustFinAssessment_recoveryCaseId_createdAt_idx"
ON "TrustFinAssessment"("recoveryCaseId", "createdAt");

CREATE INDEX "TrustFinAssessment_verdict_createdAt_idx"
ON "TrustFinAssessment"("verdict", "createdAt");

ALTER TABLE "TrustFinAssessment"
ADD CONSTRAINT "TrustFinAssessment_recoveryCaseId_fkey"
FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
