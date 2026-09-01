import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, rateLimitResponse, getRateLimitHeaders, resetRateLimits } from "@/lib/ai/rate-limit";

beforeEach(() => { resetRateLimits(); });

describe("checkRateLimit", () => {
  it("allows first request", () => {
    const r = checkRateLimit("test:s1:u1");
    assert.equal(r.allowed, true);
    assert.ok(r.remaining > 0);
  });

  it("tracks count", () => {
    checkRateLimit("test:s2:u1");
    checkRateLimit("test:s2:u1");
    const r = checkRateLimit("test:s2:u1");
    assert.ok(r.remaining < 30);
  });

  it("blocks when exceeded", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("lim:s1:u1", { maxRequests: 5, windowMs: 60000 });
    const r = checkRateLimit("lim:s1:u1", { maxRequests: 5, windowMs: 60000 });
    assert.equal(r.allowed, false);
    assert.ok(r.retryAfterMs > 0);
  });

  it("resets after window", async () => {
    checkRateLimit("exp:s1:u1", { maxRequests: 2, windowMs: 50 });
    checkRateLimit("exp:s1:u1", { maxRequests: 2, windowMs: 50 });
    assert.equal(checkRateLimit("exp:s1:u1", { maxRequests: 2, windowMs: 50 }).allowed, false);
    await new Promise(r => setTimeout(r, 60));
    assert.equal(checkRateLimit("exp:s1:u1", { maxRequests: 2, windowMs: 50 }).allowed, true);
  });

  it("different keys are independent", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("ind:s1:u1", { maxRequests: 3, windowMs: 60000 });
    assert.equal(checkRateLimit("ind:s1:u1", { maxRequests: 3, windowMs: 60000 }).allowed, false);
    assert.equal(checkRateLimit("ind:s1:u2", { maxRequests: 3, windowMs: 60000 }).allowed, true);
  });
});

describe("rateLimitResponse", () => {
  it("returns ok when allowed", () => {
    assert.equal(rateLimitResponse("recovery:sweep", "u1").ok, true);
  });

  it("returns 429 when exceeded", () => {
    for (let i = 0; i < 5; i++) rateLimitResponse("recovery:sweep", "u2");
    const r = rateLimitResponse("recovery:sweep", "u2");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 429);
  });
});

describe("getRateLimitHeaders", () => {
  it("returns standard headers", () => {
    const h = getRateLimitHeaders("recovery:sweep", "u1");
    assert.ok(h["X-RateLimit-Limit"]);
    assert.ok(h["X-RateLimit-Remaining"]);
    assert.ok(h["X-RateLimit-Reset"]);
  });
});