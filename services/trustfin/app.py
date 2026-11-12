"""TrustFin-SLM risk estimator service.

Serves the Phase-4B.1 fit-only artefact from
https://github.com/HEETMEHTA18/trust_fin (`I9_fit_only_selected.joblib`) over
the small HTTP contract InvoNotify's verifier expects:

    POST /v1/assess
    {"features": {...}, "threshold": 0.5, "modelVersion": "..."}
    -> {"risk": 0.0-1.0, "abstain": bool, "threshold": 0.5,
        "modelVersion": "...", "decision": "ACCEPT" | "REVIEW"}

Feature mapping
---------------
The artefact was trained on FinQA-shaped features (operand provenance,
question/evidence relevance, program operations, truncation). InvoNotify sends
its own stable feature names, so the mapping lives here and not in the app:
either set TRUSTFIN_FEATURE_MAP as JSON (`{"modelFeatureName": "appKey"}`) or
point TRUSTFIN_FEATURE_MAP_PATH at a JSON file. Unknown/missing features are
rejected with 422 and the expected list, never silently zero-filled — a wrong
feature vector is exactly the failure this verifier is meant to catch.
"""

import json
import os
from functools import lru_cache
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODEL_PATH = os.environ.get("TRUSTFIN_MODEL_PATH", "/models/I9_fit_only_selected.joblib")
FEATURE_MAP_PATH = os.environ.get("TRUSTFIN_FEATURE_MAP_PATH", "")
DEFAULT_THRESHOLD = float(os.environ.get("TRUSTFIN_RISK_THRESHOLD", "0.5"))
ABSTAIN_MARGIN = float(os.environ.get("TRUSTFIN_ABSTAIN_MARGIN", "0"))
MODEL_VERSION = os.environ.get("TRUSTFIN_MODEL_VERSION", "phase4b1-i9-fit-only")

app = FastAPI(title="TrustFin risk estimator", version="1.0.0")


class AssessRequest(BaseModel):
    features: Dict[str, float]
    threshold: Optional[float] = Field(default=None, ge=0, le=1)
    modelVersion: Optional[str] = None


@lru_cache(maxsize=1)
def load_feature_map() -> Dict[str, Any]:
    if FEATURE_MAP_PATH and os.path.exists(FEATURE_MAP_PATH):
        with open(FEATURE_MAP_PATH, "r", encoding="utf-8") as handle:
            return json.load(handle)
    raw = os.environ.get("TRUSTFIN_FEATURE_MAP", "")
    return json.loads(raw) if raw.strip() else {}


@lru_cache(maxsize=1)
def load_model() -> Any:
    if not os.path.exists(MODEL_PATH):
        return None
    return joblib.load(MODEL_PATH)


def build_row(model: Any, features: Dict[str, float]) -> np.ndarray:
    mapping = load_feature_map()
    names: List[str] = list(getattr(model, "feature_names_in_", []) or [])

    if not names:
        # The artefact recorded no feature names; fall back to the explicit
        # order the deployment declares, and refuse to guess.
        order = mapping.get("__order__")
        if not order:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "model has no recorded feature names and no __order__ was configured",
                    "received": sorted(features),
                },
            )
        names = list(order)

    missing = [name for name in names if mapping.get(name, name) not in features]
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "feature contract mismatch",
                "missing": missing,
                "expected": names,
                "received": sorted(features),
            },
        )

    row = [float(features[mapping.get(name, name)]) for name in names]
    return np.asarray([row], dtype=float)


@app.get("/ping")
def ping() -> Dict[str, str]:
    """SageMaker's health-check contract (expects HTTP 200)."""
    return {"status": "ok"}


@app.get("/health")
def health() -> Dict[str, Any]:
    model = load_model()
    names = list(getattr(model, "feature_names_in_", []) or []) if model is not None else []
    return {
        "status": "ok" if model is not None else "model_missing",
        "modelPath": MODEL_PATH,
        "modelVersion": MODEL_VERSION,
        "features": names,
        "threshold": DEFAULT_THRESHOLD,
    }


@app.post("/invocations")
@app.post("/v1/assess")
def assess(request: AssessRequest) -> Dict[str, Any]:
    """`/v1/assess` is the InvoNotify contract; `/invocations` is SageMaker's."""
    model = load_model()
    if model is None:
        raise HTTPException(
            status_code=503,
            detail={"error": "model artifact not loaded", "modelPath": MODEL_PATH},
        )

    probabilities = model.predict_proba(build_row(model, request.features))[0]
    classes = list(getattr(model, "classes_", [0, 1]))
    # Positive class is "the financial program is likely wrong".
    risk = float(probabilities[classes.index(1)]) if 1 in classes else float(probabilities[-1])
    risk = max(0.0, min(1.0, risk))

    threshold = request.threshold if request.threshold is not None else DEFAULT_THRESHOLD
    abstain = ABSTAIN_MARGIN > 0 and abs(risk - threshold) < ABSTAIN_MARGIN

    return {
        "risk": risk,
        "abstain": abstain,
        "threshold": threshold,
        "modelVersion": request.modelVersion or MODEL_VERSION,
        "decision": "REVIEW" if (risk >= threshold or abstain) else "ACCEPT",
    }
