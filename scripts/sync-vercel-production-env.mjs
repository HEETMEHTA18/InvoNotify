#!/usr/bin/env node

import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
const localEnv = fs.readFileSync(envPath, "utf8");

function readEnv(name) {
  const match = localEnv.match(new RegExp(`^${name}=(.*)$`, "m"));
  return match?.[1]?.trim() || null;
}

function syncSecret(name) {
  const value = readEnv(name);
  if (!value) throw new Error(`${name} is missing from .env.local`);

  const result = childProcess.spawnSync(
    "pnpm",
    ["dlx", "vercel", "env", "add", name, "production,preview", "--force", "--sensitive", "--yes"],
    { cwd: process.cwd(), input: value, encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(`Vercel rejected ${name}: ${result.stderr || result.stdout}`);
  }
}

function syncPublicValue(name, value) {
  const result = childProcess.spawnSync(
    "pnpm",
    [
      "dlx",
      "vercel",
      "env",
      "add",
      name,
      "production,preview",
      "--force",
      "--no-sensitive",
      "--value",
      value,
      "--yes",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(`Vercel rejected ${name}: ${result.stderr || result.stdout}`);
  }
}

syncSecret("RAZORPAY_KEY_ID");
syncSecret("RAZORPAY_KEY_SECRET");

const productionUrl = "https://invonotify.vercel.app";
for (const name of ["SITE_URL", "APP_URL", "NEXT_PUBLIC_APP_URL"]) {
  syncPublicValue(name, productionUrl);
}

console.log(
  JSON.stringify({
    syncedSecrets: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
    syncedPublicValues: ["SITE_URL", "APP_URL", "NEXT_PUBLIC_APP_URL"],
    targets: ["production", "preview"],
  }),
);
