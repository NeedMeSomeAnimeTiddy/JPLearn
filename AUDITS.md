# Audit ledger

One entry per `/crew-audit` pass, newest first, added by the lead. The method and the rules for an
entry are in `.claude/audit-profile.md` ("Ledger rules"). Reports themselves are not committed; they
are kept in `Z:/Projects/JPLearn/audits`.

<!-- New entries go directly below this line. -->

## 2026-10-30 — Renderer state and settings

**Scope:** Audit 17. After audit 16 Robbie picked JLPT, then judged it unfinished and chose to design
the JLPT build first; he then ran `/crew-audit renderer state and settings`.
- Covered: App.tsx state and re-renders, types.ts, constants.tsx, AppSettingsModal.tsx and
  SettingsCollapsibleSection.tsx, config_store.cjs, every browser-storage key (writer, reader,
  SQLite overlap, old, absent and corrupt copies), settings defaults and migrations, renderer timers
  and listeners, swallowed renderer catches, and Settings dialog keyboard and focus.
- Out: Daily Games (16), tutor chat (15), onboarding and progression logic (12), startup (11),
  import, export and backup logic (10), the valley render loop, JLPT.

**Commit audited:** b066f20 on main, tree clean.

**Method:**
- The Auditor read source, git history and the census, with two read-only Explore helpers (timer and
  listener cleanup; swallowed catches). At Reconcile it read known-answers Part 2, AUDITS.md,
  DEBT.md, ARCHITECTURE.md §4, §8 and line 563, and FEATURES.md.
- The lead ran, at b066f20 in the main checkout with a throwaway test file since recycled:
  - Check 2: a rejected tutor download ends as an unhandled rejection with no message shown;
  - Check 3: focus is not in the Settings dialog on open, and the tabs' aria-controls name no
    element;
  - Check 6: `conf` throws SyntaxError on a damaged config, and clearInvalidConfig defaults to false;
  - Check 8: `git log -S` shows minigameStats was never persisted;
  - Check 9: no closed issue on Settings focus or minigame stats.
- Not run: Check 4 (user-event is not installed and jsdom cannot activate a button), Checks 1 and 5
  (optional), Check 7 (launch-gated profiler).
- Report: `AUDIT-renderer-state-and-settings-2026-10-30-1-r2.md`.

### Where each finding went
- F1, the Drills screen's per-mode record is never saved, so it reads "NOT PLAYED ON THIS DECK" after
  every relaunch while SQLite holds the results (P2, confirmed): reported.
- F2, Settings model actions and the FSRS reset discard their errors (P2, Check 2): reported.
- F3, the Settings dialog does not take, trap or return focus; its tabs' aria-controls dangle (P2,
  Check 3): reported.
- F4, the Offline Dictionary Download button cannot be pressed with Enter or Space (P3, plausible):
  reported.
- F5, the global keyboard handler stays fresh only through an unmemoised function (P3): reported.
- F6, a damaged `jplearn-config.json` disables config reads and writes for the run (P3, Check 6):
  reported. The r1 debt row was withdrawn because Check 6 met its trigger.
- F7, config keys and values are entered in four places; the notifications setting is unreachable
  (P3): reported.
- Nits N1-N2: reported.
- Q1, the progression "open anyway" overrides and the menu unlock mark live in browser storage
  against ARCHITECTURE.md:563, and "Reset all progress" clears neither: asked of Robbie.
- STALE RECORD: S1 App.tsx and AppSettingsModal size figures (ARCH §4, §8 D1,
  electron-frontend/CLAUDE.md, electron.instructions.md); S2 ARCH §4 "five localStorage keys" (ten);
  S3 electron.instructions.md lists `features/background/`.
- Dropped: a saved-prefs script crash (ScriptKey unchanged in history); the per-second focus-timer
  re-render (not established).
- Debt rows drafted: none.

### Outcome (branch `team/0a1c72ca`, merged 0fb67de)
- Robbie's answers: scope "All seven and nits"; F1 "Per level deck" and best run "Rebuild from
  history"; Q1 "Reset clears them too"; after the design critic, Settings failures read "Plain,
  reason underneath" and a preference that fails to save "Snap back and say so". A design critic
  (Opus) asked for amendments 2-10, all taken.
- F1 fixed (a69f8b8, 586ee21): Drills reads each mode's record for the level deck on screen from
  review history (bridge `minigame-records`), best run included; the in-memory minigameStats is gone.
- F2 fixed (586ee21): Settings model, dictionary, translation, speech, voice and scheduler-reset
  failures show beside their control in a polite live region, a plain sentence over the main
  process's reason.
- F3 fixed (9c15dfe, 586ee21): Settings and the close dialog take, trap and return focus with the
  shared trap; the tab panels carry the ids their tabs name.
- F4 fixed (720f2ab): a button in a section header works from the keyboard (user-event test).
- F5 fixed (586ee21): the window key handler sits behind a latest-value ref, attached once.
- F6 fixed (a69f8b8, 586ee21): a damaged config file is cleared and recovers; a preference shows a
  new value only once it is saved, and a failed save snaps back and says so.
- F7 fixed (a65df24, 586ee21): the config routes take their keys and close values from the store;
  notificationsEnabled is settable, with no new control.
- Q1 fixed (586ee21, d3ae73e): Reset all progress clears the progression overrides and the menu
  unlock mark; ARCHITECTURE.md names those two keys as the exception. S1-S3 refreshed (d3ae73e).
  N1-N2 fixed (586ee21).
- Review (Opus): approve with nits; the nits fixed in c4d44db and 9170c0b (Shift+Tab from the panel,
  a stale save painting over a newer one, a refresh failure shown as the action failing, the drill
  record kept on a same-deck re-read, sections drawn locked after a reset, a comment, an indent).
  Left: DEBT #17 (drill record re-read cost) and #18 (a narrow preference save race).
- Checks: on win-build at c4d44db lint, build, vitest 2235/2235 and a11y 7/7 pass; again at 9170c0b
  (one comment later) vitest 2233/2235, the two failures a route test that timed out while the VM
  fetched Electron and a read-count test, both passing alone. pytest on linux-build at 9170c0b 1946
  passed, 4 skipped, only the known Linux test_conjugation_index failure (fugashi 1.5.2).
- Not run: the app; no screen was looked at.

### Triggers checked
- No DEBT.md row covers renderer state or settings. ARCH §8 D1 open, figures stale. A2 holds.

### Inspected and found sound — do not re-derive these
- Browser-storage settings and SQLite user_settings do not overlap.
- loadSettings falls back to defaults; theme fields are normalised; the theme migration runs once.
- Every renderer listener, interval and IPC subscription in scope has a matching cleanup.
- Card-score adoption runs once, into an empty table only.
- config_store validates key, type and close-behaviour value.
- Deck-load timeouts and in-flight de-duplication.
- The session save is shape-checked and dropped when unreadable.

### What this pass could not establish
- F4 in a real browser; App re-render cost while the focus timer runs or a slider is dragged.
- Nothing was launched.

### Coverage, not a finding
- The last three passes (minigames and Daily Games, tutor, dictionary and OCR) did not cover the menu
  and valley, JLPT, reading passages or handwriting; none of those has had a pass.

## 2026-10-29 — Minigames and Daily Games

**Scope:** Audit 16. Robbie chose "Minigames, Daily Games (Recommended)" over JLPT and renderer state
and ran `/crew-audit minigames and Daily Games`.
- Covered: `domain/daily_games.py`, `data/daily_games_repository.py`, the daily-games bridge commands
  and IPC routes, `features/daily-games/`, the daily road, the missed-word review, how minigame and
  daily results reach XP, mastery, the schedule and queue order, and the crossword clue cache and its
  caller.
- Out: clue generation inside the tutor runtime (audit 15), the general graders (audit 9), grammar
  minigame generator content.

**Commit audited:** 04f453d on main, tree clean.

**Method:**
- The Auditor read source, blame and the census; no helpers. At Reconcile it read known-answers
  Part 2, DEBT #9, AUDITS.md, ARCHITECTURE.md and FEATURES.md.
- The lead ran the checks, read-only:
  - Check 1, five throwaway vitest cases in the main checkout, each written to pass only when the
    bug is absent: all five failed as predicted (the SPENT cases with the clock pinned to the
    fixture's pool day; unpinned, the hook ignores the saved state and the bug hides). A verifier
    wrote the cases but its sandbox could not install packages.
  - Checks 2-3, counts over the built vocab_n5..n1 decks: 8,051 cards; 350 readings Romaji Sprint
    cannot take; 73 stored forms with a space, 334 with `~`, `;` or brackets; 720 cards share a
    meaning with another.
  - Check 4, read-only against `C:\Users\Robbie\Documents\JPLearn Progress\data\jplearn.db`:
    daily_game_attempts 0 rows, daily_crossword_clues 0 rows.
  - Checks 5-6: `git log -S"missed_words"`; closed issue #62 (no ruling on the review's drill or
    the streak display).
- Not run: IME punctuation in a crossword cell; the app.
- Report: `AUDIT-minigames-and-daily-games-2026-10-29-1-r2.md`.

### Where each finding went
- F1, the missed-word review grades vocabulary readings in Romaji Sprint, which cannot accept "~ku",
  "benkyou (suru)" or "iku yuku"; 350 of 8,051 cards, each failure saved as a real failed review
  (P1): reported; which drill the review uses is asked of Robbie.
- F2, a crossword entry stored with a space ("good", いい; よい) can never be solved, so that
  crossword cannot be finished (P2, Check 1c; 73 cards): reported.
- F3, Match Pairs grades a right match wrong when two dealt words share a meaning ("blue", 青 and
  青い), writing a 7-day miss signal for both (P2, Check 1d): reported.
- F4, saving a puzzle re-runs its setup: the result shows 00:00 spent and a practice puzzle is
  dealt again, with a rare duplicate practice record on retry (P2, Checks 1a and 1a2): reported.
- F5, the clue cache is used only when its saved set exactly equals the board's entries, so a
  practice crossword breaks it for the day (P3, Check 1b): reported.
- F6, the Daily Games streak and freezes shown are as of the last completion, not today (P3):
  reported; whether a broken streak should show as broken is asked of Robbie.
- Nits: midnight unmounts a puzzle in progress; `progress.missed_words` and `attempt_count` have no
  reader in the app; the pool size is restated in `ipc_security.cjs`.
- STALE RECORD: DEBT #9's bridge line numbers.
- Debt rows drafted: none.

### Triggers checked
- DEBT #9: not fired (0 rows in daily_game_attempts).

### Inspected and found sound — do not re-derive these
- Pool selection is pure and deterministic, never reads fabricated review states, and excludes topic
  decks.
