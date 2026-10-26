---
kind: code
reports: Z:/Projects/JPLearn/audits
ledger: AUDITS.md
census: ./.venv/Scripts/python.exe .claude/audit/census.py
---

# JPLearn — audit profile

Project specifics for `/crew-audit`. The method, finding format and report format are Team's; this
file carries only what is true of this repository. Adapted on 2026-10-26 from Heaven Unbound's
profile at Robbie's request, because the older systems here were written by much older models and
he wants them robust before anything new is added. Reference files: `.claude/audit/known-answers.md`
(constraints and settled answers) and `.claude/audit/repo-map.md` (layout and the searches that
work here).

The Auditor has no shell. Where this file names a command, it is for the lead or the lead's
verifier: the Auditor lists it under **Checks to run** and never runs it. The census takes optional
`--json` and `--top N`, reads paths relative to its working folder, and is run by the lead from the
root of the audited tree (for a worktree of an older commit without the script, the main checkout's
copy, with the worktree as the working folder).

## Identity

- A desktop Japanese-learning app for one learner on Windows. Electron + React 19.2 + TypeScript
  renderer; Electron main process in CommonJS (`electron-frontend/electron/*.cjs`); a Python 3.11
  backend implementing FSRS v4.5 scheduling. The legacy Python GUI (`main.py`, `gui.py`) raises
  `RuntimeError` on purpose.
- Layers: `domain/` pure learning logic (no I/O, no clock, no randomness of its own);
  `data/` SQLite persistence and Japanese text normalisation; `scripts/desktop_bridge.py`, the one
  long-lived Python child the main process talks to over JSON lines; dedicated runtimes for OCR,
  speech, voice and the local LLM; `electron-frontend/src/` the renderer, with `App.tsx` as
  orchestrator and `src/features/<name>/` hook-first modules. `scripts/arch_check.py` enforces the
  import boundaries.
- Commands, for the lead's verifier only (Python is always `./.venv/Scripts/python.exe`; bare
  `python` dies importing fugashi):
  - `python -m pytest -q`: about 1,670 tests, about 90 s.
  - `python scripts/arch_check.py`: layer boundaries, seconds.
  - from `electron-frontend/`: `npm run lint` (must be zero warnings), `npm run build`
    (tsc + vite, about 1 min), `npm run test:ui` (vitest, about 1,700 tests), `npm run test:a11y`,
    `npx vitest run electron` (main-process tests).
  - `python scripts/dev.py --full`: everything plus packaging and a packaged smoke run; slow.
- **Launch gate.** Anything that opens the app (`npm run start`, `test:e2e`, the packaged smoke)
  must run with a throwaway profile: `JPLEARN_DOCUMENTS_DIR` pointed at a scratch copy and its own
  `--user-data-dir`. The real database is `Documents\JPLearn\data\jplearn.db`; nothing an audit runs
  may write to it. Robbie's progress is test data, but the rule stands.
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

- `CLAUDE.md`, `electron-frontend/CLAUDE.md`, `.github/instructions/{domain,data,electron}.instructions.md`.
- `.claude/skills/jplearn-backend-invariants/SKILL.md` (the persistence and bridge invariants).
- `ARCHITECTURE.md` sections 1-7 (how the app is put together). **Not section 8** yet.
- `.claude/audit/known-answers.md`, **Part 1 only**.
- `.claude/audit/repo-map.md`.
- **Not yet:** `ARCHITECTURE.md` section 8, `DEBT.md`, `ROADMAP.md`, open GitHub issues. They come
  back at Reconcile, with known-answers Part 2.

## Records

- **Decisions.** There is no decision register. Settled decisions live in, by precedence: Robbie's
  latest explicit instruction; `ARCHITECTURE.md` (sections 2-7 state rules with their reasons, e.g.
  "nothing that reports what is installed may sit behind a network call"); closed GitHub issues
  (`#<n>`, readable with `gh issue view <n>` under Checks to run); code comments beside the thing
  they govern; commit messages. Cite as `ARCHITECTURE §<n>`, `#<n>` or `file:line`.
- **Debt register.** Two places, read both:
  - `ARCHITECTURE.md` section 8, "Findings": the older table, ids `A1`..`F5` by area; a struck id
    (`~~B4~~`) is closed and stays in place with how it closed. Rows here have no triggers.
  - `DEBT.md` at the repo root: new rows from audits, `## <n>. <title>`, `**Recorded <date>.**`,
    the body, and a `**Trigger:**`. Closed rows stay, marked `**CLOSED <date>**` in the heading.
  Cite as `ARCH §8 <id>` or `DEBT #<n>`.
