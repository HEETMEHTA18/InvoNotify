-- Repair migration: owner-scoping (multi-tenancy) drift.
--
-- WHY THIS EXISTS
-- `Customer.ownerUserId`, `Product.ownerUserId`, `Customer.firstInvoiceAt`,
-- `Customer.isVipExempt` and their indexes were present in prisma/schema.prisma
-- and in the live database, but no migration ever created them -- they were
-- applied with `prisma db push`. Result: `prisma migrate deploy` against a fresh
-- database produced a schema that did not match schema.prisma, and the seed
-- script failed with `The column Customer.ownerUserId does not exist`.
--
-- Every statement below is guarded (IF EXISTS / IF NOT EXISTS / catalog check),
-- so this migration is a real change on a database built from migrations alone
-- and a safe no-op on a database that already received the `db push`.

-- Customer: owner scoping + fields
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "firstInvoiceAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isVipExempt" BOOLEAN NOT NULL DEFAULT false;

-- Product: owner scoping
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

-- The global unique on Customer.name is superseded by the per-owner unique
-- below; two merchants may legitimately have a customer with the same name.
DROP INDEX IF EXISTS "Customer_name_key";

-- Not declared in schema.prisma (lookups go through Invoice.razorpayPaymentLinkId
-- equality on a low-cardinality nullable column); dropped to match the model.
DROP INDEX IF EXISTS "Invoice_razorpayPaymentLinkId_idx";

CREATE INDEX IF NOT EXISTS "Customer_ownerUserId_idx" ON "Customer"("ownerUserId");
CREATE INDEX IF NOT EXISTS "Customer_ownerUserId_name_idx" ON "Customer"("ownerUserId", "name");
CREATE INDEX IF NOT EXISTS "Customer_ownerUserId_cibilScore_idx" ON "Customer"("ownerUserId", "cibilScore");
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_name_ownerUserId_key" ON "Customer"("name", "ownerUserId");
CREATE INDEX IF NOT EXISTS "Invoice_userId_idx" ON "Invoice"("userId");
CREATE INDEX IF NOT EXISTS "Product_ownerUserId_idx" ON "Product"("ownerUserId");

-- Foreign keys: Postgres has no ADD CONSTRAINT IF NOT EXISTS, so guard on the catalog.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Customer_ownerUserId_fkey') THEN
    ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ownerUserId_fkey"
      FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_ownerUserId_fkey') THEN
    ALTER TABLE "Product" ADD CONSTRAINT "Product_ownerUserId_fkey"
      FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
