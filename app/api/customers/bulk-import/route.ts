
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import * as yaml from "js-yaml";

export async function POST(req: Request) {
    try {
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
            // Fallback: check if root is array
            if (Array.isArray(data)) {
                data = { customers: data };
            } else {
                return NextResponse.json({ error: "Invalid data structure. Expected 'customers' key or array." }, { status: 400 });
            }
        }

        const created = [];
        const errors = [];
        const updated = [];

        for (const cust of data.customers) {
            try {
                if (!cust.name) continue;

                // Upsert customer
                const customer = await prisma.customer.upsert({
                    where: { name: cust.name },
                    update: {
                        openingBalance: parseFloat(cust.opening_balance) || 0,
                        address: Array.isArray(cust.address) ? cust.address.join(", ") : cust.address || "",
                        state: cust.state || "",
                        country: cust.country || "",
                        gstin: cust.gstin || "",
                        phone: cust.contact?.phone || "",
                        email: cust.contact?.email || "",
                        group: cust.group || ""
                    },
                    create: {
                        name: cust.name,
                        openingBalance: parseFloat(cust.opening_balance) || 0,
                        address: Array.isArray(cust.address) ? cust.address.join(", ") : cust.address || "",
                        state: cust.state || "",
                        country: cust.country || "",
                        gstin: cust.gstin || "",
                        phone: cust.contact?.phone || "",
                        email: cust.contact?.email || "",
                        group: cust.group || ""
                    }
                });

                // rudimentary tracking of created/updated (prisma upsert doesn't tell us easily)
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
