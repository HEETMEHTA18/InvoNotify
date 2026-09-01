#!/usr/bin/env python3
"""
Payment *risk* model training script.

Trains a logistic regression that predicts P(invoice is NOT paid) and exports
the weights to:
    lib/ai/ml/model-weights.json

CRITICAL — LABEL POLARITY
-------------------------
The TypeScript inference engine (lib/ai/ml/risk-model.ts) computes:

    riskScore          = sigmoid(intercept + Sum(w_i * x_i))
    paymentProbability = 1 - riskScore

so the exported model MUST predict the probability of *default* (not paid).
Training on a "paid" label produces a model of P(paid), which inference then
mislabels as risk - inverting every score, every expectedRecovery, and every
escalation decision. This script therefore trains on `defaulted` (1 = unpaid)
and refuses to export weights whose signs contradict domain expectations
(see EXPECTED_SIGNS / check_polarity).

Usage:
    python3 ai/ml/training/train.py                  # synthetic, writes weights
    python3 ai/ml/training/train.py --dry-run        # evaluate, write nothing
    python3 ai/ml/training/train.py --data real.jsonl
    python3 ai/ml/training/train.py --samples 8000 --test-frac 0.25

Dependencies (optional): numpy, scikit-learn. Without them the script falls
back to a pure-python gradient-descent fit. Metrics are computed in pure
python either way, so both paths report identically.
"""
from __future__ import annotations

import argparse
import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

FEATURES = [
    "amountDue",
    "daysOverdue",
    "customerAgeDays",
    "previousInvoiceCount",
    "previousLatePayments",
    "averagePaymentDelayDays",
    "paymentSuccessRate",
    "previousReminders",
    "isVipExempt",
    "cibilScore",
    "humanEngaged",
]

# Sign each coefficient must have in a *risk* (P(default)) model.
# +1 => raising the feature must raise risk;  -1 => must lower risk.
# check_polarity() blocks export when a fitted sign disagrees, which is the
# guard that catches a re-introduced "trained on paid instead of defaulted" bug.
EXPECTED_SIGNS = {
    "amountDue": +1,
    "daysOverdue": +1,
    "customerAgeDays": -1,
    "previousInvoiceCount": -1,
    "previousLatePayments": +1,
    "averagePaymentDelayDays": +1,
    "paymentSuccessRate": -1,
    "previousReminders": +1,
    "isVipExempt": -1,
    "cibilScore": -1,
    "humanEngaged": -1,
}

# Ground-truth coefficients used to *generate* the synthetic dataset, in
# normalized feature space. Because they are known, the training pipeline is
# verifiable end-to-end: a correct fit recovers these signs and roughly these
# magnitudes. They encode the same domain prior as the shipped hand-calibrated
# weights, so a synthetic fit should land near them.
TRUE_INTERCEPT = 0.30
TRUE_COEFFICIENTS = {
    "amountDue": 0.50,
    "daysOverdue": 1.60,
    "customerAgeDays": -0.60,
    "previousInvoiceCount": -0.50,
    "previousLatePayments": 1.20,
    "averagePaymentDelayDays": 0.80,
    "paymentSuccessRate": -2.50,
    "previousReminders": 0.60,
    "isVipExempt": -1.00,
    "cibilScore": -0.90,
    "humanEngaged": -0.50,
}


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def sigmoid(z: float) -> float:
    if z >= 0:
        return 1.0 / (1.0 + math.exp(-z))
    ez = math.exp(z)
    return ez / (1.0 + ez)


def normalize(features: dict) -> dict:
    """Mirror of lib/ai/ml/features.ts normalizeFeatures().

    Any change here MUST be mirrored there, or the exported weights are
    applied to a different feature scale at inference time (train/serve skew).
    """
    return {
        "amountDue": _clamp01(math.log1p(max(0, features["amountDue"])) / math.log1p(100000)),
        "daysOverdue": _clamp01(max(0, features["daysOverdue"]) / 30),
        "customerAgeDays": _clamp01(max(0, features["customerAgeDays"]) / 365),
        "previousInvoiceCount": _clamp01(max(0, features["previousInvoiceCount"]) / 10),
        "previousLatePayments": _clamp01(max(0, features["previousLatePayments"]) / 5),
        "averagePaymentDelayDays": _clamp01(max(0, features["averagePaymentDelayDays"]) / 30),
        "paymentSuccessRate": _clamp01(features["paymentSuccessRate"]),
        "previousReminders": _clamp01(max(0, features["previousReminders"]) / 5),
        "isVipExempt": 1.0 if features["isVipExempt"] else 0.0,
        "cibilScore": _clamp01((max(300, min(900, features["cibilScore"])) - 300) / 600),
        "humanEngaged": 1.0 if features["humanEngaged"] else 0.0,
    }


