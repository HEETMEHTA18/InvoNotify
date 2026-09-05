#!/bin/bash
# InvoNotify Demo Preparation Script
# Run this before recording your demo video

set -e

echo "🎬 InvoNotify Demo Preparation"
echo "=============================="

# 1. Reset and re-seed demo data
echo ""
echo "📦 Step 1: Resetting demo data..."
npx tsx scripts/reset-cases.ts 2>/dev/null || echo "  (reset skipped - no cases to reset)"

echo ""
echo "🌱 Step 2: Seeding fresh demo data..."
npx tsx scripts/ai/seed-recovery-data.ts

# 3. Verify environment
echo ""
echo "🔍 Step 3: Verifying environment..."

if [ -f .env ]; then
  if grep -q "RAZORPAY_KEY_ID" .env; then
    echo "  ✅ Razorpay configured"
  else
    echo "  ❌ Razorpay not configured"
  fi
  
  if grep -q "GMAIL_USER" .env; then
    echo "  ✅ Gmail SMTP configured"
  else
    echo "  ❌ Gmail not configured"
  fi
  
  if grep -q "WHATSAPP_PHONE_NUMBER_ID" .env; then
    echo "  ✅ WhatsApp configured"
  else
    echo "  ⚠️  WhatsApp not configured (optional)"
  fi
else
  echo "  ❌ .env file not found"
fi

# 4. Start dev server
echo ""
echo "🚀 Step 4: Starting dev server..."
echo "  Run: pnpm dev"
echo "  Open: http://localhost:3000"
echo ""
echo "📋 Demo Checklist:"
echo "  1. Login: razorpay@invo-notify.test / razorpay"
echo "  2. Show dashboard overview"
echo "  3. Click on a recovery case"
echo "  4. Trigger AI sweep"
echo "  5. Show email with Razorpay payment link"
echo "  6. Show analytics with baseline comparison"
echo ""
echo "✅ Ready to record!"
