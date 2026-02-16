import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/utils/db";

// GET: Get a single invoice with items
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params;
    const invoice = await prisma.invoice.findUnique({
      where: { id: Number(id) },
      include: { items: true },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (error) {
    console.error("Failed to fetch invoice:", error);
    return NextResponse.json({ error: "Failed to fetch invoice" }, { status: 500 });
  }
}

// PATCH: Update an invoice
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params;
    const data = await req.json();
    const { items, ...invoiceData } = data;

    // Update invoice and optionally replace items
    const updateData: Record<string, unknown> = { ...invoiceData };

    if (items) {
      // Delete existing items and create new ones
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: Number(id) } });
      updateData.items = {
        create: items.map(
          (item: { description: string; quantity: number; rate: number; amount: number }) => ({
            description: item.description,
            quantity: Number(item.quantity),
            rate: Number(item.rate),
            amount: Number(item.amount),
          })
        ),
      };
    }

    const invoice = await prisma.invoice.update({
      where: { id: Number(id) },
      data: updateData,
      include: { items: true },
    });
    return NextResponse.json(invoice);
  } catch (error) {
    console.error("Failed to update invoice:", error);
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
  }
}

// DELETE: Delete an invoice
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params;
    await prisma.invoice.delete({ where: { id: Number(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete invoice:", error);
    return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 });
  }
}