- Pools are immutable; every daily-games write is normalised; deck-name keys match review_states.
- A completed daily attempt is recorded once (partial unique index); record-attempt goes through the
  worker only; the other daily routes are idempotent under fallback; the attempt write is one
  transaction; the streak is derived and heals itself.
- Freeze arithmetic across months is correct.
- All six daily-games IPC routes validate sender and payload; Python validates again.
- Daily Games award no XP and leave the schedule alone (#62); their only effect is the intended 7-day
  miss priority.
- Clue generation stays off the bridge, never loads a cold model, has 8 s limits and validated output.

### What this pass could not establish
- How often F2's and F3's words are dealt together in real pools.
- IME punctuation in crossword cells.
- The first-of-day pool build cost (review_events has no index).
- Nothing was looked at in the app.

### Coverage, not a finding
- The last three passes (tutor and assistant, dictionary and OCR, packaging) did not cover JLPT, the
  menu and valley, renderer state and settings, reading passages or handwriting.

### Outcome (branch `audit16-repairs`, merged 4cc1ae9)
- Robbie's answers: F1 "Fix reading check" (keep typing the reading, accept what it means); F3
  "Accept either"; F6 "Show as of today"; scope "All six and nits". After the design critic: Match
  Pairs never deals two words written the same; Word Search skips non-kana-and-kanji words like the
  crossword. A design critic (Astra) asked for rework, then approved revisions 2 and 3 with
  amendments, all taken.
- F1 fixed (a4e492d): Romaji Sprint vocabulary rounds accept the forms a reading means: `~` dropped,
  brackets read from a reviewed list (optional part, alternative word, or label), space-separated
  alternatives only when the written form lists as many, and a reviewed table for 行く, 何, 毎月,
  毎年, お金持ち and さぞ. No fragment is accepted; kana and kanji rounds are unchanged.
- F2 fixed (999adc1): the crossword and Word Search take only words written in kana and kanji; a
  plain pool's board is unchanged.
- F3 fixed (999adc1, 7be8a3e): a same-meaning pick counts; two words written the same are never dealt
  together; a miss on a meaning tile goes to the word that tile will complete, so a word already
  paired is never marked missed.
- F4 and the midnight nit fixed (43b2f46): a puzzle session owns a snapshot of its pool from start to
  close, so saving no longer re-runs setup and midnight no longer unmounts a puzzle in progress.
- F5 fixed (1047b23): the clue cache serves a saved set that holds every requested position; every
  check on the board's own clues is kept.
- F6 fixed (70b1c1b, 7be8a3e): the streak and freezes shown are as of today (a broken streak reads
  0, a new month shows its freezes, with no history three freezes); display only, the stored streak
  is never written from it, and repeated reads spend no freeze.
- Nits: `progress.missed_words` and `attempt_count` left the payload (70b1c1b, 89ca279); the pool size
  in `ipc_security.cjs` is held to the domain's by a test (2dae603). DEBT #9's line numbers
  refreshed. No debt rows filed.
- Review (Opus): approve with nits, then approved 7be8a3e after the Match Pairs miss owner, a
  comment and a bridge read-read-complete test. Left: two harmless nits.
- Checks: pytest on linux-build at 1b74b2d 1932 passed, 4 skipped, only the known Linux
  test_conjugation_index failure (run with fugashi 1.5.2, as 1.3.0 has no Linux 3.12 wheel);
  arch_check and the generated types clean. On win-build at 7be8a3e lint, build and a11y 7/7 pass;
  vitest 2164/2165, the one failure a hint test that timed out under load and passes alone; its wait
  was raised to 5 s (1b74b2d, file checked locally).
- Not run: the app. No Daily Game has been played on Robbie's install (0 attempts), and no screen was
  looked at.

## 2026-10-29 — Tutor and assistant

**Scope:** Audit 15. Robbie chose "Tutor and assistant (Recommended)" and ran `/crew-audit` with "tutor and assistant".
- Covered: the tutor chat (Look It Up's A QUESTION and `useTutor`), the runtime's prompts, context, history, adapters, time limits and cancel as the chat sees them, the translation shortcut in chat, chat history storage and its bridge commands, scenario practice and crossword clues.
- Out: dictionary, OCR and OCR translation (audit 14), runtime start and stop and the one-request rule (audit 5), setup and downloads (audits 6 and 13).

**Commit audited:** 92eb2f7 on main, tree clean.

**Method:**
- The Auditor read source, history and blame (cfc985b, cb9b9ba), the census and, at Reconcile, AUDITS.md, DEBT.md, FEATURES.md and ARCHITECTURE.md. No helpers.
- The lead ran Checks 1-5, 8 and 9 read-only at 92eb2f7:
  - live database chat tables empty;
  - system prompt 1,817 characters;
  - context 915 characters on a scratch copy;
  - "What's 'dog' in Japanese?" answered Ｓ (エス);
  - 325 vitest and 14 pytest tests passed.
- Not run: Check 6 (no tutor model installed) and Check 7 (deferred to the F3 repair).
- Report: `AUDIT-tutor-and-assistant-2026-10-29-1-r2.md`.

### Where each finding went
- F1, the tutor answers every message alone while the screen promises follow-ups (P2): reported; Robbie decides.
- F2, a failed model's canned reply is shown and kept as the tutor's answer (P2): reported.
- F3, scenario and crossword time limits start after the cold load (P2, plausible): reported.
- F8, the translation shortcut reads apostrophes as quotes and answers "What's 'dog'…" with Ｓ (P2, confirmed by Check 5): reported.
- F4, chat history half-removed (P3): reported. It is code-only: Robbie's chat tables are empty.
- F5, adapter instructions cut by the 3,200-character cap (P3): reported. It fits today with about 50-200 characters of headroom, and `memory_graph` is already cut at 280. Debt row drafted.
- F6, scenario warmup sets the chat warmup flag (P3): reported. It is a gap in audit 11 F3's fix.
- F7, scenario judging and clues run on the translation model (P3, plausible): reported; debt row drafted.
- Nits 1-3: reported.
- Asked of Robbie: Q1, Japanese-only replies, and English replies replaced by "send it again".
- STALE RECORD: `FEATURES.md:205`, `FEATURES.md:212`, and the code comments under F1, F3 and F4.
- RECORDED: DEBT #15, whose scope has grown to per-message chat context; ARCH §8 B1.
- Dropped: none.

### Triggers checked
- DEBT #15: not fired (hashed embedder on this install, Check 4). A second caller was found.

### Inspected and found sound — do not re-derive these
- The chat gate and its no-model copy.
- CLEAR and send are disabled while a reply is pending.
- Renderer polls and timers clean up.
- Turning the chat off unloads and resets.
- Every model path takes or refuses the one lease and releases it in `finally`.
- Scenario AI verdicts are shape-checked and token-guarded.
- Crossword clues are used only as a full checked set.
- Scenario SRS text is normalised.
- Authored scenarios are checked by tests.
- The translation shortcut is offline only, and a plain question answers correctly.
- The baseline tests in scope pass.

### What this pass could not establish
- GGUF cold-load times.
- Judging quality on the translation model.
- Prompt size on a database with real history.
- Screens not looked at.
- The scenario evaluator read at a skim only.
- Whether session-end coaching events are consumed before a toast can show.
- Issue #61 not read.

### Coverage, not a finding
- The last three passes (dictionary and OCR, packaging, progression) did not cover JLPT, minigames and Daily Games, the menu and valley, renderer state and settings, reading passages, or handwriting. No pass has ever covered those six.

### Outcome (branch `audit15-repairs`, merged 09f51f5, pushed 2026-10-29)
- Robbie's answers: F1 "Remember recent turns"; F4 "Forget on close"; Q1 Japanese for practice,
  English only when the learner asks what something means or how grammar works; F2 "The tutor
  couldn't answer: <reason>", not kept in history; voice speaks only the Japanese parts; footer
  "ENTER ASKS A FOLLOW-UP · THE TUTOR SEES THE LAST 3 EXCHANGES"; with no model, "no tutor model is
  installed". A design critic (Opus) approved revision 1 with amendments, all taken (revision 2).
- F1 fixed (80471b7, df92f57): the last six turns (three exchanges) go to the model with each
  question, 300 characters a turn and 900 in all, oldest dropped first; CLEAR forgets them.
- F2 fixed (80471b7, df92f57): no canned replies. Each failure throws a short reason (load failed, no
  model, too slow, no answer, too long, error, busy, stopped); a failed load is not retried for 30 s;
  the question is dropped from the chat and the failure is not kept. Only a reply that is nothing but
  a short hedge becomes the clarifying question.
- F3 fixed (80471b7): a cold scenario judgement answers at once and warms the model in the
  background, which arms the idle unload; crossword clues never load a cold model.
- F4 fixed (80471b7, df92f57, e45a88e): history lives in the main process for the session (20 turns
  kept); the startup read, the preloaded route, the bridge commands assistant-chat-append, -history
  and -clear, the compaction on every snapshot and the chat summaries in the context are gone. The
  tables stay and reset-db still clears them.
- F5 fixed (80471b7): the prompt and adapter note are never cut; the context keeps at least 1,200 of
  4,000 characters, dropping low-value keys first and never the memory graph (clip 480);
  llama-server runs `-c 4096 -np 1`, and its "too long" error has its own reason. Judge and clue
  prompts reach the model whole (2,600 and 1,800; the largest authored judge prompt is about 1,450).
- F6 fixed (80471b7, df92f57): scenario practice warms through `scenario:preload-model`.
- F7 fixed (80471b7): judging, clues and the scenario warmup refuse the translation model (setup's
  choice or the only GGUF found); a model named by option or environment counts as a tutor model.
- F8 fixed (80471b7): a single quote quotes only at a word boundary; keys under two letters skip the
  dictionary. "What's 'dog' in Japanese?" now looks up dog, not s (tested).
- Q1 also reached `models/llama/instructions.txt`, which replaces the built-in prompt when present
  (a run from the repo) and still said "match the user's language".
- Nits 1-3 fixed; FEATURES.md corrected; DEBT #15 amended (second caller, up to 54 encodes a
  message, trigger extended). The drafted F5 and F7 debt rows were not filed: both are fixed.
- Review (Opus): approve with nits. Fixed: a stale comment, a test that did not isolate the
  background load's idle unload (701d24a). Left: an unload during a background scenario load can
  leave one idle timer that re-unloads an unloaded runtime (harmless).
- Checks: pytest on linux-build 1923 passed, 4 skipped, only the known Linux
  test_conjugation_index failure; arch_check and the generated types clean. On win-build at
  701d24a lint, build, vitest 2064/2064 and a11y 7/7 pass.
- Not run: the app end to end. Robbie's install has no tutor model, so no reply, judgement or clue
  from a real model was seen, and no screen was looked at.

## 2026-10-29 — Dictionary, lookup and OCR

**Scope:** Audit 14. Robbie chose "Dictionary, lookup, OCR (Recommended)" over tutor and assistant, and minigames and Daily Games, then ran `/crew-audit`.
- Covered: the offline dictionary (repository, bridge commands, the tutor's JMdict lookup, install and paths); Look It Up and the Dictionary panel with their IPC routes; the OCR runtime, server, extraction, temp file and screenshot screen; OCR translation; normalisation on lookup keys.
- Out: OCR package install and pins (audit 13), download integrity (audit 6), the tutor chat.

**Commit audited:** f570104 on main, tree clean.

**Method:**
- The Auditor read source, the census, git history (085cb63) and the records; no helpers.
- The lead ran Checks 1-10 locally, read-only, against the repo's dictionary index (the installed app has no dictionary, OCR, tutor model or embedder).
- Not run: Check 11 (needs an installed embedder).
- known-answers Part 2 was read at Orient by mistake.
- Report: `AUDIT-dictionary-lookup-and-ocr-2026-10-29-1-r2.md`; F1's full list `audit14-f1-mismatches.csv`.

### Where each finding went
- F1, 287 of 1,410 N5/N4 vocabulary cards (165/744, 122/666) carry another dictionary entry, shown as furigana and clues and accepted as typed-recall answers (P0, Checks 1, 2, 10): reported. Check 10: 57 the same word in another spelling, 14 a dropped honorific (wrong reading), 34 a stripped "~" affix (different word), 182 other.
- F3, the tutor's JMdict query hits a table gone since 085cb63, then parses a 117 MB JSON (2.4 s) in the main process (P2, Checks 5, 6): reported.
- F4, the screenshot route opens with OCR alone though translation needs llama.cpp and a refreshed runtime; text read is discarded on failure; the active-translation setting is unread (P2): reported.
- F2, English dictionary search runs the embedding model on the serial bridge (P2, plausible; Check 11 not run): reported; debt row drafted.
- F5, Look It Up claims to search decks and has no romaji fallback (P3): reported.
- F6, the Dictionary panel calls a missing dictionary a failed lookup (P3): reported.
- Nits 1-4: reported.
- STALE RECORD: this file's audit 5 F1 line ("translations come from the bundled JMdict"); `llm_runtime.cjs:992-993`; ARCHITECTURE §8 B1 omits the embedder.
- Dropped: none. CONTRADICTS: none.

### Triggers checked
- DEBT #4: kanji detail is an unlisted caller that rebuilds decks; trigger not measured.
- ARCH §8 B1/B2: still open; F2 is a new case of B1.

### Inspected and found sound — do not re-derive these
- IPC validation on the dictionary, kanji, sentence, image and translate routes.
- The OCR temp file is randomly named and removed on every path.
- The OCR runtime: single-flight queue, cold and warm time limits, settling only its own request, idle and quit unload; ocr_server survives failed requests; OCR never downloads.
- Kanji detail falls back to deck data.
- Look It Up's sequential routes and stale-batch drop.
- The phrase scan of 60,000 rows; dictionary note keys from the JMdict id.
- The fallback English search takes 5-58 ms; prefix search stays within 3 ms.

### What this pass could not establish
- F2's cost with a real embedder (Check 11).
- How long Electron takes to build F3's index after the parse.
- No screens were looked at.
- No test reaches F1's entry choice over real decks, F3's real schema or F4's failure path.

### Coverage, not a finding
- The last three passes (packaging, progression, startup) did not cover tutor and assistant, JLPT, minigames and Daily Games, the menu and valley, renderer state and settings, passages or handwriting.

### Outcome (branch `audit14-repairs`, merged d6dd3f1)
- Robbie's answers: F1 "No dictionary clue"; F4 "Install the runner too" and the failure wording
  "Read the text, but couldn't translate it: <reason>" above the kept Japanese lines; F5 "Search
  decks + romaji"; F6 "Use Look It Up's line"; N2 "Honest labels"; the English heading "ENGLISH",
  or "ENGLISH · FIRST PART OF THE TEXT" when the text was clipped. A design critic (Astra) approved
  revision 3 with amendments, all taken.
- F1 fixed (51bda68): a card takes a dictionary entry only when it is the same word: the reading
  matches the card's romaji and the spelling or a content word of meaning matches; a kana card must
  be read as spelled; a tie between different meanings attaches nothing. Measured over N5/N4: 1,144
  kept, 202 corrected, 31 added, 27 wrong removed, 3 lost (あの, コート, バス: multi-meaning cards).
  Enrichment takes 0.43 s, from 0.9 s. Over every deck, 47 of 9,484 enriched cards take an entry
  spelled inside their own spelling, all affix cards, spelling variants or grammar patterns, so the
  reviewer's proposed guard was not added.
- F3 fixed (b35de6e, 8d164cc): the tutor reads the real index (FTS phrase, common first, then the
  first meaning, the shorter word, more senses), with no JSON fallback. Exact gloss first, then a
  whole word of a gloss. The index keeps 240 characters of glosses, so a meaning past that is not
  found (accepted); the cut-off last piece is never an answer. Checked: water 水, dog 犬, teacher
  先生, to go 行く, red 赤; "to eat" gives 食う, "bathroom" 浴室.
- F4 fixed (b0dded3, d95c01a, 8d164cc): Image Translation installs llama.cpp last and counts as
  installed only with it; the screenshot route opens only when the tutor runtime would run a real
  model (`translationReady`); the active translation model is read; setup routes recreate the
  runtime only when its server or model changed; the text read is shown before the translation
  and kept when it fails.
- F2 filed as DEBT #15; ARCHITECTURE §8 B1 names it. Look It Up searches only on its word and phrase
  routes (critic A6).
- F5, F6, N1-N4 fixed (d95c01a): Look It Up's word route searches your decks first, then the
  dictionary, then romaji as kana (shared with the Dictionary panel); the panel shows Look It Up's
  missing-dictionary line; OCR labels as Robbie chose.
- Records corrected (abab4e0): the audit 5 F1 line, the `llm_runtime.cjs` comment, ARCHITECTURE B1.
- Review (Opus): approve with nits, then approve. Fixed: needless runtime restarts cancelling a reply,
  an old image's lines under a new image's error, the cut-off gloss, a false "would answer more"
  note, long-vowel folding. Left: Image Translation's stated size and the wizard's progress bar
  still leave out the runner.
- Checks: pytest on linux-build 1921 passed, 4 skipped, only the known Linux test_conjugation_index
  failure; arch_check and the generated types clean. On win-build lint, build and a11y (7) pass;
  test:ui 2026/2029 with three timeouts that pass on rerun, two of them the new index tests, now
  given 30 s (3b4974e).
- Not run: the app end to end. Robbie's install has no OCR, llama.cpp, tutor model or dictionary,
  so no screen of this was looked at and no real translation was made.

## 2026-10-29 — Packaging, updates and upgrades

**Scope:** Audit 13. Robbie chose "Packaging and upgrades (Recommended)" over JLPT prep, minigames and Daily Games, dictionary/lookup/OCR, the menu and valley, reading passages, handwriting, and the whole repository.
- Covered: forge config and its post-package hook; bundle_python.ps1; updater.cjs; schema versions and migrations; which Python the packaged app and setup run; what ships in resources; the packaged smoke and dev.py --full; progress and downloads locations across versions and the former-location copy; the Squirrel hooks; both workflows.
- Out: each migration's data correctness (audits 1, 10), the uninstall dialog's selection logic (audit 6), the bridge start and failure display (audits 7, 11), download integrity (audit 6).

**Commit audited:** 3f28c5f on main, tree clean.

**Method:**
- The Auditor read source, history and the census, and ran nothing. No helpers.
- The lead ran Checks 1-8, 10 and 11 locally (scratch databases under %TEMP%, confirmed).
- Not run: Check 9 (a real update in a VM), Checks 12-13.
- Report: `AUDIT-packaging-and-upgrades-2026-10-29-1-r2.md`.

### Where each finding went
- F1, speech recognition cannot run in the installed app (P2, Check 1): reported; Q3.
- F3, local releases ship the 2026-09-05 bundle (fugashi 1.5.2 against 1.3.0 tested), unchecked (P2, Checks 1, 5): reported.
- F2, OCR's Python packages are lost on every update (P2, plausible; Check 9 not run): reported; Q3.
- F4, the tutor embedder is never found, the folders being split since 9ca9cfb (P3, Checks 1, 3, 6): reported.
- F5, migration 15's unguarded column add leaves a database that never opens (P3, Check 2 reproduced): reported.
- F6, a newer database is opened silently (P3, Check 10): reported; Q2; debt row drafted.
- F7, the uninstall cleanup uses home\Documents (P3, plausible): reported; debt row drafted.
- F8, auto-update has no source and no matching release asset (P3, Checks 7, 11; evidence corrected): reported; Q1.
- Nits 1-2: reported.
- STALE RECORD: README.md:100-134; release.yml:219,226-228; bundle_python.ps1:124-127.
- RECORDED: DEBT #6.
- Dropped:
  - the former-location copy's home\Documents (no release, no former-location database, Documents not moved; Checks 7, 8);
  - the topic-to-level migration not run on upgrade;
  - Squirrel re-creating shortcuts;
  - the shared user-data folder for dev and installed builds.

### Triggers checked
- DEBT #6: not fired.

### Inspected and found sound — do not re-derive these
- Packaging strips every *.db (including -wal and .backup-*) and data/backups.
- Progress and downloads live outside Squirrel's app-<version> folder and are set before any runtime.
- The migration plan is checked for gaps; column adds are guarded and defaulted except migration 15; a safety copy precedes an upgrade.
- Squirrel events exit before the lock and the bridge spawn.
- The packaged smoke is isolated.
- The updater never blocks startup.
- A fresh bundle build fails loudly and probes tokenization.
- The release workflow forces a fresh bundle; the smoke workflow skips fork pull requests.
- No app release exists and nothing is installed on Robbie's machine (Checks 4, 7).

### What this pass could not establish
- A real Squirrel update.
- Whether restore can be reached when the engine fails.
- The screens on an OCR or speech import failure.
- What fugashi 1.5.2 changes at runtime.
- No test reaches an interrupted migration, a newer database, the Squirrel hooks or setup's pip installs.

### Coverage, not a finding
- The last three passes (progression, startup, import and export) did not cover tutor and assistant, JLPT, minigames and Daily Games, dictionary/lookup/OCR, the menu and valley, renderer state and settings, passages or handwriting.


### Outcome (branch `audit13-repairs`, merged 3a3527f)
- Robbie's answers: Q1, typed, "wire updates up to github repo, but don't add a release yet"; Q2
  "Keep opening it" (DEBT #14); Q3 "In JPLearn Assets"; "Add a switch", checked "Launch only";
  version "Plain numbers" (0.1.0); the switch's wording as shown. A design critic (Opus) reviewed
  the design before it was built.
- F1, F2 fixed (7e21c24, caf163b): the optional features' Python packages go in
  `JPLearn Assets\python-packages\<tag>\<feature>-<pinhash>`, installed by setup in the installed app
  only, probed before they count, and reached through `JPLEARN_PYTHON_PACKAGES`; source mode is
  unchanged. Every package and its floating dependencies are pinned to the source environment.
- Found while checking, fixed (caf163b, 2365381, 5379cc0, 8f47747): on a clean Windows every native
  package failed to load. The bundle now carries the Visual C++ runtime, OpenMP included, from the
  build machine (or `-VcRuntimeDirectory`). A bare Windows Server then loaded the embedder's packages;
  OpenCV and PyAV still need Windows' media DLLs, which N editions and Server leave out and nothing
  can ship, so the install error names the Media Feature Pack. Not yet run on a clean Windows 10/11.
- F3 fixed (7e21c24): `make:release` rebuilds the bundle with `-Force` and the pins, then runs the
  packaged smoke.
- F4 fixed (7e21c24): the bridge and embedder read the downloads folder, then the progress folder.
- F5 fixed (7e21c24): migration 15's column add is guarded; the test reproduces the cut-short upgrade.
- F6 filed as DEBT #14.
- F7 fixed (7e21c24): the uninstall cleanup resolves the progress folder as the app does.
- F8 fixed (7e21c24, fddeff0): updates come from this repository's GitHub Releases, checked once at
  launch, skipped on Squirrel's first run; Settings has "Check for updates automatically". No release
  was made. release.yml checks the tag against the version and uploads RELEASES and the full .nupkg.
- Review fixes (caf163b): the CUDA check sees the downloaded packages; OCR uninstall stops the server
  first; one install per feature at a time.
- Checks: pytest on linux-build 1907 passed, 3 skipped, only the known Linux test_conjugation_index
  failure; on win-build lint, build, a11y (7) and the electron tests (227) pass, test:ui 1996/1999
  with three load timeouts that pass on rerun. Not run: a real Squirrel install or update.

## 2026-10-29 — Progression and onboarding

**Scope:** Audit 12. Robbie chose "Progression (Recommended)" over JLPT prep, minigames and Daily Games, dictionary/lookup/OCR, the menu and valley, reading passages, handwriting, and the whole repository.
- Covered: the progression graph and its sync; feature unlocks; achievement badges; XP and levels; learning-path status; the onboarding wizard; expertise seeding; `mark-onboarding-pending`; their IPC routes and the read cache.
- Out: recommendation ranking, tutor-reaction writing, and how the menu draws itself.

**Commit audited:** 1097c4c on main, tree clean.

**Method:**
- The Auditor read the source, history and the census, and ran nothing. No helpers were used.
- The verifier ran Checks 1, 2, 4, 5, 6 and 9 (linux-build, Python 3.12.3, scratch databases). The lead ran Check 3 locally.
- The lead ran Check 10 read-only on the live database: 1 XP key stored today.
- Not run: Checks 7 and 8 (app launches).
- Report: `AUDIT-progression-and-onboarding-2026-10-29-1-r2.md`.

### Where each finding went
- F1, the knowledge checklist seeds whole level presets; one N5 Vocabulary tick seeds 1,051 cards (P1, Check 5): reported; asked of Robbie (Q1).
- F2, XP rewrites every correct answer's key on every correct answer: about 1.2 ms per 1,000 keys, 121–126 ms at 100,000 (P2, Check 2): reported; fix now recommended; debt row drafted as a fallback.
- F3, eight wall seals can never be earned, including three for steps that are reached (P2, Check 4): reported; asked of Robbie (Q2).
- F4, a step's mastered date is erased on the next sync (P3, Check 1): reported.
- F5, onboarding saves fail silently (P3): reported.
- F6, a learner with history is re-asked onboarding when the setup mark fails or never ran (P3, plausible): reported.
- F7, the readiness labels and warning are computed and never shown; the opener was removed in 30c6635 (P3, Check 3): reported; debt row drafted.
- Nits 1–3: reported.
- Q3, the menu's hard locks against soft gating: asked of Robbie.
- STALE RECORD: FEATURES.md:114, 118, 120, 126-127, 135-136.
- RECORDED: DEBT #3, #1, #4.
- Dropped: the reset unlock moment (Check 8 not run).

### Triggers checked
- DEBT #3: not fired. The largest seed took 0.13 s for 4,358 cards.
- DEBT #1: not fired on a fresh database (6–14 ms). F2 adds about 1.2 ms per 1,000 XP keys.
- DEBT #4: not checked.

### Inspected and found sound — do not re-derive these
- Progression and feature transitions only move forward, and their fixed-point loops end. The graph is checked at build.
- Unlock and badge writes keep the first timestamp.
- Expertise seeding never touches a card with history, runs in one transaction on the worker after the answer queue, clears the caches, and is fast.
- `mark-onboarding-pending` never resets a finished onboarding, and tests cover it. Setup exits and onboarding completion clear all cached reads; reads that save clear the progress reads.
- Reset clears progression, unlocks, badges and XP with the review data.
- XP and review/streak badges are awarded inside the answer transaction and are safe on replay.
- The scope's 183 tests pass at 1097c4c.

### What this pass could not establish
- F6 and the reset unlock moment in the app; how any screen looks.
- No test covers the checklist mapping, the dates surviving a second sync, or the wizard's failure paths.

### Coverage, not a finding
- The last three passes (startup, import and export, answer checking) did not cover tutor and assistant, JLPT, minigames and Daily Games, dictionary/lookup/OCR, the menu and valley, renderer state and settings, passages, handwriting, or packaging and updates.

### Outcome (branch `audit12-repairs`, merged c2f05c1, pushed 2026-10-29)
- Robbie's answers: Q1 "Only what's ticked"; N3+ "Split it: N3 Kanji, N3 Vocab"; Q2, asked again
  after JLPT N5-N1 were found to open together, "2 on reach, hide 6"; Q3 "Keep the locks, update
  docs"; F5 wording "Use this wording"; the checklist descriptions and Bookworm text as shown; the
  Ready page's "~750-word". A design critic (Opus) required M1-M4, all taken; M2 was settled by
  re-running the onboarding mark at startup rather than a read-side rule.
- F1 fixed (ee7e6c2, 9bbd285): `apply_known_items` / `study:apply-known-items` seed only the ticked
  decks; the level presets and `applyExpertiseLevel` are gone; N3 is two ticks.
- F2 filed as DEBT #12 (the live database held 1 key, Check 10).
- F3 fixed (ee7e6c2, 9bbd285): the six unearnable seals left the curriculum and the wall (x / 19);
  Free Talker and Avid Reader are earned on reach. Learners already past them get both seals dated at
  their first read after the update; nothing records the reach date.
- F4 fixed (ee7e6c2): stored dates are loaded, so later syncs keep `mastered_at`.
- F5 fixed (9bbd285, dc45c18): the wizard shows "Couldn't save what you already know: <reason>" or
  "Couldn't finish onboarding: <reason>" (first line only) above its pages; Start or Skip retries; a
  ref stops double submits; nothing is seeded when nothing is ticked.
- F6 fixed (ee7e6c2, dc45c18, cf083ad): `onboarding-check`, the first startup preload task, re-runs
  `mark-onboarding-pending` after setup; a failure is logged and recorded in the preload telemetry.
  Known consequence: a learner whose seed saved but whose completion failed, and who quit, is treated
  as onboarded next launch and their goal and daily minutes are not saved.
- F7 fixed in part (9bbd285): the dead readiness-warning state is gone; the unread steps are DEBT #13.
- Nits 1-3 fixed. Stale FEATURES.md lines corrected; the soft-gating notes now say the menu locks
  THE WORLD and THE EXAM.
- Checks at the merge: pytest 1903 passed with the known Linux-only conjugation-index failure (passes
  on Windows); lint 0; build OK; test:ui 1979 of 1981 with two runtime tests timing out under load
  and passing on rerun; a11y 7; main-process 211; arch_check and generate_ts_types OK. Reviewer
  (Opus) approved at dc45c18. Not run: Checks 7 and 8 (the app), so the wizard and wall were not
  seen in the running app.

## 2026-10-29 — Startup

**Scope:** Audit 11. Robbie chose "Startup (Recommended)" and ran `/crew-audit startup`.
- Covered:
  - `main.cjs` from module load to the window showing: the single-instance lock, the early bridge spawn, `whenReady`, the splash, the startup preload, the voice and tutor warmups, and the startup telemetry and budgets.
  - The bridge's first start and its first summary.
  - The renderer from first render to the home screen: the first-run gate, `loadSummary`, the `localStorage` loaders and the summary snapshot, and the loading, error and retry paths.
  - The setup wizard's first-run check and its exits.
  - Launch with Python, the bundled Python, fugashi or the database missing or broken.
- Out: bridge command semantics (audit 7), IPC sender checks (audit 8), setup downloads (audit 6), and import, export and backups (audit 10).

**Commit audited:** bf764f8 on main, tree clean.

**Method:**
- The Auditor read the source, the census and, at Reconcile, ARCHITECTURE §2 and §8, DEBT.md and AUDITS.md. It ran nothing and used no helpers.
- The lead ran Checks 4, 5, 6 and 9 at bf764f8 and supplied the raw results. Check 9: 190 main-process tests passed.
- Not run: Checks 1, 2, 3, 7 and 8, which need interactive app launches.
- Report and census: `Z:/Projects/JPLearn/audits/AUDIT-startup-2026-10-29-1-r2.md`, `census-startup-2026-10-28-1.txt`.

### Where each finding went
- F1, a failed backend shown as "nothing due" (P1): reported.
- F2, the setup wizard cannot be left when the backend has failed (P2): reported.
- F3, the tutor model loads on every launch, including with the chat off (P2): reported. Check 6 showed the only warmup that honoured the setting was removed in 6a9e82d.
- F4, the splash waits on the preload with no overall limit (P3): reported; debt row drafted.
- F5, XP, recommendations and path status fetched twice by the renderer (P3): reported; debt row drafted.
- F6, the first-summary budget measures neither the summary nor the visible window (P3): reported.
- F7, first run decided by the downloads folder alone (P3): reported.
- Nits 1 to 4: reported.
- Asked of Robbie:
  - Q1, audit 7 F3's four kept preload reads. Check 5 found no recorded reason.
  - Q2, whether the tutor should warm up at launch. Check 6 narrowed it but did not settle it.
- STALE RECORD:
  - the tutor comment at `App.tsx:1144-1145` (rewritten by the repairs);
  - the `App.tsx` line counts in `electron.instructions.md:21` and `electron-frontend/CLAUDE.md:12`.
- RECORDED:
  - ARCH §8 B3, whose scope has grown into startup;
  - ARCH §8 B1;
  - DEBT #4, whose trigger metric is the one F6 describes;
  - DEBT #3.
- Dropped: none.

### Outcome (branch `audit11-repairs`, merged fde578b, pushed 2026-10-29)
- Robbie's answers: Q2 "Only if chat is on"; Q1 "Keep them, reuse results"; F1 "Plain error +
  Retry"; F7 "Setup yes, onboarding no". A design critic (Astra) required M1-M6, all taken.
- F1 fixed (22537af, 45de19f): with no summary since launch, the home hero reads "JPLearn couldn't
  start its study engine.", the reason and a Retry; a Retry that works reloads the home data and the
  progression map; a stored snapshot is not shown as current meanwhile.
- F2 fixed (690e4e3, 22537af): the setup wizard's exits write the first-run marker first and mark
  onboarding on the worker only, with a 10 s limit; a failure is shown on the wizard.
- F3 fixed (690e4e3, 22537af, 45de19f): no tutor warmup at launch or after setup; the window asks
  for one only while the tutor chat is on (and on switching it on), and the warmup still reads back
  the saved chat history. A model installed by setup is warmed only if the window had asked.
- F4 fixed (690e4e3, 45de19f): one 30 s deadline for the whole splash; telemetry keeps the finished
  tasks' timings when it fires.
- F5 and Q1 fixed (690e4e3, 22537af, 45de19f): the read cache moved to `bridge_read_cache.cjs` with
  per-command generations, so a read begun before a clear never lands; XP, recommendations and path
  status are held 15 s and reused from the startup preload; the renderer fetches them once at launch;
  progression, feature-unlock and milestone reads, which save, clear them. Review found no write that
  changes them without clearing.
- F6 filed as DEBT #10. F7 fixed (690e4e3): a finished onboarding is never reset, and saved
  schedules or reviews mark a learner as onboarded (`data.database.has_study_history`).
- Nits: 2 (`python_command.cjs`), 3 (snapshot parsed once) fixed; 4 kept on purpose (the tutor
  snapshot fetch saves tutor state, critic M6). The PRACTICE and STUDY rows under the failure hero
  filed as DEBT #11.
- Review (5X Opus Reviewer, two rounds, approved at 45de19f): Retry left the progression map empty,
  and a narrow cache clear stopped every other read from caching; both fixed.
- Checks: full pytest 1,904 passed; vitest 147 files, 1,957 tests; lint and build clean. A flaky
  Daily Games test's lazy-view wait was raised to 5 s. Not tried in the running app.

### Triggers checked
- DEBT #4: not checked (Check 2 not run). Its first-summary figure under-measures (F6).
- DEBT #3: not timed.
- ARCH §8 B3: still open, and it now reaches the startup path.

### Inspected and found sound — do not re-derive these
- The single-instance lock is taken after the user-data folder is fixed and before the bridge spawn.
- The early spawn happens after the folders are set and is skipped on Squirrel runs.
- The renderer's first summary and the hiragana and katakana warmup reuse the preload's cached reads.
- The voice warmup runs beside the bridge tasks, with its own budget.
- Speech recognition and OCR start only when first used.
- The `localStorage` loaders fall back to defaults; the snapshot is checked for age and shape; a top-level ErrorBoundary is present.
- The startup theme file falls back to the default.
- A corrupt database gets a code 2 reply and does not end the worker.
- Expertise seeding never overwrites a card that has history.
- Telemetry writes are best-effort.
- The main-process tests passed at bf764f8 (190).

### What this pass could not establish
- Every check that needs a launch: what the screens look like, startup timings, the tutor's memory use, which window a second launch brings forward, and electron-store's handling of a corrupt config.
- A realistic bridge hang longer than 30 s.
- No test reaches the setup wizard, `setup:complete` or `setup:skip`, a failed summary, or `createWindowWithSplash`.

### Coverage, not a finding
- The last three passes (import and export, answer checking, IPC) did not cover tutor and assistant, JLPT, minigames and Daily Games, dictionary, lookup and OCR, the menu and valley, renderer state and settings, progression and onboarding, reading passages, handwriting, or packaging and updates.
- No pass so far has covered any of those ten systems.

## 2026-10-28 — Import, export and backups

**Scope:** Audit 10. Robbie ran `/crew-audit` with no target and chose "Import, export, backups
(Recommended)" over startup, progression and onboarding, and renderer state. Covered: data/ and
scripts/deck_portability.py; the analytics export, import and legacy-score bridge commands and IPC
routes; the Settings Backup & Restore section; every copy of jplearn.db (topic-deck migration backup,
legacy-location copy, packaged copies). Out: IPC sender checks (audit 8), uninstall (audit 6), each
schema migration's own correctness.
**Commit audited:** 3f87340 on main, clean.
**Method:** The Auditor read source, history, the census and directory listings, and ran nothing; no
helpers. The lead ran Checks 1-6, 8 and 9 at 3f87340 on scratch folders (Check 2 read-only on the
packaged copy); Check 7 not run. Check 10: `gh release list` shows no published app release (only the
valley-models asset release), so no public installer carried the database. Report and census:
`Z:/Projects/JPLearn/audits/AUDIT-import-export-and-backups-2026-10-28-1(-r2).md`.

### Where each finding went
- F1 local installers (2026-09-07) ship the repo's jplearn.db (112 schedules, 15,406 reviews) and
  app.db, and a first launch with no live database adopts it; from source the same happens with the
  repo copy (P1, Checks 1-3): reported.
- F2 merge import lets an older backup overwrite schedules, stages, problem-card records and counters;
  version 1 files zero FSRS stability (P1, Check 4): reported; merge policy asked of Robbie (Q1).
- F3 the "full backup" omits notes, study streak, XP, unlocks, badges, JLPT results, conversation
  cards, tutor history and settings; issue #8 asked for a whole-database backup (P1): reported.
- F4 study rows are not validated; a bad date is stored and the deck then fails to load (P2, Check 5): reported.
- F5 every import failure shows only "Import failed." (P2): reported.
- F6 pre-#78 backups restore onto topic-deck names (P3, Check 6): reported; debt row drafted.
- F7 no copy before schema upgrades (P3): reported, as Robbie's design call.
- Nits 1-4: reported.
- Stale: ARCHITECTURE §3 schema version 20 vs 21; the "everything" comments; issue #8's "Implemented".

### Outcome (branch `audit10-repairs`, merged bb43943, pushed 2026-10-28)
- F1 fixed (e538f20): packaging strips every `*.db` file and `data/backups`; the repo-relative
  legacy copy is no longer a candidate, so nothing is adopted on a first launch.
- F7 fixed (c326cd1): a safety copy before a schema upgrade, import or restore, newest 3 kept
  (`data/db_backups.py`); a failed copy blocks an import or restore, not an upgrade.
- F2, F4, F5, F6 fixed (388e6df, Robbie: "Further-along wins"): per card the further-along schedule
  wins; rows are validated before any write; damaged and newer files are refused by name; pre-#78
  topic-deck rows are remapped to their level decks. Import asks first, with a summary.
- F3 fixed (214e1f3, 7bb5767, f0a79ca; Robbie: "Add a whole-database backup", "Include them"):
  "Back up everything" / "Restore from a backup" copy the whole database plus four allowlisted
  window keys. Import, backup, restore and the scheduling optimizer refuse to run over each other.
- Nits 3 and 4 fixed: files are written whole or not at all; export waits for queued answers.
- Stale docs fixed (8ff3c5c). Issue #8 not yet updated.
- Review (5X Opus Reviewer, two rounds, approve with nits at 94453ba) found a successful import shown
  as "Import failed." (the bridge nests counts under `imported`), and database jobs bound by the
  worker's 30 s timeout; both fixed in 94453ba, with pruning that could drop the copy just made.
- Accepted: undoing a restore from its safety copy brings the database back but not the four window
  keys (the copy holds only the database). Reads queued behind a long database job still time out at
  30 s and fall back to one-shot processes, as before this branch.
- Checks: full pytest 1,898 passed locally (Linux VM: 1,886 passed, 1 failed in
  `test_conjugation_index` with fugashi 1.5.2 against the local 1.3.0; requirements.txt does
  not pin fugashi; unrelated to this branch); vitest 1,925
  passed; lint and build clean. Not tried in the running app.

### Triggers checked
- DEBT #3: not fired (merge of 107,842 events 0.65 s, Check 8, without the bridge).
- DEBT #6: unchanged; relevant to F6.

### Inspected and found sound — do not re-derive these
- Import is one transaction with full rollback; versions 1-2 read, newer refused before writes.
- Event merge removes duplicates and is idempotent; topic counters map to parents; Daily Games are validated first.
- The import path comes only from the main-process dialog; import is worker-only after the answer queue; export is uncached.
- Export and import take well under 1 s at 100,000+ events.
- Legacy counter adoption only into an empty table; a reset clears the snapshot.
- The topic-deck migration plans, backs up, writes update before delete, and keeps orphans.

### What this pass could not establish
- Whose data the repo database holds; the screens affected
  by F4; counter rollback (Check 4b); the UI's look.
- From source, a new JPLEARN_DOCUMENTS_DIR receives a copy of the repo's data/jplearn.db (Check 3),
  so earlier "empty scratch database" measurements may not have been empty.

### Coverage, not a finding
- None of the last three passes covered tutor, JLPT, minigames/daily games, dictionary/OCR,
  menu/valley, renderer state, progression, passages, handwriting, packaging or startup.

## 2026-10-28 — Answer checking and grading

**Scope:** Audit 9. Robbie ran `/crew-audit` with no target and chose "Answer checking (Recommended)"
over startup, import/export and backups, and renderer state. Covered: domain/answer_check.py,
domain/conjugation.py, features/round/, and everything that decides right/wrong and the grade, up
to the bridge's record_game_result. Not covered: scheduling, mastery and the queue (audits 1, 3
and 4), Daily Games grading, the tutor, passages.
**Commit audited:** 3649b63 on main, clean.
**Method:** The Auditor read only; no helpers; one follow-up with check results (report r2). The
lead ran checks 1-4, 6-10 at 3649b63 in the main checkout (one temp vitest file, recycled): check 3
fed Windows-voice English clips straight to scripts/speech_recognition_server.py (fast tier, CUDA),
not through the app. Check 5 is deferred to the F3 repair; check 11 (real voice in the app) not
run. Report and census: `Z:/Projects/JPLearn/audits/AUDIT-answer-checking-and-grading-2026-10-28-1(-r2).md`.

### Where each finding went
Repairs merged at 927c38c (branch audit9-repairs). Robbie's rulings: a one-kana slip is "Wrong,
shown as close"; an answer after the hint's full reveal is wrong, and the clue step hides anything
the grader would accept; English typo tolerance only from 4 letters; keep "· counts as a miss".
- F1 near-miss passed a wrong kana or word in Dictation and Speech Recall (P1, check 1): fixed in
  16b60eb. Japanese answers are graded exactly after a kana fold; one kana off is a new "close"
  outcome, saved as wrong with the right spelling shown.
- F3 nine kanji readings no romaji could match (P1, check 4): fixed by the lead in d17f140 and
  521d74e. New readings avoid every keep-first collision; regeneration changed exactly those nine
  fields (check 5), so no card id moved. New test: every kanji card has a plain romaji reading.
- F2 Speech Recall accepted the displayed Japanese word (P2): fixed in 16b60eb and ce455a8; it
  grades the English meanings only and transcribes in English (allowlist ja + en, 74c9665).
- F8 Dictation marked a loanword's long-vowel spelling wrong (P2, check 2): fixed in 16b60eb by the
  same fold (katakana to hiragana, ー to the previous vowel, う after an o-row kana as お; the last
  is deliberate, since Dictation grades what is heard).
- F4 a revealed hint answer saved as correct (P2): fixed in 16b60eb and c54d7ef; hintStep reaches
  submitAnswer, and lib/hintClue.ts keeps accepted answers (including romaji spellings, ce455a8)
  out of the clue step.
- F5 the drill asked the "can do" form of "to exist" (ある) (P2): fixed in 16b60eb.
- F6 Romaji Sprint took one spelling for ぢ, づ, を (P3): fixed in 41b0e6a (ji/di, zu/du, o/wo).
  Built-in card-note keys hash the reading; the live database holds no card notes, so none moved.
- N1 Speech Recall graded twice: fixed (one grader). N2 the Python grader: kept as a test-only
  mirror with a case table shared with the TypeScript tests.
- Typed Recall tolerance on short English words: Robbie chose 4+ letters; fixed in 16b60eb.
- Stale records fixed: audit profile, repo-map, .opencode/agents/domain.md and FEATURES.md:40-41.
- Dropped: Sentence Assembly duplicate chunks (check 7: 0 of 152); a double-submit race (no
  interleaving found).
- Known limits, not fixed: Speech Recall on the kana decks grades the romaji in English mode, so a
  spoken を may transcribe as "Oh" and fail (not run with a real voice); a clue gloss written with
  macrons ("tōfu") or a near-spelling ("sumo") can still guide the learner to the answer.
- Checks at 927c38c's branch tip: lint and build clean; vitest 1,888 passed; pytest 1,848 passed.
  Not run in the app.

### Triggers checked
- DEBT #5: fired by the F3 repair and handled as the row asks (regeneration diff limited to the
  nine fields; check 5).

### Inspected and found sound — do not re-derive these
- One review write path, one transaction; the flag is boolean-validated, sent as '1' or '0',
  parsed strictly, and part of the replay fingerprint.
- Conjugation Drill exact grading; the conjugation tables are correct apart from F5.
- The Python and TypeScript typed-answer rules agree; the JLPT exam grades once per question.
- Sentence Assembly content gives no duplicate chunks today (check 7; kana templates read).

### What this pass could not establish
- Speech Recall with a real voice and the larger models; how often hints are used.

### Coverage, not a finding
- None of the last three passes covered tutor, JLPT, minigames/daily games, dictionary/OCR,
  menu/valley, renderer state, progression, passages, handwriting, import/export, packaging.

## 2026-10-28 — IPC and the trust boundary

**Scope:** Audit 8. Robbie ran `/crew-audit` with no target and chose "IPC and trust boundary
(Recommended)" over answer checking, import/export, and startup. Covered: every `ipcMain.handle`
route (130; no `ipcMain.on`), every validator in `ipc_security.cjs`, the preload surface, window
settings, navigation, window-open, permissions and the content security policy in `main.cjs` and
`index.html`, and payloads followed into the voice, tutor and setup runtimes and the bridge
handlers. Out: bridge internals (audit 7), runtime lifecycles (audit 5), setup installs (audit 6).
**Commit audited:** a7f4c8f on main, tree clean.
**Method:** The Auditor (5X was out; it ran on 20X) read source, the census and the records census,
and ran nothing; no helpers. The lead ran Checks 1 and 3-5 at a7f4c8f (Check 1 one-shot with a
scratch documents folder, the offline dictionary read from the default assets folder). Not run:
Check 2 (dragging a file onto the built app). Reports:
`AUDIT-ipc-and-the-trust-boundary-2026-10-28-1(-r2).md`.

### Where each finding went
Repairs on branch audit8-repairs (merged 8894550). F1-F3, the nits and the records by the lead
(security); F4 and the developer-tool gating by a 5X feature-coding worker, merged and finished by
the lead. Reviewed by a 5X Opus reviewer: changes requested (the titlebar's Developer Tools menu
still showed), fixed, then approve with nits, fixed.
- F1 the production sender and navigation check accepted any `file:` URL (P3): fixed. Only the app's
  own page passes (`appPageUrl` = `pathToFileURL(dist/index.html)`), any query or hash, path compared
  without case and with each valid %XX run decoded on its own, so a bare '%' in a folder name works.
  Known limit: a folder named like an escape ("%41") is ambiguous. Checked live: moving the window to
  another local file was blocked.
- F2 no permission handlers (P3): fixed. Request and check handlers grant only the microphone (audio
  only), fullscreen, clipboard read and sanitized write, and only to the app page. Checked live on the
  final build (DevTools protocol, launch gate): microphone and getUserMedia audio granted; camera,
  geolocation and notifications denied; getUserMedia video refused; clipboard write/read and
  fullscreen work. Not checked in a packaged installer.
- F3 dictionary search unbounded (P3): fixed. Cut at 200 characters (Robbie's choice over the
  recommended 64), counted by character; session ids bounded (128, no control characters; the tutor
  chat context drops an unusable one); grammar sentences over 1,000 refused. Live: a 5,000-character
  search returned a 200-character query. Assistant metadata went with its route (F4).
- F4 ten preload methods with no caller (P3): fixed. Robbie chose "Remove them": the ten methods, their
  routes, `debug:reload-fonts`, their types, two orphaned validators and the voice runtime's
  `listVoices` removed; the Python commands stay. FEATURES.md marks tutor reactions, word of the day
  and the daily goal as backend only.
- Developer commands in released builds (asked): Robbie chose "Hide in installed app". `ui:inspect-
  element` and `debug:*` refuse when `isPackaged` (main.cjs passes `app.isPackaged`; without it the app
  counts as installed); the palette, the Developer Dashboard and the titlebar's Developer Tools submenu
  are hidden until the main process says it is running from source. Not checked in a packaged
  installer.
- Nit 1 (hand-listed sender-guard test): fixed; every handler's first statement is checked (120
  routes), and the test fails when one guard is removed. Nit 2 (dev server in the production CSP):
  fixed; the build strips it and fails if the policy no longer lists it.
