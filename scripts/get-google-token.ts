import { google } from "googleapis";
import readline from "readline";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3000/api/auth/callback/google";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first");
  process.exit(1);
}

const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = auth.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent",
});

console.log("\n🔗 Open this URL in your browser:\n");
console.log(authUrl);
console.log("\nAfter authorizing, paste the code here:\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Authorization code: ", async (code) => {
  rl.close();
  try {
    const { tokens } = await auth.getToken(code.trim());
    console.log("\n✅ Tokens received!\n");
    console.log("GOOGLE_ACCESS_TOKEN=" + tokens.access_token);
    console.log("GOOGLE_REFRESH_TOKEN=" + tokens.refresh_token);
    console.log("\nAdd these to your .env and Vercel environment variables.");
  } catch (error: any) {
    console.error("❌ Failed to get tokens:", error.message);
  }
});
