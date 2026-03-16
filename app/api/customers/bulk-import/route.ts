
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import * as yaml from "js-yaml";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const text = await req.text();
        let data;

        try {
            data = JSON.parse(text);
        } catch {
            try {
                data = yaml.load(text);
            } catch (e) {
                return NextResponse.json({ error: "Invalid format. Upload JSON or YAML." }, { status: 400 });
            }
        }

        if (!data || !data.customers || !Array.isArray(data.customers)) {
            if (Array.isArray(data)) {
                data = { customers: data };
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

                // Find existing customer by name + owner (compound unique may have nullable ownerUserId)
                const existing = await prisma.customer.findFirst({
                    where: { name: cust.name, ownerUserId: userId }
                });

                const customerData = {
                    openingBalance: parseFloat(cust.opening_balance) || 0,
                    address: Array.isArray(cust.address) ? cust.address.join(", ") : cust.address || "",
                    state: cust.state || "",
                    country: cust.country || "",
                    gstin: cust.gstin || "",
                    phone: cust.contact?.phone || "",
                    email: cust.contact?.email || "",
                    group: cust.group || ""
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
