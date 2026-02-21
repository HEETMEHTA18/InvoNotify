
import { google } from "googleapis";
import { prisma } from "./db";

export async function getGmailClient(userId: string) {
    const account = await prisma.account.findFirst({
        where: {
            userId,
            provider: "google",
        },
    });

    if (!account || !account.access_token) {
        // Fallback to .env tokens if database tokens are missing
        const fallbackAccessToken = process.env.GOOGLE_ACCESS_TOKEN;
        const fallbackRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;

        if (fallbackAccessToken) {
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

        throw new Error("Google account not linked or access token missing");
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

    // Handle token refresh if necessary
    auth.on("tokens", async (tokens) => {
        if (tokens.refresh_token) {
            await prisma.account.update({
                where: {
                    provider_providerAccountId: {
                        provider: "google",
                        providerAccountId: account.providerAccountId,
                    },
                },
                data: {
                    refresh_token: tokens.refresh_token,
                    access_token: tokens.access_token,
                    expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : undefined,
                },
            });
        } else if (tokens.access_token) {
            await prisma.account.update({
                where: {
                    provider_providerAccountId: {
                        provider: "google",
                        providerAccountId: account.providerAccountId,
                    },
                },
                data: {
                    access_token: tokens.access_token,
                    expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : undefined,
                },
            });
        }
    });

    return google.gmail({ version: "v1", auth });
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
    const gmail = await getGmailClient(userId);

    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;

    let message = "";

    if (attachment) {
        const boundary = "__boundary__";
        const messageParts = [
            `To: ${to}`,
            `Subject: ${utf8Subject}`,
            "MIME-Version: 1.0",
            `Content-Type: multipart/mixed; boundary="${boundary}"`,
            "",
            `--${boundary}`,
            "Content-Type: text/html; charset=utf-8",
            "MIME-Version: 1.0",
            "",
            body,
            "",
            `--${boundary}`,
            `Content-Type: application/pdf; name="${attachmentName}"`,
            "Content-Transfer-Encoding: base64",
            `Content-Disposition: attachment; filename="${attachmentName}"`,
            "",
            Buffer.from(attachment).toString("base64"),
            `--${boundary}--`,
        ];
        message = messageParts.join("\r\n");
    } else {
        const messageParts = [
            `To: ${to}`,
            "Content-Type: text/html; charset=utf-8",
            "MIME-Version: 1.0",
            `Subject: ${utf8Subject}`,
            "",
            body,
        ];
        message = messageParts.join("\n");
    }

    const encodedMessage = Buffer.from(message)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    try {
        await gmail.users.messages.send({
            userId: "me",
            requestBody: {
                raw: encodedMessage,
            },
        });
    } catch (error: any) {
        const msg = error?.message || "";
        if (error.code === 401 || msg.includes("unauthorized_client") || msg.includes("invalid_grant")) {
            throw new Error("Google access expired or token revoked. Please sign out and sign in again with Google to refresh your Gmail permissions.");
        }
        throw error;
    }
}
