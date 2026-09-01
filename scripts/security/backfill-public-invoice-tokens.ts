import { PrismaClient } from "@prisma/client";
import { createPublicInvoiceToken } from "../../lib/security/public-invoice";

const prisma = new PrismaClient();

/**
 * Idempotently gives legacy invoices an opaque public capability. This is a
 * data repair, not a migration: `prisma db push` creates the column but does
 * not execute SQL migration backfills.
 */
async function main() {
  const invoices = await prisma.invoice.findMany({
    where: { publicToken: null },
    select: { id: true },
  });

  let updated = 0;
  for (const invoice of invoices) {
    // The null predicate prevents a concurrent deployment from replacing an
    // already-issued capability token.
    const result = await prisma.invoice.updateMany({
      where: { id: invoice.id, publicToken: null },
      data: { publicToken: createPublicInvoiceToken() },
    });
    updated += result.count;
  }

  console.log(`Public invoice capability tokens: ${updated} backfilled, ${invoices.length - updated} unchanged.`);
}

main()
  .catch((error) => {
    console.error("Public invoice token backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
