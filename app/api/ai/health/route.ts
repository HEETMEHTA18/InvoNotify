import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateEnv, isLlmConfigured, getPaymentProvider } from "@/lib/ai/config";
import { getModelVersion } from "@/lib/ai/ml/risk-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthCheck = {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  checks: {
    database: { status: string; latencyMs?: number; error?: string };
    env: { status: string; issues: Array<{ path: string; message: string }> };
    payment: { provider: string; configured: boolean };
    llm: { configured: boolean; disabled: boolean };
    model: { name: string; source: string; trainedAt: string };
  };
};

export async function GET() {
  const checks: HealthCheck["checks"] = {
    database: { status: "unknown" },
    env: { status: "unknown", issues: [] },
    payment: { provider: "none", configured: false },
    llm: { configured: false, disabled: false },
    model: { name: "unknown", source: "unknown", trainedAt: "" },
  };

  // Database check
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      status: "error",
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }

  // Environment validation
  const envIssues = validateEnv();
  checks.env = {
    status: envIssues.length === 0 ? "ok" : "invalid",
    issues: envIssues,
  };

  // Payment provider
  const provider = getPaymentProvider();
  checks.payment = {
    provider,
    configured: provider !== "none",
  };

  // LLM
  checks.llm = {
    configured: isLlmConfigured(),
    disabled: process.env.DISABLE_LLM_AGENT === "true",
  };

  // Model
  try {
    const model = getModelVersion();
    checks.model = model;
  } catch {
    checks.model = { name: "error", source: "unknown", trainedAt: "" };
  }

  // Overall status
  const dbOk = checks.database.status === "ok";
  const envOk = checks.env.status === "ok";
  const status: HealthCheck["status"] =
    dbOk && envOk ? "healthy" : dbOk ? "degraded" : "unhealthy";

  const response: HealthCheck = {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
  };

  return NextResponse.json(response, {
    status: status === "unhealthy" ? 503 : 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Health-Status": status,
    },
  });
}