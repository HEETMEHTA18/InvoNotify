import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";
import { Jimp } from "jimp";
import jsQR from "jsqr";
import { isValidPaymentPayload } from "@/lib/payment-qr";

let cachedFallbackQrPayload: string | null | undefined;

export async function getFallbackQrPayloadFromCodebase() {
  if (cachedFallbackQrPayload !== undefined) {
    return cachedFallbackQrPayload;
  }

  try {
    const publicPath = path.join(process.cwd(), "public", "bankqr.jpeg");
    const rootPath = path.join(process.cwd(), "bankqr.jpeg");
    const imagePath = existsSync(publicPath) ? publicPath : rootPath;

    const image = await Jimp.read(imagePath);
    const decoded = jsQR(
      new Uint8ClampedArray(image.bitmap.data),
      image.bitmap.width,
      image.bitmap.height,
      { inversionAttempts: "attemptBoth" }
    );
    const candidate = decoded?.data?.trim() || null;
    cachedFallbackQrPayload = isValidPaymentPayload(candidate) ? candidate : null;
  } catch {
    cachedFallbackQrPayload = null;
  }

  return cachedFallbackQrPayload;
}
