-- Customer contact-window attributes existed in the Prisma model but were not
-- represented in a forward migration, which made a fresh demo database fail
-- during seed. Defaults preserve the current Indian B2B demo behaviour.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "businessHoursStart" INTEGER NOT NULL DEFAULT 9;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "businessHoursEnd" INTEGER NOT NULL DEFAULT 18;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "businessDays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5];
