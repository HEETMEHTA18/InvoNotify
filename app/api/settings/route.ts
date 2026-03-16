import { NextRequest, NextResponse } from "next/server";
import { prisma, isPrismaDbConnectionError } from "@/lib/db";
import { auth } from "@/lib/auth";
import { deleteFromCloudinary } from "@/lib/cloudinary";

// GET: Get company settings for current user
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const settings = await prisma.companySettings.findUnique({
            where: { userId: session.user.id },
        });

        return NextResponse.json(settings || { logo: null, signature: null });
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

        // If replacing/removing images, clean up old Cloudinary images
        const existing = await prisma.companySettings.findUnique({
            where: { userId: session.user.id },
        });

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

        const settings = await prisma.companySettings.upsert({
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