- STALE RECORD: fixed. ARCH §8 E2 struck (#72; 174 main-process tests), §7 and §9 item 9 corrected,
  §2 point 3 says where validation lives, known-answers no longer lists E2.
- Dropped: drop-to-navigate as a live path (Check 2 not run; the navigation guard now refuses any
  other page anyway); `setup:download-speech-model` options; JLPT result integers.
- Checks on the merged code: lint clean; build OK; vitest 1823 passed (electron suite 176). The tool
  layer turned typed backslash escapes into raw characters twice during the repairs; both were
  caught and rewritten without escapes, and no file changed in audits 7-8 holds a control character.

### Triggers checked
- No DEBT entry concerns IPC; none checked.

### Inspected and found sound — do not re-derive these
- All 130 routes call `assertTrustedIpcSender` first; the splash window can never pass it.
- Window isolation settings, window-open denied, `will-navigate` guarded, content security policy
  without inline or eval script, no HTML rendered from data, no `shell.openExternal`, protocol
  handlers or webview.
- No route carries a renderer-chosen path, argv, URL or bridge command; temp files are named by
  main; import and export paths come from OS dialogs.
- Tiers, speakers, adapters and themes are allowlisted or normalised; voice text capped at 400.
- Main-to-renderer channels carry nothing sensitive; deck-slug allowlist parity is tested.

### What this pass could not establish
- Drop navigation in the built app; the worker-side cost of a long query; packaged menu
  accelerators; other worktrees.

### Coverage, not a finding
- None of the last three passes (bridge, setup, runtimes) covered startup beyond the bridge, the
  tutor, JLPT, minigames, dictionary/OCR content, the menu, renderer state, answer checking,
  progression, passages, handwriting or packaging.

## 2026-10-28 — The Python bridge

**Scope:** Audit 7. Robbie ran `/crew-audit` with no target and chose "The Python bridge
(Recommended)" over the IPC trust boundary, answer checking, and import/export.
Covered: bridge_worker.cjs; the bridge start-up, preload and first summary in main.cjs; the
worker, fallback and isolated runners; the 73 commands in desktop_bridge.py and their IPC routes;
the payload dataclasses and generate_ts_types.py; the open items (command counts in the docs,
DEBT #8). Out: answer queue internals (audit 1), dedicated runtimes (audit 5), setup routes
(audit 6).
**Commit audited:** 324cded on main, tree clean.
**Method:** The Auditor (5X was out; it ran on 20X) read source, the census and records census,
and the app's telemetry in AppData (older builds), and ran nothing. Two Explore helpers (payload
types; per-command cost table), their claims re-read. Known-answers Part 2 was seen at Orient by
accident. The lead ran Checks 1, 2, 4-7, 10 and 11 at 324cded (scratch documents folder; the live
database opened read-only for Check 4). The lead's own shell sets
`PYTHONIOENCODING=utf-8:surrogateescape`, which hid F1 until it was cleared. Not run: Check 3
(packaged runtime), 8 and 9 (they launch the app). Reports: `AUDIT-the-python-bridge-2026-10-28-1(-r2).md`.

### Where each finding went
Repairs on branch audit7-repairs (edb51c9, 4bf6108, 5cc60ba; merged 33dd492), implemented by the
lead (a Codex coding worker for F5 was refused by its sandbox before reading anything); reviewed by
an Astra reviewer (5X was out): approve with nits, both fixed.
- F1 bridge stdin decoded as cp1252 (P0, confirmed by Check 2; Check 4 found no card notes, so
  nothing was damaged): fixed. The bridge, ocr_server.py and speech_recognition_server.py reconfigure
  stdin to UTF-8; a reply UTF-8 cannot carry is written as escaped JSON instead of ending the worker.
  Tests: a real pipe with PYTHONIOENCODING/PYTHONUTF8 removed (fails without the fix), and a
  surrogate echo through `_run_server` (fails without the reply fix). The same real-pipe probe now
  answers kanji-detail 日, dictionary-search たべる and xp-progress.
- F5 deck-cards vocab_n5 2.46 s warm on the shared worker (P1): fixed. `_heavy_deck_enrichment`
  caches each heavy deck's dictionary summaries and distractor ids per process, keyed on
  `dictionary_cache_key()` (path, size, mtime_ns; setup replaces the file from another process) and
  a fingerprint of the deck's cards; leech and curriculum stage are read every call. Warm repeat
  0.037 s; the first open per run still costs about 2.5 s.
- F2 non-answer writes re-run in a one-shot after any worker failure (P2): fixed. A worker refusal
  (`isWorkerRefusal`, bridge_worker.cjs) is not replayed, by policy; a transient refusal such as a
  locked database now reaches the caller. Daily Games attempts, JLPT results, assistant event
  tracking and the FSRS weight reload/reset run worker-only (nit 2 with it).
- F4 no single-instance lock (P2): fixed. Robbie chose "Show the open window": the lock is taken
  before the module-load bridge spawn, a losing launch exits 0, and the running window is restored,
  shown and focused. Checked under the launch gate (scratch documents and user-data folders): the
  second launch exited 0 and one bridge ran. Whether the window visibly came forward was not looked at.
- F3 startup preload discards five reads (P3): tutor-reactions removed from the preload (nothing
  reads it); the other four left, since they warm Python caches.
- F7 Daily Games state loads every attempt ever played (P3): DEBT #9.
- Nits: 1 fixed (tray due count uses the cached summary); 2 fixed with F2; 4 fixed (electron.d.ts
  imports the generated StudyQueuePayload); 3 (dev-tools commands on the worker) and 5 (one-shots
  untracked at quit) left: dev-only or rare.
- STALE RECORD: fixed in CLAUDE.md (command count, "bridge worker pool"), ARCHITECTURE.md (diagram,
  §2 transport and fallback, the "67 branches" note, B1, E3, roadmap item 2) and DEBT #8 (30 s
  allowance; 12 s is the cache lifetime).