- **Audit ledger:** `AUDITS.md` at the repo root, entries `## <date> — <scope>`.
- **What a feature does:** `FEATURES.md` (has known-stale entries; ARCHITECTURE §8 "F" rows list
  them). **Planned work:** `ROADMAP.md` (also partly stale). Built but unverified is not broken.
- **Severity scale.** Priority **P0** severe or very likely severe · **P1** meaningful, worth doing
  soon · **P2** worthwhile · **P3** minor but justified (never one created to lengthen a report).
  Each finding also carries **Confidence** (High established from code / Medium runtime decides the
  magnitude / Low needs a named measurement), **Benefit** (Very High / High / Moderate / Low) and
  **Risk of change** (High / Moderate / Low). Reconcile status: NEW · RECORDED (`ARCH §8 <id>` /
  `DEBT #<n>`) · TRIGGER FIRED (`DEBT #<n>`) · STALE RECORD. CONTRADICTS is not a finding: it goes
  under **Questions for Robbie**, quoting the record and saying why the code looks wrong anyway.
  Mapping to Team's default if needed: P0 = Critical, P1 = High, P2 = Medium, P3 = Low.

## Hard lines

A recommendation that breaks one is an error, not a finding; code that breaks one is ranked first.
Full text and reasoning in `.claude/audit/known-answers.md` Part 1.

