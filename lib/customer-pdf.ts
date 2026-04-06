import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type CustomerHistoryItem = {
  id: number;
  invoiceNumber: string;
  date: string;
  dueDate: string | null;
  status: string;
  total: number;
  amountPaid: number;
  balance: number;
};

type CustomerExportRecord = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  cibilScore: number;
  openingBalance: number;
  history: CustomerHistoryItem[];
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function getRiskLabel(cibilScore: number) {
  if (cibilScore < 650) return "Risky";
  if (cibilScore >= 750) return "Good";
  return "Moderate";
}

export async function generateCustomersPdfBuffer(
  customers: CustomerExportRecord[],
  title = "Customer Report"
): Promise<Uint8Array> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(18);
  doc.text(title, 14, 18);

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth - 14, 18, { align: "right" });

  autoTable(doc, {
    startY: 26,
    head: [["Customer", "Contact", "Location", "CIBIL", "Risk", "Opening Bal.", "Invoices"]],
    body: customers.map((c) => [
      c.name,
      [c.email || "-", c.phone || "-"].filter(Boolean).join("\n"),
      [c.city || "-", c.state || ""].filter(Boolean).join(", "),
      String(c.cibilScore),
      getRiskLabel(c.cibilScore),
      `INR ${Number(c.openingBalance || 0).toFixed(2)}`,
      String(c.history.length),
    ]),
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: 255,
      fontStyle: "bold",
    },
    margin: { left: 14, right: 14 },
  });

  const tableDoc = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  let y = (tableDoc.lastAutoTable?.finalY || 32) + 10;

  for (const customer of customers) {
    if (y > 230) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(12);
    doc.setTextColor(17, 24, 39);
    doc.text(`${customer.name} (${getRiskLabel(customer.cibilScore)})`, 14, y);

    y += 6;
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    doc.text(
      `CIBIL: ${customer.cibilScore} | Opening Balance: INR ${Number(customer.openingBalance || 0).toFixed(2)} | Total History: ${customer.history.length}`,
      14,
      y
    );

    y += 4;

    if (customer.history.length === 0) {
      y += 6;
      doc.setFontSize(9);
      doc.text("No invoice history found.", 14, y);
      y += 4;
      continue;
    }

    autoTable(doc, {
      startY: y + 2,
      head: [["Invoice", "Date", "Due", "Status", "Total", "Paid", "Balance"]],
      body: customer.history.map((item) => [
        item.invoiceNumber || `#${item.id}`,
        formatDate(item.date),
        formatDate(item.dueDate),
        item.status,
        Number(item.total).toFixed(2),
        Number(item.amountPaid).toFixed(2),
        Number(item.balance).toFixed(2),
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: 51,
      },
      margin: { left: 14, right: 14 },
    });

    y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 10;
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
