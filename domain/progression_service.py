"""Pure functions for progression graph construction and state transitions.

All functions are deterministic and side-effect free.
Time (``today``) is always injected by the caller — never read internally.
"""
from __future__ import annotations

from datetime import date
from collections.abc import Sequence

from domain.progression import (
    NodeProgressionState,
    ProgressionEvent,
    ProgressionEventType,
    ProgressionGraph,
    ProgressionNode,
    ProgressionState,
    _STATUS_ORDER,
)


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------


def build_graph(nodes: Sequence[ProgressionNode], root_id: str) -> ProgressionGraph:
    """Build a validated :class:`ProgressionGraph` from a flat node list.

    Computes the reverse ``parent_index`` by inverting all ``children`` and
    ``branches`` edges.

    Raises:
        ValueError: If any referenced node_id is missing from the registry,
            or if ``root_id`` is not present.
    """
    node_map: dict[str, ProgressionNode] = {n.node_id: n for n in nodes}

    if root_id not in node_map:
        raise ValueError(f"root_id '{root_id}' not found in node list")

    for node in nodes:
        for ref_id in (*node.children, *node.branches):
            if ref_id not in node_map:
                raise ValueError(
                    f"Node '{node.node_id}' references unknown node_id '{ref_id}'"
                )
        for cond in node.unlock_requirement.conditions:
            if cond.node_id not in node_map:
                raise ValueError(
                    f"Node '{node.node_id}' has UnlockCondition referencing "
                    f"unknown node_id '{cond.node_id}'"
                )

    # Build reverse parent index (covers children AND branches edges)
    parent_index: dict[str, list[str]] = {n.node_id: [] for n in nodes}
    for node in nodes:
        for ref_id in (*node.children, *node.branches):
            parent_index[ref_id].append(node.node_id)

    # Build prerequisite index: prereq_node_id → nodes that declare it as a
    # condition.  Enables discovery of multi-prerequisite successors.
    prereq_index: dict[str, list[str]] = {n.node_id: [] for n in nodes}
    for node in nodes:
        for cond in node.unlock_requirement.conditions:
            prereq_index[cond.node_id].append(node.node_id)

    return ProgressionGraph(
        nodes=node_map,
        parent_index={k: tuple(v) for k, v in parent_index.items()},
        prerequisite_index={k: tuple(v) for k, v in prereq_index.items()},
        root_id=root_id,
    )


# ---------------------------------------------------------------------------
# Initial state
# ---------------------------------------------------------------------------


def build_initial_state(graph: ProgressionGraph) -> ProgressionState:
    """Create the initial :class:`ProgressionState` for a new learner.

    The root node starts as ``"unlocked"``; all others start as ``"locked"``.
    """
    node_states: dict[str, NodeProgressionState] = {
        node_id: NodeProgressionState(
            node_id=node_id,
            status="unlocked" if node_id == graph.root_id else "locked",
        )
        for node_id in graph.nodes
    }
    return ProgressionState(node_states=node_states)


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------


def is_unlocked(
    graph: ProgressionGraph,
    state: ProgressionState,
    node_id: str,
) -> bool:
    """Return ``True`` if all unlock conditions for *node_id* are satisfied.

    A condition is satisfied when the prerequisite node's current status is
    at least as high as ``required_status`` in the ordering:
    locked < unlocked < active < mastered.
    """
    node = graph.nodes[node_id]
    for cond in node.unlock_requirement.conditions:
        prereq_state = state.node_states.get(cond.node_id)
        if prereq_state is None:
            return False
        if _STATUS_ORDER[prereq_state.status] < _STATUS_ORDER[cond.required_status]:
            return False
    return True


def is_mastered(
    node: ProgressionNode,
    mastered_count: int,
    total_count: int,
) -> bool:
    """Return ``True`` if the node's mastery thresholds are met.

    Both ``mastered_ratio`` and ``min_mastered`` must be satisfied.
    A ``total_count`` of 0 is always treated as not mastered.
    """
    if total_count == 0:
        return False
    req = node.mastery_requirement
    ratio_met = (mastered_count / total_count) >= req.mastered_ratio
    floor_met = mastered_count >= req.min_mastered
    return ratio_met and floor_met


def reachable_nodes(
    graph: ProgressionGraph,
    state: ProgressionState,
) -> frozenset[str]:
    """Return all node_ids that are not locked (unlocked, active, or mastered)."""
    return frozenset(
        node_id
        for node_id, ns in state.node_states.items()
        if ns.status != "locked"
    )


# ---------------------------------------------------------------------------
# Transitions
# ---------------------------------------------------------------------------


