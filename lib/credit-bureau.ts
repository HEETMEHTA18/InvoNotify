/**
 * Credit bureau integration service.
 *
 * Fetches real credit scores from external APIs. Supports multiple providers:
 *   1. CRA API (free tier for developers)
 *   2. Manual score entry fallback
 *
 * Env vars:
 *   CREDIT_BUREAU_API_KEY   - API key for credit bureau
 *   CREDIT_BUREAU_API_URL   - Custom API endpoint (optional)
 *   CREDIT_BUREAU_PROVIDER  - "cra" | "mock" (default: "mock")
 *
 * Pricing: Most Indian credit bureaus charge ₹15-50 per score pull.
 * For hackathon demos, use the mock provider (free).
 */

import { prisma } from "@/lib/db";

function logInfo(msg: string, data?: Record<string, unknown>) {
  console.log(`[credit-bureau] ${msg}`, data || "");
}
function logWarn(msg: string, data?: unknown) {
  console.warn(`[credit-bureau] ${msg}`, data || "");
}
function logError(msg: string, error?: unknown) {
  console.error(`[credit-bureau] ${msg}`, error || "");
}

export type CreditScoreResult = {
  score: number;
  provider: string;
  fetchedAt: Date;
  expirationDate: Date;
  factors?: Array<{ code: string; description: string; impact: "positive" | "negative" | "neutral" }>;
  reportId?: string;
};

export type CreditScoreError = {
  error: string;
  code: "NOT_CONFIGURED" | "API_ERROR" | "CUSTOMER_NOT_FOUND" | "RATE_LIMITED" | "MOCK_MODE";
};

/**
 * Check if credit bureau is configured.
 */
export function isCreditBureauConfigured(): boolean {
  return (
    process.env.CREDIT_BUREAU_PROVIDER === "cra" &&
    Boolean(process.env.CREDIT_BUREAU_API_KEY)
  );
}

/**
 * Get provider name.
 */
function getProvider(): string {
  return process.env.CREDIT_BUREAU_PROVIDER || "mock";
}

/**
 * Mock credit score provider for demos.
 * Returns a deterministic score based on customer name hash.
 */
function mockCreditScore(customerName: string, existingScore?: number): CreditScoreResult {
  // Use existing score if available
  if (existingScore && existingScore >= 300 && existingScore <= 900) {
    return {
      score: existingScore,
      provider: "mock",
      fetchedAt: new Date(),
      expirationDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      factors: [
        { code: "EXISTING_SCORE", description: "Using existing CIBIL score", impact: "neutral" },
      ],
    };
  }

  // Generate deterministic score from name
  let hash = 0;
  for (let i = 0; i < customerName.length; i++) {
    hash = (hash * 31 + customerName.charCodeAt(i)) | 0;
  }
  const score = 550 + Math.abs(hash) % 300; // Range: 550-849

  return {
    score: Math.min(900, Math.max(300, score)),
    provider: "mock",
    fetchedAt: new Date(),
    expirationDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    factors: [
      { code: "MOCK_DATA", description: "Demo score - not from real bureau", impact: "neutral" },
    ],
  };
}

/**
 * Fetch credit score from CRA API (real provider).
 *
 * CRA (Credit Rating Agency) API is a common Indian credit bureau interface.
 * In production, replace with actual provider (CRIF, Experian, Equifax, etc.)
 */
async function fetchFromCRA(
  panNumber: string,
  customerName: string,
  phone: string,
): Promise<CreditScoreResult> {
  const apiKey = process.env.CREDIT_BUREAU_API_KEY;
  const apiUrl = process.env.CREDIT_BUREAU_API_URL || "https://api.creditratingagency.in/v1";

  if (!apiKey) {
    throw new Error("CREDIT_BUREAU_API_KEY not configured");
  }

  try {
    const response = await fetch(`${apiUrl}/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        pan: panNumber,
        name: customerName,
        mobile: phone,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`CRA API error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as {
      score: number;
      report_id?: string;
      factors?: Array<{ code: string; description: string; impact: string }>;
    };

    return {
      score: Math.min(900, Math.max(300, data.score)),
      provider: "cra",
      fetchedAt: new Date(),
      expirationDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      reportId: data.report_id,
      factors: data.factors?.map((f) => ({
        code: f.code,
        description: f.description,
        impact: f.impact as "positive" | "negative" | "neutral",
      })),
    };
  } catch (error) {
    logError("CRA API call failed", error);
    throw error;
  }
}

/**
 * Fetch credit score for a customer.
 *
 * Tries the configured provider, falls back to mock data.
 */
export async function fetchCreditScore(params: {
  customerId?: number;
  customerName: string;
  panNumber?: string;
  phone?: string;
  existingScore?: number;
}): Promise<CreditScoreResult | CreditScoreError> {
  const { customerId, customerName, panNumber, phone, existingScore } = params;
  const provider = getProvider();

  if (provider === "mock" || !isCreditBureauConfigured()) {
    logInfo("Using mock credit score", { customerName });
    return mockCreditScore(customerName, existingScore);
  }

  if (!panNumber) {
    return {
      error: "PAN number required for real credit score fetch",
      code: "CUSTOMER_NOT_FOUND",
    };
  }

  try {
    const result = await fetchFromCRA(panNumber, customerName, phone || "");

    // Update customer record if customerId provided
    if (customerId && result.score >= 300 && result.score <= 900) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { cibilScore: result.score },
      });
      logInfo("Updated customer credit score", {
        customerId,
        score: result.score,
        provider: result.provider,
      });
    }

    return result;
  } catch (error) {
    logWarn("Credit score fetch failed, falling back to mock", {
      error: error instanceof Error ? error.message : String(error),
    });
    return mockCreditScore(customerName, existingScore);
  }
}

/**
 * Batch fetch credit scores for multiple customers.
 */
export async function batchFetchCreditScores(
  customers: Array<{
    id: number;
    name: string;
    phone?: string;
    cibilScore: number;
  }>,
): Promise<Map<number, CreditScoreResult | CreditScoreError>> {
  const results = new Map<number, CreditScoreResult | CreditScoreError>();

  for (const customer of customers) {
    const result = await fetchCreditScore({
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      existingScore: customer.cibilScore,
    });
    results.set(customer.id, result);

    // Rate limit: 1 request per second
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}
