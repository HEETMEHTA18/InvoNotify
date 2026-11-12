# TrustFin-SLM integration and AWS deployment

Source model: **[HEETMEHTA18/trust_fin](https://github.com/HEETMEHTA18/trust_fin)** —
"Trustworthy Small Language Models for Financial Tasks".

Two separate things in that repository are relevant here, and they are
integrated in two different ways:

| TrustFin component | What it is | How InvoNotify uses it |
|---|---|---|
| Phase‑4B.1 risk estimator (`artifacts/phase4b_1/models/I9_fit_only_selected.joblib`) | A small scikit-learn logistic model that predicts when a financial answer/program is likely wrong, with calibration and selective-prediction (abstain) semantics | **Verifier gate** on every autonomous recovery action — implemented in `lib/ai/trustfin/` and served by `services/trustfin/` |
| Phase‑3 frozen backbone (`Qwen/Qwen3-1.7B`, E5 QLoRA) | A fine-tuned small language model for financial reasoning | **Decision LLM**, via the existing OpenAI-compatible adapter — configuration only, no code |

---

## 1. The verifier gate (code shipped)

`lib/ai/trustfin/` is a thin, honest adapter:

- `features.ts` — deterministic extraction of the decision text's numeric claims,
  grounding against the invoice record the agent actually saw, evidence
  vocabulary overlap, and prompt/truncation flags. No model, no network.
- `client.ts` — `POST {TRUSTFIN_RISK_URL}/v1/assess` with a 4 s timeout, strict
  response validation, and an explicit `unavailable` outcome on any failure.
- `gate.ts` — the decision rule (pure, unit-tested).

### What the gate is allowed to do

```
policy verdict BLOCK  ──────────────► BLOCK   (verifier never sees it)
policy verdict REQUIRE_HUMAN_APPROVAL ► unchanged
policy verdict ALLOW  ──► verifier ──► ALLOW, or REQUIRE_HUMAN_APPROVAL
```

It can only **tighten** an approval. It cannot unlock a blocked action, cannot
change the action itself, and cannot bypass opt-out, cooldown, amount limits or
the stopping rules — those all run before it.

Only contact actions are verified (`SEND_REMINDER`, `CREATE_PAYMENT_LINK`,
`RESEND_PAYMENT_LINK`). `STOP`, `ESCALATE_TO_HUMAN` and `SCHEDULE_FOLLOWUP` are
skipped: nothing reaches the customer.

### Behaviour matrix

| `TRUSTFIN_RISK_URL` | Service state | `TRUSTFIN_REQUIRED` | Result for an ALLOW |
|---|---|---|---|
| unset | — | — | ALLOW (no-op; one cheap branch, no network) |
| set | healthy, risk < threshold | either | ALLOW |
| set | healthy, risk ≥ threshold | either | **REQUIRE_HUMAN_APPROVAL** |
| set | healthy, `abstain: true` | either | **REQUIRE_HUMAN_APPROVAL** |
| set | down / timeout / bad JSON / 422 | `false` (default) | ALLOW, recorded as `source: "unavailable"` |
| set | down / timeout / bad JSON / 422 | `true` | **REQUIRE_HUMAN_APPROVAL** |

Every evaluation that reaches the verifier is persisted in
`TrustFinAssessment` (`source`, `risk`, `threshold`, `abstained`, `verdict`,
`reasons`, `features`), and summarised in the decision's `AuditLog.metadata`.

### Environment variables

```env
# Base URL of the served estimator. Unset = verifier disabled.
TRUSTFIN_RISK_URL="https://trustfin.internal.example.com"
# Review threshold on the model's positive-class probability (default 0.5).
TRUSTFIN_RISK_THRESHOLD="0.5"
# When true, an unreachable verifier routes to a human instead of proceeding.
TRUSTFIN_REQUIRED="false"
# When true, ungrounded numeric claims in the decision text force human review.
TRUSTFIN_REQUIRE_GROUNDING="false"
TRUSTFIN_TIMEOUT_MS="4000"
TRUSTFIN_MODEL_VERSION="phase4b1-i9-fit-only"
```

Check a deployment from the app side:

```bash
pnpm trustfin:smoke
```

### The one thing that must be validated before trusting it

The artefact was trained on **FinQA program features** — operand provenance,
question/evidence relevance, operation types, truncation. A recovery decision
has no executable program, so `programSteps` and `hasExecutableProgram` are
honestly `0`, and the remaining groups are computed against the invoice record.
That means:

- A served FinQA model **must be mapped** (`TRUSTFIN_FEATURE_MAP`) and
  **re-validated** on recovery data before its probabilities mean anything.
- The service returns `422` with the expected feature list rather than
  zero-filling a mismatch, so a bad mapping surfaces instead of silently
  producing confident nonsense.
- `TRUSTFIN_REQUIRED` should stay `false` until that validation exists.

Do not describe the gate as "validated by TrustFin" in a demo. It is "verified
by a TrustFin risk estimator deployment, with the caveat below".

---

## 2. Deploying the estimator on AWS

The service is a single stateless FastAPI container (`services/trustfin/`) that
loads one `.joblib` file. Requirements: an HTTPS endpoint InvoNotify can reach,
the artefact mounted or baked in, and no PHI outside your account.

### Option A — ECS Fargate behind an ALB (recommended for this contract)

Straightforward HTTPS, matches the `/v1/assess` contract exactly, no request
signing needed in Next.js.

```bash
# 1. Build and push to ECR
aws ecr create-repository --repository-name trustfin-risk
aws ecr get-login-password --region ap-south-1 \
  | docker login --username AWS --password-stdin <account>.dkr.ecr.ap-south-1.amazonaws.com
docker build -t trustfin-risk services/trustfin
docker tag trustfin-risk:latest <account>.dkr.ecr.ap-south-1.amazonaws.com/trustfin-risk:latest
docker push <account>.dkr.ecr.ap-south-1.amazonaws.com/trustfin-risk:latest

# 2. Artefact: put I9_fit_only_selected.joblib in S3 and mount it at /models,
#    or COPY it into the image in a private build (simplest, but then rotate the
#    image when the artefact changes).
aws s3 cp artifacts/phase4b_1/models/I9_fit_only_selected.joblib \
  s3://<your-bucket>/trustfin/I9_fit_only_selected.joblib

# 3. ECS service (console is faster than CLI for the first run): Fargate,
#    0.25 vCPU / 0.5 GB, port 8080, ALB target group with a health check on
#    /health, "Require SSL" listener on 443, and security group access only from
#    the InvoNotify runtime.
```

Then set `TRUSTFIN_RISK_URL=https://trustfin.internal.example.com`.

Approximate cost (ap-south-1, on-demand, *verify in the calculator*): Fargate
0.25 vCPU/0.5 GB ≈ **$9–11/month** if always on; ALB ≈ **$16–20/month** plus
LCU charges. Scale to zero with a scheduled task if the demo only runs in bursts.

### Option B — Lambda container + API Gateway (cheapest for bursty traffic)

```bash
docker build -t trustfin-risk services/trustfin
aws lambda create-function \
  --function-name trustfin-risk \
  --package-type Image \
  --code ImageUri=<account>.dkr.ecr.ap-south-1.amazonaws.com/trustfin-risk:latest \
  --role arn:aws:iam::<account>:role/trustfin-lambda-exec \
  --memory-size 1024 --timeout 15
```

Lambda's handler contract is not FastAPI's; either add a small Mangum adapter
(`pip install mangum`, wrap `app` with `Mangum(app)`) or front the container with
API Gateway HTTP API → Lambda proxy. Costs sit inside the free tier for a demo
(1 M requests + 400 000 GB-s per month), with cold starts of ~1–3 s for the
sklearn import — raise `TRUSTFIN_TIMEOUT_MS` above 4000 if you take this path.

### Option C — SageMaker real-time endpoint

The service already exposes SageMaker's `/ping` and `/invocations` contracts, so
the container can be deployed as a SageMaker Model:

```bash
aws sagemaker create-model --model-name trustfin-risk --primary-container Image=<ecr-uri>
aws sagemaker create-endpoint-config --endpoint-config-name trustfin-risk-cfg \
  --production-variants VariantName=all,ModelName=trustfin-risk,InitialInstanceCount=1,InstanceType=ml.c5.large
aws sagemaker create-endpoint --endpoint-name trustfin-risk --endpoint-config-name trustfin-risk-cfg
```

**Caveat that decides this for you:** invoking a SageMaker endpoint requires
SigV4 request signing. This repo deliberately does not ship the AWS SDK just for
that, so either (a) put API Gateway in front of the endpoint and call that, or
(b) accept adding `@aws-sdk/client-sagemaker-runtime` and a signing layer. For a
CPU sklearn model, Option A is usually less work than Option C.

`ml.c5.large` is ≈ **$0.11/hour** (≈ $80/month) always-on, *approximate*.

### Deploying the SLM (Qwen3‑1.7B QLoRA) instead

The Phase‑3 backbone is served as an OpenAI-compatible chat endpoint, which the
existing decision agent already supports — this needs **no code change**:

```env
LLM_BASE_URL="https://<your-slm-endpoint>/v1"
LLM_MODEL="qwen3-1.7b-trustfin-e5"
OPENAI_API_KEY="<the bearer token your endpoint expects>"
```

Serving options:

- **vLLM or TGI on a GPU** (SageMaker endpoint with a vLLM container, ECS on
  `g5.xlarge`, or EKS). `ml.g5.xlarge` ≈ **$1.41/hour** (≈ $1,030/month)
  always-on — *approximate, verify region and current pricing*.
- **Bedrock Custom Model Import** only if your exact base/adapted architecture is
  supported; otherwise stick with vLLM. Check the supported-architecture list
  before promising this in a demo.
- Keep `DISABLE_LLM_AGENT=true` for reproducible demos and add the SLM only when
  you deliberately want to show the LLM layer (see `docs/AI_MODEL_SETUP.md`).

If you use the SLM, remember the repo's own status note: the protected test has
**not** been evaluated, so do not present its accuracy as a validated result.

---

## 3. Security and data handling

- The verifier receives **decision text plus a derived feature vector** — no
  customer name, email, phone or invoice file. Keep it that way: the persisted
  `TrustFinAssessment.features` is a numeric map by construction.
- Keep the endpoint private (internal ALB, VPC-only SageMaker, or API Gateway
  with an API key + WAF). Do not expose it publicly: it is unauthenticated by
  design and only safe behind your network boundary.
- Store the artefact in S3 with SSE and a bucket policy limited to the task role;
  do not commit `.joblib` files (they are research evidence owned by the
  TrustFin project, and `.gitignore` covers `.trustfin-models/`).
- If you enable `TRUSTFIN_REQUIRED=true`, add an alarm on the endpoint's 5xx
  rate — otherwise a verifier outage silently converts every action into human
  review, which looks like "the agent stopped working".

## 4. Verification checklist

1. `pnpm trustfin:smoke` → `status: ok`, expected feature list printed.
2. Run a safe sweep (`pnpm ai:verify`) and confirm `TrustFinAssessment` rows with
   `source: "remote"` and a plausible `risk`.
3. Flip `TRUSTFIN_RISK_THRESHOLD=0.01` and confirm previously autonomous actions
   now land in `AWAITING_APPROVAL` — that proves the gate tightens and nothing else.
4. Stop the service and confirm: with `TRUSTFIN_REQUIRED=false` the sweep still
   completes (`source: "unavailable"`), and with `true` it routes to review.
