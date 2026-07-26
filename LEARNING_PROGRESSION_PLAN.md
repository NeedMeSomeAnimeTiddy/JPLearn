# Learning Progression Rework — Plan

Status: **proposal, not started.** Written 2026-07-26 as the planning artefact for a
dedicated session. Tracking issue:
[#78](https://github.com/NeedMeSomeAnimeTiddy/JPLearn/issues/78).

This document is the reference for that session. It records what exists today (measured,
not assumed), what is wrong with it, the routes considered, the recommended route, and a
phased implementation plan with the decisions that must be made before code is written.

Read alongside `ARCHITECTURE.md` (especially §4 on mastery) and `CLAUDE.md`.

---

## 1. Why this exists

The app's learning process is currently expressed by a thin strip of blocks/categories at
the bottom of the section screen. It is the least structured of the three progression
systems in the codebase, and the most structured one is not rendered at all. Meanwhile the
block/category split hides a data problem: the same word can exist twice with two
independent SRS states.

The goal is a single, visible, coherent learning spine, with one identity per card.

---

## 2. Current state (measured)

### 2.1 Three overlapping systems

**(a) `JPLEARN_GRAPH` — the real curriculum, invisible.**
`domain/progression_curriculum.py` defines a 16-node graph:

```
tutorial → hiragana → katakana → vocabulary_n5 → grammar_n5 → sentence_examples
→ scripted_conv → listening → kanji_n5 → free_conv → reading
→ jlpt_n5 → jlpt_n4 → jlpt_n3 → jlpt_n2 → jlpt_n1
```

Each `ProgressionNode` carries `node_id, name, category, unlock_requirement,
mastery_requirement, children, branches, rewards` (`domain/progression.py`). Logic lives in
`domain/progression_service.py`; state persists via `load_user_progression` /
`upsert_progression_node`; the bridge imports all of it (`scripts/desktop_bridge.py:98-148`).

**The renderer never draws it.** The only match for "progression" in `App.tsx` is a comment
about *block* progression on line 549. This is the single largest piece of already-built,
already-persisted learning structure that the user cannot see.

**(b) `LEARNING_PATHS` — a second, flatter model.**
`domain/readiness.py:89` holds one path, `complete_beginner`, as a flat list of six section
keys. Issue #20 asks for more paths. It overlaps `JPLEARN_GRAPH` without matching it.

**(c) Blocks and categories — what the UI actually shows.**
Two *different* mechanisms presented as one:

| Deck family | Mechanism | Count | Sizes |
|---|---|---|---|
| Hiragana | real blocks (`_HIRAGANA_BLOCKS`) | 12 | 5,5,5,5,5,5,5,11,… |
| Katakana | real blocks | 12 | 5,5,5,5,5,5,5,11,… |
| Grammar patterns | real blocks | 6 | 6,13,12,18,5,10 |
| Sentence examples | real blocks | 8 | 6,13,12,4,3,11,5,10 |
| Conjugation training | real blocks | 4 | 12,4,3,5 |
| **Vocabulary** | **none** — separate category decks | 28 categories | 6–25 |
| **Kanji** | **none** — separate category decks | 19 categories | 7–29 |

Verified: `desktop_bridge.py block-progress vocab_n5` → `{"blocks": []}`, same for
`kanji_n5`. Unlock thresholds live in `domain/blocks.py`: `UNLOCK_THRESHOLD = 0.8`,
`CATEGORY_UNLOCK_THRESHOLD = 0.7` (fraction of cards with `repetitions >= 1`).

62 decks total in `ALL_DECKS`, against six `ScriptKey` sections.

### 2.2 The identity problem

Category decks are *separate decks with their own `id_offset`*, so the same word exists
twice, under two ids **and two different spellings**:

| Word | Deck | id | Surface |
|---|---|---|---|
| see/watch | `vocab_n5` | 647 | 見る |
| see/watch | `vocab_verbs` | 1104 | みる |

`vocab_n5` occupies ids 0–717 (external JMdict-derived data, kanji surfaces); the category
decks start at 1000 and use the hardcoded `_VOCAB_N5_DATA` slices, which are kana-only.
Two ids means two `review_states` rows, two FSRS schedules, two mastery values for one word.

This is invisible today only because the user studies one deck at a time. **Any feature
that merges decks — multi-select, a unified queue, a progression node spanning
categories — makes it user-visible.**

### 2.3 Related known issues

- `ARCHITECTURE.md` §4: mastery has two sources of truth (SQLite `review_states` via the
  bridge `summary` command, and a `localStorage` `cardScores` map keyed by numeric card id),
  reconciled by hand. Any "is this node complete?" logic depends on this being trustworthy.
- Card ids are hand-allocated by offset with no uniqueness assertion (`domain/decks.py`);
  a collision silently corrupts SRS state.
- Mode availability comes from `SCRIPT_MINIGAMES`, keyed on the six sections, while the card
  pool comes from the far narrower block/category. Partially mitigated for the conjugation
  drill (pool top-up + menu lock, commit `5db2042`), but the general mismatch remains.

---

## 3. Problems, ranked

| # | Problem | Severity | Notes |
|---|---|---|---|
| P1 | One word, two ids, two SRS states across category/level decks | **High** | Blocks every merge feature; silently corrupts progress |
| P2 | Vocab and kanji have no blocks; categories impersonate them | **High** | Root cause of P1 |
| P3 | The 16-node curriculum graph is invisible | **High** | Built, persisted, unused |
| P4 | Mastery reconciled by hand across two stores | **High** | Gates any completion logic |
| P5 | Mode availability derived from section, not live pool | Medium | Partially fixed |
| P6 | `LEARNING_PATHS` duplicates the graph, has one entry | Low | Issue #20; likely delete |
| P7 | Kana blocks of 5 cards are too thin for most minigames | Medium | Multi-select fixes |

---

## 4. Routes considered

**A — Render the graph as a journey map.** Home becomes the 16-node path: current position,
unlocked/locked, next up. Blocks become the *contents* of a node rather than the navigation.
Cheapest large win because the data model exists. Depends on P4.

**B — Queue-first.** Drop location-picking as the primary action; home is one button driven
by the backend study queue, due cards, and readiness. Blocks/categories demote to optional
filters. Most honest to SRS; weakest at conveying course progress, which is most of what
keeps people returning.

**C — Uniform blocks everywhere.** Every deck gets blocks of consistent size (~10–15),
defined as **ranges or tags over a parent deck rather than separate decks**, with
multi-select. Most incremental; preserves the existing mental model; fixes P1 and P2 as a
side effect.

**D — Levels that mix content.** WaniKani-style numbered levels spanning scripts (level 7 =
10 kanji + 20 vocab + 2 grammar points), gated on mastery, with Lessons and Reviews as
distinct actions. Strongest progress feeling; largest cost, and most of that cost is content
authoring rather than code.

---

## 5. Recommended route

**C as the mechanism, A as the presentation. B as a button. D deferred but not foreclosed.**

Reasoning:

- C is a prerequisite for everything else. Blocks-as-filter is the single change that gives
  safe multi-select, one identity per card, and uniform structure across sections.
- Once the primitive is uniform, A has something coherent to point at, and the 16 invisible
  nodes become the thing the user navigates.
- B is worth keeping as a "Study what's due" action next to the map, for days when choosing
  is friction. It is not worth making it the architecture.
- D becomes a re-grouping over the same block primitive rather than a rewrite, so shipping C
  and A keeps it open.

---

## 6. Implementation plan

### Phase 0 — Decisions to make before writing code

These are genuine forks. Resolve them at the start of the session.

1. **Block definition mechanism.** Tag-based (cards carry `block:` tags, blocks are tag
   queries) or range-based (blocks are `(deck_slug, start, end)` ranges)? Tags are more
   flexible and survive deck reordering; ranges are simpler and match `domain/blocks.py`
   today.
2. **Migration policy for existing SRS state.** When `vocab_greetings`/1104 collapses into
   `vocab_n5`/647, what happens to the review history recorded against 1104? Options: merge
   (take the more-advanced state), prefer the parent deck's state, or discard the category
   state. This is user-visible progress; it needs an explicit answer.
3. **Do category decks stay in `ALL_DECKS`?** Keeping them as thin views over the parent is
   less disruptive; removing them is cleaner but touches `FEATURES.md`, deck registry
   consumers, `VOCAB_CATEGORY_TO_DECK_SLUG`, and any saved user preference naming a slug.
4. **Target block size.** ~10–15 suggested. Affects how many blocks each deck yields and
   therefore how the map reads.
5. **Does the graph gate access, or only describe it?** Hard gating (locked nodes are
   unclickable) versus soft (everything reachable, the map shows a recommended order).
   Affects churn risk for existing users mid-deck.

### Phase 1 — Blocks as a filter over a parent deck

- Extend `domain/blocks.py` so `blocks_for_slug` covers vocab and kanji, generated from the
  parent deck rather than hand-listed.
- Vocab/kanji "categories" become block definitions over `vocab_n5` / `kanji_n5` etc.,
  keyed by the parent's card ids.
- Keep `compute_block_mastery` / `compute_unlocked_count` / `unlock_threshold_for_slug`
  semantics; only the source of the id lists changes.
- Add the uniqueness assertion `domain/decks.py` currently lacks, so an id collision fails
  loudly instead of corrupting state.
- Tests: every block's card ids resolve in the parent deck; no id appears in two decks;
  block sizes within the agreed bounds; every card belongs to at least one block.

### Phase 2 — Migration

- Write a one-shot migration under `data/` (pattern: `data/repetitions_backfill.py`,
  `data/state_rebuild.py`) applying the Phase 0.2 policy.
- Must be idempotent and must back up `data/jplearn.db` first — there is precedent for the
  backup naming (`data/jplearn.db.backup-pre-issue66-*`).
- Report what it changed: cards merged, states discarded, rows rewritten.
- Tests: run against a fixture DB with known duplicate state; assert the chosen policy;
  assert running it twice is a no-op.

### Phase 3 — Multi-select

- `activeBlockIndex: number` → a selected-block set (`App.tsx:166`), and `activeBlockCards`
  (`App.tsx:549`) unions the selected blocks' card ids.
- Tracklist strip in `ScriptHubView` becomes multi-select, with select-all/none.
- Persist the selection with the other session prefs (`PREFS_STORAGE_KEY`).
- Revisit `SCRIPT_MINIGAMES` gating: with the pool now explicit, availability should be
  computed from the live pool for every mode, generalising the conjugation-drill lock
  (`App.tsx` lock-reasons map) rather than special-casing modes one at a time.
- Tests: union correctness; empty selection falls back to the whole deck; lock reasons
  reflect the live pool.

### Phase 4 — Render the progression graph

- Add a bridge command exposing `JPLEARN_GRAPH` plus per-node state (much of
  `progression_service` is already imported by the bridge — check what is already exposed
  before adding).
- New feature module `src/features/progression/` following the repo's
  `types → constants → utils → use<Name> → components → index` convention. Do **not** add
  state to `App.tsx` inline.
- Node completion must read a single mastery source. Resolve P4 first or as part of this.
- Home screen shows the map; a node opens its blocks; "Study what's due" (route B) sits
  beside it.
- Tests: node states derive correctly from mastery fixtures; locked/unlocked rendering;
  accessibility pass (`npm run test:a11y`).

### Phase 5 — Retire the duplicate model

- Delete `LEARNING_PATHS` from `domain/readiness.py` and its consumers, or reduce it to a
  view over `JPLEARN_GRAPH`.
- Close #20 as superseded, or re-scope it to "alternate branches in the graph", which
  `ProgressionNode.branches` already supports.
- Update `FEATURES.md`, `ROADMAP.md`, and `ARCHITECTURE.md` §4/§8.

---

## 7. Risks

- **Migration is destructive to user-visible progress.** Highest risk in the plan. Backup +
  idempotency + an explicit policy decision are non-negotiable.
- **P4 (two mastery sources) will surface.** Phase 4 cannot be honest without it. Budget for
  it rather than discovering it.
- **Churn for an existing user mid-deck.** Hard gating (Phase 0.5) could lock content
  someone is already studying. Soft gating avoids this.
- **Scope creep toward D.** Levels are tempting once the map exists. Ship C+A first.
- **`App.tsx` is ~4.9k lines.** Phase 3 and 4 both touch it. Extract to feature modules;
  do not compound it.

---

## 8. Validation

Per `CLAUDE.md`, validate lint → typecheck → test, and escalate to the full aggregate check
for something this cross-cutting:

```bash
python scripts/dev.py
```

Also relevant: `python scripts/arch_check.py` (layer boundaries),
`python scripts/generate_ts_types.py --check` (payload drift),
`python scripts/generate_conjugation_index.py --check` (deck-content drift — Phase 1 changes
deck composition, so this will need regenerating),
and from `electron-frontend/`: `npm run lint`, `npm run build`, `npm run test:ui`,
`npm run test:a11y`.

---

## 9. Definition of done

- One id per word; no card reachable under two ids. Asserted by a test.
- Every section has uniform blocks; multi-select works across all of them.
- The 16-node graph is visible, navigable, and reflects real mastery.
- Existing user progress survives migration, with a written record of what changed.
- `LEARNING_PATHS` is gone or demoted; #20 resolved.
- `FEATURES.md`, `ROADMAP.md`, `ARCHITECTURE.md` updated to match.
