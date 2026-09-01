-- CreateTable
CREATE TABLE "RecoveryCase" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "stage" TEXT NOT NULL DEFAULT 'SCORING',
    "riskScore" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "paymentProbability" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "expectedRecovery" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "strategy" TEXT,
    "lastDecision" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecoveryCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" SERIAL NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "totalInvoices" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "actionCount" INTEGER NOT NULL DEFAULT 0,
    "recoveredAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "summary" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "recoveryCaseId" INTEGER,
    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" SERIAL NOT NULL,
    "recoveryCaseId" INTEGER NOT NULL,
    "agentRunId" INTEGER,
    "invoiceId" INTEGER,
    "actionType" TEXT NOT NULL,
    "channel" TEXT,
    "riskScore" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "decision" JSONB,
    "reason" TEXT,
    "urgency" TEXT,
    "confidence" DECIMAL(5,4),
    "policyResult" TEXT NOT NULL,
    "policyReasons" JSONB,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "executionStatus" TEXT,
    "failureReason" TEXT,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" SERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "source" TEXT NOT NULL DEFAULT 'stripe',
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCase_invoiceId_key" ON "RecoveryCase"("invoiceId");

-- CreateIndex
CREATE INDEX "RecoveryCase_ownerUserId_idx" ON "RecoveryCase"("ownerUserId");

-- CreateIndex
CREATE INDEX "RecoveryCase_status_idx" ON "RecoveryCase"("status");

-- CreateIndex
CREATE INDEX "RecoveryCase_riskScore_idx" ON "RecoveryCase"("riskScore");

-- CreateIndex
CREATE INDEX "RecoveryCase_ownerUserId_status_idx" ON "RecoveryCase"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "AgentRun_status_idx" ON "AgentRun"("status");

-- CreateIndex
CREATE INDEX "AgentRun_startedAt_idx" ON "AgentRun"("startedAt");

-- CreateIndex
CREATE INDEX "AgentAction_recoveryCaseId_idx" ON "AgentAction"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "AgentAction_agentRunId_idx" ON "AgentAction"("agentRunId");

-- CreateIndex
CREATE INDEX "AgentAction_status_idx" ON "AgentAction"("status");

-- CreateIndex
CREATE INDEX "AgentAction_createdAt_idx" ON "AgentAction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_source_status_idx" ON "WebhookEvent"("source", "status");

-- CreateIndex
CREATE INDEX "WebhookEvent_eventType_idx" ON "WebhookEvent"("eventType");

-- AddForeignKey
ALTER TABLE "RecoveryCase" ADD CONSTRAINT "RecoveryCase_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;