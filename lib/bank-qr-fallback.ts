import "server-only";

import { Jimp } from "jimp";
import jsQR from "jsqr";
import { isValidPaymentPayload } from "@/lib/payment-qr";

let cachedFallbackQrPayload: string | null | undefined;

export async function getFallbackQrPayloadFromCodebase() {
  if (cachedFallbackQrPayload !== undefined) {
    return cachedFallbackQrPayload;
  }

  try {
    const image = await Jimp.read(`${process.cwd()}\\bankqr.jpeg`);
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
