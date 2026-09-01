-- AlterTable: Add Razorpay fields to Invoice
ALTER TABLE "Invoice" ADD COLUMN "razorpayPaymentLinkId" TEXT,
ADD COLUMN "razorpayPaymentLinkUrl" TEXT,
ADD COLUMN "razorpayPaymentId" TEXT;

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'razorpay',
    "eventType" TEXT NOT NULL,
    "razorpayEventId" TEXT,
    "paymentId" TEXT,
    "paymentLinkId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_razorpayEventId_key" ON "PaymentEvent"("razorpayEventId");

-- CreateIndex
CREATE INDEX "PaymentEvent_invoiceId_idx" ON "PaymentEvent"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentEvent_source_eventType_idx" ON "PaymentEvent"("source", "eventType");

-- CreateIndex
CREATE INDEX "PaymentEvent_razorpayEventId_idx" ON "PaymentEvent"("razorpayEventId");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentLinkId_idx" ON "PaymentEvent"("paymentLinkId");

-- CreateIndex
CREATE INDEX "Invoice_razorpayPaymentLinkId_idx" ON "Invoice"("razorpayPaymentLinkId");

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