def vectorize(features: dict) -> list[float]:
    norm = normalize(features)
    return [norm[k] for k in FEATURES]


# ---------------------------------------------------------------------------
# Datasets
# ---------------------------------------------------------------------------

def synthetic_dataset(size: int = 4000, seed: int = 42) -> list[tuple[dict, float]]:
    """Synthetic recovery outcomes drawn from a known logistic model.

    Returns (raw_features, defaulted) where defaulted == 1.0 means the invoice
    was NOT paid. This is a *cold-start prior*, not evidence about real
    customers - metrics measured on it must be reported as synthetic.
    """
    rng = random.Random(seed)
    rows: list[tuple[dict, float]] = []

    for _ in range(size):
        count = rng.randint(0, 12)
        late = rng.randint(0, count) if count else 0
        delay = rng.uniform(0, 40) if late else rng.uniform(0, 4)
        raw = {
            "amountDue": rng.randint(1000, 300000),
            "daysOverdue": rng.randint(0, 60),
            "customerAgeDays": rng.randint(30, 1500),
            "previousInvoiceCount": count,
            "previousLatePayments": late,
            "averagePaymentDelayDays": delay,
            "paymentSuccessRate": rng.uniform(0.3, 1.0),
            "previousReminders": rng.randint(0, 5),
            "isVipExempt": rng.random() < 0.10,
            "cibilScore": rng.randint(550, 820),
            "humanEngaged": rng.random() < 0.15,
        }

        norm = normalize(raw)
        log_odds = TRUE_INTERCEPT + sum(
            TRUE_COEFFICIENTS[k] * norm[k] for k in FEATURES
        )
        p_default = sigmoid(log_odds)
        rows.append((raw, 1.0 if rng.random() < p_default else 0.0))

    return rows


def load_dataset(path: Path) -> list[tuple[dict, float]]:
    """Loads real outcomes from JSONL.

    Each line: the 11 raw features plus a label. The label may be given as
    `defaulted` (1 = unpaid) or `paid` (1 = paid); `paid` is inverted on load
    so downstream code only ever sees the risk polarity.
    """
    rows: list[tuple[dict, float]] = []
    with path.open() as handle:
        for line_no, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)

            if "defaulted" in record:
                label = 1.0 if record["defaulted"] else 0.0
            elif "paid" in record:
                label = 0.0 if record["paid"] else 1.0
            else:
                raise ValueError(
                    f"{path}:{line_no} needs a 'defaulted' or 'paid' field"
                )

            missing = [k for k in FEATURES if k not in record]
            if missing:
                raise ValueError(f"{path}:{line_no} missing features: {missing}")

            rows.append(({k: record[k] for k in FEATURES}, label))

    if not rows:
        raise ValueError(f"{path} contained no usable rows")
    return rows


def stratified_split(
    rows: list[tuple[dict, float]], test_frac: float, seed: int
) -> tuple[list, list]:
    """Class-stratified split so both splits keep the base default rate."""
    rng = random.Random(seed)
    positives = [r for r in rows if r[1] >= 0.5]
    negatives = [r for r in rows if r[1] < 0.5]
    rng.shuffle(positives)
    rng.shuffle(negatives)

    train: list = []
    test: list = []
    for group in (positives, negatives):
        cut = int(round(len(group) * test_frac))
        test.extend(group[:cut])
        train.extend(group[cut:])

    rng.shuffle(train)
    rng.shuffle(test)
    return train, test


# ---------------------------------------------------------------------------
# Fitting
# ---------------------------------------------------------------------------

def fit_sklearn(X: list[list[float]], y: list[float]) -> tuple[float, list[float], str]:
    import numpy as np  # type: ignore

    try:
        from sklearn.linear_model import LogisticRegression  # type: ignore
    except ImportError as exc:  # pragma: no cover - exercised via fallback
        raise ImportError("scikit-learn unavailable") from exc

    clf = LogisticRegression(max_iter=1000)
    clf.fit(np.array(X, dtype=float), np.array(y, dtype=float))
    return float(clf.intercept_[0]), [float(w) for w in clf.coef_[0]], "scikit-learn"


