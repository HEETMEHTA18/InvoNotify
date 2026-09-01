#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const inputPath = process.argv[2];

if (!inputPath) {
  throw new Error("Usage: node scripts/configure-razorpay-test-mode.mjs <razorpay-key-csv>");
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  cells.push(current.trim());
  return cells;
}

function upsertEnvValue(contents, key, value) {
  const expression = new RegExp(`^${key}=.*$`, "m");
  const entry = `${key}=${value}`;
  return expression.test(contents)
    ? contents.replace(expression, entry)
    : `${contents}${contents && !contents.endsWith("\n") ? "\n" : ""}${entry}\n`;
}

const csvLines = fs
  .readFileSync(inputPath, "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim().length > 0);

if (csvLines.length < 2) {
  throw new Error("The key CSV must contain a header row and one credential row.");
}

const headers = parseCsvLine(csvLines[0]).map((header) =>
  header.toLowerCase().replace(/[^a-z0-9]/g, ""),
);
const values = parseCsvLine(csvLines[1]);
const lookup = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
const keyId = lookup.keyid || lookup.razorpaykeyid || lookup.apikey || values[0];
const keySecret = lookup.keysecret || lookup.razorpaykeysecret || lookup.apisecret || values[1];

if (!keyId?.startsWith("rzp_") || !keySecret) {
  throw new Error("The CSV does not contain a valid Razorpay key ID and key secret.");
}

const envPath = path.join(process.cwd(), ".env.local");
const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
let next = upsertEnvValue(existing, "RAZORPAY_KEY_ID", keyId);
next = upsertEnvValue(next, "RAZORPAY_KEY_SECRET", keySecret);
const createdCronSecret = !/^CRON_SECRET=.+$/m.test(next);
if (createdCronSecret) {
  next = upsertEnvValue(next, "CRON_SECRET", crypto.randomBytes(32).toString("base64url"));
}
fs.writeFileSync(envPath, next, { encoding: "utf8", mode: 0o600 });

const configuredKeys = new Set(
  next
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=.+/.test(line))
    .map((line) => line.slice(0, line.indexOf("="))),
);

console.log(
  JSON.stringify({
    configured: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
    source: path.basename(inputPath),
    additionalSetup: {
      webhookSecretPresent: configuredKeys.has("RAZORPAY_WEBHOOK_SECRET"),
      publicAppUrlPresent:
        configuredKeys.has("SITE_URL") ||
        configuredKeys.has("APP_URL") ||
        configuredKeys.has("NEXT_PUBLIC_APP_URL"),
      cronSecretPresent: configuredKeys.has("CRON_SECRET"),
      createdCronSecret,
    },
  }),
);
