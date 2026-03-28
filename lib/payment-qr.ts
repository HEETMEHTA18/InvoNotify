export function isValidPaymentPayload(payload: unknown): payload is string {
  if (typeof payload !== "string") return false;
  const trimmed = payload.trim();
  if (!trimmed) return false;
  return trimmed.includes("{amount}") || trimmed.startsWith("upi://pay");
}

export function buildPaymentPayload(basePayload: string, amount: string, invoiceNumber: string) {
  const trimmed = basePayload.trim();
  if (!trimmed) return "";

  if (trimmed.includes("{amount}")) {
    return trimmed.replaceAll("{amount}", amount);
  }

  if (trimmed.startsWith("upi://pay")) {
    try {
      const url = new URL(trimmed);
      url.searchParams.set("am", amount);
      if (!url.searchParams.get("tn")) {
        url.searchParams.set("tn", `Invoice ${invoiceNumber}`);
      }
      if (!url.searchParams.get("cu")) {
        url.searchParams.set("cu", "INR");
      }
      return url.toString();
    } catch {
      const separator = trimmed.includes("?") ? "&" : "?";
      return `${trimmed}${separator}am=${encodeURIComponent(amount)}`;
    }
  }

  // Avoid generating QR that opens unrelated links (e.g. image/drive URLs).
  return "";
}
