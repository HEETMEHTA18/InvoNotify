import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// GET: Single product
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        const product = await prisma.product.findFirst({
            where: { id: Number(id), ownerUserId: session.user.id },
        });
        if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(product);
    } catch {
        return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 });
    }
}

// PUT: Update product
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        const data = await req.json();

        const updateResult = await prisma.product.updateMany({
            where: { id: Number(id), ownerUserId: session.user.id },
            data: {
                ...data,
                basePrice: data.basePrice !== undefined ? Number(data.basePrice) : undefined,
                defaultTaxRate: data.defaultTaxRate !== undefined ? Number(data.defaultTaxRate) : undefined,
            },
        });

        if (updateResult.count === 0) {
            return NextResponse.json({ error: "Product not found or unauthorized" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
    }
}

// DELETE: Delete product
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        const deleteResult = await prisma.product.deleteMany({
            where: { id: Number(id), ownerUserId: session.user.id },
        });

        if (deleteResult.count === 0) {
            return NextResponse.json({ error: "Product not found or unauthorized" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
    }
}
