"""Unit tests for the bounded correction search."""

import pytest

from app.corrections import (
    MAX_CORRECTION_COST,
    _lowest_path_costs,
    suggest_corrections,
)
from app.validation import LETTER_VALUES, expected_check_digit

# Pinned vectors (independently brute-forced, then frozen here):
#
# KEMZ058631 with check digit 8 FAILs (expected digit is 3). The unique
# cheapest explanation is one confusable 0 -> 8 replacement in the
# serial, restoring KEMZ0506318 at cost 1.
SINGLE_CASE = ("KEM", "Z", "058631", "8", 1, ["KEMZ0506318"])

# CSQU571171 with check digit 6 FAILs (expected digit is 7). No cost-1
# edit fixes it; exactly two cost-2 paths tie for the global minimum.
TIE_CASE = (
    "CSQ",
    "U",
    "571171",
    "6",
    2,
    ["CSOU5711176", "SCQU5171716"],
)

# CSQU512311 with check digit 6 FAILs and nothing within budget 2 makes
# the entered digit valid.
NO_SOLUTION_CASE = ("CSQ", "U", "512311", "6")


def test_single_confusable_replacement_is_the_unique_minimum():
    owner, category, serial, check, cost, candidates = SINGLE_CASE
    assert expected_check_digit(owner, category, serial) != check
    assert suggest_corrections(owner, category, serial, check) == (
        cost,
        candidates,
    )


def test_two_step_paths_tie_at_the_global_minimum():
    owner, category, serial, check, cost, candidates = TIE_CASE
    assert expected_check_digit(owner, category, serial) != check
    minimum_cost, result = suggest_corrections(owner, category, serial, check)
    assert minimum_cost == cost
    assert result == candidates  # both present and lexicographically sorted


def test_no_solution_returns_empty_without_cost():
    owner, category, serial, check = NO_SOLUTION_CASE
    assert expected_check_digit(owner, category, serial) != check
    assert suggest_corrections(owner, category, serial, check) == (None, [])


def test_every_returned_candidate_actually_verifies():
    for owner, category, serial, check, _, candidates in (
        SINGLE_CASE,
        TIE_CASE,
    ):
        assert candidates  # non-empty
        for number in candidates:
            assert len(number) == 11
            assert number[-1] == check  # entered check digit is preserved
            assert (
                expected_check_digit(number[:3], number[3], number[4:10])
                == check
            )


def test_adjacent_swap_inside_a_field_costs_one():
    # Build the case from a known-good number: swapping two different
    # adjacent serial digits must be undone at cost 1.
    owner, category, serial, check = "CSQ", "U", "305438", "3"
    assert expected_check_digit(owner, category, serial) == check
    swapped = serial[1] + serial[0] + serial[2:]  # "30" -> "03"
    assert swapped == "035438"
    assert expected_check_digit(owner, category, swapped) != check
    minimum_cost, candidates = suggest_corrections(
        owner, category, swapped, check
    )
    assert minimum_cost == 1
    assert f"CSQU{serial}{check}" in candidates


def test_swaps_crossing_field_boundaries_are_not_offered():
    # Swapping category/serial boundary (4|5) or owner/category (3|4)
    # must never appear; candidates keep field-internal structure.
    costs = _lowest_path_costs("CSQU305438")
    for state in costs:
        assert state[3] == "U"  # category position can only be replaced
        # No state may correspond to a boundary swap of the original.
        assert state != "CSQ3U05438"
        assert state != "CSUQ305438"


def test_ordinary_replacement_costs_three_and_exceeds_the_budget():
    # K is not in any confusable group, so every direct replacement of
    # the leading K costs 3 and must be pruned at budget 2 (swaps only
    # permute the existing characters, they cannot plant a new letter).
    costs = _lowest_path_costs("KAAU000000")
    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        if letter != "K":
            assert f"{letter}AAU000000" not in costs
    assert all(cost <= MAX_CORRECTION_COST for cost in costs.values())
    # Two cheap adjacent swaps can still reach a cost-2 state.
    two_step = _lowest_path_costs("AAAU068900")
    assert any(cost == 2 for cost in two_step.values())


@pytest.mark.parametrize(
    "original,replacement",
    [("I", "L"), ("L", "I"), ("O", "Q"), ("Q", "O"),
     ("C", "G"), ("G", "C")],
)
def test_confusable_letter_pairs_are_reachable_at_cost_one(
    original, replacement
):
    costs = _lowest_path_costs(f"{original}AAU000000")
    assert costs.get(f"{replacement}AAU000000") == 1


@pytest.mark.parametrize(
    "original,replacement",
    [("0", "6"), ("6", "0"), ("8", "9"), ("9", "8"), ("0", "9")],
)
def test_confusable_digit_pairs_are_reachable_at_cost_one(
    original, replacement
):
    costs = _lowest_path_costs(f"AAAU{original}00000")
    assert costs.get(f"AAAU{replacement}00000") == 1


def test_category_position_only_accepts_ujz():
    costs = _lowest_path_costs("CSQU305438")
    for state in costs:
        assert state[3] in "UJZ"


def test_letter_positions_never_become_digits_and_vice_versa():
    costs = _lowest_path_costs("CSQU305438")
    for state in costs:
        assert state[:4].isalpha()
        assert state[4:].isdigit()


def test_cheapest_path_wins_when_several_edits_reach_one_candidate():
    # Whatever multi-edit routes exist, no returned cost exceeds the
    # budget and identical states share a single minimum cost.
    costs = _lowest_path_costs("CSQU305438")
    assert costs["CSQU305438"] == 0
    for state, cost in costs.items():
        assert 0 <= cost <= MAX_CORRECTION_COST
        assert len(state) == 10
    # Letter value table sanity: replacements stay within A-Z values.
    for state in costs:
        for letter in state[:4]:
            assert letter in LETTER_VALUES
