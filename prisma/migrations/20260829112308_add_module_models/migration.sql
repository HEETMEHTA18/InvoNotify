-- CreateTable
CREATE TABLE "RevenueEvent" (
    "id" SERIAL NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "failureCode" TEXT,
    "failureReason" TEXT,
    "rawPayload" JSONB NOT NULL,
    "normalizedAt" TIMESTAMP(3),
    "recoveryCaseId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventPayload" (
    "id" SERIAL NOT NULL,
    "revenueEventId" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventPayload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventIngestionError" (
    "id" SERIAL NOT NULL,
    "revenueEventId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'ERROR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventIngestionError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailureTaxonomy" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "actionFamily" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FailureTaxonomy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailureDiagnosis" (
    "id" SERIAL NOT NULL,
    "recoveryCaseId" INTEGER NOT NULL,
    "taxonomyCode" TEXT,
    "canonicalCause" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "reasoning" TEXT,
    "evidence" JSONB,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "modelVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FailureDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticEvidence" (
    "id" SERIAL NOT NULL,
    "diagnosisId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "rawValue" JSONB NOT NULL,
    "interpretation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryDecision" (
    "id" SERIAL NOT NULL,
    "recoveryCaseId" INTEGER NOT NULL,
    "agentRunId" INTEGER,
    "selectedAction" TEXT NOT NULL,
    "channel" TEXT,
    "expectedRecovery" DECIMAL(12,2) NOT NULL,
    "expectedProbability" DECIMAL(5,4) NOT NULL,
    "rationale" TEXT NOT NULL,
    "riskScore" DECIMAL(5,4) NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "RecoveryDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionCandidate" (
    "id" SERIAL NOT NULL,
    "decisionId" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "channel" TEXT,
    "expectedRecovery" DECIMAL(12,2) NOT NULL,
    "expectedProbability" DECIMAL(5,4) NOT NULL,
    "score" DECIMAL(5,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "policyResult" TEXT NOT NULL,
    "policyReasons" JSONB,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryPolicy" (
    "id" SERIAL NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyVersion" (
    "id" SERIAL NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "modelConfig" JSONB,
    "policyConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "deployedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryAction" (
    "id" SERIAL NOT NULL,
    "recoveryCaseId" INTEGER NOT NULL,
    "decisionId" INTEGER,
    "actionType" TEXT NOT NULL,
    "channel" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "executionStatus" TEXT,
    "provider" TEXT,
    "providerResponse" JSONB,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "RecoveryAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionExecution" (
    "id" SERIAL NOT NULL,
    "actionId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromiseToPay" (
    "id" SERIAL NOT NULL,
    "recoveryCaseId" INTEGER NOT NULL,
    "promisedAmount" DECIMAL(12,2) NOT NULL,
    "promisedAt" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'OPERATOR',
    "confidence" DECIMAL(5,4),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "fulfilledAt" TIMESTAMP(3),
    "fulfilledAmount" DECIMAL(12,2),
    "missedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromiseToPay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromiseReminder" (
    "id" SERIAL NOT NULL,
    "promiseId" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromiseReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromiseEvent" (
    "id" SERIAL NOT NULL,
    "promiseId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromiseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardrailEvaluation" (
    "id" SERIAL NOT NULL,
    "recoveryCaseId" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "channel" TEXT,
    "result" TEXT NOT NULL,
    "reasons" JSONB,
    "riskScore" DECIMAL(5,4) NOT NULL,
    "amountAtRisk" DECIMAL(12,2) NOT NULL,
    "attemptCount" INTEGER NOT NULL,
    "contactCount" INTEGER NOT NULL,
    "optOut" BOOLEAN NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardrailEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" SERIAL NOT NULL,
    "recoveryCaseId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "assignedTo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanReview" (
    "id" SERIAL NOT NULL,
    "recoveryCaseId" INTEGER NOT NULL,
    "actionId" INTEGER,
    "reviewerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decision" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "HumanReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "recoveryCaseId" INTEGER,
    "actionId" INTEGER,
    "eventType" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryMetricsDaily" (
    "id" SERIAL NOT NULL,
    "merchantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "casesDetected" INTEGER NOT NULL DEFAULT 0,
    "casesDiagnosed" INTEGER NOT NULL DEFAULT 0,
    "casesActioned" INTEGER NOT NULL DEFAULT 0,
    "casesRecovered" INTEGER NOT NULL DEFAULT 0,
    "casesStopped" INTEGER NOT NULL DEFAULT 0,
    "casesEscalated" INTEGER NOT NULL DEFAULT 0,
    "amountAtRisk" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amountRecovered" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "recoveryRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "avgDaysToRecover" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryMetricsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchRun" (
    "id" SERIAL NOT NULL,
    "merchantId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "totalEvents" INTEGER NOT NULL DEFAULT 0,
    "acceptedEvents" INTEGER NOT NULL DEFAULT 0,
    "rejectedEvents" INTEGER NOT NULL DEFAULT 0,
    "duplicateEvents" INTEGER NOT NULL DEFAULT 0,
    "casesCreated" INTEGER NOT NULL DEFAULT 0,
    "casesUpdated" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "summary" JSONB,
    "error" TEXT,

    CONSTRAINT "BatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RevenueEvent_sourceEventId_key" ON "RevenueEvent"("sourceEventId");

-- CreateIndex
CREATE INDEX "RevenueEvent_merchantId_idx" ON "RevenueEvent"("merchantId");

-- CreateIndex
CREATE INDEX "RevenueEvent_customerId_idx" ON "RevenueEvent"("customerId");

-- CreateIndex
CREATE INDEX "RevenueEvent_status_idx" ON "RevenueEvent"("status");

-- CreateIndex
CREATE INDEX "RevenueEvent_eventType_idx" ON "RevenueEvent"("eventType");

-- CreateIndex
CREATE INDEX "RevenueEvent_source_idx" ON "RevenueEvent"("source");

-- CreateIndex
CREATE INDEX "RevenueEvent_createdAt_idx" ON "RevenueEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueEvent_source_sourceEventId_key" ON "RevenueEvent"("source", "sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventPayload_revenueEventId_key" ON "EventPayload"("revenueEventId");

-- CreateIndex
CREATE INDEX "EventIngestionError_revenueEventId_idx" ON "EventIngestionError"("revenueEventId");

-- CreateIndex
CREATE INDEX "EventIngestionError_code_idx" ON "EventIngestionError"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FailureTaxonomy_code_key" ON "FailureTaxonomy"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FailureDiagnosis_recoveryCaseId_key" ON "FailureDiagnosis"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "FailureDiagnosis_recoveryCaseId_idx" ON "FailureDiagnosis"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "FailureDiagnosis_taxonomyCode_idx" ON "FailureDiagnosis"("taxonomyCode");

-- CreateIndex
CREATE INDEX "FailureDiagnosis_category_idx" ON "FailureDiagnosis"("category");

-- CreateIndex
CREATE INDEX "FailureDiagnosis_status_idx" ON "FailureDiagnosis"("status");

-- CreateIndex
CREATE INDEX "DiagnosticEvidence_diagnosisId_idx" ON "DiagnosticEvidence"("diagnosisId");

-- CreateIndex
CREATE INDEX "RecoveryDecision_recoveryCaseId_idx" ON "RecoveryDecision"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "RecoveryDecision_agentRunId_idx" ON "RecoveryDecision"("agentRunId");

-- CreateIndex
CREATE INDEX "RecoveryDecision_status_idx" ON "RecoveryDecision"("status");

-- CreateIndex
CREATE INDEX "RecoveryDecision_decidedAt_idx" ON "RecoveryDecision"("decidedAt");

-- CreateIndex
CREATE INDEX "DecisionCandidate_decisionId_idx" ON "DecisionCandidate"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryPolicy_merchantId_key" ON "RecoveryPolicy"("merchantId");

-- CreateIndex
CREATE INDEX "RecoveryPolicy_merchantId_idx" ON "RecoveryPolicy"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersion_version_key" ON "StrategyVersion"("version");

-- CreateIndex
CREATE INDEX "StrategyVersion_isActive_idx" ON "StrategyVersion"("isActive");

-- CreateIndex
CREATE INDEX "RecoveryAction_recoveryCaseId_idx" ON "RecoveryAction"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "RecoveryAction_decisionId_idx" ON "RecoveryAction"("decisionId");

-- CreateIndex
CREATE INDEX "RecoveryAction_status_idx" ON "RecoveryAction"("status");

-- CreateIndex
CREATE INDEX "RecoveryAction_scheduledAt_idx" ON "RecoveryAction"("scheduledAt");

-- CreateIndex
CREATE INDEX "ActionExecution_actionId_idx" ON "ActionExecution"("actionId");

-- CreateIndex
CREATE INDEX "ActionExecution_createdAt_idx" ON "ActionExecution"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromiseToPay_recoveryCaseId_key" ON "PromiseToPay"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "PromiseToPay_recoveryCaseId_idx" ON "PromiseToPay"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "PromiseToPay_status_idx" ON "PromiseToPay"("status");

-- CreateIndex
CREATE INDEX "PromiseToPay_promisedAt_idx" ON "PromiseToPay"("promisedAt");

-- CreateIndex
CREATE INDEX "PromiseReminder_promiseId_idx" ON "PromiseReminder"("promiseId");

-- CreateIndex
CREATE INDEX "PromiseReminder_scheduledAt_idx" ON "PromiseReminder"("scheduledAt");

-- CreateIndex
CREATE INDEX "PromiseReminder_status_idx" ON "PromiseReminder"("status");

-- CreateIndex
CREATE INDEX "PromiseEvent_promiseId_idx" ON "PromiseEvent"("promiseId");

-- CreateIndex
CREATE INDEX "PromiseEvent_eventType_idx" ON "PromiseEvent"("eventType");

-- CreateIndex
CREATE INDEX "PromiseEvent_createdAt_idx" ON "PromiseEvent"("createdAt");

-- CreateIndex
CREATE INDEX "GuardrailEvaluation_recoveryCaseId_idx" ON "GuardrailEvaluation"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "GuardrailEvaluation_actionType_idx" ON "GuardrailEvaluation"("actionType");

-- CreateIndex
CREATE INDEX "GuardrailEvaluation_result_idx" ON "GuardrailEvaluation"("result");

-- CreateIndex
CREATE INDEX "GuardrailEvaluation_evaluatedAt_idx" ON "GuardrailEvaluation"("evaluatedAt");

-- CreateIndex
CREATE INDEX "Escalation_recoveryCaseId_idx" ON "Escalation"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "Escalation_status_idx" ON "Escalation"("status");

-- CreateIndex
CREATE INDEX "Escalation_priority_idx" ON "Escalation"("priority");

-- CreateIndex
CREATE INDEX "HumanReview_recoveryCaseId_idx" ON "HumanReview"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "HumanReview_actionId_idx" ON "HumanReview"("actionId");

-- CreateIndex
CREATE INDEX "HumanReview_status_idx" ON "HumanReview"("status");

-- CreateIndex
CREATE INDEX "AuditLog_recoveryCaseId_idx" ON "AuditLog"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "AuditLog_actionId_idx" ON "AuditLog"("actionId");

-- CreateIndex
CREATE INDEX "AuditLog_eventType_idx" ON "AuditLog"("eventType");

-- CreateIndex
CREATE INDEX "AuditLog_actor_idx" ON "AuditLog"("actor");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "RecoveryMetricsDaily_merchantId_date_idx" ON "RecoveryMetricsDaily"("merchantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryMetricsDaily_merchantId_date_key" ON "RecoveryMetricsDaily"("merchantId", "date");

-- CreateIndex
CREATE INDEX "BatchRun_merchantId_idx" ON "BatchRun"("merchantId");

-- CreateIndex
CREATE INDEX "BatchRun_status_idx" ON "BatchRun"("status");

-- CreateIndex
CREATE INDEX "BatchRun_startedAt_idx" ON "BatchRun"("startedAt");

-- AddForeignKey
ALTER TABLE "RevenueEvent" ADD CONSTRAINT "RevenueEvent_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPayload" ADD CONSTRAINT "EventPayload_revenueEventId_fkey" FOREIGN KEY ("revenueEventId") REFERENCES "RevenueEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIngestionError" ADD CONSTRAINT "EventIngestionError_revenueEventId_fkey" FOREIGN KEY ("revenueEventId") REFERENCES "RevenueEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailureDiagnosis" ADD CONSTRAINT "FailureDiagnosis_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailureDiagnosis" ADD CONSTRAINT "FailureDiagnosis_taxonomyCode_fkey" FOREIGN KEY ("taxonomyCode") REFERENCES "FailureTaxonomy"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticEvidence" ADD CONSTRAINT "DiagnosticEvidence_diagnosisId_fkey" FOREIGN KEY ("diagnosisId") REFERENCES "FailureDiagnosis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryDecision" ADD CONSTRAINT "RecoveryDecision_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionCandidate" ADD CONSTRAINT "DecisionCandidate_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "RecoveryDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryAction" ADD CONSTRAINT "RecoveryAction_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "RecoveryAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromiseToPay" ADD CONSTRAINT "PromiseToPay_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromiseReminder" ADD CONSTRAINT "PromiseReminder_promiseId_fkey" FOREIGN KEY ("promiseId") REFERENCES "PromiseToPay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromiseEvent" ADD CONSTRAINT "PromiseEvent_promiseId_fkey" FOREIGN KEY ("promiseId") REFERENCES "PromiseToPay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardrailEvaluation" ADD CONSTRAINT "GuardrailEvaluation_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReview" ADD CONSTRAINT "HumanReview_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