- **A learner's progress is never lost, forked or silently rewritten.** Review state is keyed
  `(deck_name, card_id)`; card ids are positional (`id_offset + index`), so a corpus row is never
  dropped, reordered or inserted mid-deck, and a deck is never renamed, without a migration in the
  shape of `data/category_identity_migration.py` (backup, rewrite, report). Hiding a card is
  filtering after ids are assigned (#80).
- `data/jplearn.db` is the live database; `data/app.db` is a dev fixture no runtime path touches.
- Every write in `data/` goes through `data/text_normalization.py`, or lookups silently miss.
- `load_states()` fabricates a default state for unseen cards: persist only after a real review.
- The Python bridge is strictly serial and a timeout rejects everything pending: no slow or
  long-running operation goes on the shared worker; it gets a dedicated runtime or a one-shot.
- `domain/` stays pure: no database, file I/O, UI, hidden clock or randomness. `arch_check.py`
  layers are not to be crossed.
- Nothing a learner types, says, photographs or asks the tutor leaves the machine. The network is
  for downloads the learner starts (models, voice engine, dictionary, fonts); no core study feature
  may depend on it, and nothing that reports what is installed may wait on it.
- The renderer is untrusted: windows stay `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`; every IPC route validates its sender and payload (`ipc_security.cjs`); the
  renderer never touches the file system directly.
- Generated files are regenerated, never hand-edited: `src/generated/types.ts`
  (`scripts/generate_ts_types.py`), `domain/external_deck_data.py`
  (`python -m scripts.import_external_lists --conflict-policy keep-first`), the handwriting manifest
  (`scripts/build_handwriting_assets.py`).
- The authored 3D world (`world.glb` and its `.blend`) is Robbie's: never hide, replace or edit its
  meshes. Cameras move and interfaces are added.
- No "simplify now, build properly later" advice, and never recommend a cache without saying what
  invalidates it.
- In the roadmap, say for each item whether behaviour stays identical or it is a change Robbie must
  approve (anything he sees or reads, or any change to what a learner's history means).

## Multipliers

- **Per frame, renderer:** `requestAnimationFrame`, the three.js valley render loop and its
  animation callbacks, `motion` animations. Read whether a loop stops when its screen is hidden.
- **Per render of `App.tsx`:** about 3,300 lines and some 60 `useState` calls (counted
  2026-10-26; `ARCH §8 D1`'s figures are older), so a state change there re-renders most of the tree; work done in render bodies multiplies by every keystroke and tick.
- **Per answer in a study session:** bridge `review` call, mastery write, `localStorage` snapshot,
  queue rebuild. A session is 8-20 items; a learner may do many sessions a day.
- **Per deck build:** `ALL_DECKS[slug]()` rebuilds the deck from module data on every call, and
  levels run to 2,700 cards (decks.py); a build inside a per-card or per-deck loop multiplies.
- **Per card in a deck:** SQLite queries are chunked `IN (...)`; anything per card that is not
  chunked is N round trips.
- **Startup:** the first summary has a 2.5 s budget (`ui:first-summary` telemetry); everything on
  the path from window creation to that summary counts once per launch but is felt every time.
- **Per keystroke / per hover:** dictionary lookups and search boxes over IPC (debounced?).
- **Timers:** `setInterval` in the renderer and main process, per interval for the app's lifetime.

## Known answers

`.claude/audit/known-answers.md` Part 2: the reconciliation searches and the table of things that
reliably look like findings and are not, each with its record. The table is a snapshot; the records
win.

## Sweep questions

1. Every bridge command (`scripts/desktop_bridge.py` route table): can it take more than about a
   second, and does it run on the shared serial worker?
2. Every write to `jplearn.db` (`INSERT`, `UPDATE`, `DELETE`, `executemany` in `data/`): is the
   text normalised, is it inside a transaction with what it must agree with, and can it run before
   a real review (the `load_states` trap)?
3. Every place that derives, compares or stores a card id or deck name: could a corpus or deck-name
   change move it? Every reader of a deck's card *positions*.
4. Every network call (`https.get`, `https.request`, `fetch(`, `net.request`, `urllib`,
   `requests.`) in `electron-frontend/electron`, `scripts`, `data`, `domain`: what triggers it,
   what happens offline (no network, DNS failure, a hung socket), and does a core feature wait on it
   (issue #36)?
5. Every `ipcMain.handle` route: does it validate sender and payload, and what does it do with a
   malformed payload?
6. Every child process (`spawn`, `execFile`, `fork`): single-flight start, error and exit handling,
   `stdin` errors, kill on quit, what happens to pending requests when it dies.
7. Every `localStorage` key: who writes it, who reads it, and does SQLite also hold it (a second
   source of truth)? What happens when it is absent, corrupt or from an older build?
8. Every `setInterval`, `requestAnimationFrame` and `addEventListener` in the renderer: is there a
   matching cleanup?
9. Every `catch` that swallows an error (empty, or logs and continues): what does the learner see,
   and is state left half-written?
10. Every `ALL_DECKS[...]()` call outside tests: how often does it run?
11. Dead code: a symbol with no reference across `electron-frontend/src`, `electron/`, tests, and
    the Python tree. Class names are often built (`is-${tone}`, `assistant-toast-${priority}`), so a
    CSS class with no literal mention needs its producers checked; git history (`git log -S`) goes
    under Checks to run.
12. How many separate files must change to add one deck, one minigame, or one study mode? Count it
    from a recent commit that added one (`git show --stat <commit>` under Checks to run).
13. Every test that cannot fail: asserts nothing, asserts a mock it set up, or is skipped.
14. Every open `ARCH §8` row and every `DEBT.md` trigger the census lists: still true? fired?

Report groupings that fit this repository: data integrity and persistence, the Python bridge and
runtimes, offline and network, IPC and security, study session and scheduling, renderer state and
performance, startup, content pipeline and card ids, accessibility, redundancy and dead code,
architecture and extensibility, tests.

## Debt filing rule

The Auditor drafts rows; the lead files them. A draft row has `DEBT.md`'s shape — `## ?. <title>`,
`**Recorded <date>.**`, the body (what, where with `file:line`, why it is not fixed now), and a
`**Trigger:**` naming a behaviour or a count that would make it worth fixing, not just "later" —
and has been reconciled against `ARCHITECTURE.md` §8 and `DEBT.md` first. The lead numbers it (next
free number) and files it with a pathspec commit. **A finding that contradicts a record is never
drafted as debt:** name the record, quote it, and the lead puts it to Robbie.

## Ledger rules

- The lead adds one entry per pass to `AUDITS.md`, newest first under the header, and commits only
  that file with a pathspec.
- Entry fields: `## <date> — <scope>`; `**Scope:**` (Robbie's request, in his words where
  possible, and what was offered and declined); `**Commit audited:**`; `**Method:**` (what was read,
  what the verifier ran, what was not run and why); then `### Where each finding went`,
  `### Triggers checked`, `### Inspected and found sound — do not re-derive these`,
  `### What this pass could not establish`, and `### Coverage, not a finding` (systems none of the
  last three passes covered).
- Reports are never committed; they go to the `reports:` folder above. What lasts graduates: later →
  `DEBT.md` with a trigger; a rule → `ARCHITECTURE.md`; a stale record → fix that record; now →
  the fix; inspected and sound → the ledger.

## Tree hygiene

- Several sessions share the main checkout. Before the census, the lead checks
  `git status --porcelain`. Uncommitted source nobody in this audit wrote means another session is
  working: read it as evidence, build nothing on it, and name those files in `Method:`.
- Team worktrees live under `F:\Projects\.robbie-team-worktrees\`; a branch there may hold work
  main lacks. Say in the header which tree and commit were audited.
- Never delete permanently: `& "$env:USERPROFILE\.claude\tools\recycle.ps1" <path>`.
