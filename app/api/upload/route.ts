import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadToCloudinary } from "@/lib/cloudinary";

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { image, folder } = await req.json();

        if (!image || typeof image !== "string") {
            return NextResponse.json(
                { error: "No image data provided" },
                { status: 400 }
            );
        }

        // Validate it's a base64 data URL
        if (!image.startsWith("data:image/")) {
            return NextResponse.json(
                { error: "Invalid image format. Expected base64 data URL." },
                { status: 400 }
            );
        }

        // Upload to Cloudinary
        const uploadFolder = folder || `invoice-settings/${session.user.id}`;
        const url = await uploadToCloudinary(image, uploadFolder);

        return NextResponse.json({ url });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json(
            { error: "Failed to upload image" },
            { status: 500 }
        );
    }
}
