export function getStripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY;
}

export function getStripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET;
}
