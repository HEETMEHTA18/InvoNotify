import nodemailer from "nodemailer";
import { google } from "googleapis";
import { prisma } from "./db";

function createSmtpTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

async function getGmailClient(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account || !account.access_token) {
    const fallbackAccessToken = process.env.GOOGLE_ACCESS_TOKEN;
    const fallbackRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (fallbackAccessToken || fallbackRefreshToken) {
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      auth.setCredentials({
        access_token: fallbackAccessToken,
        refresh_token: fallbackRefreshToken,
      });
      return google.gmail({ version: "v1", auth });
    }

    throw new Error("No Gmail credentials available");
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  auth.on("tokens", async (tokens) => {
    const updateData: Record<string, unknown> = {};
    if (tokens.refresh_token) updateData.refresh_token = tokens.refresh_token;
    if (tokens.access_token) updateData.access_token = tokens.access_token;
    if (tokens.expiry_date) updateData.expires_at = Math.floor(tokens.expiry_date / 1000);
    if (Object.keys(updateData).length > 0) {
      await prisma.account.update({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: account.providerAccountId,
          },
        },
        data: updateData,
      });
    }
  });

  return google.gmail({ version: "v1", auth });
}

async function sendViaSmtp(to: string, subject: string, html: string, pdfBuffer?: Uint8Array, attachmentName?: string) {
  const transport = createSmtpTransport();
  if (!transport) throw new Error("SMTP not configured");

  const user = process.env.GMAIL_USER!;
  const mailOptions: nodemailer.SendMailOptions = {
    from: user,
    to,
    subject,
    html,
  };

  if (pdfBuffer && attachmentName) {
    mailOptions.attachments = [{ filename: attachmentName, content: Buffer.from(pdfBuffer) }];
  }

  await transport.sendMail(mailOptions);
}

async function sendViaOAuth(
  userId: string,
  to: string,
  subject: string,
  body: string,
  attachment?: Uint8Array,
  attachmentName?: string,
) {
  const gmail = await getGmailClient(userId);
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=?=`;

  let message = "";
  if (attachment) {
    const boundary = "__boundary__";
    const parts = [
      `To: ${to}`,
      `Subject: ${utf8Subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      body,
      "",
      `--${boundary}`,
      `Content-Type: application/pdf; name="${attachmentName || "invoice.pdf"}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachmentName || "invoice.pdf"}"`,
      "",
      Buffer.from(attachment).toString("base64"),
      `--${boundary}--`,
    ];
    message = parts.join("\r\n");
  } else {
    message = [
      `To: ${to}`,
      "Content-Type: text/html; charset=utf-8",
      "MIME-Version: 1.0",
      `Subject: ${utf8Subject}`,
      "",
      body,
    ].join("\n");
  }

  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedMessage },
  });
}

export async function sendInvoiceReminder({
  userId,
  to,
  subject,
  body,
  attachment,
  attachmentName = "invoice.pdf",
}: {
  userId: string;
  to: string;
  subject: string;
  body: string;
  attachment?: Uint8Array;
  attachmentName?: string;
}) {
  const smtpTransport = createSmtpTransport();

  if (smtpTransport) {
    try {
      await sendViaSmtp(to, subject, body, attachment, attachmentName);
      return;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "";
      console.warn("SMTP send failed, falling back to OAuth:", msg);
    }
  }

  try {
    await sendViaOAuth(userId, to, subject, body, attachment, attachmentName);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: number }).code
        : undefined;
    if (errorCode === 401 || msg.includes("unauthorized_client") || msg.includes("invalid_grant")) {
      throw new Error("Gmail send failed. Check GMAIL_USER and GMAIL_APP_PASSWORD in environment variables.");
    }
    throw error;
  }
}
