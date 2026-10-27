# Audit ledger

One entry per `/crew-audit` pass, newest first, added by the lead. The method and the rules for an
entry are in `.claude/audit-profile.md` ("Ledger rules"). Reports themselves are not committed; they
are kept in `Z:/Projects/JPLearn/audits`.

<!-- New entries go directly below this line. -->

## 2026-10-27 — Mastery, problem-card and counting rules

**Scope:** Audit 3 of Robbie's order, his words via `/crew-audit`: "the mastery, problem-card and
counting rules". How a card counts as learned or mastered; review_states, the card_mastery_scores
counters and the renderer snapshot; leeches (detection, leech focus, leech_items, the JLPT
weak-area inputs); every progress count and percentage shown, including the block-unlock rule from
audit 1 and the progression-node counts. Left out: the scheduler (audit 1), deck building and ids
(audit 2), JLPT diagnostic and adaptive queues, tutor and assistant rules.
**Commit audited:** ac64077 on main, clean tree.
**Method:** The Auditor read source, history and the census and ran nothing (two Explore helpers
mapped renderer counts and the leech flow; findings re-read). AUDITS.md and DEBT.md were read
before the sweep at the lead's instruction. The lead ran Checks 1-10 at ac64077 (Python on
throwaway temp databases; Check 8 read-only on the live database; `gh issue list` for Check 9).

