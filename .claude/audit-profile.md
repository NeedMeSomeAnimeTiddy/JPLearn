---
kind: code
reports: Z:/Projects/JPLearn/audits
ledger: AUDITS.md
census: ./.venv/Scripts/python.exe .claude/audit/census.py
---

# JPLearn — audit profile

Project specifics for `/crew-audit`. The method, finding format and report format are Team's; this
file carries only what is true of this repository. Adapted on 2026-10-26 from Heaven Unbound's
profile at Robbie's request: the older systems here were written by much older models, and he wants
them robust before anything new is added. Reference files: `.claude/audit/known-answers.md`
(constraints, then settled answers) and `.claude/audit/repo-map.md` (layout, systems, searches).

The Auditor has no shell. Where this file names a command, it is for the lead or the lead's
verifier: the Auditor lists it under **Checks to run** and never runs it. The census is run by the
lead from the root of the audited tree (for a worktree of an older commit without the script, the
main checkout's copy, with the worktree as the working folder). Its default output holds counts
only. `--records` adds the open record rows and debt triggers; the lead runs that separately and
hands it over at Reconcile, never at Orient.

## Identity

- A desktop Japanese-learning app for one learner on Windows. Electron + React 19.2 + TypeScript
  renderer; Electron main process in CommonJS (`electron-frontend/electron/*.cjs`); a Python 3.11
  backend implementing FSRS v4.5 scheduling. The legacy Python GUI (`main.py`, `gui.py`) raises
  `RuntimeError` on purpose.
- Layers: `domain/` pure learning logic; `data/` SQLite persistence and Japanese text
  normalisation; `scripts/desktop_bridge.py`, the one long-lived Python child the main process
  talks to over JSON lines; dedicated runtimes for OCR, speech, voice and the local tutor model;
  `electron-frontend/src/`, the renderer, with `App.tsx` as orchestrator and `src/features/<name>/`
  hook-first modules. `scripts/arch_check.py` enforces the import boundaries.
- Commands, for the lead's verifier only, exactly as they run on this machine (bare `python` dies
  importing fugashi):
  - `./.venv/Scripts/python.exe -m pytest -q` (about 1,670 tests, 1-2 min, measured 2026-10-26).
  - `./.venv/Scripts/python.exe scripts/arch_check.py` (seconds).
  - In `electron-frontend/`: `npm run lint` (must report zero warnings), `npm run build` (tsc + vite),
    `npm run test:ui` (vitest), `npm run test:a11y`, `npx vitest run electron` (main process).
  - `./.venv/Scripts/python.exe scripts/dev.py --full`: everything plus packaging and the packaged
    smoke run; slow.
  - `./.venv/Scripts/python.exe scripts/generate_ts_types.py --check`: bridge payload types drift.
- **Launch gate.** Anything that opens the app (`npm run start`, `test:e2e`, the packaged smoke)
  runs with `JPLEARN_DOCUMENTS_DIR` pointed at a scratch copy and its own user-data directory.
  Isolating user data alone does not isolate the database. With `JPLEARN_DOCUMENTS_DIR` unset, the
  app keeps the real database at `Documents\JPLearn Progress\data\jplearn.db`
  (`electron/main.cjs::resolveProgressDocumentsDir`); Python run outside the app falls back to the
  repo's `data/jplearn.db` (`data/database.py::_resolve_db_path`). Nothing an audit runs may write
  to either, and the verifier states which path a run resolved before trusting it. The packaged
  smoke resets its database by default; it has set its own `JPLEARN_DOCUMENTS_DIR` since
  2026-10-26, and before that it wiped the real one.
- An audit rarely needs any of these: reading source establishes almost everything.
- **Robbie does not read Japanese.** In the report, name every word, card, screen and system in
  English. A Japanese term may follow in brackets, never stand alone as the handle for a thing.

## When audits may run

- Only when Robbie asks for an audit, review, sweep or "a pass over" something in his own words, or
  says yes to an offer. Never on Claude's own initiative; no `auto:` rule.
- When a group of work closes, offer one in a sentence and let him choose.
- A question about speed, startup time, dead code or what to clean up next is a question to answer
  directly, not a reason to audit.
