

export interface InvoiceTemplateData {
  clientName: string;
  invoiceNumber: string;
  amountDue: string;
  dueDate: string;
  senderName: string;
  senderAddress: string;
  logoUrl?: string | null;
  currency: string;
  reminderTitle?: string;
  reminderBadge?: string;
  isOverdue?: boolean;
  paymentQrDataUrl?: string | null;
  paymentQrAmount?: string;
}

export function getInvoiceReminderTemplate(data: InvoiceTemplateData) {
  const {
    clientName,
    invoiceNumber,
    amountDue,
    dueDate,
    senderName,
    senderAddress,
    logoUrl,
    currency,
    reminderTitle,
    reminderBadge,
    isOverdue,
    paymentQrDataUrl,
    paymentQrAmount,
  } = data;

  const message = isOverdue
    ? `We are writing to remind you that your payment for invoice <strong>#${invoiceNumber}</strong> is currently overdue. We understand how things can get lost in the shuffle, so we'd appreciate it if you could settle the balance at your earliest convenience.`
    : `We hope you are having a great day. This is a friendly reminder regarding your upcoming payment for invoice <strong>#${invoiceNumber}</strong>. Please find the specific details below and the attached PDF for your records.`;

  const badgeColor = isOverdue ? "#ef4444" : "#f59e0b";
  const badgeBg = isOverdue ? "#fee2e2" : "#fef3c7";
  const headerGradient = isOverdue
    ? "linear-gradient(135deg, #7f1d1d 0%, #0f172a 100%)"
    : "linear-gradient(135deg, #0f172a 0%, #334155 100%)";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reminderTitle || "Payment Reminder"}</title>
  <style>
    body {
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      color: #4b5563;
      margin: 0;
      padding: 0;
      background-color: #f3f4f6;
    }
    .email-container {
      max-width: 500px;
      margin: 40px auto;
      background-color: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .section {
      padding: 24px;
      border-bottom: 8px solid #f3f4f6;
    }
    .section:last-child {
      border-bottom: none;
    }
    .top-section {
      text-align: center;
      padding: 32px 24px;
    }
    .status-icon {
      width: 48px;
      height: 48px;
      background-color: ${isOverdue ? "#fee2e2" : "#ecfdf5"};
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 20px;
    }
    .status-icon-inner {
      width: 24px;
      height: 24px;
      background-color: ${isOverdue ? "#ef4444" : "#10b981"};
      border-radius: 50%;
      display: inline-block;
      position: relative;
    }
    /* Simple CSS checkmark/exclamation */
    .status-icon-inner::after {
      content: '${isOverdue ? "!" : "✓"}';
      color: white;
      font-weight: bold;
      font-size: 16px;
      line-height: 24px;
    }
    .amount {
      font-size: 32px;
      font-weight: 700;
      color: #111827;
      margin: 0;
    }
    .status-text {
      font-size: 16px;
      color: #6b7280;
      margin-top: 4px;
      font-weight: 500;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
    }
    .data-row td {
      padding: 8px 0;
      font-size: 14px;
    }
    .label {
      color: #6b7280;
      width: 40%;
    }
    .value {
      color: #111827;
      text-align: right;
      font-weight: 500;
    }
    .value-link {
      color: #2563eb;
      text-decoration: none;
    }
    .footer-text {
      font-size: 13px;
      color: #6b7280;
      text-align: center;
      line-height: 1.6;
    }
    .qr-container {
      margin-top: 18px;
      text-align: center;
    }
    .qr-image-wrap {
      display: inline-block;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px;
      background: #ffffff;
    }
    .qr-label {
      margin-top: 8px;
      font-size: 12px;
      color: #6b7280;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <!-- Header / Status Section -->
    <div class="section top-section">
      <div class="status-icon">
        <div class="status-icon-inner"></div>
      </div>
      <h1 class="amount">${currency} ${amountDue}</h1>
      <p class="status-text">${isOverdue ? "Invoice Overdue" : "Payment Due Soon"}</p>
    </div>

    <!-- Invoice Details Section -->
    <div class="section">
      <table class="data-table">
        <tr class="data-row">
          <td class="label">Invoice #</td>
          <td class="value">#${invoiceNumber}</td>
        </tr>
        <tr class="data-row">
          <td class="label">Status</td>
          <td class="value" style="color: ${isOverdue ? "#ef4444" : "#f59e0b"}">${isOverdue ? "Overdue" : "Pending"}</td>
        </tr>
        <tr class="data-row">
          <td class="label">Due On</td>
          <td class="value">${dueDate}</td>
        </tr>
      </table>
    </div>

    <!-- Contact Section -->
    <div class="section">
      <table class="data-table">
        <tr class="data-row">
          <td class="label">Client</td>
          <td class="value">${clientName}</td>
        </tr>
        <tr class="data-row">
          <td class="label">Email</td>
          <td class="value"><a href="#" class="value-link">${data.senderName} Portal</a></td>
        </tr>
      </table>
      ${paymentQrDataUrl
      ? `<div class="qr-container">
           <div class="qr-image-wrap">
             <img src="${paymentQrDataUrl}" alt="Payment QR" width="150" height="150" style="display:block;" />
           </div>
           <div class="qr-label">Scan to pay ${currency} ${paymentQrAmount || amountDue}</div>
         </div>`
      : ""}
    </div>

    <!-- Support Footer -->
    <div class="section">
      <p class="footer-text">
        For any invoice related queries please reach out to<br/>
        <strong>${senderName}</strong><br/>
        ${senderAddress}
      </p>
    </div>
  </div>
</body>
</html>
  `;
}


