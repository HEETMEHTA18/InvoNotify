/**
 * Local-only credentials for the judge-facing hackathon showcase.
 *
 * This is deliberately a non-routable `.test` identity and is enabled only
 * outside production. It is not a Razorpay account and must never receive real
 * provider credentials or outbound customer traffic.
 */
export const LOCAL_HACKATHON_DEMO = {
  id: "razorpay",
  email: "razorpay@invo-notify.test",
  password: "razorpay",
  name: "Razorpay AI Recovery — Hackathon Demo",
} as const;

export function localHackathonDemoEnabled(): boolean {
  return (
    (process.env.NODE_ENV !== "production" && process.env.DEMO_ACCOUNT_ENABLED !== "false") ||
    process.env.HACKATHON_DEMO_ACCOUNT_ENABLED === "true"
  );
}

/** Maps the compact judge-facing ID to the non-routable local email identity. */
export function resolveLocalHackathonDemoId(identifier: string): string | null {
  if (!localHackathonDemoEnabled()) return null;
  return identifier.trim().toLowerCase() === LOCAL_HACKATHON_DEMO.id
    ? LOCAL_HACKATHON_DEMO.email
    : null;
}

export function isLocalHackathonDemoCredential(email: string, password: string): boolean {
  return (
    localHackathonDemoEnabled() &&
    email === LOCAL_HACKATHON_DEMO.email &&
    password === LOCAL_HACKATHON_DEMO.password
  );
}