- Dropped: the quadratic stdout parser (refuted by Check 10).
- Checks on the merged code: pytest 1829 passed; arch_check OK; lint clean; build OK; vitest 1806,
  one failure on the first run that passed on rerun (not identified; likely the known flaky test).

### Triggers checked
- DEBT #4: warm summary 0.284 s on a nearly empty database, so not fired; the first-summary half
  was not checked.
- DEBT #8: not measured in the app; F5's 2.46 s call is a way it fires.
- DEBT #3: unchanged, not timed. DEBT #1: not checked.

### Inspected and found sound — do not re-derive these
- Single-flight worker start; per-child buffers, stderr and pending; late close/error isolation;
  stdin EPIPE listener; a write that throws rejects only its request.
- Junk stdout lines skipped; no command path prints to stdout.
- A timeout rejects only its own request; the three-in-a-row restart counts only the current child.
- Worker stopped at quit after the answers guard; the Python loop ends on stdin EOF.
- The worker spawns after the documents and assets folders are set; skipped on Squirrel runs.
- The Python envelope turns handler exceptions into code 2 (except the reply write, F1).
- Answers and the four long writes are worker-only.
- 30 plain-dict payloads match their TypeScript types; generate_ts_types --check passes.
- The stdout parser is linear (Check 10). buildQueueCycle maps by card id.