def fit_pure_python(
    X: list[list[float]], y: list[float], epochs: int = 300, lr: float = 0.1
) -> tuple[float, list[float], str]:
    """Batch gradient descent - deterministic, no dependencies."""
    n_features = len(FEATURES)
    weights = [0.0] * n_features
    bias = 0.0
    n = len(X)
    if n == 0:
        raise ValueError("cannot fit on an empty training set")

    for _ in range(epochs):
        grad_w = [0.0] * n_features
        grad_b = 0.0
        for row, label in zip(X, y):
            error = sigmoid(bias + sum(w * xi for w, xi in zip(weights, row))) - label
            for i, xi in enumerate(row):
                grad_w[i] += error * xi
            grad_b += error
        for i in range(n_features):
            weights[i] -= lr * grad_w[i] / n
        bias -= lr * grad_b / n

    return bias, weights, "pure-python"


def predict_proba(intercept: float, weights: list[float], row: list[float]) -> float:
    return sigmoid(intercept + sum(w * xi for w, xi in zip(weights, row)))


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def roc_auc(y_true: list[float], scores: list[float]) -> float | None:
    """Mann-Whitney U statistic, with average ranks for ties."""
    positives = sum(1 for y in y_true if y >= 0.5)
    negatives = len(y_true) - positives
    if positives == 0 or negatives == 0:
        return None

    order = sorted(range(len(scores)), key=lambda i: scores[i])
    ranks = [0.0] * len(scores)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and scores[order[j + 1]] == scores[order[i]]:
            j += 1
        average_rank = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = average_rank
        i = j + 1

    positive_rank_sum = sum(ranks[i] for i, y in enumerate(y_true) if y >= 0.5)
    return (positive_rank_sum - positives * (positives + 1) / 2.0) / (positives * negatives)


def calibration_bins(y_true: list[float], scores: list[float], bins: int = 5) -> list[dict]:
    """Predicted vs observed default rate per score bucket.

    This is the check that actually catches an inverted model: a flipped
    model still scores a fine AUC (ranking is symmetric) but its predicted
    rate moves opposite to the observed rate.
    """
    out: list[dict] = []
    for b in range(bins):
        low = b / bins
        high = (b + 1) / bins
        members = [
            (y, s)
            for y, s in zip(y_true, scores)
            if (s >= low and s < high) or (b == bins - 1 and s == 1.0)
        ]
        if not members:
            out.append({"bin": f"{low:.1f}-{high:.1f}", "count": 0})
            continue
        out.append(
            {
                "bin": f"{low:.1f}-{high:.1f}",
                "count": len(members),
                "predictedDefaultRate": round(sum(s for _, s in members) / len(members), 4),
                "observedDefaultRate": round(sum(y for y, _ in members) / len(members), 4),
            }
        )
    return out


