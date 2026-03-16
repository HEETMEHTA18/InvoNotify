import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// GET: List all products for current user
export async function GET() {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const products = await prisma.product.findMany({
            where: { ownerUserId: userId },
            orderBy: { name: "asc" },
        });
        return NextResponse.json(products);
    } catch (error) {
        console.error("Failed to fetch products:", error);
        return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
    }
}

// POST: Create a new product for current user
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const data = await req.json();
        const { name, description, basePrice, hsnCode, defaultTaxRate } = data;

        if (!name || basePrice === undefined) {
            return NextResponse.json({ error: "Name and base price are required" }, { status: 400 });
        }

        const product = await prisma.product.create({
            data: {
                name,
                description,
                basePrice: Number(basePrice),
                hsnCode,
                defaultTaxRate: Number(defaultTaxRate || 0),
                ownerUserId: userId,
            },
        });

        return NextResponse.json(product, { status: 201 });
    } catch (error) {
        console.error("Failed to create product:", error);
        return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
    }
}
