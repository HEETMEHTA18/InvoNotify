/**
 * Pure settlement math for a RecoveryCase.
 *
 * Monetary values are converted to paise before calculation so an invoice with
 * several partial payments cannot drift due to JavaScript floating-point math.
 * `expectedRecovery` is intentionally absent: this ledger accepts only a
 * confirmed payment amount.
 */
export type RecoveryCreditInput = {
  amountAtRisk: number;
  recoveredAmount: number;
  confirmedPaymentAmount: number;
};

export type RecoveryCredit = {
  creditedAmount: number;
  recoveredAmount: number;
  outstandingAmount: number;
};

function asPaise(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100));
}

function asRupees(value: number): number {
  return value / 100;
}

/**
 * Applies one idempotently-recorded payment to the case ledger.
 *
 * The caller is responsible for calling this only after it has inserted a
 * unique Payment row. Capping at the original amount at risk prevents an
 * overpayment or a repeated provider callback from inflating recovered money.
 */
export function calculateRecoveryCredit(input: RecoveryCreditInput): RecoveryCredit {
  const amountAtRisk = asPaise(input.amountAtRisk);
  const recorded = Math.min(amountAtRisk, asPaise(input.recoveredAmount));
  const incoming = asPaise(input.confirmedPaymentAmount);
  const credited = Math.min(Math.max(0, amountAtRisk - recorded), incoming);
  const recovered = recorded + credited;

  return {
    creditedAmount: asRupees(credited),
    recoveredAmount: asRupees(recovered),
    outstandingAmount: asRupees(Math.max(0, amountAtRisk - recovered)),
  };
}
