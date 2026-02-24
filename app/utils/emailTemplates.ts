
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
        reminderBadge
    } = data;

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
      line-height: 1.6;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
      background-color: #f4f7f9;
    }
    .email-wrapper {
      width: 100%;
      padding: 40px 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0,0,0,0.05);
    }
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #334155 100%);
      padding: 40px 30px;
      text-align: center;
      color: #ffffff;
    }
    .header img {
      max-height: 50px;
      margin-bottom: 20px;
      border-radius: 8px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .content {
      padding: 40px 35px;
    }
    .greeting {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #0f172a;
    }
    .message {
      font-size: 16px;
      color: #475569;
      margin-bottom: 30px;
    }
    .summary-card {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 30px;
    }
    .summary-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #64748b;
      margin-bottom: 20px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 12px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      gap: 20px;
    }
    .summary-label {
      color: #64748b;
      font-size: 15px;
      flex-shrink: 0;
    }
    .summary-value {
      font-weight: 600;
      color: #0f172a;
      text-align: right;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .amount-due {
      margin-top: 15px;
      padding-top: 15px;
      border-top: 2px dashed #e2e8f0;
    }
    .amount-large {
      font-size: 24px;
      font-weight: 800;
      color: #ef4444;
      white-space: nowrap;
    }
    .badge-container {
      text-align: right;
      margin-top: 10px;
    }
    .action-area {
      text-align: center;
      margin-top: 20px;
    }
    .button {
      display: inline-block;
      background-color: #0f172a;
      color: #ffffff !important;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 16px;
      transition: all 0.3s ease;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
    }
    .footer {
      padding: 30px;
      text-align: center;
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
    }
    .sender-info {
      font-size: 14px;
      color: #64748b;
      margin-bottom: 8px;
    }
    .copyright {
      font-size: 12px;
      color: #94a3b8;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      background-color: #fee2e2;
      color: #ef4444;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="container">
      <div class="header">
        ${logoUrl ? `<img src="${logoUrl}" alt="Company Logo">` : ''}
        <h1>${reminderTitle || "Payment Reminder"}</h1>
      </div>
      <div class="content">
        <p class="greeting">Hello ${clientName},</p>
        <p class="message">
          We hope you are having a great day. This is a friendly reminder regarding your outstanding invoice.
          Please find the specific details below and the attached PDF for your records.
        </p>

        <div class="summary-card">
          <div class="summary-title">Invoice Summary</div>
          <table width="100%" cellpadding="6" cellspacing="0" border="0">
            <tr>
              <td style="color: #64748b; font-size: 15px; padding: 6px 0;">Invoice Number</td>
              <td style="font-weight: 600; color: #0f172a; text-align: right; padding: 6px 0; white-space: nowrap;">#${invoiceNumber}</td>
            </tr>
            <tr>
              <td style="color: #64748b; font-size: 15px; padding: 6px 0;">Due Date</td>
              <td style="font-weight: 600; color: #0f172a; text-align: right; padding: 6px 0; white-space: nowrap;">${dueDate}</td>
            </tr>
          </table>
          <div style="margin-top: 15px; padding-top: 15px; border-top: 2px dashed #e2e8f0;">
            <table width="100%" cellpadding="6" cellspacing="0" border="0">
              <tr>
                <td style="color: #64748b; font-size: 15px; padding: 6px 0;">Balance Amount</td>
                <td style="font-size: 24px; font-weight: 800; color: #ef4444; text-align: right; padding: 6px 0; white-space: nowrap;">${currency} ${amountDue}</td>
              </tr>
            </table>
            <div style="text-align: right; margin-top: 10px;">
              <span class="badge">${reminderBadge || "OVERDUE"}</span>
            </div>
          </div>
        </div>

        <div class="action-area">
          <a href="#" class="button">Pay Invoice Now</a>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 15px;">
            Securely pay using your preferred payment method.
          </p>
        </div>
      </div>
      <div class="footer">
        <div class="sender-info">
          <strong>${senderName}</strong><br>
          ${senderAddress}
        </div>
        <div class="copyright">
          &copy; ${new Date().getFullYear()} ${senderName}. All rights reserved.
        </div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}
