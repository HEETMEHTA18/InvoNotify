

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

  const isAlert = Boolean(isOverdue);
  const message = isAlert
    ? `This is an urgent reminder that invoice <strong>#${invoiceNumber}</strong> is overdue. Please clear the pending balance as soon as possible to avoid service or account interruptions.`
    : `This is a friendly reminder for invoice <strong>#${invoiceNumber}</strong>. The payment is due soon. Please review the details below and complete payment on time.`;

  const badgeColor = isAlert ? "#b91c1c" : "#047857";
  const badgeBg = isAlert ? "#fee2e2" : "#d1fae5";
  const headerGradient = isAlert
    ? "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)"
    : "linear-gradient(135deg, #065f46 0%, #10b981 100%)";
  const statusLabel = isAlert ? "Overdue" : "Pending";
  const reminderLabel = reminderBadge || (isAlert ? "OVERDUE" : "REMINDER");
  const statusHeading = isAlert ? "Overdue Payment Alert" : "Pending Payment Reminder";
  const statusSubheading = isAlert ? "Immediate action recommended" : "Payment due soon";
  const mailTitle = reminderTitle || (isAlert ? "Overdue Invoice Alert" : "Invoice Payment Reminder");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${mailTitle}</title>
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
    .brand-bar {
      background: ${headerGradient};
      color: #ffffff;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .brand-logo {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      object-fit: cover;
      display: block;
      background: rgba(255,255,255,0.25);
      border: 1px solid rgba(255,255,255,0.35);
    }
    .brand-fallback {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.35);
      color: #ffffff;
      font-size: 16px;
      font-weight: 800;
      line-height: 28px;
      text-align: center;
    }
    .brand-title {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 210px;
    }
    .brand-subtitle {
      margin: 0;
      font-size: 11px;
      color: rgba(255,255,255,0.8);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 10px;
      border-radius: 999px;
      background: ${badgeBg};
      color: ${badgeColor};
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
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
    .amount {
      font-size: 32px;
      font-weight: 700;
      color: #111827;
      margin: 0;
    }
    .status-text {
      font-size: 16px;
      color: ${isAlert ? "#b91c1c" : "#047857"};
      margin-top: 4px;
      font-weight: 700;
    }
    .status-subtext {
      margin-top: 4px;
      font-size: 13px;
      color: #6b7280;
      font-weight: 500;
    }
    .intro-text {
      margin: 0;
      color: #4b5563;
      font-size: 14px;
      line-height: 1.7;
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
    <!-- Brand Bar -->
    <div class="brand-bar">
      <div class="brand-wrap">
        ${logoUrl
      ? `<img src="${logoUrl}" alt="${senderName} logo" class="brand-logo" />`
      : `<div class="brand-fallback">${(senderName || "I").charAt(0).toUpperCase()}</div>`}
        <div>
          <p class="brand-title">${senderName}</p>
          <p class="brand-subtitle">Invoice Notification</p>
        </div>
      </div>
      <span class="badge">${reminderLabel}</span>
    </div>

    <!-- Header / Status Section -->
    <div class="section top-section">
      <h1 class="amount">${currency} ${amountDue}</h1>
      <p class="status-text">${statusHeading}</p>
      <p class="status-subtext">${statusSubheading}</p>
    </div>

    <!-- Message Section -->
    <div class="section">
      <p class="intro-text">${message}</p>
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
          <td class="value" style="color: ${badgeColor}">${statusLabel}</td>
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


