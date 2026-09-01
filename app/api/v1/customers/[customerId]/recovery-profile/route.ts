import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, customerScope, notFound, parseId, requireUser } from "@/lib/security/authz";
import { recoveryProfile } from "@/lib/recovery-case-service";

export async function GET(_request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;
    const customerId = parseId((await params).customerId);
    if (!customerId) return badRequest("Customer ID must be a positive integer");
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, ...customerScope(who.userId) },
      select: {
        id: true, name: true, isVipExempt: true, communicationOptOut: true,
        invoices: { orderBy: { date: "desc" }, select: { id: true }, take: 1 },
      },
    });
    if (!customer) return notFound("Customer");
    if (customer.invoices[0]) return NextResponse.json({ profile: await recoveryProfile(customer.invoices[0].id) });
    return NextResponse.json({ profile: {
      partialContext: true,
      refreshedAt: new Date().toISOString(),
      customer: { id: customer.id, segment: customer.isVipExempt ? "VIP" : "STANDARD", communication: { emailEligible: !customer.communicationOptOut, smsEligible: false, voiceEligible: false, optedOut: customer.communicationOptOut } },
      transaction: null,
      derivedFeatures: null,
    } });
  } catch (error) {
    console.error("Customer recovery profile error:", error);
    return NextResponse.json({ error: "Failed to fetch customer recovery profile" }, { status: 500 });
  }
}
