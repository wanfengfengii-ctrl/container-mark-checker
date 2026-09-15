"""Unit tests for the ISO 6346 mapping and check-digit calculation."""

import pytest

from app.validation import (
    LETTER_VALUES,
    LETTERS,
    SKIPPED,
    character_value,
    expected_check_digit,
)


def test_digits_map_to_themselves():
    for digit in range(10):
        assert character_value(str(digit)) == digit


@pytest.mark.parametrize(
    "letter,expected",
    [
        ("A", 10),  # first letter
        ("B", 12),  # 11 skipped
        ("K", 21),  # last value before 22
        ("L", 23),  # 22 skipped
        ("U", 32),  # last value before 33
        ("V", 34),  # 33 skipped
        ("Z", 38),  # last letter
    ],
)
def test_letter_mapping_boundaries(letter, expected):
    assert LETTER_VALUES[letter] == expected
    assert character_value(letter) == expected


def test_full_mapping_table_is_continuous_after_skipping_multiples():
    expected_values = [v for v in range(10, 39) if v not in SKIPPED]
    assert [LETTER_VALUES[letter] for letter in LETTERS] == expected_values
    assert len(LETTER_VALUES) == 26


def test_expected_check_digit_simple_letters_only_prefix():
    # Owner "AAA" + category "U": A = 10, U = 32.
    # 10*1 + 10*2 + 10*4 + 32*8 = 326; 326 % 11 == 7.
    assert expected_check_digit("AAA", "U", "000000") == "7"


def test_expected_check_digit_all_maximum_values():
    # Z = 38; four letters: 38 * 15 = 570.
    # digits: 9 * (16+32+64+128+256+512) = 9 * 1008 = 9072.
    # total 9642; 9642 % 11 == 6.
    assert expected_check_digit("ZZZZ", "Z", "999999") == "6"


def test_remainder_ten_is_recorded_as_zero():
    # Brute-force the smallest numeric serial producing remainder 10 and
    # pin that concrete vector so the special-case rule cannot regress.
    owner, category = "ABCU"[:3], "ABCU"[3]
    target_serial = next(
        f"{number:06d}"
        for number in range(1_000_000)
        if _raw_remainder(owner, category, f"{number:06d}") == 10
    )
    assert expected_check_digit(owner, category, target_serial) == "0"


def _raw_remainder(owner_code: str, category: str, serial: str) -> int:
    """Independent reference calculation using plain arithmetic."""
    code = f"{owner_code}{category}{serial}"
    table = {
        letter: value
        for value, letter in zip(
            [v for v in range(10, 39) if v not in SKIPPED], LETTERS
        )
    }
    total = 0
    for index, char in enumerate(code):
        numeric = int(char) if char.isdigit() else table[char]
        total += numeric * (2**index)
    return total % 11
