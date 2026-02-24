"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  Send,
  Eye,
  Download,
  ArrowLeft,
  FileText,
  Loader2,
  CheckCircle2,
  Upload,
  Camera,
  FileSpreadsheet,
  X,
  Sparkles,
  AlertCircle,
  MessageSquare,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { REMINDER_CHANNEL_OPTIONS, REMINDER_OFFSET_OPTIONS, type ReminderChannel } from "@/app/utils/invoiceReminders";

type InvoiceItem = {
  description: string;
  hsnCode?: string;
  quantity: number;
  rate: number;
  amount: number;
};

type CompanySettings = {
  logo: string | null;
  signature: string | null;
};

type ImportMethod = "manual" | "tally" | "photo" | null;

export default function CreateInvoicePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<number | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [settings, setSettings] = useState<CompanySettings>({ logo: null, signature: null });

  // Import state
  const [importMethod, setImportMethod] = useState<ImportMethod>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [ocrRawText, setOcrRawText] = useState("");
  const [showRawText, setShowRawText] = useState(false);
  const tallyFileRef = useRef<HTMLInputElement>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const dataFileInputRef = useRef<HTMLInputElement>(null);
  const customerFileInputRef = useRef<HTMLInputElement>(null);

  async function handleBulkImport(e: React.ChangeEvent<HTMLInputElement>, type: 'invoice' | 'customer') {
    const file = e.target.files?.[0];
    if (!file) return;

    const endpoint = type === 'customer' ? "/api/customers/bulk-import" : "/api/invoices/bulk-import";

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setLoading(true);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          body: content,
        });
        const result = await res.json();
        if (res.ok) {
          alert(`Import successful: ${result.createdCount} records created.`);
          router.push("/dashboard/invoices"); // Redirect to list to see imported data
        } else {
          alert(`Import failed: ${result.error || "Unknown error"}`);
        }
      } catch (err) {
        alert("Import failed. See console.");
        console.error(err);
      } finally {
        setLoading(false);
        if (dataFileInputRef.current) dataFileInputRef.current.value = "";
        if (customerFileInputRef.current) customerFileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }

  // Form state

  const [senderName, setSenderName] = useState("Shiv Hardware");
  const [senderEmail, setSenderEmail] = useState("shivhardware@gmail.com");
  const [senderAddress, setSenderAddress] = useState("Shiv Hardware, Nadiad");

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [date, setDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [autoReminderEnabled, setAutoReminderEnabled] = useState(false);
  const [reminderOffsets, setReminderOffsets] = useState<number[]>([3, 1, 0]);
  const [overdueReminderEnabled, setOverdueReminderEnabled] = useState(true);
  const [overdueReminderEveryDays, setOverdueReminderEveryDays] = useState(3);
  const [reminderChannel, setReminderChannel] = useState<ReminderChannel>("EMAIL");

  const [currency, setCurrency] = useState("INR");
  const [note, setNote] = useState("");
  const [taxRate, setTaxRate] = useState(0);
  const [gstType, setGstType] = useState<"INTRA" | "INTER">("INTRA");
  const [template, setTemplate] = useState("Standard");
  const [discount, setDiscount] = useState(0);
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: "", hsnCode: "", quantity: 1, rate: 0, amount: 0 },
  ]);

  const currencySymbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    INR: "₹",
    CAD: "C$",
    AUD: "A$",
  };

  const searchParams = useSearchParams();
  const invoiceId = searchParams.get("invoiceId");
  const isEditing = !!invoiceId;

  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    fetchSettings();
    fetchCustomers();
    fetchProducts();
  }, []);

  async function fetchProducts() {
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch {
      console.error("Failed to fetch products");
    }
  }

  async function fetchCustomers() {
    try {
      const res = await fetch("/api/customers");
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } catch {
      console.error("Failed to fetch customers");
    }
  }

  function handleClientNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value;
    setClientName(name);

    // Auto-fill if match found
    const customer = customers.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (customer) {
      if (customer.email) setClientEmail(customer.email);
      if (customer.phone) setClientPhone(customer.phone);
      if (customer.address) setClientAddress(customer.address);
    }
  }

  async function fetchSettings() {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        // Pre-fill sender details if available, only if not editing
        if (!isEditing) {
          if (data.name) setSenderName(data.name);
          if (data.email) setSenderEmail(data.email);
          if (data.address) setSenderAddress(data.address);
        }
      }
    } catch {
      // Settings not found, ignore
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function populateFormFromData(data: any) {
    if (data.invoiceNumber) setInvoiceNumber(data.invoiceNumber);
    if (data.date) setDate(data.date);
    if (data.dueDate) setDueDate(data.dueDate);
    if (typeof data.autoReminderEnabled === "boolean") setAutoReminderEnabled(data.autoReminderEnabled);
    if (Array.isArray(data.reminderOffsets)) {
      setReminderOffsets(data.reminderOffsets.map((x: any) => Number(x)).filter((x: number) => Number.isInteger(x)));
    }
    if (typeof data.overdueReminderEnabled === "boolean") {
      setOverdueReminderEnabled(data.overdueReminderEnabled);
    }
    if (data.overdueReminderEveryDays) {
      setOverdueReminderEveryDays(Number(data.overdueReminderEveryDays));
    }
    if (data.reminderChannel) {
      setReminderChannel(String(data.reminderChannel).toUpperCase() as ReminderChannel);
    }
    if (data.senderName) setSenderName(data.senderName);
    if (data.senderEmail) setSenderEmail(data.senderEmail);
    if (data.senderAddress) setSenderAddress(data.senderAddress);
    if (data.clientName) setClientName(data.clientName);
    if (data.clientEmail) setClientEmail(data.clientEmail);
    if (data.clientPhone) setClientPhone(data.clientPhone);
    if (data.clientAddress) setClientAddress(data.clientAddress);
    if (data.currency) setCurrency(data.currency);
    if (data.note) setNote(data.note);
    if (data.taxRate) setTaxRate(Number(data.taxRate));
    if (data.discount) setDiscount(Number(data.discount));
    if (data.items && data.items.length > 0) {
      setItems(
        data.items.map((item: any) => ({
          description: item.description || "",
          hsnCode: item.hsnCode || "",
          quantity: Number(item.quantity) || 1,
          rate: Number(item.rate) || 0,
          amount: Number(item.amount) || Number(item.quantity || 1) * Number(item.rate || 0),
        }))
      );
    }
    if (data.rawText) {
      setOcrRawText(data.rawText);
    }
  }

  useEffect(() => {
    if (isEditing) {
      fetchInvoiceDetails(invoiceId);
    } else {
      setInvoiceNumber(`INV-${Date.now().toString().slice(-6)}`);
      setDate(new Date().toISOString().split("T")[0]);
    }
  }, [isEditing, invoiceId]);

  async function fetchInvoiceDetails(id: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${id}`);
      if (res.ok) {
        const data = await res.json();
        // Populate form
        setInvoiceNumber(data.invoiceNumber);
        setDate(data.date ? new Date(data.date).toISOString().split('T')[0] : "");
        setDueDate(data.dueDate ? new Date(data.dueDate).toISOString().split('T')[0] : "");
        setAutoReminderEnabled(Boolean(data.autoReminderEnabled));
        setReminderOffsets(
          Array.isArray(data.reminderOffsets)
            ? data.reminderOffsets.map((x: any) => Number(x)).filter((x: number) => Number.isInteger(x))
            : [3, 1, 0]
        );
        setOverdueReminderEnabled(Boolean(data.overdueReminderEnabled));
        setOverdueReminderEveryDays(Number(data.overdueReminderEveryDays || 3));
        if (data.reminderChannel) {
          setReminderChannel(String(data.reminderChannel).toUpperCase() as ReminderChannel);
        }
        setSenderName(data.senderName);
        setSenderEmail(data.senderEmail);
        setSenderAddress(data.senderAddress);
        setClientName(data.clientName);
        setClientEmail(data.clientEmail);
        setClientPhone(data.clientPhone || "");
        setClientAddress(data.clientAddress);
        setCurrency(data.currency);
        setNote(data.note);
        if (data.items && data.items.length > 0) {
          setItems(data.items.map((item: any) => ({
            description: item.description,
            hsnCode: item.hsnCode || "",
            quantity: Number(item.quantity),
            rate: Number(item.rate),
            amount: Number(item.amount)
          })));
        }
        if (data.gstType) setGstType(data.gstType);
        if (data.template) setTemplate(data.template);
        setCreatedInvoiceId(data.id);
      } else {
        setError("Failed to fetch invoice details");
      }
    } catch (err) {
      setError("Error loading invoice");
    } finally {
      setLoading(false);
    }
  }

  async function handleTallyImport(file: File) {
    setImporting(true);
    setImportError("");
    setImportSuccess("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/tally-import", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        setImportError(err.error || "Failed to parse Tally file");
        return;
      }

      const data = await res.json();
      populateFormFromData(data);
      setImportSuccess("Tally data imported successfully! Review and adjust the fields below.");
      setShowImportModal(false);
    } catch {
      setImportError("Failed to import Tally file. Please check the file format.");
    } finally {
      setImporting(false);
    }
  }

  async function handlePhotoImport(file: File) {
    setImporting(true);
    setImportError("");
    setImportSuccess("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        setImportError(err.error || "Failed to extract data from photo");
        return;
      }

      const data = await res.json();
      populateFormFromData(data);
      setImportSuccess(
        "Invoice data extracted from photo! Review and adjust the fields below."
      );
      setShowImportModal(false);
    } catch {
      setImportError("Failed to process photo. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>, type: "tally" | "photo") {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === "tally") {
      handleTallyImport(file);
    } else {
      handlePhotoImport(file);
    }
  }

  function handleDrop(e: React.DragEvent, type: "tally" | "photo") {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (type === "tally") {
      handleTallyImport(file);
    } else {
      handlePhotoImport(file);
    }
  }

  function updateItem(index: number, field: keyof InvoiceItem, value: string | number) {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };

      if (field === "description") {
        item.description = value as string;
      } else if (field === "hsnCode") {
        item.hsnCode = value as string;
      } else if (field === "quantity") {
        item.quantity = Number(value) || 0;
        item.amount = item.quantity * item.rate;
      } else if (field === "rate") {
        item.rate = Number(value) || 0;
        item.amount = item.quantity * item.rate;
      }

      updated[index] = item;
      return updated;
    });
  }

  function addItem() {
    setItems((prev) => [...prev, { description: "", hsnCode: "", quantity: 1, rate: 0, amount: 0 }]);
  }

  function removeItem(index: number) {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const taxAmount = (Math.max(0, subtotal - discount) * taxRate) / 100;
  const total = Math.max(0, subtotal - discount + taxAmount);
  const sym = currencySymbols[currency] || "$";

  function generatePDF(): jsPDF {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Template Colors & Styles
    const styles = {
      Standard: {
        headerBg: [26, 26, 46],
        headerText: [255, 255, 255],
        accent: [26, 26, 46],
        tableHead: [26, 26, 46],
      },
      Minimalist: {
        headerBg: [255, 255, 255],
        headerText: [31, 41, 55],
        accent: [31, 41, 55],
        tableHead: [31, 41, 55],
      },
      Professional: {
        headerBg: [37, 99, 235],
        headerText: [255, 255, 255],
        accent: [37, 99, 235],
        tableHead: [37, 99, 235],
      },
    }[template as "Standard" | "Minimalist" | "Professional"] || {
      headerBg: [26, 26, 46],
      headerText: [255, 255, 255],
      accent: [26, 26, 46],
      tableHead: [26, 26, 46],
    };

    // Header section
    if (template !== "Minimalist") {
      doc.setFillColor(styles.headerBg[0], styles.headerBg[1], styles.headerBg[2]);
      doc.rect(0, 0, pageWidth, 50, "F");
      doc.setTextColor(styles.headerText[0], styles.headerText[1], styles.headerText[2]);
    } else {
      doc.setTextColor(styles.headerText[0], styles.headerText[1], styles.headerText[2]);
      doc.setDrawColor(229, 231, 235);
      doc.line(14, 45, pageWidth - 14, 45);
    }

    // Company logo
    let logoY = 8;
    if (settings.logo) {
      try {
        doc.addImage(settings.logo, "PNG", 14, logoY, 35, 35);
      } catch { /* Logo could not be added */ }
    }

    // Invoice title
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.text("INVOICE", pageWidth - 14, 25, { align: "right" });
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(invoiceNumber, pageWidth - 14, 35, { align: "right" });

    // Reset text color for body
    doc.setTextColor(45, 55, 72);

    // Sender & Client info
    let y = 65;
    doc.setFontSize(9);
    doc.setTextColor(113, 128, 150);
    doc.text("FROM", 14, y);
    doc.text("BILL TO", pageWidth / 2 + 10, y);

    y += 8;
    doc.setFontSize(12);
    doc.setTextColor(45, 55, 72);
    doc.setFont("helvetica", "bold");
    doc.text(senderName || "-", 14, y);
    doc.text(clientName || "-", pageWidth / 2 + 10, y);

    y += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(74, 85, 104);
    doc.text(senderEmail || "-", 14, y);
    doc.text(clientEmail || "-", pageWidth / 2 + 10, y);

    y += 6;
    const senderAddrLines = doc.splitTextToSize(senderAddress || "-", 80);
    const clientAddrLines = doc.splitTextToSize(clientAddress || "-", 80);
    doc.text(senderAddrLines, 14, y);
    doc.text(clientAddrLines, pageWidth / 2 + 10, y);

    y += Math.max(senderAddrLines.length, clientAddrLines.length) * 5 + 10;

    // Invoice details bar
    if (template === "Minimalist") {
      doc.setDrawColor(243, 244, 246);
      doc.line(14, y, pageWidth - 14, y);
      y += 5;
    } else {
      doc.setFillColor(247, 250, 252);
      doc.roundedRect(14, y, pageWidth - 28, 22, 3, 3, "F");
    }

    doc.setFontSize(8);
    doc.setTextColor(113, 128, 150);
    doc.text("INVOICE DATE", 20, y + 8);
    doc.text("DUE DATE", 75, y + 8);
    doc.text("CURRENCY", 130, y + 8);
    doc.text("STATUS", 170, y + 8);

    doc.setFontSize(10);
    doc.setTextColor(45, 55, 72);
    doc.setFont("helvetica", "bold");
    doc.text(date ? new Date(date).toLocaleDateString() : "-", 20, y + 16);
    doc.text(dueDate ? new Date(dueDate).toLocaleDateString() : "-", 75, y + 16);
    doc.text(currency, 130, y + 16);
    doc.text("Pending", 170, y + 16);
    doc.setFont("helvetica", "normal");

    y += (template === "Minimalist" ? 25 : 32);

    // Items table
    const tableData = items.map((item) => [
      item.description || "-",
      item.hsnCode || "-",
      item.quantity.toString(),
      `${sym}${item.rate.toFixed(2)}`,
      `${sym}${item.amount.toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Description", "HSN", "Qty", "Rate", "Amount"]],
      body: tableData,
      theme: template === "Minimalist" ? "plain" : "striped",
      headStyles: {
        fillColor: styles.tableHead as [number, number, number],
        textColor: [255, 255, 255],
        fontSize: 10,
        fontStyle: "bold",
        cellPadding: 6,
      },
      bodyStyles: {
        fontSize: 10,
        cellPadding: 6,
        textColor: [45, 55, 72],
      },
      alternateRowStyles: {
        fillColor: template === "Minimalist" ? [255, 255, 255] : [247, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 25, halign: "center" },
        2: { cellWidth: 20, halign: "center" },
        3: { cellWidth: 32, halign: "right" },
        4: { cellWidth: 32, halign: "right" },
      },
      margin: { left: 14, right: 14 },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 10;

    // Totals
    const totalsX = pageWidth - 80;
    doc.setDrawColor(226, 232, 240);
    doc.line(totalsX - 10, y, pageWidth - 14, y);

    y += 10;
    doc.setFontSize(10);
    doc.setTextColor(113, 128, 150);
    doc.text("Subtotal", totalsX - 5, y);
    doc.setTextColor(45, 55, 72);
    doc.text(`${sym}${subtotal.toFixed(2)}`, pageWidth - 14, y, { align: "right" });

    if (discount > 0) {
      y += 8;
      doc.setTextColor(113, 128, 150);
      doc.text("Discount", totalsX - 5, y);
      doc.setTextColor(220, 38, 38);
      doc.text(`-${sym}${discount.toFixed(2)}`, pageWidth - 14, y, { align: "right" });
    }

    if (taxRate > 0) {
      if (gstType === "INTRA") {
        y += 8;
        doc.setTextColor(113, 128, 150);
        doc.text(`CGST (${(taxRate / 2)}%)`, totalsX - 5, y);
        doc.setTextColor(45, 55, 72);
        doc.text(`${sym}${(taxAmount / 2).toFixed(2)}`, pageWidth - 14, y, { align: "right" });

        y += 8;
        doc.setTextColor(113, 128, 150);
        doc.text(`SGST (${(taxRate / 2)}%)`, totalsX - 5, y);
        doc.setTextColor(45, 55, 72);
        doc.text(`${sym}${(taxAmount / 2).toFixed(2)}`, pageWidth - 14, y, { align: "right" });
      } else {
        y += 8;
        doc.setTextColor(113, 128, 150);
        doc.text(`IGST (${taxRate}%)`, totalsX - 5, y);
        doc.setTextColor(45, 55, 72);
        doc.text(`${sym}${taxAmount.toFixed(2)}`, pageWidth - 14, y, { align: "right" });
      }
    }

    y += 10;
    doc.setDrawColor(226, 232, 240);
    doc.line(totalsX - 10, y - 4, pageWidth - 14, y - 4);

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(styles.accent[0], styles.accent[1], styles.accent[2]);
    doc.text(`Total (${currency})`, totalsX - 5, y + 2);
    doc.text(`${sym}${total.toFixed(2)}`, pageWidth - 14, y + 2, { align: "right" });

    // Note etc...

    // Note
    if (note) {
      y += 25;
      doc.setFontSize(9);
      doc.setTextColor(113, 128, 150);
      doc.setFont("helvetica", "bold");
      doc.text("NOTE", 14, y);
      doc.setFont("helvetica", "normal");
      y += 7;
      doc.setFontSize(10);
      doc.setTextColor(74, 85, 104);
      const noteLines = doc.splitTextToSize(note, pageWidth - 28);
      doc.text(noteLines, 14, y);
      y += noteLines.length * 5;
    }

    // Signature
    if (settings.signature) {
      y += 20;
      doc.setFontSize(9);
      doc.setTextColor(113, 128, 150);
      doc.text("AUTHORIZED SIGNATURE", 14, y);
      y += 5;
      try {
        doc.addImage(settings.signature, "PNG", 14, y, 50, 25);
      } catch {
        // Signature could not be added
      }
      y += 30;
      doc.setDrawColor(45, 55, 72);
      doc.line(14, y, 80, y);
      doc.setFontSize(10);
      doc.setTextColor(45, 55, 72);
      doc.text(senderName || "Authorized Signatory", 14, y + 7);
    }

    return doc;
  }

  function handlePreview() {
    const doc = generatePDF();
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    setPdfUrl(url);
    setShowPreview(true);
  }

  function handleDownload() {
    const doc = generatePDF();
    doc.save(`${invoiceNumber}.pdf`);
  }

  function toggleReminderOffset(dayOffset: number) {
    setReminderOffsets((prev) => {
      if (prev.includes(dayOffset)) return prev.filter((offset) => offset !== dayOffset);
      return [...prev, dayOffset].sort((a, b) => b - a);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    if (autoReminderEnabled && !dueDate) {
      setError("Please set a due date to enable automatic reminders.");
      setLoading(false);
      return;
    }

    if (reminderChannel !== "EMAIL" && !clientPhone.trim()) {
      setError("Please provide client phone number for SMS or Both reminder channel.");
      setLoading(false);
      return;
    }

    try {
      const url = isEditing ? `/api/invoices/${invoiceId}` : "/api/invoices";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderName,
          senderEmail,
          senderAddress,
          clientName,
          clientEmail,
          clientPhone,
          clientAddress,
          invoiceNumber,
          date,
          dueDate,
          status: "Pending", // Or keep existing if editing
          currency,
          note,
          items,
          discount,
          taxRate,
          tax: taxAmount,
          gstType,
          template,
          subtotal,
          total,
          autoReminderEnabled,
          reminderOffsets,
          overdueReminderEnabled,
          overdueReminderEveryDays,
          reminderChannel,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || `Failed to ${isEditing ? "update" : "create"} invoice`);
      } else {
        const invoice = await res.json();
        setCreatedInvoiceId(invoice.id);
        setSuccess(true);
        if (isEditing) alert("Invoice updated successfully!");
      }
    } catch {
      setError(`Failed to ${isEditing ? "update" : "create"} invoice`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmail() {
    if (!createdInvoiceId) return;

    setSendingEmail(true);
    setError("");

    try {
      const doc = generatePDF();
      const pdfBase64 = doc.output("datauristring").split(",")[1];

      const res = await fetch(`/api/invoices/${createdInvoiceId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64 }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to send invoice");
      } else {
        alert(`Invoice sent to ${clientEmail} successfully!`);
      }
    } catch {
      setError("Failed to send invoice");
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleSendSMS() {
    const phone = window.prompt("Enter client phone number (e.g. +919876543210):");
    if (!phone) return;

    setSendingSms(true);
    try {
      const res = await fetch("/api/invoices/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: createdInvoiceId, phoneNumber: phone }),
      });

      if (res.ok) {
        alert("SMS sent successfully!");
      } else {
        const err = await res.json();
        alert("Failed to send SMS: " + err.error);
      }
    } catch {
      alert("Error sending SMS");
    } finally {
      setSendingSms(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hidden file inputs */}
      <input
        ref={tallyFileRef}
        type="file"
        accept=".xml,.yml,.yaml"
        className="hidden"
        onChange={(e) => handleFileInput(e, "tally")}
      />
      <input
        ref={photoFileRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => handleFileInput(e, "photo")}
      />

      {/* Header */}
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

            {/* Left: Back & Title */}
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard/invoices")}
                className="-ml-2 text-gray-500 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="h-6 w-px bg-gray-200 hidden sm:block" />
              <h1 className="text-lg font-semibold text-gray-900">
                {isEditing ? "Edit Invoice" : "Create Invoice"}
              </h1>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {/* Preview */}
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreview}
                className="text-gray-600"
                title="Preview PDF"
              >
                <Eye className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Preview</span>
              </Button>

              {/* Import Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 text-gray-600">
                    <Upload className="h-4 w-4" />
                    <span className="hidden sm:inline">Import</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => customerFileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" />
                    Import Customers
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => dataFileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" />
                    Import Invoices
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Download */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="text-gray-600"
                title="Download PDF"
              >
                <Download className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Download</span>
              </Button>

              {/* Send Actions (only if created) */}
              {success && createdInvoiceId && (
                <div className="flex items-center gap-2">
                  <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block" />
                  <Button
                    size="sm"
                    onClick={handleSendEmail}
                    disabled={sendingEmail}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {sendingEmail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 sm:mr-2" />}
                    <span className="hidden sm:inline">Email</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSendSMS}
                    disabled={sendingSms}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {sendingSms ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3 sm:mr-2" />}
                    <span className="hidden sm:inline">SMS</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        {/* Status Messages */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
            <span>⚠️</span> {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Invoice created successfully! You can now preview, download, or send it to the client.
          </div>
        )}
        {importSuccess && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            {importSuccess}
            {ocrRawText && (
              <button
                onClick={() => setShowRawText(!showRawText)}
                className="ml-auto text-xs underline hover:no-underline"
              >
                {showRawText ? "Hide" : "Show"} extracted text
              </button>
            )}
          </div>
        )}
        {showRawText && ocrRawText && (
          <div className="mb-4 p-4 bg-gray-900 text-gray-100 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-xs uppercase tracking-wide font-semibold">
                Raw OCR Output
              </span>
              <button
                onClick={() => setShowRawText(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {ocrRawText}
          </div>
        )}

        {/* ===== IMPORT METHOD SELECTOR CARD ===== */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-3 mb-1">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900">Import Invoice Data</h2>
                <p className="text-xs text-gray-500">
                  Auto-fill invoice fields from a Tally export or a photo
                </p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Manual Entry */}
              <button
                type="button"
                onClick={() => {
                  setImportMethod("manual");
                  setImportSuccess("");
                  setOcrRawText("");
                }}
                className={`group relative p-5 rounded-xl border-2 transition-all duration-200 text-left ${importMethod === "manual" || importMethod === null
                  ? "border-gray-900 bg-gray-50 shadow-sm"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
              >
                <div
                  className={`h-10 w-10 rounded-lg flex items-center justify-center mb-3 transition-colors ${importMethod === "manual" || importMethod === null
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-500 group-hover:bg-gray-200"
                    }`}
                >
                  <FileText className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Manual Entry</h3>
                <p className="text-xs text-gray-500">
                  Fill in the invoice details manually below
                </p>
                {(importMethod === "manual" || importMethod === null) && (
                  <div className="absolute top-3 right-3">
                    <div className="h-5 w-5 rounded-full bg-gray-900 flex items-center justify-center">
                      <CheckCircle2 className="h-3 w-3 text-white" />
                    </div>
                  </div>
                )}
              </button>

              {/* Import from Tally */}
              <button
                type="button"
                onClick={() => {
                  setImportMethod("tally");
                  dataFileInputRef.current?.click();
                }}
                className={`group relative p-5 rounded-xl border-2 transition-all duration-200 text-left ${importMethod === "tally"
                  ? "border-emerald-500 bg-emerald-50 shadow-sm"
                  : "border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/30"
                  }`}
              >
                <div
                  className={`h-10 w-10 rounded-lg flex items-center justify-center mb-3 transition-colors ${importMethod === "tally"
                    ? "bg-emerald-500 text-white"
                    : "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100"
                    }`}
                >
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Import from Tally</h3>
                <p className="text-xs text-gray-500">
                  Upload XML/YML export from Tally software
                </p>
                {importMethod === "tally" && (
                  <div className="absolute top-3 right-3">
                    <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
                      <CheckCircle2 className="h-3 w-3 text-white" />
                    </div>
                  </div>
                )}
              </button>

              {/* Upload Photo (OCR) */}
              <button
                type="button"
                onClick={() => {
                  setImportMethod("photo");
                  setShowImportModal(true);
                  setImportError("");
                }}
                className={`group relative p-5 rounded-xl border-2 transition-all duration-200 text-left ${importMethod === "photo"
                  ? "border-blue-500 bg-blue-50 shadow-sm"
                  : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/30"
                  }`}
              >
                <div
                  className={`h-10 w-10 rounded-lg flex items-center justify-center mb-3 transition-colors ${importMethod === "photo"
                    ? "bg-blue-500 text-white"
                    : "bg-blue-50 text-blue-600 group-hover:bg-blue-100"
                    }`}
                >
                  <Camera className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Upload Photo</h3>
                <p className="text-xs text-gray-500">
                  Extract data from invoice photo using AI OCR
                </p>
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full text-[10px] font-semibold">
                  <Sparkles className="h-2.5 w-2.5" />
                  AI Powered
                </div>
                {importMethod === "photo" && (
                  <div className="absolute top-3 right-3">
                    <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <CheckCircle2 className="h-3 w-3 text-white" />
                    </div>
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Invoice Header Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Create Invoice</h1>
                  <p className="text-sm text-gray-500">Fill in the details below</p>
                </div>
              </div>

              {/* Invoice Number & Currency */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    GST Type
                  </label>
                  <select
                    value={gstType}
                    onChange={(e) => setGstType(e.target.value as "INTRA" | "INTER")}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
                  >
                    <option value="INTRA">Intra-state (CGST + SGST)</option>
                    <option value="INTER">Inter-state (IGST)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Invoice Template
                  </label>
                  <select
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
                  >
                    <option value="Standard">Standard (Modern)</option>
                    <option value="Minimalist">Minimalist (Clean)</option>
                    <option value="Professional">Professional (Corporate)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Sender & Client Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-0">
              {/* Sender (Left) */}
              <div className="p-6 md:border-r border-b md:border-b-0 border-gray-100">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                  From (Your Details)
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Your Name</label>
                    <input
                      type="text"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="Your name or company"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Your Email</label>
                    <input
                      type="email"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Your Address</label>
                    <input
                      type="text"
                      value={senderAddress}
                      onChange={(e) => setSenderAddress(e.target.value)}
                      placeholder="Street, City, State, ZIP"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Client (Right) */}
              <div className="p-6">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                  Bill To (Client Details)
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Client Name</label>
                    <input
                      type="text"
                      list="customer-list"
                      value={clientName}
                      onChange={handleClientNameChange}
                      placeholder="Client name"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      required
                    />
                    <datalist id="customer-list">
                      {Array.isArray(customers) && customers.map((c: any) => (
                        <option key={c.id} value={c.name} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Client Email</label>
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="client@email.com"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      required={reminderChannel !== "SMS"}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Client Phone</label>
                    <input
                      type="tel"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="+91XXXXXXXXXX"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      required={reminderChannel !== "EMAIL"}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Client Address</label>
                    <input
                      type="text"
                      value={clientAddress}
                      onChange={(e) => setClientAddress(e.target.value)}
                      placeholder="Street, City, State, ZIP"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Invoice Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Automatic Reminders */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Automatic Reminders</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Send reminders before due date and continue after overdue until invoice is paid.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoReminderEnabled}
                  onChange={(e) => setAutoReminderEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Enable
              </label>
            </div>

            <div className="mt-5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Reminder Channel
              </label>
              <select
                value={reminderChannel}
                onChange={(e) => setReminderChannel(e.target.value as ReminderChannel)}
                className="w-full sm:w-56 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              >
                {REMINDER_CHANNEL_OPTIONS.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel === "EMAIL" ? "Email" : channel === "SMS" ? "SMS" : "Both (Email + SMS)"}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Used for both manual reminder action and automatic reminders.
              </p>
            </div>

            {autoReminderEnabled && (
              <div className="mt-5 space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Before Due Date
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {REMINDER_OFFSET_OPTIONS.map((offset) => (
                      <button
                        key={offset}
                        type="button"
                        onClick={() => toggleReminderOffset(offset)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          reminderOffsets.includes(offset)
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {offset === 0 ? "On due date" : `${offset} day${offset > 1 ? "s" : ""} before`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={overdueReminderEnabled}
                      onChange={(e) => setOverdueReminderEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Continue overdue reminders
                  </label>

                  {overdueReminderEnabled && (
                    <div className="inline-flex items-center gap-2 text-sm text-gray-700">
                      Every
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={overdueReminderEveryDays}
                        onChange={(e) => setOverdueReminderEveryDays(Number(e.target.value) || 1)}
                        className="w-16 border border-gray-300 rounded-md px-2 py-1 text-sm text-right"
                      />
                      day(s) after due date
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Line Items */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Items</h3>
            </div>

            {/* Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div className="col-span-4">Description</div>
              <div className="col-span-1 text-center">HSN</div>
              <div className="col-span-2 text-center">Quantity</div>
              <div className="col-span-2 text-right">Rate</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-1"></div>
            </div>

            {/* Items */}
            {items.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 px-6 py-4 border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
              >
                <div className="col-span-1 md:col-span-4">
                  <label className="text-xs text-gray-500 md:hidden mb-1 block">Description</label>
                  <input
                    type="text"
                    list={`product-list-${index}`}
                    value={item.description}
                    onChange={(e) => {
                      const desc = e.target.value;
                      updateItem(index, "description", desc);

                      // Auto-fill from product master
                      const product = products.find(p => p.name === desc);
                      if (product) {
                        updateItem(index, "rate", Number(product.basePrice));
                        if (product.hsnCode) updateItem(index, "hsnCode", product.hsnCode);
                        if (product.defaultTaxRate && taxRate === 0) setTaxRate(Number(product.defaultTaxRate));
                      }
                    }}
                    placeholder="Search or enter item"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    required
                  />
                  <datalist id={`product-list-${index}`}>
                    {products.map((p) => (
                      <option key={p.id} value={p.name}>
                        ₹{Number(p.basePrice).toFixed(2)} {p.hsnCode ? `(HSN: ${p.hsnCode})` : ""}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div className="col-span-1 md:col-span-1">
                  <label className="text-xs text-gray-500 md:hidden mb-1 block">HSN</label>
                  <input
                    type="text"
                    value={item.hsnCode}
                    onChange={(e) => updateItem(index, "hsnCode", e.target.value)}
                    placeholder="HSN"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div className="col-span-1 md:col-span-2 flex items-start justify-center">
                  <div className="w-full md:w-auto">
                    <label className="text-xs text-gray-500 md:hidden mb-1 block">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", e.target.value)}
                      className="w-full md:w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      required
                    />
                  </div>
                </div>
                <div className="col-span-1 md:col-span-2 flex items-start justify-end">
                  <div className="w-full md:w-auto">
                    <label className="text-xs text-gray-500 md:hidden mb-1 block">Rate</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.rate || ""}
                      onChange={(e) => updateItem(index, "rate", e.target.value)}
                      placeholder="0.00"
                      className="w-full md:w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      required
                    />
                  </div>
                </div>
                <div className="col-span-1 md:col-span-2 flex items-start justify-end">
                  <div className="w-full md:w-auto">
                    <label className="text-xs text-gray-500 md:hidden mb-1 block">Amount</label>
                    <div className="md:w-24 border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-right font-medium text-gray-700">
                      {sym}
                      {item.amount.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="col-span-1 flex items-start justify-center pt-1">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Add Item Button */}
            <div className="p-4 border-b border-gray-100">
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Line Item
              </button>
            </div>

            {/* Totals */}
            <div className="p-6 flex justify-end">
              <div className="w-full max-w-xs space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium text-gray-900">
                    {sym}
                    {subtotal.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Discount</span>
                  <div className="flex items-center w-24">
                    <span className="text-gray-500 mr-1">-</span>
                    <input
                      type="number"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-right text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Tax Rate (%)</span>
                  <div className="flex items-center w-24">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={taxRate}
                      onChange={(e) => setTaxRate(Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-right text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <span className="text-gray-500 ml-1">%</span>
                  </div>
                </div>

                {taxRate > 0 && (
                  <>
                    {gstType === "INTRA" ? (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">CGST ({(taxRate / 2).toFixed(1)}%)</span>
                          <span className="font-medium text-gray-900">
                            {sym}
                            {(taxAmount / 2).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">SGST ({(taxRate / 2).toFixed(1)}%)</span>
                          <span className="font-medium text-gray-900">
                            {sym}
                            {(taxAmount / 2).toFixed(2)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">IGST ({taxRate}%)</span>
                        <span className="font-medium text-gray-900">
                          {sym}
                          {taxAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </>
                )}

                <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                  <span className="text-base font-bold text-gray-900">Total ({currency})</span>
                  <span className="text-lg font-bold text-gray-900">
                    {sym}
                    {total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Note */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 p-6">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add your note/s right here..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 mb-8">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/dashboard/invoices")}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || success}
              className="bg-gray-900 hover:bg-gray-800 text-white px-8"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isEditing ? "Updating..." : "Creating..."}
                </span>
              ) : success ? (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {isEditing ? "Updated" : "Created"}
                </span>
              ) : (
                isEditing ? "Update Invoice" : "Create Invoice"
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* PDF Preview Modal */}
      {showPreview && pdfUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Invoice Preview</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
                {success && createdInvoiceId && (
                  <Button
                    size="sm"
                    onClick={handleSendEmail}
                    disabled={sendingEmail}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {sendingEmail ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {sendingEmail ? "Sending..." : "Send to Client"}
                  </Button>
                )}
                <button
                  onClick={() => {
                    setShowPreview(false);
                    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100 p-4">
              <iframe src={pdfUrl} className="w-full h-full rounded-lg border border-gray-200" />
            </div>
          </div>
        </div>
      )}

      {/* ===== IMPORT MODAL ===== */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            style={{ animation: "fadeInUp 0.3s ease-out" }}
          >
            {/* Modal Header */}
            <div
              className={`px-6 py-5 border-b border-gray-100 ${importMethod === "tally"
                ? "bg-gradient-to-r from-emerald-50 to-teal-50"
                : "bg-gradient-to-r from-blue-50 to-indigo-50"
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center ${importMethod === "tally"
                      ? "bg-emerald-500 text-white"
                      : "bg-blue-500 text-white"
                      }`}
                  >
                    {importMethod === "tally" ? (
                      <FileSpreadsheet className="h-5 w-5" />
                    ) : (
                      <Camera className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">
                      {importMethod === "tally" ? "Import from Tally" : "Upload Invoice Photo"}
                    </h2>
                    <p className="text-xs text-gray-500">
                      {importMethod === "tally"
                        ? "Upload your Tally XML or YML export file"
                        : "Upload a photo of an invoice to extract data using AI"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportError("");
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-lg transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {importError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {importError}
                </div>
              )}

              {importing ? (
                <div className="py-12 flex flex-col items-center gap-4">
                  <div
                    className={`h-16 w-16 rounded-2xl flex items-center justify-center ${importMethod === "tally" ? "bg-emerald-100" : "bg-blue-100"
                      }`}
                  >
                    <Loader2
                      className={`h-8 w-8 animate-spin ${importMethod === "tally" ? "text-emerald-600" : "text-blue-600"
                        }`}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-900">
                      {importMethod === "tally"
                        ? "Parsing Tally data..."
                        : "Extracting data from photo..."}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {importMethod === "tally"
                        ? "Reading invoice fields from your XML file"
                        : "Using AI OCR to recognize text"}
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${dragActive
                    ? importMethod === "tally"
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-blue-400 bg-blue-50"
                    : "border-gray-300 hover:border-gray-400 bg-gray-50/50"
                    }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => handleDrop(e, importMethod === "tally" ? "tally" : "photo")}
                >
                  <div className="flex flex-col items-center gap-3">
                    <div
                      className={`h-14 w-14 rounded-2xl flex items-center justify-center ${importMethod === "tally"
                        ? "bg-emerald-100 text-emerald-600"
                        : "bg-blue-100 text-blue-600"
                        }`}
                    >
                      <Upload className="h-7 w-7" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">
                        Drag & drop your file here
                      </p>
                      <p className="text-xs text-gray-500 mt-1">or click to browse files</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (importMethod === "tally") {
                          tallyFileRef.current?.click();
                        } else {
                          photoFileRef.current?.click();
                        }
                      }}
                      className={`mt-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all shadow-sm hover:shadow ${importMethod === "tally"
                        ? "bg-emerald-500 hover:bg-emerald-600"
                        : "bg-blue-500 hover:bg-blue-600"
                        }`}
                    >
                      {importMethod === "tally" ? "Choose XML/YML File" : "Choose Photo"}
                    </button>
                    <p className="text-[11px] text-gray-400 mt-2">
                      {importMethod === "tally"
                        ? "Supported: .xml, .yml, .yaml"
                        : "Supported: PNG, JPG, JPEG, WebP, PDF"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {!importing && (
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowImportModal(false);
                    setImportError("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Animation keyframes */}
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