### What this pass could not establish
- The packaged runtime's stdin (Check 3); startup preload timing in the built app (Check 8);
  two-instance behaviour (Check 9); timings on a database with real history; what each screen
  shows when a read and its one-shot both fail.

### Coverage, not a finding
- None of the last three passes (setup, runtimes, study session) covered IPC, startup beyond the
  bridge, the tutor, JLPT, minigames, dictionary/OCR content, the menu, renderer state, answer
  checking, progression, passages, handwriting or packaging.

## 2026-10-28 — Setup and downloads (offline, #36)

**Scope:** Audit 6, Robbie's choice "Setup and downloads (offline, #36)": setup_runtime.cjs, the
get_*.py downloaders and hf_download.py, fetch-models.cjs, the setup IPC routes and the screens that
drive them, installed-state reporting, download integrity, cancellation, timeouts, where files land
and how uninstall removes them, every outbound path including updater.cjs, and whether OCR downloads
weights by itself (flagged by audit 5). Offered and declined: IPC trust boundary, the Python bridge,
the whole repository. Out: runtime lifecycle after install (audit 5), tutor behaviour, packaging
except models.
**Commit audited:** 4869f29 on main, tree clean.
**Method:**
- Read: setup_runtime.cjs, the setup routes in ipc_handlers.cjs, ocr_runtime.cjs, updater.cjs, the
  uninstall hooks in main.cjs, every get_*.py, hf_download.py, uninstall_cleanup.ps1,
  fetch-models.cjs, the wizard and Settings model screens, installed paddlex 3.7.2 and CPython 3.11
  sources, the census and the records. No helpers.
