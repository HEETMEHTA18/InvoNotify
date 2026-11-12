import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgresql://")),
  DIRECT_URL: z.string().url().or(z.string().startsWith("postgresql://")).optional(),
  AUTH_SECRET: z.string().min(16),
  SITE_URL: z.string().url().optional(),
  APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  // Razorpay (required for production)
  RAZORPAY_KEY_ID: z.string().startsWith("rzp_").optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),

  // Stripe (legacy, optional)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // LLM (optional — falls back to rules agent)
  LLAMAINDEX_API_KEY: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_MODEL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  DISABLE_LLM_AGENT: z.enum(["true", "false"]).optional(),

  // TrustFin-SLM verifier (optional — the pipeline works without it)
  TRUSTFIN_RISK_URL: z.string().url().optional(),
  TRUSTFIN_RISK_THRESHOLD: z.coerce.number().min(0).max(1).optional(),
  TRUSTFIN_REQUIRED: z.enum(["true", "false"]).optional(),
  TRUSTFIN_REQUIRE_GROUNDING: z.enum(["true", "false"]).optional(),
  TRUSTFIN_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  TRUSTFIN_MODEL_VERSION: z.string().optional(),

  // Cron
  CRON_SECRET: z.string().min(8).optional(),

  // Email
  GMAIL_USER: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),

  // SMS (optional)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

let _cached: EnvConfig | null = null;

/**
 * Validates and caches environment variables at startup.
 * Throws a clear error with exactly which vars are missing/wrong.
 */
export function getEnvConfig(): EnvConfig {
  if (_cached) return _cached;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Environment validation failed:\n${formatted}\n\n` +
        "Fix the above variables in .env (local) or your hosting dashboard (production).",
    );
  }

  _cached = result.data;
  return _cached;
}

/**
 * Non-throwing check — returns issues array or empty if valid.
 * Useful for health endpoints and startup diagnostics.
 */
export function validateEnv(): Array<{ path: string; message: string }> {
  const result = envSchema.safeParse(process.env);
  if (result.success) return [];
  return result.error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
}

export function isRazorpayConfigured(): boolean {
  const env = getEnvConfig();
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function isLlmConfigured(): boolean {
  const env = getEnvConfig();
  return Boolean(env.LLAMAINDEX_API_KEY || env.LLM_API_KEY || env.OPENAI_API_KEY);
}

export function getLlmConfig() {
  const env = getEnvConfig();
  return {
    baseUrl: env.LLM_BASE_URL || "https://api.llamaindex.ai/v1",
    model: env.LLM_MODEL || "gpt-4o-mini",
    timeout: env.LLM_TIMEOUT_MS || 15000,
    disabled: env.DISABLE_LLM_AGENT === "true",
  };
}

export type TrustFinConfig = {
  url: string | null;
  threshold: number;
  required: boolean;
  requireGrounding: boolean;
  timeoutMs: number;
  modelVersion: string | null;
};

/**
 * TrustFin-SLM verifier configuration.
 *
 * Read straight from the environment so a sweep can never fail because an
 * optional verifier is absent. `required` is the only setting that changes
 * behaviour when the service is down: it then routes to a human instead of
 * letting the autonomous action proceed.
 */
export function getTrustFinConfig(): TrustFinConfig {
  const env = process.env;
  const threshold = Number(env.TRUSTFIN_RISK_THRESHOLD);
  const timeout = Number(env.TRUSTFIN_TIMEOUT_MS);
  return {
    url: env.TRUSTFIN_RISK_URL?.trim() || null,
    threshold: Number.isFinite(threshold) && threshold >= 0 && threshold <= 1 ? threshold : 0.5,
    required: env.TRUSTFIN_REQUIRED === "true",
    requireGrounding: env.TRUSTFIN_REQUIRE_GROUNDING === "true",
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 4000,
    modelVersion: env.TRUSTFIN_MODEL_VERSION?.trim() || null,
  };
}

export function isTrustFinConfigured(): boolean {
  return Boolean(process.env.TRUSTFIN_RISK_URL?.trim());
}

export function getPaymentProvider(): "razorpay" | "stripe" | "none" {
  if (isRazorpayConfigured()) return "razorpay";
  if (isStripeConfigured()) return "stripe";
  return "none";
}

export function getSiteUrl(): string {
  const env = getEnvConfig();
  return env.SITE_URL || env.APP_URL || env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function getCronSecret(): string | null {
  return process.env.CRON_SECRET || process.env.REMINDER_CRON_SECRET || null;
}