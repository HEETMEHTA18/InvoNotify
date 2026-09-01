import { NextResponse } from "next/server";
import { requireUser } from "@/lib/security/authz";

const FAILURE_TAXONOMY = [
  {
    code: "PAYMENT_DECLINED_INSUFFICIENT_FUNDS",
    category: "PAYMENT_FAILURE",
    description: "Customer has insufficient funds",
    retryable: true,
    actionFamily: "RETRY_PAYMENT",
  },
  {
    code: "PAYMENT_DECLINED_CARD_EXPIRED",
    category: "PAYMENT_FAILURE",
    description: "Payment card has expired",
    retryable: false,
    actionFamily: "UPDATE_PAYMENT_METHOD",
  },
  {
    code: "PAYMENT_DECLINED_CARD_BLOCKED",
    category: "PAYMENT_FAILURE",
    description: "Card blocked by issuer",
    retryable: false,
    actionFamily: "UPDATE_PAYMENT_METHOD",
  },
  {
    code: "PAYMENT_DECLINED_FRAUD_SUSPECTED",
    category: "PAYMENT_FAILURE",
    description: "Transaction flagged as fraud",
    retryable: false,
    actionFamily: "MANUAL_REVIEW",
  },
  {
    code: "PAYMENT_DECLINED_DO_NOT_HONOR",
    category: "PAYMENT_FAILURE",
    description: "Issuer declined - do not honor",
    retryable: true,
    actionFamily: "RETRY_PAYMENT",
  },
  {
    code: "PAYMENT_DECLINED_LIMIT_EXCEEDED",
    category: "PAYMENT_FAILURE",
    description: "Transaction exceeds card limit",
    retryable: false,
    actionFamily: "UPDATE_PAYMENT_METHOD",
  },
  {
    code: "MANDATE_FAILED",
    category: "MANDATE_FAILURE",
    description: "Auto-debit mandate failed",
    retryable: true,
    actionFamily: "RETRY_MANDATE",
  },
  {
    code: "MANDATE_EXPIRED",
    category: "MANDATE_FAILURE",
    description: "Mandate has expired",
    retryable: false,
    actionFamily: "RECREATE_MANDATE",
  },
  {
    code: "MANDATE_REVOKED",
    category: "MANDATE_FAILURE",
    description: "Customer revoked mandate",
    retryable: false,
    actionFamily: "RECREATE_MANDATE",
  },
  {
    code: "CHECKOUT_ABANDONED",
    category: "CHECKOUT_ABANDONMENT",
    description: "Customer abandoned checkout",
    retryable: true,
    actionFamily: "SEND_REMINDER",
  },
  {
    code: "CHECKOUT_EXPIRED",
    category: "CHECKOUT_ABANDONMENT",
    description: "Checkout session expired",
    retryable: true,
    actionFamily: "SEND_PAYMENT_LINK",
  },
  {
    code: "SUBSCRIPTION_PAYMENT_FAILED",
    category: "SUBSCRIPTION_FAILURE",
    description: "Recurring subscription payment failed",
    retryable: true,
    actionFamily: "RETRY_SUBSCRIPTION",
  },
  {
    code: "SUBSCRIPTION_CANCELLED",
    category: "SUBSCRIPTION_FAILURE",
    description: "Subscription cancelled by customer",
    retryable: false,
    actionFamily: "WINBACK",
  },
  {
    code: "INVOICE_OVERDUE",
    category: "OVERDUE_RECEIVABLE",
    description: "Invoice past due date",
    retryable: true,
    actionFamily: "CHASE_RECEIVABLE",
  },
  {
    code: "INVOICE_DISPUTED",
    category: "OVERDUE_RECEIVABLE",
    description: "Customer disputed invoice",
    retryable: false,
    actionFamily: "DISPUTE_RESOLUTION",
  },
  {
    code: "BANK_ACCOUNT_CLOSED",
    category: "BANKING_ISSUE",
    description: "Customer bank account closed",
    retryable: false,
    actionFamily: "UPDATE_BANK_DETAILS",
  },
  {
    code: "TECHNICAL_ERROR",
    category: "TECHNICAL",
    description: "Gateway/technical error",
    retryable: true,
    actionFamily: "RETRY_PAYMENT",
  },
  {
    code: "NETWORK_TIMEOUT",
    category: "TECHNICAL",
    description: "Network timeout during payment",
    retryable: true,
    actionFamily: "RETRY_PAYMENT",
  },
  {
    code: "CUSTOMER_UNREACHABLE",
    category: "COMMUNICATION_FAILURE",
    description: "Cannot reach customer",
    retryable: false,
    actionFamily: "ESCALATE",
  },
];

export async function GET() {
  try {
    const who = await requireUser();
    if (!who.ok) return who.response;

    return NextResponse.json({ taxonomy: FAILURE_TAXONOMY });
  } catch (error) {
    console.error("Failure taxonomy fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch failure taxonomy" },
      { status: 500 }
    );
  }
}
