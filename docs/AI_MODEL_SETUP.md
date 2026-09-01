# AI model setup — local hackathon demo

The complete demo works without an external AI key. By default the recovery
agent uses a deterministic rules fallback whenever no LLM is configured or a
provider response is invalid. The policy engine still evaluates every proposed
action, so an LLM can never bypass consent, approval, money, or stopping rules.

## Fastest reliable demo setup

```bash
./scripts/local-db.sh start
export DATABASE_URL='postgresql://postgres@127.0.0.1:5433/invonotify?sslmode=disable'
export DIRECT_URL="$DATABASE_URL"
pnpm exec prisma migrate deploy
pnpm ai:seed
DISABLE_LLM_AGENT=true pnpm ai:verify
pnpm dev
```

Sign in locally with `razorpay` / `razorpay`. The seed creates fictional,
non-sending notification previews and labels every simulated action or recovery
as such. It does not need an API key, a Razorpay account, or customer contact.

## Optional LLM recommendation provider

The decision adapter accepts an OpenAI-compatible chat-completions endpoint.
Set one API-key variable, then optionally set endpoint, model, and timeout:

```env
# One of these enables the adapter. Do not commit any value.
OPENAI_API_KEY="..."
# or LLM_API_KEY="..."
# or LLAMAINDEX_API_KEY="..."

# Optional; the default is https://api.llamaindex.ai/v1
LLM_BASE_URL="https://your-openai-compatible-endpoint/v1"
LLM_MODEL="gpt-4o-mini"
LLM_TIMEOUT_MS="15000"
```

Restart the app after changing environment variables. The adapter sends only
the current invoice, customer payment-history summary, risk, and previous
action types. It requires strict JSON and rejects unknown action/channel values;
timeout, provider error, or invalid JSON automatically uses the deterministic
rules agent instead.

For a reproducible judging demo, keep `DISABLE_LLM_AGENT=true`. Remove it only
when you deliberately want to demonstrate the optional recommendation layer.
Provider keys must remain in local environment configuration or the deployment
secret store; never place them in source control.

## Risk model training and evaluation

The repository includes a local logistic risk-model training pipeline. It can
use a CSV dataset when one is supplied to the Python script; without one it
uses a clearly labelled synthetic dataset for a reproducible demonstration.

```bash
pnpm ai:eval        # dry-run training/evaluation
pnpm ai:train       # train and export the model artifact
pnpm ai:unit        # TypeScript AI module tests
pnpm ai:evaluate    # simulated portfolio comparison
```

Do not describe synthetic results as production performance. Before a real
deployment, train and validate only on consented merchant outcomes, review
calibration/fairness, retain model version evidence, and keep the deterministic
policy engine as the final authority.
