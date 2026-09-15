"""ISO 6346 container number check-digit logic.

Mapping rule: digits map to themselves. Uppercase letters are assigned
10, 12, 13, ... 38 in alphabetical order, i.e. every multiple of 11
(11, 22, 33) is skipped.
"""

LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
SKIPPED = (11, 22, 33)


def build_letter_values() -> dict[str, int]:
    """Return the A-Z -> 10..38 lookup table, skipping multiples of 11."""
    values: dict[str, int] = {}
    value = 10
    for letter in LETTERS:
        while value in SKIPPED:
            value += 1
        values[letter] = value
        value += 1
    return values


LETTER_VALUES = build_letter_values()


def character_value(character: str) -> int:
    """Map one character (digit or uppercase letter) to its numeric value."""
    if "0" <= character <= "9":
        return int(character)
    return LETTER_VALUES[character]


def expected_check_digit(owner_code: str, category: str, serial: str) -> str:
    """Compute the expected check digit for the first ten characters."""
    code = f"{owner_code}{category}{serial}"
    total = sum(
        character_value(character) * (2**index)
        for index, character in enumerate(code)
    )
    remainder = total % 11
    return "0" if remainder == 10 else str(remainder)
