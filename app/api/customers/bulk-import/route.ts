
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import * as yaml from "js-yaml";
import { auth } from "@/lib/auth";
import { ensureCustomerSchema } from "@/lib/customer-schema";

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await ensureCustomerSchema();

        const text = await req.text();
        let data;

        try {
            data = JSON.parse(text);
        } catch {
            try {
                data = yaml.load(text);
            } catch {
                return NextResponse.json({ error: "Invalid format. Upload JSON or YAML." }, { status: 400 });
            }
        }

        if (!data || !data.customers || !Array.isArray(data.customers)) {
            if (Array.isArray(data)) {
                data = { customers: data };
            } else if (data && typeof data === "object" && Array.isArray((data as { customers?: unknown[] }).customers)) {
                data = { customers: (data as { customers: unknown[] }).customers };
            } else {
                return NextResponse.json({ error: "Invalid data structure. Expected 'customers' key or array." }, { status: 400 });
            }
        }

        const created = [];
        const errors = [];
        const userId = session.user.id;

        for (const cust of data.customers) {
            try {
                if (!cust.name) continue;

                const openingBalanceRaw =
                    cust.opening_balance ??
                    cust.openingBalance ??
                    cust.opening?.balance ??
                    0;

                const addressRaw =
                    cust.address ??
                    cust.location?.address ??
                    cust.contact?.address ??
                    "";

                const emailRaw =
                    cust.email ??
                    cust.contact?.email ??
                    "";

                const phoneRaw =
                    cust.phone ??
                    cust.contact?.phone ??
                    "";

                // Find existing customer by name under the authenticated user.
                const existing = await prisma.customer.findFirst({
                    where: {
                        name: cust.name,
                        ownerUserId: userId,
                    }
                });

                const cibilScoreValue = Math.max(
                    300,
                    Math.min(
                        900,
                        Math.round(
                            Number(
                                cust.cibil_score ??
                                cust.cibilScore ??
                                cust.credit_score ??
                                650
                            )
                        ) || 650
                    )
                );

                const customerData = {
                    openingBalance: Number.parseFloat(String(openingBalanceRaw).replace(/,/g, "")) || 0,
                    address: Array.isArray(addressRaw) ? addressRaw.join(", ") : addressRaw || "",
                    state: cust.state || "",
                    country: cust.country || "",
                    gstin: cust.gstin || "",
                    phone: phoneRaw || "",
                    email: emailRaw || "",
                    group: cust.group || "",
                };

                const customer = existing
                    ? await prisma.customer.update({
                        where: { id: existing.id },
                        data: customerData
                    })
                    : await prisma.customer.create({
                        data: {
                            name: cust.name,
                            ownerUserId: userId,
                            ...customerData
                        }
                    });

                await prisma.$executeRaw`
                    UPDATE "Customer"
                    SET "cibilScore" = ${cibilScoreValue}, "updatedAt" = NOW()
                    WHERE id = ${customer.id} AND "ownerUserId" = ${userId}
                `;

                created.push(customer);
            } catch (error) {
                console.error("Error creating customer:", error);
                errors.push({ name: cust.name, error: String(error) });
            }
        }

        return NextResponse.json({
            message: `Processed ${created.length} customers.`,
            createdCount: created.length,
            errors: errors
        });

    } catch (error) {
        console.error("Bulk import customers error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
