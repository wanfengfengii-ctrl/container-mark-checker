import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.corrections import suggest_corrections
from app.schemas import ContainerNumberInput, CorrectionResult, VerifyResult
from app.validation import expected_check_digit

app = FastAPI(title="Container Gate Check API", version="1.0.0")

# Local gate-side tool; the allowed origins can be narrowed with
# CORS_ORIGINS (comma separated). Defaults to permissive for dev/compose.
_cors_env = os.getenv("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _cors_env.split(",")],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/verify", response_model=VerifyResult)
def verify(payload: ContainerNumberInput) -> VerifyResult:
    expected = expected_check_digit(
        payload.owner_code, payload.category, payload.serial
    )
    container_number = (
        f"{payload.owner_code}{payload.category}{payload.serial}"
        f"{payload.check_digit}"
    )
    return VerifyResult(
        valid=payload.check_digit == expected,
        expected_check_digit=expected,
        actual_check_digit=payload.check_digit,
        container_number=container_number,
    )


@app.post(
    "/api/corrections",
    response_model=CorrectionResult,
    responses={409: {"description": "The submitted number already verifies."}},
)
def corrections(payload: ContainerNumberInput) -> CorrectionResult:
    # Only a syntactically valid number that actually failed verification
    # can be diagnosed. Malformed fields are rejected by the shared input
    # model with the same field-level 422 as /api/verify.
    if payload.check_digit == expected_check_digit(
        payload.owner_code, payload.category, payload.serial
    ):
        raise HTTPException(
            status_code=409,
            detail="Container number already passes verification.",
        )
    minimum_cost, candidates = suggest_corrections(
        payload.owner_code,
        payload.category,
        payload.serial,
        payload.check_digit,
    )
    return CorrectionResult(minimum_cost=minimum_cost, candidates=candidates)
