import { prisma } from "../../lib/db";

async function main() {
  // Order matters due to foreign key constraints
  await prisma.invoiceReminderLog.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.invoiceItem.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.companySettings.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.authenticator.deleteMany({});
  await prisma.verificationToken.deleteMany({});
  await prisma.user.deleteMany({});
  console.log("Database cleared.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
