-- Adds a compliance opt-out flag so the recovery agent never contacts a
-- customer who has opted out of communications (covers reminders and
-- payment-link emails). Enforced in lib/ai/policy/engine.ts (CONTACT_ACTIONS).
ALTER TABLE "Customer"
ADD COLUMN "communicationOptOut" BOOLEAN NOT NULL DEFAULT false;