def evaluate(y_true: list[float], scores: list[float], threshold: float = 0.5) -> dict:
    tp = fp = tn = fn = 0
    for y, s in zip(y_true, scores):
        predicted = s >= threshold
        actual = y >= 0.5
        if predicted and actual:
            tp += 1
        elif predicted and not actual:
            fp += 1
        elif not predicted and actual:
            fn += 1
        else:
            tn += 1

    total = max(1, tp + fp + tn + fn)
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    brier = sum((s - y) ** 2 for y, s in zip(y_true, scores)) / total

    return {
        "n": len(y_true),
        "threshold": threshold,
        "baseDefaultRate": round(sum(y_true) / total, 4),
        "accuracy": round((tp + tn) / total, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "rocAuc": (lambda a: round(a, 4) if a is not None else None)(roc_auc(y_true, scores)),
        "brierScore": round(brier, 4),
        "confusionMatrix": {
            "truePositive": tp,
            "falsePositive": fp,
            "trueNegative": tn,
            "falseNegative": fn,
        },
        "calibration": calibration_bins(y_true, scores),
    }


def check_polarity(weights: dict[str, float], tolerance: float = 0.05) -> list[str]:
    """Returns human-readable violations of EXPECTED_SIGNS.

    Coefficients smaller than `tolerance` are treated as "no signal" and
    skipped, so genuinely weak features do not block an export.
    """
    violations: list[str] = []
    for feature, expected in EXPECTED_SIGNS.items():
        weight = weights.get(feature, 0.0)
        if abs(weight) < tolerance:
            continue
        if (expected > 0 and weight < 0) or (expected < 0 and weight > 0):
            direction = "increase" if expected > 0 else "decrease"
            violations.append(
                f"{feature}: expected to {direction} risk (sign {expected:+d}) "
                f"but fitted weight is {weight:+.3f}"
            )
    return violations


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train and evaluate the payment-risk model.",
    )
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "lib/ai/ml/model-weights.json")
    parser.add_argument(
        "--metrics-out", type=Path, default=REPO_ROOT / "ai/ml/training/metrics.json"
    )
    parser.add_argument("--data", type=Path, help="JSONL of real labelled outcomes")
    parser.add_argument("--samples", type=int, default=4000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--test-frac", type=float, default=0.2)
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument(
        "--dry-run", action="store_true", help="evaluate without writing weights"
    )
    parser.add_argument(
        "--force", action="store_true", help="export even if polarity checks fail"
    )
    args = parser.parse_args()

    if args.data:
        rows = load_dataset(args.data)
        dataset_kind = "real"
        dataset_note = str(args.data)
    else:
        rows = synthetic_dataset(args.samples, args.seed)
        dataset_kind = "synthetic"
        dataset_note = (
            f"generated from known logistic coefficients "
            f"(samples={args.samples}, seed={args.seed})"
        )

    train_rows, test_rows = stratified_split(rows, args.test_frac, args.seed)
    if not test_rows:
        raise SystemExit("test split is empty - raise --samples or --test-frac")

    X_train = [vectorize(f) for f, _ in train_rows]
    y_train = [label for _, label in train_rows]
    X_test = [vectorize(f) for f, _ in test_rows]
    y_test = [label for _, label in test_rows]

    try:
        intercept, coefficients, backend = fit_sklearn(X_train, y_train)
    except ImportError:
        intercept, coefficients, backend = fit_pure_python(X_train, y_train)

    weights = dict(zip(FEATURES, coefficients))

    train_metrics = evaluate(
        y_train, [predict_proba(intercept, coefficients, x) for x in X_train], args.threshold
    )
    test_metrics = evaluate(
        y_test, [predict_proba(intercept, coefficients, x) for x in X_test], args.threshold
    )

    violations = check_polarity(weights)

    print(f"\n[train] backend={backend}  dataset={dataset_kind} ({dataset_note})")
    print(f"[train] train={len(train_rows)} rows  test={len(test_rows)} rows")
    print(f"[train] intercept={intercept:+.4f}")
    print("\n[train] fitted weights (risk polarity: + raises risk)")
    for feature in FEATURES:
        expected = "+" if EXPECTED_SIGNS[feature] > 0 else "-"
        print(f"         {feature:<26} {weights[feature]:+.4f}   (expected {expected})")

    print("\n[eval] held-out test set")
    for key in ("n", "baseDefaultRate", "accuracy", "precision", "recall", "f1", "rocAuc", "brierScore"):
        print(f"         {key:<18} {test_metrics[key]}")
    cm = test_metrics["confusionMatrix"]
    print(
        f"         confusion          TP={cm['truePositive']} FP={cm['falsePositive']} "
        f"TN={cm['trueNegative']} FN={cm['falseNegative']}"
    )
    print("\n[eval] calibration (predicted vs observed default rate)")
    for bucket in test_metrics["calibration"]:
        if not bucket["count"]:
            continue
        print(
            f"         {bucket['bin']}  n={bucket['count']:<5} "
            f"predicted={bucket['predictedDefaultRate']:.3f}  "
            f"observed={bucket['observedDefaultRate']:.3f}"
        )

    if dataset_kind == "synthetic":
        print(
            "\n[warn] Metrics above are measured on SYNTHETIC data generated from a\n"
            "       known model. They validate the pipeline, NOT real-world accuracy.\n"
            "       Report them as synthetic; retrain with --data once real outcomes exist."
        )

    model = {
        "version": {
            "name": "payment-risk-v1",
            "trainedAt": datetime.now(timezone.utc).isoformat(),
            "source": "trained",
            "backend": backend,
            "dataset": dataset_kind,
            "datasetNote": dataset_note,
            "predicts": "P(invoice not paid) - riskScore, matching risk-model.ts",
            "trainRows": len(train_rows),
            "testRows": len(test_rows),
        },
        "intercept": intercept,
        "weights": weights,
    }

    report = {
        "generatedAt": model["version"]["trainedAt"],
        "modelVersion": model["version"],
        "polarityViolations": violations,
        "train": train_metrics,
        "test": test_metrics,
    }

    if violations:
        print("\n[FAIL] polarity check failed - the model contradicts domain expectations:")
        for violation in violations:
            print(f"         {violation}")
        print(
            "\n       A model that predicts P(paid) instead of P(default) looks exactly\n"
            "       like this. risk-model.ts reads the sigmoid as riskScore, so exporting\n"
            "       these weights would invert every score. Refusing to write.\n"
            "       Override with --force only if you know why the signs flipped."
        )

    if args.dry_run:
        print("\n[train] --dry-run: no files written")
        return

    args.metrics_out.parent.mkdir(parents=True, exist_ok=True)
    args.metrics_out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"\n[train] wrote metrics  {args.metrics_out}")

    if violations and not args.force:
        raise SystemExit(1)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(model, indent=2) + "\n")
    print(f"[train] wrote weights  {args.out}")


if __name__ == "__main__":
    main()