- The lead ran, at 4869f29 in the main checkout:
  - a Node stub probe: a plain getSystemInfo({}) contacts proof.ovh.net and huggingface.co
    (22 calls) and returns in 2,246 ms with the network stubbed;
  - the three GPU-detection spawns timed: about 1.4–1.7 s per call;
  - a Python short-read stub: hf_download keeps a 400-of-1,000-byte file with no error;
  - read-only listings: no partials or zips in JPLearn Assets; the OCR weights are in
    ~/.paddlex/official_models (about 310 MB, of which about 140 MB is used);
  - gh issue view 36 (no ruling on OCR fetch-at-use or the speed test); gh issue list for
    uninstall (none);
  - vitest electron/setup_runtime.test.ts: 7 passed.
- Not run: the tutor-uninstall-while-loaded check (needs a launch-gated app with a tutor model).

### Where each finding went
Repairs on branch audit6-repairs, implemented by the lead (networking, file installs and deletes,
concurrency), reviewed by an Astra reviewer over five rounds (5X was out); Robbie approved rounds
four and five.
- F1 every launch contacts proof.ovh.net and huggingface.co (P1, confirmed): fixed. A non-waiting
  install-state read starts no network work (`createDeferredValue.get(false)` starts nothing).
  Robbie asked for "our own" speed test and chose "Time the real host": the wizard alone times a
  4 MB range read of a tutor model from Hugging Face. A test fails if a plain read contacts any
  non-loopback host.
