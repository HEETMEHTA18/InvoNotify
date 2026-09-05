import { google } from "googleapis";

async function testGmail() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const accessToken = process.env.GOOGLE_ACCESS_TOKEN;

  if (!clientId || !clientSecret) {
    console.error("❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    process.exit(1);
  }

  if (!refreshToken && !accessToken) {
    console.error("❌ Missing GOOGLE_REFRESH_TOKEN and GOOGLE_ACCESS_TOKEN");
    process.exit(1);
  }

  console.log("🔧 Configuring OAuth2 client...");
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  const gmail = google.gmail({ version: "v1", auth });

  // First, verify we can access the Gmail API (get profile)
  try {
    console.log("📧 Checking Gmail access...");
    const profile = await gmail.users.getProfile({ userId: "me" });
    console.log(`✅ Gmail access OK. Sending from: ${profile.data.emailAddress}`);
  } catch (error: any) {
    console.error("❌ Cannot access Gmail API:", error.message);
    if (error.code === 401 || error.message.includes("invalid_grant")) {
      console.error("   → Tokens are expired or revoked. Re-authenticate with Google OAuth.");
    }
    process.exit(1);
  }

  // Send a test email
  const testEmail = process.argv[2];
  if (!testEmail) {
    console.log("✅ Gmail API is working! (Profile fetched successfully)");
    console.log("   To send a test email, run: npx tsx scripts/test-gmail.ts your@email.com");
    process.exit(0);
  }

  console.log(`📧 Sending test email to ${testEmail}...`);

  const subject = "InvoNotify - Gmail API Test";
  const body = `
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
      <h2 style="color: #2563eb;">✅ Gmail API is Working!</h2>
      <p>This is a test email from <strong>InvoNotify</strong>.</p>
      <p>If you received this, your Gmail integration is properly configured.</p>
      <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
      <p style="color: #6b7280; font-size: 12px;">Sent at ${new Date().toISOString()}</p>
    </body>
    </html>
  `;

  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
  const messageParts = [
    `To: ${testEmail}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${utf8Subject}`,
    "",
    body,
  ];
  const message = messageParts.join("\n");
  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage },
    });
    console.log(`✅ Email sent successfully! Message ID: ${result.data.id}`);
  } catch (error: any) {
    console.error("❌ Failed to send email:", error.message);
    if (error.errors) {
      console.error("   Details:", JSON.stringify(error.errors, null, 2));
    }
    process.exit(1);
  }
}

testGmail();
