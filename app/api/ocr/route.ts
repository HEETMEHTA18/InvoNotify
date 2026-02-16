import { NextRequest, NextResponse } from "next/server";

// Using OCR.space Free API
// Get a free key at https://ocr.space/ocrapi
const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY || "helloworld";
const OCR_SPACE_URL = "https://api.ocr.space/parse/image";


// Helper: Parse OCR text into invoice fields using heuristics
function parseInvoiceFromText(text: string) {
    const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

    let invoiceNumber = "";
    let date = "";
    let dueDate = "";
    let senderName = "";
    let senderEmail = "";
    let senderAddress = "";
    let clientName = "";
    let clientEmail = "";
    let clientAddress = "";
    let note = "";
    let currency = "INR";
    const items: {
        description: string;
        quantity: number;
        rate: number;
        amount: number;
    }[] = [];

    // Currency detection
    if (/\$/.test(text) && !/₹/.test(text)) currency = "USD";
    else if (/€/.test(text)) currency = "EUR";
    else if (/£/.test(text)) currency = "GBP";
    else if (/₹/.test(text) || /INR/i.test(text) || /Rs\.?/i.test(text))
        currency = "INR";
    else if (/C\$/.test(text)) currency = "CAD";
    else if (/A\$/.test(text)) currency = "AUD";

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        // Clean markdown formatting (*, _, etc) for easier regex matching
        const line = rawLine.replace(/[*_#`]/g, " ").trim();
        const lowerLine = line.toLowerCase();

        // Invoice number
        if (!invoiceNumber && /invoice\s*(no|number|#|:)/i.test(line)) {
            const match = line.match(
                /(?:invoice\s*(?:no|number|#|:)\s*[:#]?\s*)([A-Z0-9\-/]+)/i
            );
            if (match) invoiceNumber = match[1].trim();
        }

        // Date
        if (!date && (/\bdate\b/i.test(line) && !/due/i.test(line))) {
            // Look for dd/mm/yyyy or yyyy-mm-dd or dd-mmm-yyyy
            const match = line.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})|(\d{4}[./-]\d{1,2}[./-]\d{1,2})|(\d{1,2}\s+[a-zA-Z]{3,9}\s+\d{2,4})/);
            if (match) {
                const parsed = tryParseDate(match[0]);
                if (parsed) date = parsed;
            }
        }

        // Due date
        if (!dueDate && /due\s*date/i.test(line)) {
            const match = line.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})|(\d{4}[./-]\d{1,2}[./-]\d{1,2})|(\d{1,2}\s+[a-zA-Z]{3,9}\s+\d{2,4})/);
            if (match) {
                const parsed = tryParseDate(match[0]);
                if (parsed) dueDate = parsed;
            }
        }

        // Email extraction
        const emailMatch = line.match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) {
            if (!senderEmail) senderEmail = emailMatch[0];
            else if (!clientEmail) clientEmail = emailMatch[0];
        }

        // Names & GSTIN (Common in India)
        if (!senderName && /(GSTIN|GST|PAN)[:\s]+([0-9A-Z]+)/i.test(line)) {
            // Often the company name is near the GSTIN
            // If we haven't found a sender name, look at previous lines
            if (i > 0 && lines[i - 1].length < 50 && !lines[i - 1].includes(":")) {
                senderName = lines[i - 1];
            }
        }

        if (
            !senderName &&
            /^(from|bill\s*from|sender|company)\s*[:#]/i.test(line)
        ) {
            const match = line.match(
                /(?:from|bill\s*from|sender|company)\s*[:#]\s*(.+)/i
            );
            if (match) senderName = match[1].trim();
            else if (i + 1 < lines.length) senderName = lines[i + 1];
        }

        if (
            !clientName &&
            /^(to|bill\s*to|client|customer)\s*[:#]/i.test(line)
        ) {
            const match = line.match(
                /(?:to|bill\s*to|client|customer)\s*[:#]\s*(.+)/i
            );
            if (match) clientName = match[1].trim();
            else if (i + 1 < lines.length) clientName = lines[i + 1];
        }

        // Note
        if (!note && /^(note|notes|remarks?|memo|narration)\s*[:#]/i.test(line)) {
            const match = line.match(
                /(?:note|notes|remarks?|memo|narration)\s*[:#]\s*(.+)/i
            );
            if (match) note = match[1].trim();
        }

        // Item Extraction - Improved Regex
        // Looks for: text ... number ... number
        // e.g. "Product A   10   100.00" or "Product A  100.00"

        // Markdown Table Row Extraction (Sarvam / LLM output)
        if (line.trim().startsWith("|") && line.split("|").length >= 4) {
            const parts = line.split("|").map(p => p.trim()).filter(p => p);
            // Heuristic: If we have at least 3 parts, try to map to Desc, Qty, Rate, Amount
            // Common formats: | Desc | Qty | Rate | Amount |
            // or | Desc | Amount |

            if (parts.length >= 3) {
                // Try to find numbers from the right
                const amountStr = parts[parts.length - 1];
                const rateStr = parts[parts.length - 2];
                const qtyStr = parts[parts.length - 3] || "1";

                const amount = parseFloat(amountStr.replace(/[,]/g, ""));
                const rate = parseFloat(rateStr.replace(/[,]/g, ""));
                const qty = parseFloat(qtyStr.replace(/[,]/g, ""));

                // If last column is a number, it's likely a valid item row
                if (!isNaN(amount) && !/total|subtotal|amount/i.test(parts[0])) {
                    const description = parts.slice(0, parts.length - (parts.length >= 4 ? 3 : 2)).join(" ");
                    items.push({
                        description: description.replace(/[*_]/g, ""), // Remove markdown formatting
                        quantity: isNaN(qty) ? 1 : qty,
                        rate: isNaN(rate) ? amount : rate,
                        amount
                    });
                    continue; // Skip standard regex check
                }
            }
        }

        // Exclude lines with "Total", "Tax", "GST", "Amount Due" for now (handle separately)
        if (!/(total|subtotal|tax|gst|vat|amount due|balance)/i.test(line)) {
            const itemMatch = line.match(
                /^(.+?)\s+(\d+(?:\.\d+)?)\s+[\$€£₹]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*$/
            );
            // Or quantity, rate, amount
            const qtyRateMatch = line.match(
                /^(.+?)\s+(\d+(?:\.\d+)?)\s+[\$€£₹]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s+[\$€£₹]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*$/
            );

            if (qtyRateMatch) {
                const desc = qtyRateMatch[1].trim();
                const qty = parseFloat(qtyRateMatch[2]);
                const rate = parseFloat(qtyRateMatch[3].replace(/,/g, ""));
                const amount = parseFloat(qtyRateMatch[4].replace(/,/g, ""));

                // Filter out common header words
                if (!/^(description|item|product|qty|rate|amount|price)/i.test(desc) && desc.length > 2) {
                    items.push({ description: desc, quantity: qty, rate, amount });
                }
            } else if (itemMatch) {
                // Might be "Desc ... Amount"
                const desc = itemMatch[1].trim();
                const amount = parseFloat(itemMatch[3].replace(/,/g, ""));

                if (!/^(description|item|product|qty|rate|amount|price)/i.test(desc) && desc.length > 2) {
                    items.push({ description: desc, quantity: 1, rate: amount, amount });
                }
            }
        }
    }

    // Address heuristic - simplistic but better than nothing
    // Grab lines that look like addresses (more than 2 words, no numbers only)
    if (senderName && !senderAddress) {
        // Find lines after senderName
        // This is complex without layout analysis, skipping for heuristic simplicity
        // Could assume lines immediately following name are address
    }

    return {
        invoiceNumber: invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
        date: date || new Date().toISOString().split("T")[0],
        dueDate,
        senderName,
        senderEmail,
        senderAddress,
        clientName,
        clientEmail,
        clientAddress,
        currency,
        note,
        items:
            items.length > 0
                ? items
                : [{ description: "", quantity: 1, rate: 0, amount: 0 }],
        rawText: text, // Useful for debugging
    };
}

function tryParseDate(dateStr: string): string | null {
    const cleaned = dateStr.replace(/[,]/g, "").trim();

    let match = cleaned.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (match) {
        const day = match[1].padStart(2, "0");
        const month = match[2].padStart(2, "0");
        let year = match[3];
        if (year.length === 2) year = "20" + year;
        return `${year}-${month}-${day}`;
    }

    const months: Record<string, string> = {
        jan: "01", january: "01", feb: "02", february: "02",
        mar: "03", march: "03", apr: "04", april: "04",
        may: "05", jun: "06", june: "06", jul: "07", july: "07",
        aug: "08", august: "08", sep: "09", september: "09",
        oct: "10", october: "10", nov: "11", november: "11",
        dec: "12", december: "12",
    };

    match = cleaned.match(/(\w+)\s+(\d{1,2})\s+(\d{4})/);
    if (match && months[match[1].toLowerCase()]) {
        return `${match[3]}-${months[match[1].toLowerCase()]}-${match[2].padStart(2, "0")}`;
    }

    match = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (match && months[match[2].toLowerCase()]) {
        return `${match[3]}-${months[match[2].toLowerCase()]}-${match[1].padStart(2, "0")}`;
    }

    match = cleaned.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (match) {
        return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    }

    return null;
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // Prioritize Sarvam AI if key exists
        const sarvamKey = process.env.SARVAM_API_KEY;
        if (sarvamKey) {
            console.log("Processing with Sarvam AI Vision...");
            try {
                const sarvamFormData = new FormData();
                // Sarvam expects 'file' (or 'image' based on my test 489 error saying "body.file : Field required")
                sarvamFormData.append("file", new Blob([buffer], { type: file.type }), file.name);
                // Use a valid prompt_type
                sarvamFormData.append("prompt_type", "extract_as_markdown");

                const res = await fetch("https://api.sarvam.ai/vision", {
                    method: "POST",
                    headers: {
                        "api-subscription-key": sarvamKey,
                    },
                    body: sarvamFormData,
                });

                if (res.ok) {
                    const data = await res.json();
                    console.log("Sarvam response:", JSON.stringify(data).slice(0, 200) + "...");

                    // Parse Sarvam's output. It usually returns 'text' or 'content'.
                    // If prompt asked for JSON, it might be in data.content or data.message.content
                    // We need to handle flexible output.

                    let rawText = "";
                    if (typeof data === 'string') rawText = data;
                    else if (data.content) rawText = data.content;
                    else if (data.text) rawText = data.text;
                    else if (data.message?.content) rawText = data.message.content;
                    else rawText = JSON.stringify(data);

                    // Try to parse JSON from the text if it looks like JSON
                    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            const parsedJson = JSON.parse(jsonMatch[0]);
                            // Map to our internal format
                            return NextResponse.json({
                                invoiceNumber: parsedJson.invoice_number || parsedJson.invoiceNumber || "",
                                date: parsedJson.date || "",
                                dueDate: parsedJson.due_date || parsedJson.dueDate || "",
                                senderName: parsedJson.sender_name || parsedJson.senderName || "",
                                clientName: parsedJson.client_name || parsedJson.clientName || "",
                                total: parsedJson.total_amount || parsedJson.total || 0,
                                currency: parsedJson.currency || "INR",
                                items: Array.isArray(parsedJson.line_items) ? parsedJson.line_items.map((item: any) => ({
                                    description: item.description || "",
                                    quantity: Number(item.quantity) || 1,
                                    rate: Number(item.rate) || 0,
                                    amount: Number(item.amount) || 0
                                })) : [],
                                rawText // Include for debugging
                            });
                        } catch (e) {
                            console.error("Failed to parse JSON from Sarvam:", e);
                        }
                    }

                    // Fallback to text parsing if JSON parsing failed or wasn't JSON
                    return NextResponse.json(parseInvoiceFromText(rawText));
                } else {
                    console.error("Sarvam API failed:", res.status, await res.text());
                    // Fallback to OCR.space below
                }
            } catch (e) {
                console.error("Sarvam processing error:", e);
                // Fallback
            }
        }

        // --- Fallback to OCR.space ---
        const base64Image = `data:${file.type};base64,${buffer.toString("base64")}`;
        console.log("Processing file with OCR.space (Fallback)...", file.name);

        const ocrFormData = new FormData();
        ocrFormData.append("apikey", OCR_SPACE_API_KEY);
        ocrFormData.append("base64Image", base64Image);
        ocrFormData.append("language", "eng");
        ocrFormData.append("isTable", "true");
        ocrFormData.append("detectOrientation", "true");
        ocrFormData.append("scale", "true");
        ocrFormData.append("OCREngine", "2");

        const res = await fetch(OCR_SPACE_URL, {
            method: "POST",
            body: ocrFormData,
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error("OCR.space API error:", res.status, errText);
            return NextResponse.json(
                { error: `OCR service error: ${res.status}` },
                { status: 502 }
            );
        }

        const data = await res.json();

        if (data.IsErroredOnProcessing) {
            console.error("OCR.space processing error:", data.ErrorMessage);
            return NextResponse.json(
                { error: `OCR processing failed: ${data.ErrorMessage?.join(", ") || "Unknown error"}` },
                { status: 422 }
            );
        }

        if (!data.ParsedResults || data.ParsedResults.length === 0) {
            return NextResponse.json(
                { error: "No text could be extracted." },
                { status: 422 }
            );
        }

        const extractedText = data.ParsedResults
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((result: any) => result.ParsedText)
            .join("\n\n");

        console.log("Extracted text length:", extractedText.length);
        const parsed = parseInvoiceFromText(extractedText);
        return NextResponse.json(parsed);

    } catch (error) {
        console.error("OCR processing error:", error);
        return NextResponse.json(
            { error: "Failed to process image: " + (error instanceof Error ? error.message : "Unknown error") },
            { status: 500 }
        );
    }
}
