"""Pure functions for feature unlock evaluation.

All functions are deterministic and side-effect free.
Time (``today``) is always injected by the caller — never read internally.
"""
from __future__ import annotations

from datetime import date
from collections.abc import Sequence
from typing import Literal

from domain.features import (
    Feature,
    FeatureEvent,
    FeatureState,
)
from domain.progression import ProgressionState, _STATUS_ORDER


# ---------------------------------------------------------------------------
# State construction
# ---------------------------------------------------------------------------


def build_feature_state(features: Sequence[Feature]) -> FeatureState:
    """Create a :class:`FeatureState` with all features locked.

    Features with no requirements will be unlocked on the first call to
    :func:`evaluate_features`.
    """
    return FeatureState(statuses={f.feature_id: "locked" for f in features})


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------


def is_available(
    feature: Feature,
    progression_state: ProgressionState,
    feature_state: FeatureState,
) -> bool:
    """Return ``True`` if all requirements for *feature* are satisfied.

    Checks progression conditions (using status ordering: locked < unlocked <
    active < mastered) and feature dependencies (the dependency must already
    be ``"unlocked"``).
    """
    req = feature.requirement

    for cond in req.progression_conditions:
        node_state = progression_state.node_states.get(cond.node_id)
        if node_state is None:
            return False
        if _STATUS_ORDER[node_state.status] < _STATUS_ORDER[cond.required_status]:
            return False

    for dep in req.feature_dependencies:
        if feature_state.statuses.get(dep.feature_id) != "unlocked":
            return False

    return True


def unlocked_features(feature_state: FeatureState) -> frozenset[str]:
    """Return the set of all currently unlocked feature_ids."""
    return frozenset(
        fid for fid, status in feature_state.statuses.items()
        if status == "unlocked"
    )


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------


def evaluate_features(
    features: Sequence[Feature],
    progression_state: ProgressionState,
    feature_state: FeatureState,
    today: date,
) -> tuple[FeatureState, tuple[FeatureEvent, ...]]:
    """Unlock all features whose requirements are now satisfied.

    Uses a fixed-point iteration so that a feature unlocked during one pass
    can immediately satisfy the dependency of another feature in the same
    call (e.g. conversation_mode unlocking enables tutor_chat).

    Steps:
    1. Copy the current statuses into a working dict.
    2. Ensure all features in *features* have an entry (handles first-call
       or newly-added features gracefully).
    3. Iterate over all locked features; for each, rebuild a fresh
       :class:`FeatureState` snapshot and test :func:`is_available`.
    4. Repeat until no new features unlock in a full pass.
    5. Return (new_state, all_events_in_order).

    The caller supplies ``progression_state``; this function never queries
    card IDs, SRS intervals, or database state.

    Raises:
        ValueError: If any feature dependency references an unknown feature_id.
    """
    # Validate dependency references upfront.
    known_ids = {f.feature_id for f in features}
    for feature in features:
        for dep in feature.requirement.feature_dependencies:
            if dep.feature_id not in known_ids:
                raise ValueError(
                    f"Feature '{feature.feature_id}' depends on unknown "
                    f"feature '{dep.feature_id}'"
                )

    working: dict[str, Literal["locked", "unlocked"]] = dict(feature_state.statuses)

    # Ensure every feature in the catalog has a status entry.
    for f in features:
        working.setdefault(f.feature_id, "locked")

    all_events: list[FeatureEvent] = []

    # Fixed-point: repeat until a full pass produces no new unlocks.
    changed = True
    while changed:
        changed = False
        for feature in features:
            if working.get(feature.feature_id) == "unlocked":
                continue
            # Rebuild snapshot each check so mid-pass unlocks are visible.
            tmp_state = FeatureState(statuses=working)
            if is_available(feature, progression_state, tmp_state):
                working[feature.feature_id] = "unlocked"
                all_events.append(
                    FeatureEvent(
                        event_type="feature_unlocked",
                        feature_id=feature.feature_id,
                        date=today,
                        unlock=feature.unlock,
                    )
                )
                changed = True

    return FeatureState(statuses=working), tuple(all_events)
