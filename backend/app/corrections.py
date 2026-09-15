"""Bounded search for likely transcription corrections.

After a syntactically valid container number fails check-digit
verification, the gate clerk can ask which nearby transcriptions would
make the *actually entered* check digit valid. Only the first ten
characters may change; the check digit itself is preserved.

Two edit kinds are allowed, both staying inside the original field:

* replace one character by another character legal at that position;
* swap two characters across a field boundary that are adjacent in the
  complete number (owner/category boundary at 3|4 and category/serial
  boundary at 4|5 are not adjacent fields, so they are excluded).

Confusable look-alikes cost 1 per edit:

* the I/L, O/Q and C/G letter pairs;
* the 0/6/8/9 digit group.

Every other legal replacement costs 3. The total path cost may never
exceed ``MAX_CORRECTION_COST`` (2): one ordinary replacement alone is
already out of budget, so corrections are either two confusable edits
or one confusable replacement / one adjacent swap. When the same
candidate can be reached in several ways only its cheapest path
survives, and only candidates tied at the global minimum cost are
returned, ordered by the full container number.
"""

import heapq
from collections.abc import Iterator

from app.validation import expected_check_digit

MAX_CORRECTION_COST = 2

# Look-alike groups; a replacement inside one group costs 1 instead of 3.
CONFUSABLE_GROUPS = (
    frozenset("IL"),
    frozenset("OQ"),
    frozenset("CG"),
    frozenset("0689"),
)

_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
_DIGITS = "0123456789"

# Characters that may legally occupy each of the ten prefix positions.
_POSITION_ALPHABETS: tuple[str, ...] = (
    _LETTERS,  # owner code, position 0
    _LETTERS,  # owner code, position 1
    _LETTERS,  # owner code, position 2
    "UJZ",     # category identifier
    *([_DIGITS] * 6),  # serial number, positions 4..9
)

# Adjacent position pairs *inside* one field: owner (0-1, 1-2) and the
# six serial digits (4-5 ... 8-9). The field boundaries at 3|4 and 4|5
# are deliberately absent: corrections may not cross between fields.
_ADJACENT_SWAPS: tuple[tuple[int, int], ...] = (
    (0, 1),
    (1, 2),
    (4, 5),
    (5, 6),
    (6, 7),
    (7, 8),
    (8, 9),
)


def _confusable_group(character: str) -> frozenset[str] | None:
    for group in CONFUSABLE_GROUPS:
        if character in group:
            return group
    return None


def _replacement_cost(original: str, replacement: str) -> int:
    """Cost of substituting ``replacement`` for ``original``."""
    original_group = _confusable_group(original)
    replacement_group = _confusable_group(replacement)
    if (
        original_group is not None
        and replacement_group is not None
        and original_group == replacement_group
    ):
        return 1
    return 3


def _neighbours(state: str) -> Iterator[tuple[str, int]]:
    """Yield every one-edit state reachable from ``state`` with its cost."""
    for position, alphabet in enumerate(_POSITION_ALPHABETS):
        current = state[position]
        for replacement in alphabet:
            if replacement == current:
                continue
            candidate = f"{state[:position]}{replacement}{state[position + 1:]}"
            yield candidate, _replacement_cost(current, replacement)

    for left, right in _ADJACENT_SWAPS:
        if state[left] == state[right]:
            # Swapping equal characters is a no-op, never an edit.
            continue
        characters = list(state)
        characters[left], characters[right] = (
            characters[right],
            characters[left],
        )
        yield "".join(characters), 1


def _lowest_path_costs(prefix: str) -> dict[str, int]:
    """Shortest-path cost from ``prefix`` to every reachable state.

    Dijkstra over the edit graph, pruned at ``MAX_CORRECTION_COST``.
    """
    best: dict[str, int] = {prefix: 0}
    queue: list[tuple[int, str]] = [(0, prefix)]
    while queue:
        cost, state = heapq.heappop(queue)
        if cost > best[state]:
            continue
        for neighbour, step_cost in _neighbours(state):
            total = cost + step_cost
            if total > MAX_CORRECTION_COST:
                continue
            if total < best.get(neighbour, MAX_CORRECTION_COST + 1):
                best[neighbour] = total
                heapq.heappush(queue, (total, neighbour))
    return best


def suggest_corrections(
    owner_code: str,
    category: str,
    serial: str,
    check_digit: str,
) -> tuple[int | None, list[str]]:
    """Return ``(minimum_cost, candidates)`` for a FAILing number.

    ``candidates`` lists full 11-character container numbers whose first
    ten characters are reachable within the cost budget, whose entered
    check digit is valid, and whose path cost equals the global minimum.
    Sorted lexicographically. ``(None, [])`` means no candidate fits the
    budget. The unchanged prefix itself is never offered.
    """
    prefix = f"{owner_code}{category}{serial}"
    path_costs = _lowest_path_costs(prefix)

    matching: list[tuple[int, str]] = []
    for candidate_prefix, cost in path_costs.items():
        if candidate_prefix == prefix:
            continue
        if (
            expected_check_digit(
                candidate_prefix[:3],
                candidate_prefix[3],
                candidate_prefix[4:],
            )
            == check_digit
        ):
            matching.append((cost, f"{candidate_prefix}{check_digit}"))

    if not matching:
        return None, []
    minimum_cost = min(cost for cost, _ in matching)
    candidates = sorted(
        number for cost, number in matching if cost == minimum_cost
    )
    return minimum_cost, candidates
