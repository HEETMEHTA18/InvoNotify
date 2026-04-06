import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ensureCustomerSchema } from "@/lib/customer-schema";
import {
    calculateCibilScoreFromInvoices,
    deriveInvoiceStatus,
    getOverdueDays,
    normalizeCustomerKey,
} from "@/lib/customer-credit";

function normalizeCibilScore(value: unknown) {
    const score = Number(value);
    if (!Number.isFinite(score)) return 650;
    return Math.max(300, Math.min(900, Math.round(score)));
}

async function findCustomersForUser(userId: string) {
    try {
        return await prisma.customer.findMany({
            where: { ownerUserId: userId },
            orderBy: { name: "asc" },
        });
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2022"
        ) {
            await ensureCustomerSchema();
            return prisma.customer.findMany({
                where: { ownerUserId: userId },
                orderBy: { name: "asc" },
            });
        }

        throw error;
    }
}

// GET: List all customers for current user
export async function GET() {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await ensureCustomerSchema();

        const customers = await findCustomersForUser(userId);
        if (customers.length === 0) {
            return NextResponse.json([]);
        }

        const invoices = await prisma.invoice.findMany({
            where: {
                OR: [{ ownerUserId: userId }, { userId }],
            },
            select: {
                id: true,
                customerId: true,
                clientName: true,
                clientEmail: true,
                customer: true,
                status: true,
                dueDate: true,
                total: true,
                amountPaid: true,
                balance: true,
            },
        });

        const customerById = new Map<number, (typeof customers)[number]>();
        const customerByName = new Map<string, number>();
        const customerByEmail = new Map<string, number>();

        for (const customer of customers) {
            customerById.set(customer.id, customer);
            const nameKey = normalizeCustomerKey(customer.name);
            if (nameKey && !customerByName.has(nameKey)) {
                customerByName.set(nameKey, customer.id);
            }
            const emailKey = normalizeCustomerKey(customer.email);
            if (emailKey && !customerByEmail.has(emailKey)) {
                customerByEmail.set(emailKey, customer.id);
            }
        }

        const invoiceByCustomer = new Map<number, Array<{
            id: number;
            status: string | null;
            dueDate: Date | null;
            total: number;
            amountPaid: number;
            balance: number;
        }>>();

        const linkUpdatesByCustomer = new Map<number, number[]>();

        for (const invoice of invoices) {
            let linkedCustomerId = invoice.customerId ?? null;

            if (!linkedCustomerId) {
                const emailKey = normalizeCustomerKey(invoice.clientEmail);
                const nameKey = normalizeCustomerKey(invoice.clientName || invoice.customer);
                linkedCustomerId =
                    (emailKey ? customerByEmail.get(emailKey) : undefined) ||
                    (nameKey ? customerByName.get(nameKey) : undefined) ||
                    null;

                if (linkedCustomerId) {
                    const existing = linkUpdatesByCustomer.get(linkedCustomerId) || [];
                    existing.push(invoice.id);
                    linkUpdatesByCustomer.set(linkedCustomerId, existing);
                }
            }

            if (!linkedCustomerId || !customerById.has(linkedCustomerId)) {
                continue;
            }

            const existingInvoices = invoiceByCustomer.get(linkedCustomerId) || [];
            existingInvoices.push({
                id: invoice.id,
                status: invoice.status,
                dueDate: invoice.dueDate,
                total: Number(invoice.total || 0),
                amountPaid: Number(invoice.amountPaid || 0),
                balance: Number(invoice.balance || 0),
            });
            invoiceByCustomer.set(linkedCustomerId, existingInvoices);
        }

        for (const [customerId, invoiceIds] of linkUpdatesByCustomer.entries()) {
            if (invoiceIds.length === 0) continue;
            await prisma.invoice.updateMany({
                where: { id: { in: invoiceIds } },
                data: { customerId },
            });
        }

        const overdueIdsToUpdate: number[] = [];

        const enriched = customers.map((customer) => {
            const customerInvoices = invoiceByCustomer.get(customer.id) || [];
            const computedCibil = calculateCibilScoreFromInvoices(customerInvoices);

            let overdueInvoiceCount = 0;
            let maxOverdueDays = 0;
            let totalOutstanding = 0;

            for (const invoice of customerInvoices) {
                totalOutstanding += Number(invoice.balance || 0);
                const effectiveStatus = deriveInvoiceStatus(invoice.status, invoice.dueDate, Number(invoice.balance || 0));
                if (effectiveStatus === "Overdue") {
                    overdueInvoiceCount += 1;
                    overdueIdsToUpdate.push(invoice.id);
                    maxOverdueDays = Math.max(
                        maxOverdueDays,
                        getOverdueDays(invoice.dueDate, invoice.status, Number(invoice.balance || 0))
                    );
                }
            }

            return {
                ...customer,
                cibilScore: computedCibil,
                overdueInvoiceCount,
                maxOverdueDays,
                totalInvoices: customerInvoices.length,
                totalOutstanding,
            };
        });

        if (overdueIdsToUpdate.length > 0) {
            await prisma.invoice.updateMany({
                where: { id: { in: overdueIdsToUpdate }, status: { not: "Paid" } },
                data: { status: "Overdue" },
            });
        }

        const scoreUpdates = enriched.filter(
            (customer) => normalizeCibilScore((customerById.get(customer.id) as unknown as { cibilScore?: number }).cibilScore) !== customer.cibilScore
        );

        await Promise.all(
            scoreUpdates.map((customer) =>
                prisma.$executeRaw`
                    UPDATE "Customer"
                    SET "cibilScore" = ${customer.cibilScore}, "updatedAt" = NOW()
                    WHERE id = ${customer.id} AND "ownerUserId" = ${userId}
                `
            )
        );

        return NextResponse.json(enriched);
    } catch (error) {
        console.error("Failed to fetch customers:", error);
        return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 });
    }
}

// POST: Create a customer
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await ensureCustomerSchema();

        const data = await req.json();
        const cibilScore = Number(data?.cibilScore);

        if (!data?.name || typeof data.name !== "string") {
            return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
        }

        const cibilScoreValue = Number.isFinite(cibilScore) ? Math.max(300, Math.min(900, Math.round(cibilScore))) : 650;

        const customerData: Prisma.CustomerUncheckedCreateInput = {
            name: data.name,
            group: data.group || null,
            openingBalance: Number(data.openingBalance || 0),
            address: data.address || null,
            city: data.city || null,
            state: data.state || null,
            country: data.country || null,
            gstin: data.gstin || null,
            phone: data.phone || null,
            email: data.email || null,
            ownerUserId: userId,
        };

        const existing = await prisma.customer.findFirst({
            where: { name: data.name, ownerUserId: userId },
        });

        const customer = existing
            ? await prisma.customer.update({
                where: { id: existing.id },
                data: customerData as Prisma.CustomerUncheckedUpdateInput,
            })
            : await prisma.customer.create({
                data: customerData,
            });

        await prisma.$executeRaw`
            UPDATE "Customer"
            SET "cibilScore" = ${cibilScoreValue}, "updatedAt" = NOW()
            WHERE id = ${customer.id} AND "ownerUserId" = ${userId}
        `;

        const savedCustomer = await prisma.customer.findFirst({
            where: { id: customer.id, ownerUserId: userId },
        });

        return NextResponse.json(savedCustomer || customer, { status: existing ? 200 : 201 });
    } catch (error) {
        console.error("Failed to create customer:", error);
        return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
    }
}
