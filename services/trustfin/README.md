# TrustFin risk-estimator service

HTTP wrapper around the phase‑4B.1 artefact from
[HEETMEHTA18/trust_fin](https://github.com/HEETMEHTA18/trust_fin)
(`artifacts/phase4b_1/models/I9_fit_only_selected.joblib`).

InvoNotify calls it from `lib/ai/trustfin/client.ts` as a **verifier**: a `risk`
at or above the threshold, or an `abstain`, downgrades an already-approved
policy action to human review. It can never unlock a blocked action.

## Run locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Drop the artefact next to the service (do not commit it):
mkdir -p ../../.trustfin-models
cp /path/to/I9_fit_only_selected.joblib ../../.trustfin-models/

TRUSTFIN_MODEL_PATH=../../.trustfin-models/I9_fit_only_selected.joblib \
  uvicorn app:app --host 127.0.0.1 --port 8080
```

Then in InvoNotify's `.env`:

```env
TRUSTFIN_RISK_URL="http://127.0.0.1:8080"
```

and verify with `pnpm trustfin:smoke`.

## Feature mapping is required, not optional

The artefact was trained on FinQA program features. InvoNotify sends its own feature vector (`amountClaims`, `ungroundedClaims`, `groundingRate`,
`evidenceTokenOverlap`, `reasonTokens`, `programSteps`, `promptLength`,
`truncated`, …), so you must map them:

```bash
export TRUSTFIN_FEATURE_MAP='{"operand_source_count":"amountClaims","unmatched_literal_count":"ungroundedClaims","__order__":["operand_source_count","unmatched_literal_count"]}'
```

The service returns `422` with the exact `expected` feature list when something
is missing. It never zero-fills a gap: a wrong vector is the failure mode this
verifier exists to catch.

Until a mapping is validated, leave `TRUSTFIN_REQUIRED=false` (the default) so
an unreachable or mismatched service leaves the existing policy decision
standing, and the gap stays visible in `TrustFinAssessment` rows.
