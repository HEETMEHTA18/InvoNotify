-- Permanent holdout arm for the recovery agent.
--
-- Each case is assigned once, deterministically, to TREAT (normal bounded
-- automation) or HOLD (control: scored and audited, never contacted). That is
-- what makes AI-versus-baseline recovery a measured effect on confirmed
-- settlements instead of a simulated forecast.
--
-- "experimentAssignedAt" stays NULL for cases created before this migration.
-- "experimentExcludedReason" marks cases that must never enter the experiment
-- (seeded demo fixtures), so synthetic data cannot look like a measurement.
-- Those are excluded from the report rather than back-filled into the treatment
-- arm, because a case that has already been contacted is not a valid control.
ALTER TABLE "RecoveryCase"
ADD COLUMN "experimentArm" TEXT NOT NULL DEFAULT 'TREAT',
ADD COLUMN "experimentAssignedAt" TIMESTAMP(3),
ADD COLUMN "experimentExcludedReason" TEXT;

CREATE INDEX "RecoveryCase_experimentArm_status_idx"
ON "RecoveryCase"("experimentArm", "status");
