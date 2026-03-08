import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Define interface for Invoice to avoid any type errors
interface InvoiceItem {
    description: string;
    quantity: number;
    rate: string;
    amount: string;
}

interface Invoice {
    id: number;
    invoiceNumber: string;
    date: string;
    dueDate: string | null;
    clientName: string;
    clientEmail: string;
    clientAddress: string;
    senderName: string;
    senderEmail: string;
    senderAddress: string;
    items: InvoiceItem[];
    subtotal: string;
    total: string;
    amount?: string;
    currency: string;
    note: string;
    status: string;
}

interface CompanySettings {
    logo: string | null;
    signature: string | null;
}

export const getInvoicePDFDoc = (invoice: Invoice, settings?: CompanySettings) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.height;

    // Helper to format date safely
    const safeFormatDate = (dateString: string | null | undefined) => {
        if (!dateString) return "—";
        try {
            const date = new Date(dateString);
            return isNaN(date.getTime()) ? "Invalid Date" : date.toLocaleDateString();
        } catch {
            return "Error";
        }
    };

    // Helper to add text with fallback
    const addText = (text: string | null | undefined, x: number, y: number, options?: any) => {
        doc.text(text || "", x, y, options);
    };

    // --- Logo ---
    if (settings?.logo) {
        try {
            doc.addImage(settings.logo, "PNG", 14, 10, 30, 30);
        } catch (e) {
            console.warn("Could not add logo to PDF", e);
        }
    }

    // --- Header Text ---
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text("INVOICE", pageWidth - 14, 20, { align: "right" });

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    addText(`#${invoice.invoiceNumber}`, pageWidth - 14, 25, { align: "right" });

    // --- Status Badge ---
    const status = invoice.status || "Pending";
    doc.setFillColor(status === "Paid" ? 220 : 255, status === "Paid" ? 255 : 240, status === "Paid" ? 220 : 200);
    doc.setTextColor(status === "Paid" ? 0 : 200, status === "Paid" ? 128 : 100, 0);
    doc.setFontSize(10);
    addText(status.toUpperCase(), pageWidth - 14, 32, { align: "right" });

    // --- Sender Details ---
    const senderStartY = settings?.logo ? 45 : 20;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    addText(invoice.senderName || "Company Name", 14, senderStartY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    addText(invoice.senderEmail, 14, senderStartY + 5);
    const senderAddr = doc.splitTextToSize(invoice.senderAddress || "", 60);
    doc.text(senderAddr, 14, senderStartY + 10);

    // --- Dates ---
    let yPos = 45;
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    addText("Date:", pageWidth - 50, yPos);
    doc.setTextColor(0, 0, 0);
    addText(safeFormatDate(invoice.date), pageWidth - 14, yPos, { align: "right" });

    yPos += 5;
    if (invoice.dueDate) {
        doc.setTextColor(100, 100, 100);
        addText("Due Date:", pageWidth - 50, yPos);
        doc.setTextColor(0, 0, 0);
        addText(safeFormatDate(invoice.dueDate), pageWidth - 14, yPos, { align: "right" });
    }

    // --- Bill To ---
    yPos = Math.max(senderStartY + 15 + (senderAddr.length * 5), 70);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    addText("Bill To:", 14, yPos);

    yPos += 5;
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    addText(invoice.clientName, 14, yPos);

    yPos += 5;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    addText(invoice.clientEmail, 14, yPos);

    yPos += 5;
    const clientAddr = doc.splitTextToSize(invoice.clientAddress || "", 80);
    doc.text(clientAddr, 14, yPos);

    // --- Items Table ---
    const tableStartY = yPos + (clientAddr.length * 5) + 10;
    const tableHead = [["Description", "Qty", "Rate", "Amount"]];
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    const tableBody = items.map((item) => [
        item.description,
        item.quantity,
        `${invoice.currency || "$"}${item.rate}`,
        `${invoice.currency || "$"}${item.amount}`,
    ]);

    autoTable(doc, {
        startY: tableStartY,
        head: tableHead,
        body: tableBody,
        theme: "striped",
        headStyles: { fillColor: [89, 103, 120] },
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
            0: { cellWidth: "auto" },
            1: { cellWidth: 20, halign: "center" },
            2: { cellWidth: 30, halign: "right" },
            3: { cellWidth: 30, halign: "right" },
        },
    });

    // --- Totals ---
    // @ts-ignore
    let finalY = doc.lastAutoTable.finalY + 10;
    const currency = invoice.currency || "$";

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("Subtotal:", pageWidth - 70, finalY);
    doc.setTextColor(0, 0, 0);
    doc.text(`${currency}${invoice.subtotal || "0.00"}`, pageWidth - 14, finalY, { align: "right" });

    finalY += 6;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Total:", pageWidth - 70, finalY + 4);
    doc.text(`${currency}${invoice.total || invoice.amount}`, pageWidth - 14, finalY + 4, { align: "right" });

    // --- Notes ---
    if (invoice.note) {
        finalY += 20;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text("Notes:", 14, finalY);

        doc.setTextColor(50, 50, 50);
        const notes = doc.splitTextToSize(invoice.note, 180);
        doc.text(notes, 14, finalY + 5);
        finalY += 5 + (notes.length * 5);
    }

    // --- Signature ---
    if (settings?.signature) {
        finalY += 10;
        if (finalY + 40 > pageHeight) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFontSize(9);
        doc.setTextColor(113, 128, 150);
        doc.text("AUTHORIZED SIGNATURE", 14, finalY);

        try {
            doc.addImage(settings.signature, "PNG", 14, finalY + 5, 40, 20);
        } catch (e) {
            console.warn("Could not add signature to PDF", e);
        }

        finalY += 30;
        doc.setDrawColor(45, 55, 72);
        doc.line(14, finalY, 80, finalY);
    }

    // --- Footer ---
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Generated by InvoiceFlow", pageWidth / 2, pageHeight - 10, { align: "center" });

    return doc;
};

export const generateInvoicePDF = (invoice: Invoice, settings?: CompanySettings) => {
    const doc = getInvoicePDFDoc(invoice, settings);
    doc.save(`invoice-${invoice.invoiceNumber || invoice.id}.pdf`);
};

export const generateInvoicePDFBuffer = (invoice: Invoice, settings?: CompanySettings): Uint8Array => {
    const doc = getInvoicePDFDoc(invoice, settings);
    return new Uint8Array(doc.output("arraybuffer"));
};
