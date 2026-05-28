
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import * as yaml from "js-yaml";
import { XMLParser } from "fast-xml-parser";

import { auth } from "@/lib/auth";

type JsonObject = Record<string, unknown>;

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Fetch settings if user is authenticated
        // First, ensure the user record exists in the database (handles wiped DB with active session)
        let user = await prisma.user.findUnique({
            where: { id: session.user.id }
        });

        if (!user && session.user.email) {
            console.log("[BulkImport] User missing from DB, recreating record for session ID:", session.user.id);
            user = await prisma.user.create({
                data: {
                    id: session.user.id,
                    email: session.user.email,
                    name: session.user.name,
                    image: session.user.image,
                }
            });
        }

        const settings = await prisma.companySettings.findUnique({
            where: { userId: session.user.id }
        });

        const text = await req.text();
        console.log("[BulkImport] Received text length:", text.length);
        console.log("[BulkImport] First 100 characters:", text.substring(0, 100).replace(/\n/g, "\\n"));

        let data: unknown = null;
        let isTallyXml = false;

        // Try parsing as XML (Tally format)
        if (text.trim().startsWith("<")) {
            console.log("[BulkImport] Potential XML detected.");
            try {
                const parser = new XMLParser({
                    ignoreAttributes: false,
                    attributeNamePrefix: "@_",
                    textNodeName: "#text"
                });
                const xmlObj = parser.parse(text) as JsonObject;

                // Recursive function to find all VOUCHER objects
                const findVouchers = (obj: unknown): JsonObject[] => {
                    const results: JsonObject[] = [];
                    if (!obj || typeof obj !== "object") return results;

                    const record = obj as JsonObject;
                    const voucherNode = record.VOUCHER;
                    if (voucherNode) {
                        const vData = Array.isArray(voucherNode) ? voucherNode : [voucherNode];
                        results.push(...vData.filter((entry): entry is JsonObject => typeof entry === "object" && entry !== null));
                    }

                    for (const key in record) {
                        if (key !== "VOUCHER") {
                            results.push(...findVouchers(record[key]));
                        }
                    }
                    return results;
                };

                const vouchers = findVouchers(xmlObj);
                console.log(`[BulkImport] Found ${vouchers.length} potential vouchers in XML.`);

                if (vouchers.length > 0) {
                    isTallyXml = true;
                    data = {
                        transactions: vouchers.map((v) => {
                            // Map Tally XML fields to a common format
                            const partyLedger = String(v.PARTYLEDGERNAME || v["PARTYLEDGERNAME.#text"] || "Unknown Client");
                            const invoiceNo = String(v.VOUCHERNUMBER || v.REFERENCE || v["VOUCHERNUMBER.#text"] || "");
                            const date = String(v.DATE || v["DATE.#text"] || "");
                            const narration = String(v.NARRATION || v["NARRATION.#text"] || "");

                            const inventoryEntriesList = v["ALLINVENTORYENTRIES.LIST"] || [];
                            const inventoryEntries = Array.isArray(inventoryEntriesList) ? inventoryEntriesList : [inventoryEntriesList];

                            const inventory = inventoryEntries.map((entry) => {
                                const i = (typeof entry === "object" && entry !== null) ? (entry as JsonObject) : {};
                                return {
                                    item_name: String(i.STOCKITEMNAME || i["STOCKITEMNAME.#text"] || "Item"),
                                    quantity: String(i.BILLEDQTY || i["BILLEDQTY.#text"] || "1").split(" ")[0],
                                    rate: parseFloat(String(i.RATE || i["RATE.#text"] || "0").split("/")[0]) || 0,
                                    amount: Math.abs(parseFloat(String(i.AMOUNT || i["AMOUNT.#text"] || "0"))) || 0,
                                };
                            });

                            const ledgerEntriesList = v["ALLLEDGERENTRIES.LIST"] || [];
                            const ledgerEntries = Array.isArray(ledgerEntriesList) ? ledgerEntriesList : [ledgerEntriesList];

                            const ledgers = ledgerEntries.map((entry) => {
                                const l = (typeof entry === "object" && entry !== null) ? (entry as JsonObject) : {};
                                return {
                                    ledger_name: String(l.LEDGERNAME || l["LEDGERNAME.#text"] || "Ledger"),
                                    amount: Math.abs(parseFloat(String(l.AMOUNT || l["AMOUNT.#text"] || "0"))) || 0,
                                };
                            });

                            return {
                                voucher_type: String(v["@_VCHTYPE"] || v.VOUCHERTYPENAME || "Sales"),
                                invoice_no: invoiceNo,
                                date: date,
                                party_ledger: partyLedger,
                                inventory,
                                ledger_allocations: ledgers,
                                narration: narration
                            };
                        })
                    };
                } else {
                    console.log("[BulkImport] No vouchers found in XML after recursive search.");
                }
            } catch (e) {
                console.warn("[BulkImport] XML parsing failed:", e);
            }
        }

        if (!isTallyXml) {
            console.log("[BulkImport] Not Tally XML, trying JSON/YAML.");
            // Try parsing as JSON first, then YAML
            try {
                data = JSON.parse(text);
                console.log("[BulkImport] Parsed as JSON.");
            } catch {
                try {
                    data = yaml.load(text);
                    console.log("[BulkImport] Parsed as YAML.");
                } catch (e: unknown) {
                    const message = e instanceof Error ? e.message : String(e);
                    console.error("[BulkImport] All parsing failed:", message);
                    return NextResponse.json({ error: "Invalid format. Upload JSON, YAML, or Tally XML." }, { status: 400 });
                }
            }
        }

        // --- Robust Array Detection ---
        let transactions: unknown[] | null = null;
        if (Array.isArray(data)) {
            transactions = data;
            console.log("[BulkImport] Data is directly an array.");
        } else if (data && typeof data === 'object') {
            const dataObj = data as Record<string, unknown>;
            transactions = (dataObj.transactions as unknown[] | undefined) || (dataObj.invoices as unknown[] | undefined) || (dataObj.vouchers as unknown[] | undefined) || (dataObj.data as unknown[] | undefined) || null;
            if (!transactions) {
                // If no direct key, check if any property is an array
                for (const key in dataObj) {
                    if (Array.isArray(dataObj[key])) {
                        transactions = dataObj[key] as unknown[];
                        console.log(`[BulkImport] Found array in key '${key}'`);
                        break;
                    }
                }
            }
        }

        if (!transactions || !Array.isArray(transactions)) {
            console.error("[BulkImport] Could not find a transactions array in the data.");
            return NextResponse.json({ error: "Invalid data structure. Could not find a list of transactions." }, { status: 400 });
        }

        const createdInvoices = [];
        const skippedInvoices = [];
        const errors = [];

        for (const txn of transactions) {
            let txnData: JsonObject = {};
            try {
                txnData = (typeof txn === "object" && txn !== null) ? (txn as JsonObject) : {};

                // Only process Sales vouchers for now
                if (String(txnData.voucher_type || "") !== "Sales") continue;

                // Map YAML fields to Prisma model
                // Assuming date format is "1-Apr-2025" or ISO
                let date = new Date();
                const txnDate = txnData.date;
                if (txnDate) {
                    if (typeof txnDate === "string" && txnDate.match(/^\d{1,2}-[A-Za-z]{3}-\d{4}$/)) {
                        date = new Date(txnDate);
                    } else {
                        date = new Date(String(txnDate));
                    }
                }

                let dueDate = null;
                const txnDueDate = txnData.due_date;
                if (txnDueDate) {
                    if (typeof txnDueDate === "string" && txnDueDate.match(/^\d{1,2}-[A-Za-z]{3}-\d{4}$/)) {
                        dueDate = new Date(txnDueDate);
                    } else {
                        dueDate = new Date(String(txnDueDate));
                    }
                }

                let subtotal = 0;
                let tax = 0;

                // Calculate totals from inventory
                const inventory = Array.isArray(txnData.inventory) ? txnData.inventory : [];
                const items = inventory.map((rawItem) => {
                    const item = (typeof rawItem === "object" && rawItem !== null) ? (rawItem as JsonObject) : {};
                    const amount = parseFloat(String(item.amount ?? "0")) || 0;
                    subtotal += amount;
                    return {
                        description: String(item.item_name || "Item"),
                        quantity: parseInt(String(item.quantity ?? "1"), 10) || 1,
                        rate: parseFloat(String(item.rate ?? "0")) || 0,
                        amount: amount
                    };
                });

                // Calculate tax from ledger allocations
                const ledgerAllocations = Array.isArray(txnData.ledger_allocations) ? txnData.ledger_allocations : [];
                for (const rawLedger of ledgerAllocations) {
                    const ledger = (typeof rawLedger === "object" && rawLedger !== null) ? (rawLedger as JsonObject) : {};
                    const ledgerName = String(ledger.ledger_name || "");
                    if (ledgerName.includes("GST") || ledgerName.includes("Tax")) {
                        tax += parseFloat(String(ledger.amount ?? "0")) || 0;
                    }
                }

                const total = subtotal + tax;

                const toBoolean = (value: unknown, fallback = false) => {
                    if (typeof value === "boolean") return value;
                    if (typeof value === "string") {
                        const normalized = value.trim().toLowerCase();
                        if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
                        if (normalized === "false" || normalized === "0" || normalized === "no") return false;
                    }
                    if (typeof value === "number") return value === 1;
                    return fallback;
                };

                const toIntArray = (value: unknown) => {
                    if (!Array.isArray(value)) return [] as number[];
                    const unique = new Set<number>();
                    for (const raw of value) {
                        const parsed = Number(raw);
                        if (!Number.isInteger(parsed)) continue;
                        if (parsed < 0 || parsed > 30) continue;
                        unique.add(parsed);
                    }
                    return Array.from(unique).sort((a, b) => b - a);
                };

                // Find customer if exists
                let customerId = null;
                const partyLedger = String(txnData.party_ledger || "");
                if (partyLedger) {
                    // Optionally filter customer by userId if multi-tenant
                    const customer = await prisma.customer.findFirst({
                        where: { name: partyLedger /*, userId: session?.user?.id */ }
                    });
                    if (customer) customerId = customer.id;
                }

                const customerObj = (typeof txnData.customer === "object" && txnData.customer !== null)
                    ? (txnData.customer as JsonObject)
                    : {};
                const clientName = String(txnData.party_ledger || customerObj.name || txnData.clientName || "Unknown Client");
                const clientEmail = String(
                    txnData.client_email || txnData.clientEmail || customerObj.email || ""
                );
                const clientPhone = String(
                    txnData.client_phone || txnData.clientPhone || customerObj.phone || ""
                );
                const invoiceNumber = String(txnData.invoice_no || txnData.invoiceNumber || txnData.id || `INV-${Date.now()}`);
                const rawStatus = String(txnData.status || "Pending").trim();
                const status = rawStatus ? rawStatus[0].toUpperCase() + rawStatus.slice(1).toLowerCase() : "Pending";

                const autoReminderEnabled = toBoolean(
                    txnData.auto_reminder_enabled ?? txnData.autoReminderEnabled,
                    false
                );
                const reminderOffsets = toIntArray(txnData.reminder_offsets ?? txnData.reminderOffsets);
                const overdueReminderEnabled = toBoolean(
                    txnData.overdue_reminder_enabled ?? txnData.overdueReminderEnabled,
                    false
                );
                const parsedEveryDays = Number(
                    txnData.overdue_reminder_every_days ?? txnData.overdueReminderEveryDays ?? 3
                );
                const overdueReminderEveryDays = Number.isInteger(parsedEveryDays)
                    ? Math.max(1, Math.min(30, parsedEveryDays))
                    : 3;
                const rawReminderChannel = String(
                    txnData.reminder_channel ?? txnData.reminderChannel ?? "EMAIL"
                ).toUpperCase();
                const reminderChannel =
                    rawReminderChannel === "SMS" || rawReminderChannel === "BOTH"
                        ? rawReminderChannel
                        : "EMAIL";
                const parsedAmountPaid = Number(txnData.amount_paid ?? txnData.amountPaid ?? NaN);
                const amountPaid = status === "Paid"
                    ? total
                    : Number.isFinite(parsedAmountPaid)
                        ? Math.max(0, Math.min(total, parsedAmountPaid))
                        : 0;
                const balance = Math.max(0, total - amountPaid);

                // Check for duplicate invoice number
                if (invoiceNumber) {
                    const existingInvoice = await prisma.invoice.findFirst({
                        where: { invoiceNumber: invoiceNumber, ownerUserId: session?.user?.id }
                    });
                    if (existingInvoice) {
                        console.log(`Skipping duplicate invoice: ${invoiceNumber}`);
                        // FIX: If the existing invoice has no owner, claim it for this user
                        if (!existingInvoice.ownerUserId && session?.user?.id) {
                            console.log(`Claiming orphaned invoice: ${invoiceNumber} for user ${session.user.id}`);
                            await prisma.invoice.update({
                                where: { id: existingInvoice.id },
                                data: {
                                    ownerUserId: session.user.id,
                                    userId: session.user.id
                                }
                            });
                        }

                        skippedInvoices.push(invoiceNumber);
                        continue;
                    }
                }

                const invoice = await prisma.invoice.create({
                    data: {
                        invoiceNumber: invoiceNumber,
                        ownerUserId: session?.user?.id, // CRITICAL FIX: Link to user
                        userId: session?.user?.id,      // Linking with both fields just in case
                        senderName: settings?.name || "Shiv Hardware",
                        senderEmail: settings?.email || "shivhardware@gmail.com",
                        senderAddress: settings?.address || "Shiv Hardware, Nadiad",
                        clientName: clientName,
                        clientEmail,
                        clientPhone,
                        date: date,
                        dueDate: dueDate,
                        status,
                        subtotal: subtotal,
                        tax: tax,
                        total: total,
                        note: String(txnData.narration || ""),
                        // Use legacy fields for compatibility if needed, or map properly
                        customer: clientName,
                        amount: total,
                        amountPaid,
                        balance,
                        autoReminderEnabled,
                        reminderOffsets: autoReminderEnabled ? reminderOffsets : [],
                        overdueReminderEnabled: autoReminderEnabled ? overdueReminderEnabled : false,
                        overdueReminderEveryDays,
                        reminderChannel,
                        customerId: customerId,
                        items: {
                            create: items
                        }
                    },
                });
                createdInvoices.push(invoice);
            } catch (error) {
                console.error("Error creating invoice:", error);
                errors.push({ transaction: txnData, error: String(error) });
            }
        }

        return NextResponse.json({
            message: `Processed ${transactions.length} items. Created ${createdInvoices.length} invoices. Skipped ${skippedInvoices.length} duplicates.`,
            createdCount: createdInvoices.length,
            skippedCount: skippedInvoices.length,
            skippedInvoices: skippedInvoices,
            errors: errors
        });

    } catch (error) {
        console.error("Bulk import error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
