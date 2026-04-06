ALTER TABLE "Customer"
ADD COLUMN "cibilScore" INTEGER NOT NULL DEFAULT 650;

CREATE INDEX "Customer_ownerUserId_cibilScore_idx"
ON "Customer"("ownerUserId", "cibilScore");
