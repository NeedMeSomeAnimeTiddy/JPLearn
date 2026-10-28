# Audit ledger

One entry per `/crew-audit` pass, newest first, added by the lead. The method and the rules for an
entry are in `.claude/audit-profile.md` ("Ledger rules"). Reports themselves are not committed; they
are kept in `Z:/Projects/JPLearn/audits`.

<!-- New entries go directly below this line. -->

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
  removed; translations come from the bundled JMdict, and a test fails if the client comes back.
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
