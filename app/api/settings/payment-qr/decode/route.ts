import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { Jimp } from "jimp";
import jsQR from "jsqr";
import { isValidPaymentPayload } from "@/lib/payment-qr";

const MAX_QR_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "QR image file is required" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Please upload a JPG, PNG, or WEBP image" },
        { status: 400 }
      );
    }

    if (file.size > MAX_QR_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "QR image must be smaller than 5MB" },
        { status: 400 }
      );
    }

    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const image = await Jimp.read(imageBuffer);

    const decoded = jsQR(
      new Uint8ClampedArray(image.bitmap.data),
      image.bitmap.width,
      image.bitmap.height,
      { inversionAttempts: "attemptBoth" }
    );

    const candidate = decoded?.data?.trim();

    if (!candidate) {
      return NextResponse.json(
        { error: "No QR code detected in the uploaded image" },
        { status: 422 }
      );
    }

    if (!isValidPaymentPayload(candidate)) {
      return NextResponse.json(
        { error: "QR code was found, but it does not contain a valid UPI payment payload" },
        { status: 422 }
      );
    }

    return NextResponse.json({ payload: candidate });
  } catch (error) {
    console.error("Failed to decode payment QR image:", error);
    return NextResponse.json({ error: "Failed to decode QR image" }, { status: 500 });
  }
}