- F2 uninstall leaves JPLearn Assets; the dialog points at Documents (P1): fixed. Robbie chose
  "Separate the two": a downloads list (tutor; voice; speech; OCR, translation, tools, fonts) and
  "Keep learning progress", all kept by default; Enter now means Keep Everything, and removal goes
  to the Recycle Bin. The lead labelled progress without "and settings": settings are not in that
  folder. Review rounds hardened it: an item never removes what a kept item owns inside its folder,
  the item naming a path wins over a kept folder around it, and nothing reached through a junction
  or symbolic link is followed or removed (probed under PowerShell 5.1 on scratch trees, five
  selections, a decoy file behind a junction into progress). Tutor and translation uninstall remove
  `.tmp`, `.partN` and the hf CLI bookkeeping; get_llama_cpp.py deletes its zips. The uninstall hook
  itself still has no automated test (the probe moves files to the Recycle Bin, so it is not in the
  suite).
- F6 synchronous PowerShell and pip on the main process (P1, measured): fixed. GPU detection is one
  async PowerShell call cached per process; the hf CLI check is async with timeouts and never
  pip-installs (the Node downloader is the fallback).
- F3 Reapply translation deletes the model before downloading (P2): fixed. A forced reinstall
  downloads to `.tmp` over the working file; installed needs the GGUF as well as the marker.
- F4 partial llama.cpp and speech installs read as installed (P2): fixed. get_llama_cpp.py works in
  `Release.partial` and renames into place only when complete (also checks the byte count); a speech
  tier needs all four files; `--force` replaces them. Installs left incomplete by older builds
  (llama-server.exe present, CUDA runtime missing) are not detected.
- F5 stalled downloads hang setup, no cancel (P2): fixed for the hang: a 60 s idle timeout on Node
  downloads and a 30 s socket timeout on every urlopen. No cancel button this round (the lead's call;
  it is something Robbie would see).
- F7 OCR weights in ~/.paddlex; cold cache downloads at use (P2): fixed. Robbie chose "No, offline
  only" (asked first how big they are: about 310 MB there, about 140 MB used). `scripts/ocr_model_cache.py`
  points PaddleX's cache at `ocr/paddlex` in the assets folder, copies old weights across rather than
  downloading, refuses to download in use (source check off, no model hosts) with or without an
  assets folder, and fails with "Reinstall OCR from Settings" when weights are missing; installed
  checks the weights (or the old cache); uninstall removes them.
- F8 tutor uninstall deletes before unloading (P3): fixed. Both uninstall routes unload the tutor
  runtime first, and the llama-server stop now resolves on process exit (5 s cap), from review.
- F9 Python fallback accepts cut-short files (P3, confirmed): fixed rather than filed as debt. The
  sequential path compares bytes to Content-Length; the range worker requires 206 and retries an
  early close. Downloads are still not checked against a hash (Hugging Face publishes an LFS
  SHA-256 per file; not used yet).
