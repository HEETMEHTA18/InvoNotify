import { NextRequest, NextResponse } from "next/server";
import { prisma, isPrismaDbConnectionError } from "@/lib/db";
import { auth } from "@/lib/auth";
import { deleteFromCloudinary } from "@/lib/cloudinary";
import { isValidPaymentPayload } from "@/lib/payment-qr";
import { getFallbackQrPayloadFromCodebase } from "@/lib/bank-qr-fallback";

function isCompanySettingsSchemaMismatch(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return (
        message.includes("paymentQrEnabled") ||
        message.includes("paymentQrPayload") ||
        message.includes("column does not exist") ||
        message.includes("Unknown arg") ||
        message.includes("Unknown field")
    );
}

// GET: Get company settings for current user
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let settings;
        try {
            settings = await prisma.companySettings.findUnique({
                where: { userId: session.user.id },
            });
        } catch (error) {
            if (!isCompanySettingsSchemaMismatch(error)) throw error;
            settings = await prisma.companySettings.findUnique({
                where: { userId: session.user.id },
                select: {
                    id: true,
                    userId: true,
                    logo: true,
                    signature: true,
                    createdAt: true,
                    updatedAt: true,
                    address: true,
                    email: true,
                    name: true,
                    phone: true,
                },
            });
        }

        const fallbackPayload = await getFallbackQrPayloadFromCodebase();
        const persistedPayload = (settings as { paymentQrPayload?: string | null })?.paymentQrPayload;
        const effectivePayload = isValidPaymentPayload(persistedPayload)
            ? persistedPayload.trim()
            : fallbackPayload;

        const responsePayload = settings
            ? {
                ...settings,
                paymentQrPayload: effectivePayload,
                paymentQrEnabled:
                    Boolean((settings as { paymentQrEnabled?: boolean }).paymentQrEnabled) || Boolean(effectivePayload),
            }
            : {
                logo: null,
                signature: null,
                paymentQrEnabled: Boolean(effectivePayload),
                paymentQrPayload: effectivePayload,
            };

        return NextResponse.json(responsePayload);
    } catch (error) {
        console.error("Failed to fetch settings:", error);
        if (isPrismaDbConnectionError(error)) {
            return NextResponse.json(
                { error: "Database is temporarily unavailable. Please try again shortly." },
                { status: 503 }
            );
        }
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }
}

// POST: Create or update company settings
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const data = await req.json();
        const { logo, signature } = data;
        const normalizedPaymentPayload = isValidPaymentPayload(data.paymentQrPayload)
            ? String(data.paymentQrPayload).trim()
            : null;

        // If replacing/removing images, clean up old Cloudinary images
        let existing;
        try {
            existing = await prisma.companySettings.findUnique({
                where: { userId: session.user.id },
            });
        } catch (error) {
            if (!isCompanySettingsSchemaMismatch(error)) throw error;
            existing = await prisma.companySettings.findUnique({
                where: { userId: session.user.id },
                select: {
                    id: true,
                    userId: true,
                    logo: true,
                    signature: true,
                    createdAt: true,
                    updatedAt: true,
                    address: true,
                    email: true,
                    name: true,
                    phone: true,
                },
            });
        }

        if (existing) {
            // Delete old logo from Cloudinary if it's being replaced or removed
            if (logo !== undefined && existing.logo && existing.logo !== logo && existing.logo.includes("res.cloudinary.com")) {
                await deleteFromCloudinary(existing.logo);
            }
            // Delete old signature from Cloudinary if it's being replaced or removed
            if (signature !== undefined && existing.signature && existing.signature !== signature && existing.signature.includes("res.cloudinary.com")) {
                await deleteFromCloudinary(existing.signature);
            }
        }

        let settings;
        try {
            const updateData: Record<string, unknown> = {
                ...(logo !== undefined && { logo }),
                ...(signature !== undefined && { signature }),
                ...(data.name !== undefined && { name: data.name }),
                ...(data.email !== undefined && { email: data.email }),
                ...(data.phone !== undefined && { phone: data.phone }),
                ...(data.address !== undefined && { address: data.address }),
            };
            const createData: Record<string, unknown> = {
                userId: session.user.id,
                logo: logo || null,
                signature: signature || null,
                name: data.name || "",
                email: data.email || "",
                phone: data.phone || "",
                address: data.address || "",
            };

            if (data.paymentQrEnabled !== undefined) {
                updateData.paymentQrEnabled = Boolean(data.paymentQrEnabled);
            }
            if (data.paymentQrPayload !== undefined) {
                updateData.paymentQrPayload = normalizedPaymentPayload;
            }
            createData.paymentQrEnabled = Boolean(data.paymentQrEnabled);
            createData.paymentQrPayload = normalizedPaymentPayload;

            settings = await prisma.companySettings.upsert({
                where: { userId: session.user.id },
                update: updateData as any,
                create: createData as any,
            });
        } catch (error) {
            if (!isCompanySettingsSchemaMismatch(error)) throw error;
            settings = await prisma.companySettings.upsert({
                where: { userId: session.user.id },
                update: {
                    ...(logo !== undefined && { logo }),
                    ...(signature !== undefined && { signature }),
                    ...(data.name !== undefined && { name: data.name }),
                    ...(data.email !== undefined && { email: data.email }),
                    ...(data.phone !== undefined && { phone: data.phone }),
                    ...(data.address !== undefined && { address: data.address }),
                },
                create: {
                    userId: session.user.id,
                    logo: logo || null,
                    signature: signature || null,
                    name: data.name || "",
                    email: data.email || "",
                    phone: data.phone || "",
                    address: data.address || "",
                },
            });
        }

        return NextResponse.json(settings);
    } catch (error) {
        console.error("Failed to update settings:", error);
        if (isPrismaDbConnectionError(error)) {
            return NextResponse.json(
                { error: "Database is temporarily unavailable. Please try again shortly." },
                { status: 503 }
            );
        }
        return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }
}
