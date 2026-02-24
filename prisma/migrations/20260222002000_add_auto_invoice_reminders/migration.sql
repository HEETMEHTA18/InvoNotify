-- AlterTable
ALTER TABLE "Invoice"
ADD COLUMN "ownerUserId" TEXT,
ADD COLUMN "autoReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reminderOffsets" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "overdueReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "overdueReminderEveryDays" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "InvoiceReminderLog" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "reminderKey" TEXT NOT NULL,
    "reminderType" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_autoReminderEnabled_dueDate_status_idx" ON "Invoice"("autoReminderEnabled", "dueDate", "status");

-- CreateIndex
CREATE INDEX "Invoice_ownerUserId_idx" ON "Invoice"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceReminderLog_invoiceId_reminderKey_key" ON "InvoiceReminderLog"("invoiceId", "reminderKey");

-- CreateIndex
CREATE INDEX "InvoiceReminderLog_targetDate_idx" ON "InvoiceReminderLog"("targetDate");

-- CreateIndex
CREATE INDEX "InvoiceReminderLog_sentAt_idx" ON "InvoiceReminderLog"("sentAt");

-- AddForeignKey
ALTER TABLE "InvoiceReminderLog" ADD CONSTRAINT "InvoiceReminderLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