- A bare `/crew-audit` with no target: ask what to cover, offering the systems in
  `.claude/audit/repo-map.md` ("Systems") plus "the whole repository", and say the whole-repository
  sweep costs most. Deep and narrow beats shallow and wide.
- The tree need not be clean; see Tree hygiene.

## Constraints read at Orient

Rule documents only. Each says what a valid recommendation looks like; none is a list of known
problems.

- `CLAUDE.md`, `AGENTS.md` (its architecture and conventions; its tool names belong to another
  harness), `PROJECT-CONTEXT.md`, `electron-frontend/CLAUDE.md`.
- `.github/instructions/domain.instructions.md`, `data.instructions.md`, `electron.instructions.md`.
- `.claude/audit/known-answers.md`, **Part 1 only**.
- `.claude/audit/repo-map.md`.

**Not at Orient:** `ARCHITECTURE.md` (sections 2-7 mix rules with conclusions and measurements
about specific systems, and section 8 is the findings table), `.claude/skills/jplearn-backend-invariants/SKILL.md`
(a summary of the same), `FEATURES.md`, `ROADMAP.md`, `DEBT.md`, `AUDITS.md`, GitHub issues, and
the census's `--records` output. Every rule in them that a recommendation must respect is restated
in known-answers Part 1. They come back at Reconcile.

## Records

- **Decisions.** No decision register. Settled decisions live in, by precedence: Robbie's latest
  explicit instruction; `ARCHITECTURE.md` (sections 2-7 state rules with their reasons and
  measurements); closed GitHub issues (`#<n>`, readable with `gh issue view <n>` under Checks to
  run); code comments beside the thing they govern; commit messages. Cite as `ARCHITECTURE §<n>`,
  `#<n>` or `file:line`.
- **Debt register.** Two places, read both at Reconcile:
  - `ARCHITECTURE.md` section 8, "Findings": the older table, ids `A1`..`F5`; a struck id is closed
    and says how. No triggers.
  - `DEBT.md` at the repo root: `## <n>. <title>`, `**Recorded <date>.**`, the body, a
    `**Trigger:**`. Closed rows stay, with `**CLOSED <date>**` in the heading.
  Cite as `ARCH §8 <id>` or `DEBT #<n>`.
- **Audit ledger:** `AUDITS.md` at the repo root, entries `## <date> — <scope>`.
- **What a feature does:** `FEATURES.md`; **planned work:** `ROADMAP.md`. Both are partly stale.
  Built but unverified is not broken.
- **Severity scale.** Priority **P0** severe or very likely severe · **P1** meaningful, worth doing
  soon · **P2** worthwhile · **P3** minor but justified (never one created to lengthen a report).
  Each finding also carries **Confidence** (High established from code / Medium runtime decides the
  magnitude / Low needs a named measurement), **Benefit** (Very High / High / Moderate / Low) and
  **Risk of change** (High / Moderate / Low). Mapping to Team's default: P0 = Critical, P1 = High,
  P2 = Medium, P3 = Low.
- **Reconcile buckets** are Team's: NEW · RECORDED · TRIGGER FIRED · STALE RECORD · CONTRADICTS.
  A record that merely describes the code wrongly (a count, a path, a behaviour since changed) is a
  STALE RECORD and is reported as one. CONTRADICTS, a question for Robbie, is only for a conflict
  with a decision or an intent that the records leave ambiguous. A record does not exempt its
  subject: a regression in something once fixed is a finding.

## Hard lines

In order of consequence. A recommendation that breaks one is an error, not a finding; code that
breaks one is ranked first. Full text, sources and the per-store keys in known-answers Part 1.