### Where each finding went
- F1 onboarding seeds schedules but never the counters, which live only in the renderer and are
  lost at the first restart after an answer (P1; 1,051 seeded, 0 counters; nobody affected yet):
  fixed: the bridge writes the counters in the seeding transaction (#66's stated intent); rollback tested.
- F2 the Ledger and the REVIEW lane add up 43 summary entries: 545 topic cards counted twice,
  60,000 sentences counted where 1,200 are served, and the hidden Conjugation deck (P1;
  "1,196 OF 71,053" should be 1,051 of about 11,684): Robbie, "Fix the totals"; fixed with a `totals` object in the summary, which the Ledger, REVIEW lane and tray read.
- F3 block unlocking drops a card on any miss, so a studied block can re-lock (P2; reproduced):
  Robbie (Q1), "Correct once counts": a card counts toward its block once ever answered correctly;
  fixed (`_block_pass_inputs`), and applied to the overview, known kanji and path-step counts.
- F4 the REVIEW lane's due count includes cards done today (P2): fixed with F2 (`remaining_due`).
- F5 the Kanji and Vocabulary level bars always read 0% of 0; the setter has been gone since
  28c37ec (P2): Robbie, "Score counters"; fixed (`level-progress` command).
- F6 JLPT accuracy is queried by slug against name-keyed history and is never used (P2): fixed.
- F7 untracked path steps block Kanji N5, Reading Mode, Advanced Analytics and the JLPT steps for
  good (P2; #78 made untracked deliberate, not the blocking): Robbie, "Don't block on them"; fixed (`MEASURED_NODE_IDS`, `gate_status`). Review follow-up: the JLPT row counts open steps (Robbie, "Count open steps"); it goes 0 to 5 in one step, as the five JLPT steps open together.
- F8 the leech-focus card count covers the whole deck (P3): fixed.
- Q2 leech focus stays on after an Up next "Problem items" run: Robbie, "Only for that session";
  fixed. Q3 the Mastery screen's vocabulary is the 12 N5 topics only: Robbie, "All five levels";
  fixed.
- Stale records: S1 ARCH §4 table and §5 unlock paragraph; S2 ARCH §9 item 3; S3 comments in
  mastery_repository.py, desktop_bridge.py:1928-1929 and worldLanes.ts:17-22: fixed.
- Nits: `_mastered_count` unused (removed); "MASTERED" names two figures (left; the Ledger's note
  says so).
- The FSRS "mastered" rule copied in seven places: DEBT #7.
- Left after review: no review_events index (DEBT #1); a failed Up next start keeps its focus until
  the next start, on purpose.
- Passed to the JLPT audit: the diagnostic and adaptive queues test for states that
  load_review_states always fabricates.

### Triggers checked
- DEBT #1: not fired (1 review event).
- DEBT #6: not fired (no topic-slug counter rows).
- DEBT #4: not checked.

### Inspected and found sound — do not re-derive these
- Counters are clamped both ways; one step per answer under the parent slug, in the answer's
  transaction; the renderer's ±1 matches and is replaced by the stored value.
- Reset clears counters and leech rows with review_states in one transaction.
- The legacy import goes only into an empty table; backup import maps topics to parents.
- Leech rule (3 of the last 5 wrong, full window) is recomputed each answer, clears, and is keyed
  by deck name; queue, card-flag and Up next leech readers are limited to deck cards.
- JLPT readiness uses the summary's mastered rule; progression status never moves backwards.
- The mastered rule agrees across its seven copies.

### What this pass could not establish
- How the screens look; whether block progress is refetched mid-session.

### Coverage, not a finding
Three passes so far (scheduling; decks; mastery and counts). None has covered: study session and
queue, runtimes, setup and offline, IPC, startup, tutor, JLPT queues, minigames, dictionary and
OCR, the menu, renderer state, answer checking, progression beyond counts, passages, handwriting,
packaging.

## 2026-10-27 — Decks, card ids and the content pipeline

**Scope:** Audit 2 of Robbie's order ("Start audit 2 (decks, card numbering and how lesson content is
loaded) now?": "Start now"). Deck building, both list generators, the recovered extra cards
(supplements), topic views and blocks; every place a card id, deck slug or deck name is derived or
stored (mastery, the topic-to-level migration, backup export and import, the daily-games pool,
review history); the bridge deck commands and the main-process startup preload; renderer deck
loading and resume. Left out: mastery, leech and count rules (audit 3); JLPT, tutor and daily-games
logic beyond deck reads.
**Commit audited:** 96f7a5a on main, clean tree.
**Method:** The Auditor read source, history and the census and ran nothing. The lead ran checks
1-13 in the main checkout at 96f7a5a with a scratch `JPLEARN_DOCUMENTS_DIR` (empty scratch
database), opened the live database read-only for one query, and read the app's startup telemetry.
Check 14 (append a row to a kanji list and regenerate, to show no test catches it) was not run: it
needs a throwaway worktree with the venv. No helpers.

### Where each finding went
- F1 a daily-game word can carry a topic-deck slug, so a missed-word review gives the card a second
  mastery counter (P1; 0-3 of 20 pool words a day; no such rows in the live database yet): to fix.
- F2 "Up next" measures vocabulary over the topic views, 545 of 8,051 cards (P1): Robbie's call on
  what it measures.
- F3 supplement cards sit straight after each level's imported rows (Kanji N5 "one" is id 88), so
  appending a row moves them (P1): pin test to fix; a reserved id range is Robbie's call.
- F8 `deck-cards sentence_examples` sends 39 MB, about 4 s, through the serial bridge for the 1,200
  cards the renderer keeps (P1): cap at the bridge to fix; deck caching filed as DEBT #4.
- F4 the generator only regenerates under keep-first, silently dropping at least 180 cross-level
  rows, and nothing checks a regeneration (P2): DEBT #5.
- F5 the full backup leaves out the mastery counters (P2): to fix.
- F6 the Grammar Patterns and Sentence Examples blocks were written for the fallback list; 24 of 88
  grammar patterns are in no block (P2): Robbie's call on the new blocks.
- F7 resume loads the section's N5 deck and runs every unseen card (P2): to fix.
- F9 the topic-to-level migration looks for mastery under deck names; production uses slugs (P3):
  DEBT #6.
- F10 review-history prompts prefer a bare card-id match over the stored prompt (P3): to fix.
- F11 the deck list is hand-copied into the IPC allowlist and the startup preload with no check
  against Python's; Conjugation Training is Python-only (P3): cross-check test to fix; serving or
  retiring Conjugation Training is Robbie's call.
- Stale records: S1 audit 1's "deck builds are cached" (corrected below); S2 `README.md:160` and the
  generator's default policy, the generated module's "0 duplicates" header; S3 `ARCHITECTURE.md`
  §4-§6 on retired kanji topic decks, vocabulary blocks, supplement counts and "Add a deck"; S4 the
  `desktop_bridge.py:1772-1777` comment; S5 the `blocks.py` comments.
- Carried in from audit 1, `kanji_numbers_time` at launch: closed. It was the startup preload list
  in `main.cjs`, fixed by 6ea0f82 before this commit; the telemetry predated the fix. The one-shot
  retry is ARCH §8 B3.

### Outcome (branch `audit2-mastery-backup`)
- Fixed: F1, F5 (backup format 2; the screen re-reads the counters after an import), F7, F8, F10,
  and the pins for F3 and F11. S2-S5 corrected.
- Robbie's calls: F2 Up next measures the five level decks; the vocabulary recall floor drops to 0.07
  of `vocab_n5` (about 52 words) to keep the old pace ("Keep the old pace"). F3 pin test only, no
  reserved range. F6 grammar in his 13-block table, sentences in 60 numbered sets of 20. F11
  Conjugation Training stays hidden.
- F6 side effect: a saved block choice (`blockSelectionV2` in browser storage, by block index) for
  grammar or sentences now points at the new block with that number, or falls back to the default
  if that block is locked. A viewing preference only; no progress moves.
- Left as is: `studyPlan.ts` still gates grammar on topic words (nothing calls it); the renderer's
  pending-answer key uses the submitted slug, matching the main process.

### Triggers checked
- DEBT #1: not fired (empty-database summary 0.52 s warm; no review timing).
- DEBT #2 and #3: out of scope.

### Inspected and found sound — do not re-derive these
- Hiding the #80 repeats moves no id; 81 kanji and 6 words are hidden, as ARCH §5 says.
- Level and N4-N1 topic capacity checks at build time; topic ids leave holes, not shifts.
- Topic views keep the parent deck's name and ids, mapped onto shown cards only.
- Renderer deck routes validate slugs; the main-process preload is a trusted literal.
- Keep-first regeneration reproduces `domain/external_deck_data.py` byte for byte.
- The legacy score import runs only into an empty table.
- Hiragana, Katakana and Conjugation Training blocks cover their decks exactly.
- Up next leech counts are limited to the cards each deck shows.
- Deck build cost: 254.6 ms for all 43 decks, uncached (Sentence Examples 151.5 ms).

### What this pass could not establish
- Whether a resumed session's later rounds keep the resume card list.
- How the affected screens look (the app was not opened).
- The sentence deck's cost on the warm worker, rather than one-shot.
- The F3 mutation check (Check 14).

### Coverage, not a finding
Two passes so far (scheduling; decks). Neither has covered: mastery, leeches and counts; the study
session and queue; runtimes; setup and offline; IPC; startup; tutor; JLPT; minigames; dictionary and
OCR; the menu; renderer state; answer checking; progression; passages; handwriting; packaging.

## 2026-10-26 — Scheduling and review persistence

**Scope:** Audit 1 of 21 in Robbie's "polish the old systems" order ("realistically everything might
need redoing, so make a list"; "Start it"). The FSRS scheduler and every path that records a review:
scheduler callers, the bridge `record-result` path end to end, `review_states`/`review_events`
writes and `load_states`, the `study_pipeline` review functions, review-table migrations, the FSRS
optimizer, state rebuild and backfill. Left out: judging mastery, leeches and counts (audit 3),
import/export, XP/streak/badges beyond write order.
**Commit audited:** 2ddf741 on main, clean tree.
**Method:** The Auditor read source and the census and ran nothing. The lead ran telemetry, scratch
database queries, pytest (seven files, 204 passed), timing, gh and git log in the main checkout,
because the verifier's sandbox could not run the venv, git or gh; the verifier ran two domain-only
scripts. The live database had been reset (1 review event), so history-based measures were empty.
Known-answers Part 2 was seen at Orient by accident. Reports: `AUDIT-scheduling-and-review-persistence-2026-10-26-1-r2.md`.

### Where each finding went
- F1 a failed or timed-out review save is re-run in a second process, so one answer can be recorded
  twice (P1): to fix, by the lead (persistence). A per-answer id stored uniquely in `review_events`
  makes a repeated save return the stored result. Fallback seen live on reads (2 of 3 sessions).
- F2 a lapse stores "never studied", so it is queued and counted as new (P2): to fix. Robbie chose
  "due, counted as studied" (2026-10-26). The block-unlock rule is handed to audit 3.
- F3 about eight transactions per answer, and ordinary study hides a failed save (P2): to fix, by
  the lead. One transaction; Robbie chose a notice with Retry in study rounds, safe through F1's id.
- F4 optimized weights not live until the worker restarts (P3): to fix (reload command).
- F5 the optimizer ignores confidence and uses UTC days (P3): DEBT #2.
- F6 no index on `review_events` (P3): DEBT #1.
- F7 onboarding seeding stores a made-up review date (P3): to fix. Robbie kept schedule seeding
  (2026-10-26), which settles the question below.
- Seeding writes schedule rows despite the migration-20 docstring: asked; Robbie kept seeding, so
  the docstring is a stale record to correct with F7.
- Dropped: confidence clamp mismatch (IPC limits it to 1-5); per-answer deck build (0.8 ms; not cached, as audit 2 found).
- Passed to audit 2: the app asks the bridge for the unknown slug `kanji_numbers_time` at launch.

### Triggers checked
None: DEBT.md had no rows.

### Inspected and found sound — do not re-derive these
- One local day for scheduling and logging; the same-day floor and repetitions come from one flag.
- Confidence limited to 1-5 at IPC.
- Review writes normalise their text.
- `load_states` defaults are never written back on the live path.
- Unknown and hidden card ids are rejected before any write.
- Leech is evaluated after the log row.
- Review-table migrations are idempotent; reset runs in one transaction.
- `review_states` reads use the primary key.
- The worker settles only its own child's requests.
- Explicit review blocks on the save.
- A deck build takes 0.8 ms (not cached; audit 2 measured all 43 at 255 ms); a review save takes 40-65 ms on a fresh database.

### What this pass could not establish
- How often the fallback fires on writes.
- Whether the FSRS v4 curve with weights labelled 4.5 is intended.
- The bodies of #31, #64 and #65.

### Coverage, not a finding
No previous passes; this is the first.