- Nit 1 fonts read installed with files missing: fixed (any extraction failure fails the install;
  each weight's CSS is written last). Nit 2 unannounced pip install of nvidia-cublas: left. Nit 3
  duplicate concurrent llama.cpp download: fixed rather than filed (single-flight); review found the
  join lost the wizard's chosen backend, so the wizard now starts llama.cpp before the model.
- STALE RECORD: ARCHITECTURE.md §2 OCR notes and §8 B4, the ocr_runtime.cjs comment, and the
  downloader docstrings corrected.
- Dropped: none. No debt rows filed.

### Triggers checked
- No DEBT.md row covers setup or downloads. DEBT #4's startup-budget clause: not fired on evidence
  supplied; F6's measured block could produce it on its own. ARCH §8 B4's rule holds.

### Inspected and found sound — do not re-derive these
- fetch-models.cjs (SHA-256, idle timeout, partials outside public/).
- updater.cjs is a no-op by default (no repository in package.json).
- Renderer CSP and window.open deny; renderer fetches are bundled files.
- Install flags never wait on the network; probeUrl timer; VOICEVOX loopback probe.
- Speech server is local-folder only.
- Dictionary and embedder markers written last.
- Node GGUF .tmp + rename.
- Setup route tier allow-lists.
- hf_download timeouts and retries.
- OCR server lazy start.

### What this pass could not establish
- Windows delete-while-open for a loaded GGUF; pip duration offline; whether the first summary
  misses its budget at launch; bundled Python and paddlex versions. No test reaches any download,
  resume, extract or uninstall path.

### Coverage, not a finding
- None of the last three passes covered IPC, startup, tutor, JLPT, minigames, dictionary/OCR
  content, menu, renderer state, answer checking, progression, passages, handwriting or packaging.

## 2026-10-28 — Dedicated runtimes

**Scope:** Audit 5, Robbie's choice "Dedicated runtimes": the separate processes for the tutor model,
speech recognition, voice and OCR — how they start, queue requests, time out, unload and shut down,
and what the learner sees when one fails. Out: tutor behaviour and prompts, setup and downloads (#36),
the IPC trust boundary in general, startup, dictionary/OCR content.
**Commit audited:** 208e78e on main, tree clean.
**Method:**
- Read: the four `*_runtime.cjs` files, `ocr_server.py`, `speech_recognition_server.py`, their wiring
  in `main.cjs`, the IPC routes in `ipc_handlers.cjs`, `useTutor.ts`, and the OCR tests. No helpers.
- The verifier ran, at 208e78e in the main checkout:
  - vitest on the OCR, llm and IPC runtime-contract tests: 3 files, 68 passed;
  - a Node probe: the http `timeout` option does not abort a request;
  - Python: a missing executable raises `FileNotFoundError`; Robbie's machine has nvidia-smi;
  - `git log -S` and `gh issue list` for jisho: only 8296e87, no issues;
  - a cold Whisper load of the `fast` tier on CUDA: 12.25 s then 5.79 s;
  - `git log -S` for the runtime swap: 9c8fa09, 6663cbb.
- Not run: the OCR late-close test (it becomes the repair's failing-first test). Larger Whisper tiers
  and CPU were not measured because none is installed.

### Where each finding went
- F1 tutor translation questions go to jisho.org first (P1, hard line 2): Robbie chose "Offline
  only". Fixed: the online client, its 4.5 s race and the `unofficial-jisho-api` dependency are
  removed; translations come from the offline dictionary, and a test fails if the client comes back.
  (Corrected by audit 14: the dictionary is installed from Settings, not bundled, and until audit 14
  F3 the tutor read an index file that does not exist, so it never answered.)
- F2 IPC routes keep the old tutor runtime after setup (P1): fixed. The routes call
  `getLocalTutorRuntime()` (main.cjs passes a getter); a contract test swaps the runtime.
- F3 tutor HTTP timeouts never fire (confirmed by the Node probe); crash not detected; unload timer
  armed when a request starts (P2): fixed. `httpRequestJson` destroys a request past its timeout;
  an inference timeout stops llama-server; an exit listener and `isRunning()` reload a dead server
  on the next message; the unload timer is held off while a lease is held and armed when it is
  released. The review found the exit listener hid a server dying during start (a 120 s hang):
  `waitForHealth` now watches the process it started, a server that never becomes ready is
  stopped, and preload clears an earlier timer. Cancel before inference reports "cancelled" (nit 1).
- F4 speech recognition fails without nvidia-smi (P2; not Robbie's machine): fixed; `OSError`
  from running it means CPU.
- F5 speech runtime follows none of the §2 rules (P2; the `fast` tier's cold load fits the 20 s
  budget): fixed. Rebuilt in `ocr_runtime.cjs`'s shape: queue, kill on timeout, 20 s warm and
  3 min cold budgets, 5 min idle unload, close and error settle only their own request. First
  test file for it (8 cases).
- F6 OCR queued request rejected by a late close (P3): fixed; requests carry their process and
  the stderr tail resets per spawn. Debt row not filed.
- F7 a model loaded for crossword clues is never unloaded (P3): fixed with F3 (every lease arms
  the unload).
- F8 choosing a speech model does not restart the server (P3): fixed. Selecting restarts it;
  uninstalling stops it and waits for it to close before deleting.
- Nit 2: one `resolvePythonCommand` (`electron/python_command.cjs`) and one `SPEECH_TIERS`.
- STALE RECORD: jplearn-backend-invariants SKILL.md:28-32 (all four runtimes "share" the rules):
  fixed, naming `ocr_runtime.cjs` and `speech_runtime.cjs` as the templates; its card-id line now
  names `tests/test_deck_id_uniqueness.py`.
- Left, from the review: with `JPLEARN_LLAMA_SERVER_PORT` set (dev only), a respawn can lose the
  port race; a speech clip queued while an uninstall waits for the process to close could start a
  server on the tier being deleted.
- Dropped: none.

### Triggers checked
- No DEBT.md row covers the runtimes. ARCH §8 B1 is unchanged by this scope.

### Inspected and found sound — do not re-derive these
- ocr_runtime.cjs: queue, kill on timeout, cold/warm budgets, unload only once nothing is in flight,
  stdin error listener, setup refresh.
- ocr_server.py never dies on a request.
- Temp image and audio files are deleted in `finally`.
- Voice runtime: HTTP timeouts destroy the request, loopback host, process-tree kill of a VOICEVOX it
  started.
- llama-server bound to 127.0.0.1 and limited to one instance, stopped on exit.
- before-quit unloads all four runtimes after the unsaved-answers guard.

### What this pass could not establish
- Cold-load times for tiers other than `fast`, for CPU, and for the GGUF models; the speech
  minigame's error display; OCR's possible weight download on first load (for the setup/offline
  audit).

### Coverage, not a finding
- None of the last three passes covered setup and offline, IPC, startup, tutor, JLPT, minigames,
  dictionary/OCR, menu, renderer state, answer checking, progression, passages, handwriting or
  packaging.

## 2026-10-27 — Study session and queue

**Scope:** Audit 4, Robbie's words: "the study session and its queue: how a session is built, how
cards are ordered and served, and what is saved when it ends". Queue building (`queue_builder.py`,
bridge `study-queue`), `domain/session.py`, `features/study-session/`, App's queue, deck and block
caches, block selection and the session starts; hand-offs to the Up Next preview, the Ledger's
Sessions sheet and the tutor's session summary. Left out: tutor, minigames, JLPT queues, answer
checking internals, mastery and counting rules (audit 3).
**Commit audited:** 293bcae on main, clean tree.
**Method:** The Auditor read source, history (blame) and the census and ran nothing; no helpers.
Known-answers Part 2 was seen at Orient by accident. The lead ran Checks 4-6 at 293bcae: a
read-only query on the live database (one smoke-test session, no real ones), pytest on the queue
and session-goal tests (13 passed), and `git log -S` for the preview and the block cache. Checks 1
and 2 (renderer tests) were not run, because team worktrees have no node_modules; they become
failing-first regression tests in the repairs. Check 3 (study-queue timing in the built app under
the launch gate) was not run.

### Where each finding went
- F1 App keeps each deck's block list for the whole run; starting a block unlocked during the run
  saves an empty selection, so sessions study the whole deck, across restarts (P1): fixed. The deck
  is marked stale on each answer and its blocks re-read once the session ends; START THIS BLOCK
  checks against the deck screen's fresh blocks; `select` never saves for a block that does not
  survive the check. The review measured the first design's cost: re-reading `deck-cards` takes
  3.3-4.7 s warm for vocab_n5 (kanji 0.15-0.5 s), enough to push the next queue past 1.2 s. So
  only `block-progress` (6-15 ms) is re-read, and it now carries the deck's problem-card ids and
  grammar stages above 1, patched onto the cached cards (`withCardState`).
- F2 problem-card flags and grammar stages frozen at deck load for the run (P2): fixed with F1,
  from the same block-progress read; a pytest checks it agrees with `deck-cards`.
- F3 Ledger Sessions and 30-day accuracy multiplied by 100 (P2; since 1e1c4d25): fixed, and the
  review found the same bug in the menu's THIS WEEK panel (`statPanels.ts`), also fixed. Their test
  fixtures used fractions and now use whole numbers.
- F4 Up Next preview indexes the block, not the session's pool (P2): fixed (the hook remembers the
  pool its cycle was built from). The preview cannot be opened today: `queueOpen` in
  `MinigameView.tsx` is never set true. Whether it gets a button or goes is Robbie's call; left.
- F5 two "session goal met" rules; the tutor's cannot be met on kana blocks (P3; no real sessions
  to size it): Robbie chose "Answers given". One helper, `session_items_goal_met`, now decides it
  for the summary, the history and the devtools diagnostics; the tutor's context strings show
  answers given. Only the summary also applies an accuracy target, which the app never sets.
- F6 study queue over 1.2 s gives a silent random order (P2, plausible; Check 3 not run): measure
  first; filed as DEBT #8 with a timing trigger.
- F7 goal row written before a round is built; failed starts appear in history (P3): fixed; the
  goal is sent after the first round builds and awaited before it can be answered, so the first
  answer carries its session id (review). The wait has no timer of its own (the bridge's 30 s);
  normally milliseconds, left.
- F8 no session id means no end screen and an uncleared save (P3): drafted as debt; fixed with the
  session repairs instead. A session ended with no answers builds no report of zeros (review).
- Nits: unread save fields, unread `queueBucketCounts`, unreachable "+N more" and its style:
  removed. Old saves carrying the fields still resume (tests seed them).

### Triggers checked
- DEBT #4: not checked (needs startup telemetry).

### Inspected and found sound — do not re-derive these
- Queue buckets are disjoint and use `has_been_reviewed`; leech and miss ids limited to deck
  cards; the JLPT queues' fabricated-state test is not shared with the session queue. Queue and
  session-goal tests pass (13).
- Queue ids map to the session pool by id; queue caches cleared on every answer and save.
- Resume refuses saves without a deck slug and asks the goal only for the remaining rounds; there
  is no resume card list.
- Session-only leech focus matches Robbie's "only for that session".

### What this pass could not establish
- Study-queue latency under bridge load; F5 and F7 frequency (no real sessions in the live
  database); how often a mid-session round fails to build; whether a first answer can miss its
  session id; how the screens look.

### Coverage, not a finding
Four passes so far (scheduling; decks; mastery and counts; session and queue). None has covered:
runtimes, setup and offline, IPC, startup, tutor, JLPT queues, minigames, dictionary and OCR, the
menu, renderer state beyond the session, answer checking, progression beyond counts, passages,
handwriting, packaging.

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
