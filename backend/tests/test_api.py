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


CORRECTIONS_PATH = "/api/corrections"


def test_corrections_returns_single_confusable_fix():
    # KEMZ058631 / 8 FAILs (expected digit is 3); the unique cheapest
    # fix is the confusable 0 -> 8 replacement at serial position 3.
    response = client.post(
        CORRECTIONS_PATH,
        json={
            "owner_code": "KEM",
            "category": "Z",
            "serial": "058631",
            "check_digit": "8",
        },
    )
    assert response.status_code == 200
    assert response.json() == {
        "minimum_cost": 1,
        "candidates": ["KEMZ0506318"],
    }


def test_corrections_returns_every_candidate_tied_at_minimum_cost():
    response = client.post(
        CORRECTIONS_PATH,
        json={
            "owner_code": "CSQ",
            "category": "U",
            "serial": "571171",
            "check_digit": "6",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["minimum_cost"] == 2
    assert body["candidates"] == ["CSOU5711176", "SCQU5171716"]


def test_corrections_returns_200_with_empty_list_when_no_fit():
    response = client.post(
        CORRECTIONS_PATH,
        json={
            "owner_code": "CSQ",
            "category": "U",
            "serial": "512311",
            "check_digit": "6",
        },
    )
    assert response.status_code == 200
    assert response.json() == {"minimum_cost": None, "candidates": []}


def test_corrections_rejects_an_already_passing_number_with_409():
    response = client.post(
        CORRECTIONS_PATH,
        json={
            "owner_code": "CSQ",
            "category": "U",
            "serial": "305438",
            "check_digit": "3",
        },
    )
    assert response.status_code == 409


@pytest.mark.parametrize(
    "field,value",
    [
        ("owner_code", "MS1"),
        ("category", "X"),
        ("serial", "12A456"),
        ("check_digit", "A"),
    ],
)
def test_corrections_invalid_fields_return_422_with_field_location(
    field, value
):
    payload = {
        "owner_code": "CSQ",
        "category": "U",
        "serial": "305438",
        "check_digit": "8",
    }
    payload[field] = value
    response = client.post(CORRECTIONS_PATH, json=payload)
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any(error["loc"][-1] == field for error in errors)


def test_corrections_kept_check_digit_is_always_valid():
    # Every candidate returned for the canonical FAIL vector must verify.
    response = client.post(
        CORRECTIONS_PATH,
        json={
            "owner_code": "CSQ",
            "category": "U",
            "serial": "305438",
            "check_digit": "8",
        },
    )
    assert response.status_code == 200
    candidates = response.json()["candidates"]
    assert candidates  # non-empty and lexicographically sorted
    assert candidates == sorted(candidates)
    for number in candidates:
        assert len(number) == 11
        assert number[-1] == "8"
        assert expected_check_digit(number[:3], number[3], number[4:10]) == "8"
