-- Event identifiers belong to a merchant/source namespace, not to the whole
-- application. This prevents one tenant from colliding with another tenant's
-- provider event ID while retaining idempotency for retries.
DROP INDEX IF EXISTS "RevenueEvent_sourceEventId_key";
DROP INDEX IF EXISTS "RevenueEvent_source_sourceEventId_key";

CREATE UNIQUE INDEX "RevenueEvent_merchantId_source_sourceEventId_key"
ON "RevenueEvent"("merchantId", "source", "sourceEventId");
