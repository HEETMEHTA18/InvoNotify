import { NextRequest, NextResponse } from "next/server";
import YAML from "yaml";

// Helper: Parse date strings
function parseDate(dateStr: string): string {
    if (!dateStr) return "";

    // Tally XML format: YYYYMMDD
    const yyyymmdd = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (yyyymmdd) {
        return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;
    }

    // Tally YAML format: 1-Apr-2025
    const months: Record<string, string> = {
        jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
        jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
    };
    const dayMonthYear = dateStr.match(/^(\d{1,2})-(\w{3})-(\d{4})$/);
    if (dayMonthYear) {
        const month = months[dayMonthYear[2].toLowerCase()];
        if (month) {
            return `${dayMonthYear[3]}-${month}-${dayMonthYear[1].padStart(2, "0")}`;
        }
    }

    // Try ISO or standard parsing
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split("T")[0];
    }

    return "";
}

// Parse Tally YAML invoice data
function parseTallyYAML(yamlContent: string) {
    try {
        const data = YAML.parse(yamlContent);

        // Expecting a "transactions" array
        const transactions = data.transactions || [];
        if (!Array.isArray(transactions) || transactions.length === 0) {
            console.error("No transactions found in YAML");
            return null;
        }

        // For now, take the first transaction that looks like an invoice
        // Or just the first one if we can't find a specific type
        const invoice = transactions.find((t: any) =>
            t.voucher_type === "Sales" || t.voucher_type === "Purchase" || t.invoice_no
        ) || transactions[0];

        if (!invoice) return null;

        const items: {
            description: string;
            quantity: number;
            rate: number;
            amount: number;
        }[] = [];

        // Inventory items
        if (Array.isArray(invoice.inventory)) {
            for (const item of invoice.inventory) {
                const qty = Number(item.quantity) || 1;
                const rate = Number(item.rate) || 0;
                const amt = Number(item.amount) || (qty * rate);

                items.push({
                    description: item.item_name || item.description || "Item",
                    quantity: qty,
                    rate: rate,
                    amount: amt,
                });
            }
        }

        // Ledger allocations (e.g. Tax, Service charges)
        if (Array.isArray(invoice.ledger_allocations)) {
            for (const ledger of invoice.ledger_allocations) {
                // Skip tax ledgers if you want, or include them as line items
                // Usually taxes are separate, but for simple import we can add them as items
                // or just ignore them depending on requirement. 
                // Let's add them as line items for now so the total matches Tally.
                const amount = Number(ledger.amount) || 0;
                if (amount > 0) {
                    items.push({
                        description: ledger.ledger_name || "Charge",
                        quantity: 1,
                        rate: amount,
                        amount: amount,
                    });
                }
            }
        }

        return {
            invoiceNumber: invoice.invoice_no || `INV-${Date.now().toString().slice(-6)}`,
            date: parseDate(invoice.date) || new Date().toISOString().split("T")[0],
            dueDate: parseDate(invoice.due_date) || "",
            senderName: invoice.company_name || "", // Often not in transaction, might need default
            senderEmail: "",
            senderAddress: "",
            clientName: invoice.party_ledger || "",
            clientEmail: "",
            clientAddress: "",
            currency: "INR",
            note: invoice.narration || "",
            items: items.length > 0 ? items : [{ description: "", quantity: 1, rate: 0, amount: 0 }],
        };

    } catch (e) {
        console.error("YAML parsing error:", e);
        return null;
    }
}

