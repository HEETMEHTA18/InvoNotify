-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_date_idx" ON "Invoice"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_status_date_idx" ON "Invoice"("status", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_clientEmail_clientName_idx" ON "Invoice"("clientEmail", "clientName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_invoiceId_idx" ON "Payment"("invoiceId");
