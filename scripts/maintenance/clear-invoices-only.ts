import { prisma } from "../../lib/db";

async function main() {
  const before = await prisma.invoice.count();

  const deleted = await prisma.invoice.deleteMany({});

  const afterCounts = {
    users: await prisma.user.count(),
    customers: await prisma.customer.count(),
    products: await prisma.product.count(),
    invoices: await prisma.invoice.count(),
    invoiceItems: await prisma.invoiceItem.count(),
    payments: await prisma.payment.count(),
    reminderLogs: await prisma.invoiceReminderLog.count(),
  };

  console.log(
    JSON.stringify(
      {
        invoicesBefore: before,
        invoicesDeleted: deleted.count,
        afterCounts,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
