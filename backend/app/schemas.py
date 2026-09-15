from pydantic import BaseModel, Field

# Strict patterns: invalid input is rejected with 422 and a field-level loc.
OWNER_CODE_PATTERN = r"^[A-Z]{3}$"
CATEGORY_PATTERN = r"^[UJZ]$"
SERIAL_PATTERN = r"^[0-9]{6}$"
CHECK_DIGIT_PATTERN = r"^[0-9]$"


class ContainerNumberInput(BaseModel):
    owner_code: str = Field(
        ...,
        pattern=OWNER_CODE_PATTERN,
        description="Three-letter owner code (A-Z).",
    )
    category: str = Field(
        ...,
        pattern=CATEGORY_PATTERN,
        description="Equipment category identifier: U, J or Z.",
    )
    serial: str = Field(
        ...,
        pattern=SERIAL_PATTERN,
        description="Six-digit serial number.",
    )
    check_digit: str = Field(
        ...,
        pattern=CHECK_DIGIT_PATTERN,
        description="One-digit check digit entered by the tally clerk.",
    )


class VerifyResult(BaseModel):
    valid: bool
    expected_check_digit: str
    actual_check_digit: str
    container_number: str


class CorrectionResult(BaseModel):
    # Lowest edit-path cost at which a valid candidate exists; null when
    # no candidate fits the budget (returned together with an empty list).
    minimum_cost: int | None
    # Full 11-character container numbers, lexicographically ordered,
    # all tied at minimum_cost.
    candidates: list[str]
