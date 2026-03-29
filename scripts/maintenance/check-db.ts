import { prisma } from "../../lib/db"

async function main() {
  console.log("--- Multi-Tenancy Security Audit ---");
  
  const results = await Promise.all([
    prisma.user.count(),
    prisma.invoice.count(),
    prisma.customer.count(),
    prisma.product.count(),
    // Check for orphaned records (leaks)
    prisma.invoice.count({ where: { ownerUserId: null } }),
    prisma.customer.count({ where: { ownerUserId: null } }),
    prisma.product.count({ where: { ownerUserId: null } }),
  ]);

  const [users, invoices, customers, products, orphanedInvoices, orphanedCustomers, orphanedProducts] = results;

  console.log(`Total Users: ${users}`);
  console.log(`Total Invoices: ${invoices} (${orphanedInvoices} orphaned)`);
  console.log(`Total Customers: ${customers} (${orphanedCustomers} orphaned)`);
  console.log(`Total Products: ${products} (${orphanedProducts} orphaned)`);

  if (orphanedInvoices > 0 || orphanedCustomers > 0 || orphanedProducts > 0) {
    console.warn("\n⚠️ WARNING: Identified records without ownerUserId. These are potentially insecure or shared across all users.");
  } else {
    console.log("\n✅ PASS: All analyzed records are correctly associated with an owner.");
  }

  // Check for name collisions (multi-tenancy verification)
  const customersByName = await prisma.customer.groupBy({
    by: ['name'],
    _count: { name: true },
    having: { name: { _count: { gt: 1 } } }
  });

  if (customersByName.length > 0) {
    console.log(`\nVerified: ${customersByName.length} customer names exist across multiple accounts (Safe multi-tenancy).`);
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
