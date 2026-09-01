#!/usr/bin/env node
/**
 * Comprehensive AI test runner using node:test + tsx.
 *
 * Runs all test files under tests/ai/ in sequence.
 * Pure-logic tests (ML, policy, decision, rate-limit) run without mocks.
 * Integration tests (orchestrator) use mocked Prisma.
 *
 * Usage:
 *   npx --yes tsx tests/ai/run-all.ts
 */
import { run } from "node:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function findTestFiles(dir: string = __dirname): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await findTestFiles(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

async function main() {
  const files = await findTestFiles();

  if (files.length === 0) {
    console.error("No test files found under tests/ai/");
    process.exit(1);
  }

  console.log(`\n  AI Test Suite — ${files.length} file(s)\n`);
  console.log("  Files:");
  for (const f of files) {
    const rel = path.relative(path.join(__dirname, "../.."), f);
    console.log(`    ${rel}`);
  }
  console.log("");

  const stream = run(
    { files, concurrency: 1 },
  );

  let failures = 0;
  stream.on("test:fail", () => { failures += 1; });

  await new Promise<void>((resolve) => {
    stream.on("complete", () => resolve());
  });

  if (failures > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