// Parse Tally XML invoice data into our invoice format
function parseTallyXML(xmlContent: string) {
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
    let currency = "INR"; // Tally is Indian software, default INR
    const items: { description: string; quantity: number; rate: number; amount: number }[] = [];

    // Simple XML tag extraction helper
    function getTagValue(xml: string, tag: string): string {
        // Try both exact case and case-insensitive
        const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
        const match = xml.match(regex);
        return match ? match[1].trim() : "";
    }

    function getAllTagValues(xml: string, tag: string): string[] {
        const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
        const matches: string[] = [];
        let m;
        while ((m = regex.exec(xml)) !== null) {
            matches.push(m[1].trim());
        }
        return matches;
    }

    function getAllTags(xml: string, tag: string): string[] {
        const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
        const matches: string[] = [];
        let m;
        while ((m = regex.exec(xml)) !== null) {
            matches.push(m[0]);
        }
        return matches;
    }

    // --- Tally XML Structure Parsing ---

    // Voucher Number (Invoice Number)
    invoiceNumber =
        getTagValue(xmlContent, "VOUCHERNUMBER") ||
        getTagValue(xmlContent, "INVOICENUMBER") ||
        getTagValue(xmlContent, "VCHNO") ||
        getTagValue(xmlContent, "NUMBER") ||
        `INV-${Date.now().toString().slice(-6)}`;

    // Date - Tally uses YYYYMMDD format
    const rawDate =
        getTagValue(xmlContent, "DATE") ||
        getTagValue(xmlContent, "VOUCHERDATE") ||
        getTagValue(xmlContent, "VCHDATE");
    date = parseDate(rawDate);

    // Due date
    const rawDueDate = getTagValue(xmlContent, "DUEDATE") || getTagValue(xmlContent, "EFFECTIVEDATE");
    dueDate = parseDate(rawDueDate);

    // Company / Sender info
    senderName =
        getTagValue(xmlContent, "COMPANYNAME") ||
        getTagValue(xmlContent, "SENDERCOMPANY") ||
        getTagValue(xmlContent, "PARTYNAME") ||
        "";

    senderAddress =
        getTagValue(xmlContent, "COMPANYADDRESS") ||
        getTagValue(xmlContent, "ADDRESS") ||
        "";

    senderEmail = getTagValue(xmlContent, "COMPANYEMAIL") || getTagValue(xmlContent, "EMAIL") || "";

    // Client / Buyer info
    clientName =
        getTagValue(xmlContent, "BUYERNAME") ||
        getTagValue(xmlContent, "PARTYLEDGERNAME") ||
        getTagValue(xmlContent, "PARTYNAME") ||
        getTagValue(xmlContent, "CUSTOMERNAME") ||
        getTagValue(xmlContent, "LEDGERNAME") ||
        "";

    // If senderName and clientName are the same, try to differentiate
    if (senderName === clientName) {
        const allPartyNames = getAllTagValues(xmlContent, "PARTYLEDGERNAME");
        if (allPartyNames.length > 1) {
            clientName = allPartyNames[1];
        } else {
            const ledgerNames = getAllTagValues(xmlContent, "LEDGERNAME");
            if (ledgerNames.length > 0) clientName = ledgerNames[0];
        }
    }

    clientAddress =
        getTagValue(xmlContent, "BUYERADDRESS") ||
        getTagValue(xmlContent, "CONSIGNEEADDRESS") ||
        "";

    clientEmail = getTagValue(xmlContent, "BUYEREMAIL") || "";

    // Note
    note =
        getTagValue(xmlContent, "NARRATION") ||
        getTagValue(xmlContent, "NOTES") ||
        getTagValue(xmlContent, "DESCRIPTION") ||
        "";

    // Currency
    const curr = getTagValue(xmlContent, "CURRENCYNAME") || getTagValue(xmlContent, "BASECURRENCYNAME");
    if (curr) {
        const currUpper = curr.toUpperCase().replace(/[^A-Z]/g, "");
        if (["USD", "EUR", "GBP", "INR", "CAD", "AUD"].includes(currUpper)) {
            currency = currUpper;
        } else if (currUpper.includes("RUPEE") || currUpper.includes("INR")) {
            currency = "INR";
        }
    }

    // Line Items - Tally uses ALLINVENTORYENTRIES.LIST or INVENTORYENTRIES.LIST
    const inventoryEntries =
        getAllTags(xmlContent, "ALLINVENTORYENTRIES.LIST") ||
        getAllTags(xmlContent, "INVENTORYENTRIES.LIST") ||
        getAllTags(xmlContent, "ALLINVENTORYENTRIESLIST") ||
        [];

    for (const entry of inventoryEntries) {
        const stockName =
            getTagValue(entry, "STOCKITEMNAME") ||
            getTagValue(entry, "ITEMNAME") ||
            getTagValue(entry, "DESCRIPTION") ||
            "";

        const qtyRaw = getTagValue(entry, "BILLEDQTY") || getTagValue(entry, "ACTUALQTY") || "1";
        const rateRaw = getTagValue(entry, "RATE") || "0";
        const amountRaw = getTagValue(entry, "AMOUNT") || "0";

        // Parse quantity - Tally sometimes uses "10 Nos" format
        const qtyMatch = qtyRaw.match(/([\d.]+)/);
        const quantity = qtyMatch ? Math.abs(parseFloat(qtyMatch[1])) : 1;

        // Parse rate
        const rateMatch = rateRaw.match(/([\d.]+)/);
        const rate = rateMatch ? Math.abs(parseFloat(rateMatch[1])) : 0;

        // Parse amount
        const amountMatch = amountRaw.match(/([\d.]+)/);
        const amount = amountMatch ? Math.abs(parseFloat(amountMatch[1])) : quantity * rate;

        if (stockName) {
            items.push({
                description: stockName,
                quantity,
                rate,
                amount: amount || quantity * rate,
            });
        }
    }

    // If no inventory entries found, try LEDGERENTRIES for service invoices
    if (items.length === 0) {
        const ledgerEntries =
            getAllTags(xmlContent, "ALLLEDGERENTRIES.LIST") ||
            getAllTags(xmlContent, "LEDGERENTRIES.LIST") ||
            [];

        for (const entry of ledgerEntries) {
            const ledgerName = getTagValue(entry, "LEDGERNAME") || "";
            const amountRaw = getTagValue(entry, "AMOUNT") || "0";

            const amountMatch = amountRaw.match(/([\d.]+)/);
            const amount = amountMatch ? Math.abs(parseFloat(amountMatch[1])) : 0;

            // Skip party ledger entries (those are usually the buyer/seller, not items)
            if (ledgerName && amount > 0 && ledgerName !== clientName && ledgerName !== senderName) {
                items.push({
                    description: ledgerName,
                    quantity: 1,
                    rate: amount,
                    amount,
                });
            }
        }
    }

    return {
        invoiceNumber,
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
        items: items.length > 0 ? items : [{ description: "", quantity: 1, rate: 0, amount: 0 }],
    };
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        // Validate file type
        const fileName = file.name.toLowerCase();
        const isYaml = fileName.endsWith(".yml") || fileName.endsWith(".yaml");
        const isXml = fileName.endsWith(".xml");

        if (!isXml && !isYaml) {
            return NextResponse.json(
                { error: "Invalid file type. Please upload a Tally XML/YML file" },
                { status: 400 }
            );
        }

        const text = await file.text();

        if (!text.trim()) {
            return NextResponse.json({ error: "File is empty" }, { status: 400 });
        }

        let parsed;
        if (isYaml) {
            parsed = parseTallyYAML(text);
        } else {
            parsed = parseTallyXML(text);
        }

        if (!parsed) {
            return NextResponse.json({ error: "Could not extract invoice data from file. Please check the file format." }, { status: 422 });
        }

        return NextResponse.json(parsed);
    } catch (error) {
        console.error("Tally import error:", error);
        return NextResponse.json(
            { error: "Failed to parse Tally file" },
            { status: 500 }
        );
    }
}
