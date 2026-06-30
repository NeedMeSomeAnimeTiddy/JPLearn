"""Static definition of the JPLearn feature catalog.

Pure data — analogous to ``domain/progression_curriculum.py``.
All logic lives in :mod:`domain.feature_service`.

Features unlock in three tiers:
1. Always available  — no prerequisites (themes, achievements)
2. Progression gates — require specific progression nodes to be mastered
3. Feature chains    — require another feature to be unlocked first
"""
from __future__ import annotations

from domain.features import (
    Feature,
    FeatureDependency,
    FeatureRequirement,
    FeatureReward,
    FeatureUnlock,
    ProgressionCondition,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _unlock(access_descriptor: str, *rewards: FeatureReward) -> FeatureUnlock:
    return FeatureUnlock(access_descriptor=access_descriptor, rewards=rewards)


def _badge(descriptor: str) -> FeatureReward:
    return FeatureReward(reward_type="badge", descriptor=descriptor)


def _requires_mastered(*node_ids: str) -> FeatureRequirement:
    return FeatureRequirement(
        progression_conditions=tuple(
            ProgressionCondition(node_id=nid, required_status="mastered")
            for nid in node_ids
        )
    )


def _requires_feature(*feature_ids: str) -> FeatureRequirement:
    return FeatureRequirement(
        feature_dependencies=tuple(
            FeatureDependency(feature_id=fid) for fid in feature_ids
        )
    )


# ---------------------------------------------------------------------------
# Feature catalog
# ---------------------------------------------------------------------------

JPLEARN_FEATURES: list[Feature] = [
    # ------------------------------------------------------------------
    # Tier 1: Always available
    # ------------------------------------------------------------------
    Feature(
        feature_id="themes",
        name="Themes",
        category="customization",
        requirement=FeatureRequirement(),
        unlock=_unlock("themes_access"),
    ),
    Feature(
        feature_id="achievements",
        name="Achievements",
        category="ui",
        requirement=FeatureRequirement(),
        unlock=_unlock("achievements_access"),
    ),
    # ------------------------------------------------------------------
    # Tier 2: Unlocked by progression milestones
    # ------------------------------------------------------------------
    Feature(
        feature_id="listening_mode",
        name="Listening Mode",
        category="learning_mode",
        requirement=_requires_mastered("hiragana"),
        unlock=_unlock(
            "listening_mode_access",
            _badge("listening_mode_unlocked"),
        ),
    ),
    Feature(
        feature_id="conversation_mode",
        name="Conversation Mode",
        category="learning_mode",
        requirement=_requires_mastered("grammar_n5"),
        unlock=_unlock(
            "conversation_mode_access",
            _badge("conversation_mode_unlocked"),
        ),
    ),
    Feature(
        feature_id="kanji_mode",
        name="Kanji Mode",
        category="learning_mode",
        requirement=_requires_mastered("vocabulary_n5", "grammar_n5"),
        unlock=_unlock(
            "kanji_mode_access",
            _badge("kanji_mode_unlocked"),
        ),
    ),
    Feature(
        feature_id="reading_mode",
        name="Reading Mode",
        category="learning_mode",
        requirement=_requires_mastered("reading"),
        unlock=_unlock(
            "reading_mode_access",
            _badge("reading_mode_unlocked"),
        ),
    ),
    Feature(
        feature_id="advanced_analytics",
        name="Advanced Analytics",
        category="analytics",
        requirement=_requires_mastered("reading"),
        unlock=_unlock("advanced_analytics_access"),
    ),
    Feature(
        feature_id="jlpt_dashboard",
        name="JLPT Dashboard",
        category="ui",
        requirement=FeatureRequirement(
            progression_conditions=(
                ProgressionCondition(node_id="jlpt_n5", required_status="unlocked"),
            )
        ),
        unlock=_unlock(
            "jlpt_dashboard_access",
            _badge("jlpt_dashboard_unlocked"),
        ),
    ),
    # ------------------------------------------------------------------
    # Tier 3: Feature dependency chains
    # ------------------------------------------------------------------
    Feature(
        feature_id="tutor_chat",
        name="Tutor Chat",
        category="learning_mode",
        requirement=_requires_feature("conversation_mode"),
        unlock=_unlock(
            "tutor_chat_access",
            _badge("tutor_chat_unlocked"),
        ),
    ),
]
