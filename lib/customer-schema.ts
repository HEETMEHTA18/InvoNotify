import { prisma } from "@/lib/db";

let customerSchemaReady: Promise<void> | null = null;

async function ensureCustomerCibilColumn() {
    await prisma.$executeRawUnsafe(`
        ALTER TABLE "Customer"
        ADD COLUMN IF NOT EXISTS "cibilScore" INTEGER NOT NULL DEFAULT 650
    `);

    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "Customer_ownerUserId_cibilScore_idx"
        ON "Customer"("ownerUserId", "cibilScore")
    `);
}

export async function ensureCustomerSchema() {
    if (!customerSchemaReady) {
        customerSchemaReady = ensureCustomerCibilColumn().catch((error) => {
            customerSchemaReady = null;
            throw error;
        });
    }

    return customerSchemaReady;
}