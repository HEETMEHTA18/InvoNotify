
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import * as yaml from "js-yaml";
import { XMLParser } from "fast-xml-parser";

import { auth } from "@/lib/auth";

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Fetch settings if user is authenticated
        const settings = await prisma.companySettings.findUnique({
            where: { userId: session.user.id }
        });

        const text = await req.text();
        console.log("[BulkImport] Received text length:", text.length);
        console.log("[BulkImport] First 100 characters:", text.substring(0, 100).replace(/\n/g, "\\n"));

        let data: any = null;
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
                const xmlObj = parser.parse(text);

                // Recursive function to find all VOUCHER objects
                const findVouchers = (obj: any): any[] => {
                    let results: any[] = [];
                    if (!obj || typeof obj !== "object") return results;

                    if (obj.VOUCHER) {
                        const vData = Array.isArray(obj.VOUCHER) ? obj.VOUCHER : [obj.VOUCHER];
                        results.push(...vData);
                    }

                    for (const key in obj) {
                        if (key !== "VOUCHER") {
                            results.push(...findVouchers(obj[key]));
                        }
                    }
                    return results;
                };

                const vouchers = findVouchers(xmlObj);
                console.log(`[BulkImport] Found ${vouchers.length} potential vouchers in XML.`);

                if (vouchers.length > 0) {
                    isTallyXml = true;
                    data = {
                        transactions: vouchers.map((v: any) => {
                            // Map Tally XML fields to a common format
                            const partyLedger = v.PARTYLEDGERNAME || v["PARTYLEDGERNAME.#text"] || "Unknown Client";
                            const invoiceNo = v.VOUCHERNUMBER || v.REFERENCE || v["VOUCHERNUMBER.#text"];
                            const date = v.DATE || v["DATE.#text"];
                            const narration = v.NARRATION || v["NARRATION.#text"];

                            const inventoryEntriesList = v["ALLINVENTORYENTRIES.LIST"] || [];
                            const inventoryEntries = Array.isArray(inventoryEntriesList) ? inventoryEntriesList : [inventoryEntriesList];

                            const inventory = inventoryEntries.map((i: any) => ({
                                item_name: i.STOCKITEMNAME || i["STOCKITEMNAME.#text"] || "Item",
                                quantity: String(i.BILLEDQTY || i["BILLEDQTY.#text"] || "1").split(" ")[0],
                                rate: parseFloat(String(i.RATE || i["RATE.#text"] || "0").split("/")[0]) || 0,
                                amount: Math.abs(parseFloat(String(i.AMOUNT || i["AMOUNT.#text"] || "0"))) || 0
                            }));

                            const ledgerEntriesList = v["ALLLEDGERENTRIES.LIST"] || [];
                            const ledgerEntries = Array.isArray(ledgerEntriesList) ? ledgerEntriesList : [ledgerEntriesList];

                            const ledgers = ledgerEntries.map((l: any) => ({
                                ledger_name: l.LEDGERNAME || l["LEDGERNAME.#text"] || "Ledger",
                                amount: Math.abs(parseFloat(String(l.AMOUNT || l["AMOUNT.#text"] || "0"))) || 0
                            }));

                            return {
                                voucher_type: v["@_VCHTYPE"] || v.VOUCHERTYPENAME || "Sales",
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
                } catch (e: any) {
                    console.error("[BulkImport] All parsing failed:", e?.message);
                    return NextResponse.json({ error: "Invalid format. Upload JSON, YAML, or Tally XML." }, { status: 400 });
                }
            }
        }

        // --- Robust Array Detection ---
        let transactions = null;
        if (Array.isArray(data)) {
            transactions = data;
            console.log("[BulkImport] Data is directly an array.");
        } else if (data && typeof data === 'object') {
            transactions = data.transactions || data.invoices || data.vouchers || data.data;
            if (!transactions) {
                // If no direct key, check if any property is an array
                for (const key in data) {
                    if (Array.isArray(data[key])) {
                        transactions = data[key];
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
            try {
                // Only process Sales vouchers for now
                if (txn.voucher_type !== "Sales") continue;

                // Map YAML fields to Prisma model
                // Assuming date format is "1-Apr-2025" or ISO
                let date = new Date();
                if (txn.date) {
                    if (typeof txn.date === 'string' && txn.date.match(/^\d{1,2}-[A-Za-z]{3}-\d{4}$/)) {
                        date = new Date(txn.date);
                    } else {
                        date = new Date(txn.date);
                    }
                }

                let dueDate = null;
                if (txn.due_date) {
                    if (typeof txn.due_date === 'string' && txn.due_date.match(/^\d{1,2}-[A-Za-z]{3}-\d{4}$/)) {
                        dueDate = new Date(txn.due_date);
                    } else {
                        dueDate = new Date(txn.due_date);
                    }
                }

                let subtotal = 0;
                let tax = 0;

                // Calculate totals from inventory
                const items = (txn.inventory || []).map((item: any) => {
                    const amount = parseFloat(item.amount) || 0;
                    subtotal += amount;
                    return {
                        description: item.item_name || "Item",
                        quantity: parseInt(item.quantity) || 1,
                        rate: parseFloat(item.rate) || 0,
                        amount: amount
                    }
                });

                // Calculate tax from ledger allocations
                if (txn.ledger_allocations) {
                    for (const ledger of txn.ledger_allocations) {
                        if (ledger.ledger_name.includes("GST") || ledger.ledger_name.includes("Tax")) {
                            tax += parseFloat(ledger.amount) || 0;
                        }
                    }
                }

                const total = subtotal + tax;

                // Find customer if exists
                let customerId = null;
                if (txn.party_ledger) {
                    // Optionally filter customer by userId if multi-tenant
                    const customer = await prisma.customer.findFirst({
                        where: { name: txn.party_ledger /*, userId: session?.user?.id */ }
                    });
                    if (customer) customerId = customer.id;
                }

                const clientName = txn.party_ledger || txn.customer?.name || txn.clientName || "Unknown Client";
                const invoiceNumber = txn.invoice_no || txn.invoiceNumber || txn.id || `INV-${Date.now()}`;

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
                        date: date,
                        dueDate: dueDate,
                        status: "Pending", // Default status
                        subtotal: subtotal,
                        tax: tax,
                        total: total,
                        note: txn.narration || "",
                        // Use legacy fields for compatibility if needed, or map properly
                        customer: clientName,
                        amount: total,
                        customerId: customerId,
                        items: {
                            create: items
                        }
                    },
                });
                createdInvoices.push(invoice);
            } catch (error) {
                console.error("Error creating invoice:", error);
                errors.push({ transaction: txn, error: String(error) });
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
