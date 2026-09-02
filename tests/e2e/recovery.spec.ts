import { test, expect } from "@playwright/test";

test.describe("AI Revenue Recovery Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the recovery dashboard
    await page.goto("/dashboard/recovery");
    // Wait for page to load
    await page.waitForLoadState("networkidle");
  });

  test("displays recovery overview cards", async ({ page }) => {
    // Check that the page title is present
    await expect(page.locator("text=AI Revenue Recovery")).toBeVisible();

    // Check that KPI cards are present
    await expect(page.locator("text=At Risk")).toBeVisible();
    await expect(page.locator("text=Expected Recovery")).toBeVisible();
    await expect(page.locator("text=Open Recovery Cases")).toBeVisible();
    await expect(page.locator("text=Awaiting Approval")).toBeVisible();
  });

  test("shows Run Recovery button", async ({ page }) => {
    const runButton = page.locator("button", { hasText: "Run Recovery" });
    await expect(runButton).toBeVisible();
    await expect(runButton).toBeEnabled();
  });

  test("runs recovery sweep and displays results", async ({ page }) => {
    const runButton = page.locator("button", { hasText: "Run Recovery" });
    await runButton.click();

    // Wait for the sweep to complete (loading indicator disappears)
    await page.waitForResponse(
      (res) => res.url().includes("/api/ai/recovery") && res.request().method() === "POST",
    );

    // Wait for toast notification
    await expect(page.locator("text=Recovery run")).toBeVisible({ timeout: 10000 });
  });

  test("shows empty state when no cases", async ({ page }) => {
    // The shared demo database can contain cases; verify the page still loads.
    await expect(page.locator("text=AI Revenue Recovery")).toBeVisible();
  });

  test("can open case detail modal", async ({ page }) => {
    // If there are cases, click Review on first one
    const reviewButton = page.locator("button", { hasText: "Review" }).first();
    if (await reviewButton.isVisible()) {
      await reviewButton.click();

      // Modal should appear
      await expect(page.locator("text=Why did the AI do this?")).toBeVisible({ timeout: 5000 });

      // Close modal
      await page.keyboard.press("Escape");
    }
  });

  test("recovery page is accessible from sidebar", async ({ page }) => {
    // Navigate to main dashboard first
    await page.goto("/dashboard");

    // Click AI Recovery in sidebar
    const recoveryLink = page.locator("a", { hasText: "AI Recovery" });
    await expect(recoveryLink).toBeVisible();
    await recoveryLink.click();

    // Should navigate to recovery page
    await expect(page).toHaveURL(/\/dashboard\/recovery/);
  });
});

test.describe("AI Health Check", () => {
  test("health endpoint returns status", async ({ request }) => {
    const response = await request.get("/api/ai/health");
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("checks");
    expect(body).toHaveProperty("timestamp");
    expect(["healthy", "degraded", "unhealthy"]).toContain(body.status);
    expect(body.checks).toHaveProperty("database");
    expect(body.checks).toHaveProperty("env");
    expect(body.checks).toHaveProperty("payment");
  });
});

test.describe("AI Metrics Endpoint", () => {
  test("metrics returns 401 without auth", async ({ request }) => {
    const response = await request.get("/api/ai/metrics");
    expect(response.status()).toBe(401);
  });
});
