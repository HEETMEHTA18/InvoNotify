import { Prisma, prisma } from "@/lib/db";
import {
  recordConfirmedRecoveryPaymentInTransaction,
  resolveRecoveryCaseForPaidInvoiceInTransaction,
} from "@/lib/ai/orchestrator";

export class InvoicePaymentError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "ALREADY_PAID",
  ) {
    super(message);
    this.name = "InvoicePaymentError";
  }
}

export type SettleInvoicePaymentInput = {
  invoiceId: number;
  amount: number;
  method: string;
  date?: Date;
  note?: string | null;
  /** A provider payment ID or manually supplied reconciliation reference. */
  transactionId?: string | null;
  /** Restricts dashboard-originated manual payments to this merchant. */
  ownerUserId?: string;
  /** Razorpay callback metadata kept on the invoice for reconciliation. */
  razorpayPaymentId?: string | null;
};

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isSerializationError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/**
 * Records confirmed money exactly once and updates the invoice, recovery case,
 * recovery audit ledger, and scheduled action state in one transaction.
 *
 * The row lock makes two different callbacks for the same invoice calculate
 * their balances in sequence. A unique provider transaction reference protects
 * the same callback arriving concurrently through different provider events.
 */
export async function settleInvoicePayment(input: SettleInvoicePaymentInput) {
  if (!Number.isInteger(input.invoiceId) || input.invoiceId <= 0) {
    throw new InvoicePaymentError("Invoice ID must be a positive integer", "NOT_FOUND");
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new InvoicePaymentError("Payment amount must be positive", "ALREADY_PAID");
  }

  const transactionId = input.transactionId?.trim() || null;
  const paymentDate = input.date && !Number.isNaN(input.date.getTime()) ? input.date : new Date();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          // PostgreSQL row locking makes the following balance calculation safe
          // for different, valid provider payments arriving at the same time.
          const locked = await tx.$queryRaw<Array<{ id: number }>>`
            SELECT "id" FROM "Invoice" WHERE "id" = ${input.invoiceId} FOR UPDATE
          `;
          if (locked.length === 0) {
            throw new InvoicePaymentError("Invoice not found", "NOT_FOUND");
          }

          const invoice = await tx.invoice.findFirst({
            where: input.ownerUserId
              ? {
                  id: input.invoiceId,
                  OR: [{ ownerUserId: input.ownerUserId }, { userId: input.ownerUserId }],
                }
              : { id: input.invoiceId },
            select: { total: true, amountPaid: true, balance: true },
          });
          if (!invoice) {
            throw new InvoicePaymentError("Invoice not found or unauthorized", "NOT_FOUND");
          }

          if (transactionId) {
            const existing = await tx.payment.findFirst({
              where: { transactionId },
              select: { id: true },
            });
            if (existing) {
              return { status: "duplicate" as const, paymentId: existing.id };
            }
          }

          const outstanding = Math.max(0, Number(invoice.total) - Number(invoice.amountPaid));
          const creditedAmount = Math.min(input.amount, outstanding);
          if (creditedAmount <= 0) {
            throw new InvoicePaymentError("Invoice is already paid", "ALREADY_PAID");
          }

          let payment;
          try {
            payment = await tx.payment.create({
              data: {
                invoiceId: input.invoiceId,
                amount: creditedAmount,
                method: input.method || "Manual",
                date: paymentDate,
                note: input.note || null,
                transactionId,
              },
            });
          } catch (error) {
            if (!transactionId || !isUniqueConstraintError(error)) throw error;
            const existing = await tx.payment.findFirst({
              where: { transactionId },
              select: { id: true },
            });
            return { status: "duplicate" as const, paymentId: existing?.id ?? null };
          }

          const newAmountPaid = Number(invoice.amountPaid) + creditedAmount;
          const newBalance = Math.max(0, Number(invoice.total) - newAmountPaid);
          const updatedInvoice = await tx.invoice.update({
            where: { id: input.invoiceId },
            data: {
              amountPaid: newAmountPaid,
              balance: newBalance,
              status: newBalance <= 0 ? "Paid" : "Pending",
              ...(input.razorpayPaymentId !== undefined
                ? { razorpayPaymentId: input.razorpayPaymentId }
                : {}),
            },
          });

          const recoveryCredit = await recordConfirmedRecoveryPaymentInTransaction(tx, {
            invoiceId: input.invoiceId,
            paymentId: payment.id,
            confirmedPaymentAmount: Number(payment.amount),
          });
          const recoveryCaseResolved = await resolveRecoveryCaseForPaidInvoiceInTransaction(
            tx,
            input.invoiceId,
          );

          return {
            status: "created" as const,
            payment,
            updatedInvoice,
            recoveryCredit,
            recoveryCaseResolved,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (attempt < 2 && isSerializationError(error)) continue;
      throw error;
    }
  }

  // The loop always returns or throws; this is only for TypeScript control flow.
  throw new Error("Payment settlement could not be completed");
}
