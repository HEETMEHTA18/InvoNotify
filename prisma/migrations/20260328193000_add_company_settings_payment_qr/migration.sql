ALTER TABLE "CompanySettings"
ADD COLUMN "paymentQrEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paymentQrPayload" TEXT;
