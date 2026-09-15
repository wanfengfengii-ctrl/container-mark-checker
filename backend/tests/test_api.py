"""Integration tests for the FastAPI endpoints."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.validation import expected_check_digit

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_verify_accepts_matching_check_digit():
    expected = expected_check_digit("MSC", "U", "123456")
    response = client.post(
        "/api/verify",
        json={
            "owner_code": "MSC",
            "category": "U",
            "serial": "123456",
            "check_digit": expected,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is True
    assert body["expected_check_digit"] == expected
    assert body["actual_check_digit"] == expected
    assert body["container_number"] == f"MSCU123456{expected}"


def test_verify_reports_mismatch_with_unique_expected_value():
    expected = expected_check_digit("MSC", "U", "123456")
    wrong = "0" if expected != "0" else "1"
    response = client.post(
        "/api/verify",
        json={
            "owner_code": "MSC",
            "category": "U",
            "serial": "123456",
            "check_digit": wrong,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is False
    assert body["expected_check_digit"] == expected
    assert body["actual_check_digit"] == wrong


@pytest.mark.parametrize(
    "field,value",
    [
        ("owner_code", "MS"),        # too short
        ("owner_code", "MS1"),       # digit not allowed
        ("owner_code", "msc"),       # lowercase not allowed
        ("category", "X"),           # outside U/J/Z
        ("category", "u"),           # lowercase not allowed
        ("category", ""),            # missing value
        ("serial", "12345"),         # five digits
        ("serial", "1234567"),       # seven digits
        ("serial", "12345A"),        # letter not allowed
        ("check_digit", "10"),       # two digits
        ("check_digit", "A"),        # letter not allowed
    ],
)
def test_invalid_fields_return_422_with_field_location(field, value):
    payload = {
        "owner_code": "MSC",
        "category": "U",
        "serial": "123456",
        "check_digit": "3",
    }
    payload[field] = value
    response = client.post("/api/verify", json=payload)
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any(error["loc"][-1] == field for error in errors)


def test_missing_field_returns_422_with_field_location():
    response = client.post(
        "/api/verify",
        json={"owner_code": "MSC", "category": "U", "serial": "123456"},
    )
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any(error["loc"][-1] == "check_digit" for error in errors)


def test_multiple_invalid_fields_are_all_reported():
    response = client.post(
        "/api/verify",
        json={
            "owner_code": "msc",
            "category": "X",
            "serial": "12A456",
            "check_digit": "Z",
        },
    )
    assert response.status_code == 422
    locations = {tuple(error["loc"]) for error in response.json()["detail"]}
    assert ("body", "owner_code") in locations
    assert ("body", "category") in locations
    assert ("body", "serial") in locations
    assert ("body", "check_digit") in locations
