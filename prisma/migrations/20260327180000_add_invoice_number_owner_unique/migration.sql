CREATE UNIQUE INDEX "Invoice_invoiceNumber_ownerUserId_key"
ON "Invoice"("invoiceNumber", "ownerUserId");