def activate_node(
    graph: ProgressionGraph,
    state: ProgressionState,
    node_id: str,
    today: date,
) -> tuple[ProgressionState, tuple[ProgressionEvent, ...]]:
    """Transition a node from ``"unlocked"`` to ``"active"``.

    No-ops (returns state unchanged) if the node is already ``"active"``
    or ``"mastered"``.

    Raises:
        ValueError: If *node_id* is unknown or currently ``"locked"``.
    """
    if node_id not in graph.nodes:
        raise ValueError(f"Unknown node_id '{node_id}'")

    ns = state.node_states[node_id]
    if ns.status == "locked":
        raise ValueError(f"Cannot activate locked node '{node_id}'")
    if ns.status in ("active", "mastered"):
        return state, ()

    updated = NodeProgressionState(
        node_id=ns.node_id,
        status="active",
        mastered_item_count=ns.mastered_item_count,
        total_item_count=ns.total_item_count,
        first_activated_date=today,
        mastered_date=ns.mastered_date,
    )
    new_state = ProgressionState(node_states={**state.node_states, node_id: updated})
    event = ProgressionEvent(event_type="node_activated", node_id=node_id, date=today)
    return new_state, (event,)


def record_mastery(
    graph: ProgressionGraph,
    state: ProgressionState,
    node_id: str,
    mastered_count: int,
    total_count: int,
    today: date,
) -> tuple[ProgressionState, tuple[ProgressionEvent, ...]]:
    """Update mastery counts for a node, triggering transitions as needed.

    Steps performed in order:

    1. Update ``mastered_item_count`` / ``total_item_count`` on the node.
    2. If the mastery threshold is now met and the node was not already
       mastered: transition to ``"mastered"``, set ``mastered_date``, and
       emit a ``"node_mastered"`` event carrying the node's rewards.
    3. For each child of the now-mastered node: if ``is_unlocked`` is now
       satisfied and the child is still ``"locked"``, transition it to
       ``"unlocked"`` and emit ``"node_unlocked"``.
    4. For each branch of the now-mastered node: same logic, but emits
       ``"branch_unlocked"`` instead.
    5. Return ``(new_state, all_events_in_order)``.

    The caller supplies ``mastered_count`` and ``total_count`` — this
    function never accesses card IDs or SRS state.

    Raises:
        ValueError: If *node_id* is unknown.
    """
    if node_id not in graph.nodes:
        raise ValueError(f"Unknown node_id '{node_id}'")

    node = graph.nodes[node_id]
    current_ns = state.node_states[node_id]
    events: list[ProgressionEvent] = []

    # 1. Always update the item counts.
    working: dict[str, NodeProgressionState] = {
        **state.node_states,
        node_id: NodeProgressionState(
            node_id=current_ns.node_id,
            status=current_ns.status,
            mastered_item_count=mastered_count,
            total_item_count=total_count,
            first_activated_date=current_ns.first_activated_date,
            mastered_date=current_ns.mastered_date,
        ),
    }

    already_mastered = current_ns.status == "mastered"
    node_is_locked = current_ns.status == "locked"
    threshold_met = is_mastered(node, mastered_count, total_count)

    # 2. Transition to mastered if threshold newly met.
    # Locked nodes never transition — prerequisites must be satisfied first.
    if threshold_met and not already_mastered and not node_is_locked:
        working[node_id] = NodeProgressionState(
            node_id=node_id,
            status="mastered",
            mastered_item_count=mastered_count,
            total_item_count=total_count,
            first_activated_date=working[node_id].first_activated_date,
            mastered_date=today,
        )
        events.append(
            ProgressionEvent(
                event_type="node_mastered",
                node_id=node_id,
                date=today,
                rewards=node.rewards,
            )
        )

        # 3 & 4. Re-evaluate all nodes that declare this node as a prerequisite.
        # Using prerequisite_index covers both single-parent and multi-parent
        # unlock scenarios correctly.
        tmp = ProgressionState(node_states=working)
        for dep_id in graph.prerequisite_index.get(node_id, ()):
            dep_ns = working.get(dep_id)
            if dep_ns and dep_ns.status == "locked" and is_unlocked(graph, tmp, dep_id):
                working[dep_id] = NodeProgressionState(
                    node_id=dep_id,
                    status="unlocked",
                    mastered_item_count=dep_ns.mastered_item_count,
                    total_item_count=dep_ns.total_item_count,
                    first_activated_date=dep_ns.first_activated_date,
                    mastered_date=dep_ns.mastered_date,
                )
                # Emit branch_unlocked if dep_id is listed in any parent's branches.
                is_branch = any(
                    dep_id in graph.nodes[p].branches
                    for p in graph.parent_index.get(dep_id, ())
                )
                event_type: ProgressionEventType = "branch_unlocked" if is_branch else "node_unlocked"
                events.append(
                    ProgressionEvent(event_type=event_type, node_id=dep_id, date=today)
                )
                tmp = ProgressionState(node_states=working)

    return ProgressionState(node_states=working), tuple(events)