1. **A learner's history is never lost, forked or silently rewritten.** Each learner store has its
   own key (known-answers Part 1 lists them). Card ids are positional (`id_offset + index` over the
   imported rows), so a corpus row is never dropped, reordered or inserted mid-deck, and a deck is
   never renamed, without a migration in the shape of `data/category_identity_migration.py`
   (back up, rewrite, report). Hiding a card means filtering after ids are assigned (#80).
2. **No learner content leaves the machine.** What the learner types, says, photographs, asks the
   tutor, and their progress, stay local: the tutor, speech recognition, OCR and voice all run on
   the machine. Outbound traffic is downloads the learner starts and the packaged app's update check
   (`electron/updater.cjs`).
3. **The renderer is untrusted.** Windows keep `contextIsolation: true`, `nodeIntegration: false`,
   `sandbox: true`; every IPC route checks its sender and payload (`ipc_security.cjs`); the renderer
   reaches files and processes only through IPC.
4. **What is taught and recorded is correct.** An answer is graded as the learner gave it; a review
   updates the schedule and mastery once; unlocks and counts reflect what was studied.
5. **Core study works offline,** and nothing that reports what is installed may wait on the network
   (ARCHITECTURE §8 B4's rule).
6. **Data rules.** `data/jplearn.db` (wherever it resolves) is the live store and `data/app.db` a
   dev fixture; every write in `data/` normalises Japanese text; `load_states()` fabricates defaults
   for unseen cards, so state is persisted only after a real review.
7. **The bridge is serial.** One Python child answers one request at a time; no slow or
   long-running operation goes on it. It gets a dedicated runtime or a one-shot process.
8. **Layers.** `domain/` stays pure (no database, file I/O, UI, hidden clock or randomness);
   `arch_check.py`'s boundaries hold.
9. **Generated files are regenerated, never hand-edited:** `src/generated/types.ts`,
   `domain/external_deck_data.py`, the handwriting manifest.
10. **Robbie's design rulings:** the UI is square-cornered (`electron-frontend/CLAUDE.md`); the
    menu's authored 3D world (`world.glb` and its `.blend`) is not hidden, decimated or replaced
    without his approval.
11. No "simplify now, build properly later" advice; never recommend a cache without saying what
    invalidates it; in the roadmap, say for each item whether behaviour stays identical or Robbie
    must approve it (anything he sees or reads, or any change to what a learner's history means).

## Multipliers

- **Per frame, renderer:** `requestAnimationFrame`, the three.js valley render loop and its
  animation callbacks, `motion` animations. Read whether a loop stops when its screen is hidden.
- **Per render of `App.tsx`:** about 3,300 lines and some 60 `useState` calls (counted 2026-10-26),
  so state held there re-renders most of the tree; work in render bodies multiplies.
- **Per answer in a study session:** bridge review call, mastery write, `localStorage` snapshot,
  queue rebuild. A session is 8-20 items; a learner may do many a day.
- **Per deck build:** `ALL_DECKS[slug]()` builds the deck from module data on each call; levels run
  to about 2,700 cards. Establish whether a given builder caches before claiming either way.
- **Per card in a deck:** SQLite reads are chunked `IN (...)`; anything per card that is not is N
  round trips.
- **Startup:** the first summary has a 2.5 s budget (`STARTUP_BUDGETS_MS` in `electron/main.cjs`);
  everything between window creation and that summary runs once per launch and is felt every time.
- **Per keystroke or hover:** dictionary lookups and search boxes over IPC.
- **Timers:** `setInterval` in the renderer and main process, for the app's lifetime; the updater's
  periodic check in packaged builds.

## Known answers

`.claude/audit/known-answers.md` Part 2: the reconciliation procedure, then three tables: intentional
designs, recorded problems that are still open (re-check them; they are not exemptions), and
historical fixes (a regression is a finding). The tables are snapshots; the records win.

## Sweep questions

1. **Answer to record.** Trace one answer end to end: answer checking (`lib/answerAssessment.ts`, `lib/typedRecallAssessment.ts`, `useStudySession.ts::submitAnswer`),
   grade, the bridge review call, `review_states` and `review_events`, the mastery score, leech
   state, then the block unlock and the counts the learner sees. At each step: can it run twice, be
   skipped, or disagree with the next? Keep the three mastery notions in `domain/mastery.py` apart.
2. **Old state to new build.** Every persisted format (SQLite schema versions, `localStorage` keys,
   settings in `config_store.cjs`, exports from `data/deck_portability.py`): what does a newer build
   do with an older copy, an absent one and a corrupt one?
3. Every write to the live database (`INSERT`, `UPDATE`, `DELETE`, `executemany` in `data/`): is
   the text normalised, is it in one transaction with what it must agree with, and can it run before
   a real review?
4. Every place that derives, compares or stores a card id, deck name or deck slug: could a corpus or
   deck change move it? Every reader of a deck's card positions. Every reader of a learner store
   that is not limited to the cards a deck shows.
5. Every bridge command (`_COMMAND_HANDLERS` in `scripts/desktop_bridge.py`): can it take more than
   about a second on the shared worker?
6. **Offline.** Every outbound path: network calls in the main process and Python, renderer
   `fetch`/`XMLHttpRequest`/`WebSocket`, URLs in HTML and CSS, dependencies that fetch on their own
   (the updater). For each: loopback, bundled resource or external; what triggers it; the timeout;
   what the learner sees with no network, a DNS failure or a hung socket; whether core study waits
   on it (#36).
7. Every `ipcMain.handle` route: sender and payload checked? What a malformed payload does.
8. Every child process (`spawn`, `execFile`, `fork`): single-flight start, error and exit handling,
   `stdin` errors, kill on quit, what happens to pending requests when it dies.
9. Every `localStorage` key: writer, reader, and whether SQLite also holds it.
10. Every `catch` that swallows an error (empty, or logs and continues): what the learner sees, and
    whether state is left half-written. Every async screen: is there a loading, error and retry path?
11. Every `setInterval`, `requestAnimationFrame` and `addEventListener` in the renderer: is there a
    matching cleanup?
12. Keyboard and focus: every interactive control in the study flow, the menu and settings is
    reachable by keyboard and shows focus; every dialog traps and returns focus.
13. Dead code: a symbol with no reference across `electron-frontend/src`, `electron/`, tests and the
    Python tree. Class names are often built at runtime; check producers before calling a class
    dead. `git log -S` goes under Checks to run.
14. How many files must change to add one deck, one minigame or one study mode? Count from a recent
    commit that added one (`git show --stat <commit>` under Checks to run).
15. Every test that cannot fail: asserts nothing, asserts a mock it set up, or is skipped.
16. At Reconcile only: every open `ARCH §8` row and `DEBT.md` trigger (`census.py --records`):
    still true? fired?

Report groupings: data integrity and persistence; learning correctness; offline and network; IPC and
security; the bridge and runtimes; startup; renderer state and performance; content pipeline and card
ids; accessibility; redundancy and dead code; architecture and extensibility; tests.

## Debt filing rule

The Auditor drafts rows; the lead files them. A draft row has `DEBT.md`'s shape — `## ?. <title>`,
`**Recorded <date>.**`, the body (what, where with `file:line`, why it is not fixed now), and a
`**Trigger:**` naming a behaviour or a count that would make it worth fixing — and has been
reconciled against `ARCHITECTURE.md` §8 and `DEBT.md` first. The lead numbers it (next free number)
and files it with a pathspec commit. **A finding that contradicts a decision is never drafted as
debt:** name the record, quote it, and the lead puts it to Robbie.

## Ledger rules

- The lead adds one entry per pass to `AUDITS.md`, newest first under the header, and commits only
  that file with a pathspec.
- Entry fields: `## <date> — <scope>`; `**Scope:**` (Robbie's request, in his words where
  possible, and what was offered and declined); `**Commit audited:**`; `**Method:**` (what was read,
  what the verifier ran, what was not run and why); then `### Where each finding went`,
  `### Triggers checked`, `### Inspected and found sound — do not re-derive these`,
  `### What this pass could not establish`, and `### Coverage, not a finding` (systems none of the
  last three passes covered).
- No closing-commit field: a repair is recorded where its finding went.
- Reports are never committed; they go to the `reports:` folder above. What lasts graduates: later →
  `DEBT.md` with a trigger; a rule → `ARCHITECTURE.md`; a stale record → fix that record; now → the
  fix; inspected and sound → the ledger.

## Tree hygiene

- Several sessions share the main checkout. Before the census, the lead checks
  `git status --porcelain`. Uncommitted source nobody in this audit wrote means another session is
  working: read it as evidence, build nothing on it, and name those files in `Method:`.
- Team worktrees live under `F:\Projects\.robbie-team-worktrees\`; a branch there may hold work
  main lacks. Say in the header which tree and commit were audited.
- Never delete permanently: `& "$env:USERPROFILE\.claude\tools\recycle.ps1" <path>`.
