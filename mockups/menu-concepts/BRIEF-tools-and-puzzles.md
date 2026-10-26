# BRIEF — the last old-language screens

Written 2026-10-26, revised the same day after a design critique. Covers the four daily puzzles, the
kanji detail panel, conversation practice (the scenario tutor) and the rest of the tutor pop-up
(chat with the tutor, image translation). Every one of them is still on `App.css`'s dark sepia
cassette panels.

Read first: `design-system/foundations/frame-contract.html`, `design-system/components/past-three.html`
(the sheet), `design-system/foundations/color.html`, `geometry.html`.

## Robbie's answers (2026-10-26)

- **Kanji detail** becomes a sheet over the dimmed scene, three columns: the character | readings and
  compounds | parts and stroke order. Not a side drawer.
- **Conversation practice** leaves the tutor pop-up and gets its own screen on the session sheet,
  started from The World's conversation lane (level three, `Scenes.tsx`, already built).
- **Chat with the tutor and image translation** are restyled in the same pass.
- **Mock first** for everything without a design (kanji, conversation, chat, image translation);
  he approves the mock before any of that is built. **The puzzles build now** — their design exists.

## Assumed (lead's calls)

- The puzzles follow `past-three.html` plate THREE in structure; its numbers are corrected below
  where the code disagrees with the drawing.
- **Where the critique found a taste call, current behaviour stays**: typing blitz keeps the reading
  and meaning visible; conversation English stays shown at every level; the puzzle result keeps
  Share; the crossword does not reveal correctness while you type. Changing any of these is Robbie's
  call, not this brief's.
- The mock is a new card, `design-system/components/tools.html`, on the real valley plates.

## Laws every screen here obeys (settled — do not reopen)

The frame contract (stage x 160–1120 / y 192–576, foot band for whole-set summaries; **sheets on the
lookup scrim are exempt from the stage's y range** — Every character stands at top 150, Look it up at
152) · **nothing scrolls**: what does not fit becomes a count on the edge it left over · square corners
· one skew angle, one hard shadow · colour law: gold = earned, vermilion = the one thing to press,
ink = not yet · labels English-led, Japanese as texture (Robbie does not read Japanese) · Escape goes
up exactly one level · digits 1–5/7 are contested by `App`, so a screen that binds a digit must
`stopPropagation` · **no copy shows a number the code cannot produce**.

---

# PART ONE — THE FOUR PUZZLES (build now)

## Structure

Each game component renders its **own** `<Round>` (`features/round/components/Round.tsx`), because
each one owns the state that drives both of its cells (`activeEntryId`, `foundTargetIds`,
`remainingSeconds`). `DailyGameSession` supplies the shared props — `head`, `cap`, `hints` base,
`onBack`, the ending — and wraps the `Round` in an element that keeps today's Escape/IME-composition
guard (`DailyGameSession.tsx:119-128`). A game's own Escape (word search cancelling a selection)
still wins over leaving.

**The App chrome goes.** `daily_games` renders bare, the way `jlpt_prep` does (`App.tsx:2884`): no CRT,
glitch corners, `hub-topbar`, `JPL-DLY-A`. `DailyGameView`'s loading, error and empty-pool states
stand on the sheet (an empty plate, the cap line saying what is happening, the slab offering the
retry or the way back). `App.routing.test.tsx` stops finding the view by `.daily-games-hub`.

**Back goes to the daily road** (menu level three, `menuPath.screen === 'daily'`), not level one.
Verify what `navigate('home', 'back')` lands on today and make it the road.

Build order, one commit each, suite green after each: shared plumbing + typing blitz → match pairs →
word search → crossword.

## Common to all four

- `head`: kicker `DAILY · PUZZLE 0n OF 04`, title = the road's own names from `features/menu/daily.ts`
  (クロスワード / 単語探し / 札合わせ / 早打ち) with the English name leading in the label sense the
  road already uses. Order as the road draws them.
- `cap`: `TODAY'S POOL · N WORDS` in daily mode; `PRACTICE · NOT COUNTED` in practice mode. No reset
  time — the payload has none.
- `run` chips: the puzzle's own progress and time; real maxima only (crossword ≤ 6 clues, word search
  ≤ 8 targets, match pairs 8–12 pairs, typing blitz ≤ 10 words). Typing blitz's time chip is the one
  that gets louder — vermilion under 10 s, like the exam's countdown.
- `foot`: the trail is the **order of completion**, `at` = number solved, each tick's colour the
  recorded outcome (gold correct, vermilion incorrect — e.g. a match-pairs word that was mismatched
  before it was paired). Pass `foot.note` (e.g. `12 WORDS`) so it never reads `ROUND 0n`.
- `hints`: the puzzle's real keys only.
- **Ending** = the round's ANSWERED state, replacing `GameResultsOverlay`'s modal (port its test to
  the new structure; retire the component): score in the run chips, missed words as slips in the
  work cell. Slabs: daily mode with misses → `REVIEW MISSED · n` (vermilion, existing
  `onReviewMissedWords`, with its loading and failure states); otherwise `BACK TO THE ROAD`. Share
  result stays as a second, calm action in `.rd-acts`. Practice and fallback runs get BACK only.
  `DailyGameSession`'s saving state and save-failed retry stand on the sheet.
- Fix `loadingGame` copy, which says "Preparing Match Pairs" for all four (`constants.ts:24`).

## Per puzzle

The ask cell's content box is **278 px** wide (322 minus `.rd-ask`'s 22 px side padding) and about
325 px tall; the work cell loses ~40 px of height to the slab.

| puzzle | ask cell | work cell |
| --- | --- | --- |
| Typing blitz | the current word at the round's character size, **reading and English meaning both visible, English first** (today's game accepts the typed reading) | the input field, then the last answers as slips: gold right, vermilion wrong with the right reading beside it |
| Match pairs | the Japanese tiles, **two columns of up to six** (~45 px tiles) | the meaning tiles, two columns of up to six; a made pair turns gold in both cells and stays in place; a wrong pair flashes vermilion once |
| Word search | the letter grid | the target list as slips — **English meaning leading** (from `pool.words[poolPosition]`), Japanese beside it; found = gold, struck; not yet = ink |
| Crossword | the grid | **every clue** (there are at most six, so nothing folds); a filled entry reads `FILLED` in ink — no live correctness; slab `CHECK 確認` calls `submit()`, and the `incomplete` message shows as a `RoundVerdict` |

**Board sizing**: cell = floor((278 − (n − 1) · gap) / n) with a **1 px gap**, which is 22 px at the
maximum 12 columns. No board-builder change, so the same seed still makes the same board. Add a unit
test that 12 columns gives ≥ 22 px inside 278. Raw romaji clipping inside a 22 px cell while an IME
is composing is accepted.

**Crossword keys** are what the code does: `←↑↓→ Move · ENTER Set · SPACE Fill · ESC Leave` (check
against `CrosswordGame.tsx:135-149` and use exactly what it binds).

## What must not change

Seeds, `recordAttempt`/outcomes, practice seeds, crossword clue enrichment, the Escape/IME guard,
the missed-words review hand-off. Behaviour tests stay and pass; tests asserting old class names or
DOM are rewritten to the new structure, never deleted to make the suite pass.

New tests: the crossword CHECK slab completes the puzzle; match pairs' two-column layout; a mismatched
word's tick is vermilion; Escape during IME composition does not leave; word search's first Escape
cancels the selection; practice mode shows no review slab; save failure retries; routing finds the
new root; cell-size formula.

**Deletion**: the old puzzle and daily-hub CSS (in `daily-games.css` and `App.css`) goes, by the
four-step recipe — grep every class for live uses in `.tsx`/`.ts` before deleting it, never a prefix
sweep.

Checks: `npm run lint` (0 warnings), `npm run build`, `npm run test:ui`, `npm run test:a11y`.

---

# PART TWO — THE MOCK (no app code)

A new card, `design-system/components/tools.html`, in the house style of `past-three.html`: each
plate a real 1280×720 composite on a real backdrop from `assets/` (The World has no plate of its own:
use `valley-reading.png`, the hot-spring town, and say so), with the numbers it is built from and a
short "why" note under it. `@dsCard` header with name, subtitle, width 1360 and measured height.
Every number on a plate must be one the code can produce.

**1. Kanji — with the dictionary.** Lookup scrim; Every character's shell (three columns, 900 × 316,
left 190, top 150). Header band `CHARACTER` + the JLPT level when there is one (`jlpt_level` can be
null) and `ESC`. Col 1: the glyph large, meanings, stroke count, level and theme. Col 2: ON and KUN
readings, each with one example word; readings beyond what fits fold to a count; then three or four
compounds and `+ MORE` (the payload only says whether there are more, not how many). Col 3: parts as
chips, the stroke-order box (hanzi-writer) with replay. Example: 漢. Note where Escape goes when the
panel was opened from inside Look it up (back to Look it up, not out).

**2. Kanji — deck only.** The state Robbie actually sees: the offline dictionary is **not installed**
(`source === "deck_only"`). Readings, compounds and meanings from the dictionary are missing; parts
(deck KRADFILE data) and the stroke-order box still show. The missing parts collapse into one line
using the existing `deckOnly` copy. It must read as deliberate, not broken. Use 語.

**3. Conversation — choosing a level.** `ScenarioIntro`: the scene, its objectives, beginner /
intermediate with their real descriptions (`scenario-tutor/constants.ts`).

**4. Conversation — asking.** On the stage. `head` THE WORLD · TALK 会話; `cap` the scene title
(Order at a Cafe カフェで注文する); `run` chips `OBJECTIVES 1 / 5` and `HINT 1 OF 3` (hints are a
ladder per line, not a budget). Ask cell: the character's name and role, their line in Japanese
large, reading, **English always shown**, a replay button. Earlier turns are behind a button
(`2 EARLIER TURNS`), not a key — the reply field takes romaji. Work cell: the reply field, a mic
button (with a modifier-key shortcut, never a bare letter), "Heard: …" landing in the field to edit,
revealed hint slips, the slab `SAY IT 送る`. Foot band: the scene's objectives as ticks, gold when met.

**5. Conversation — answered.** Your line, the outcome, the correction slip `TRY SAYING IT LIKE
THIS` and the assisted answer `YOU COULD ALSO SAY` where present. Slab `NEXT 次へ`.

**6. Conversation — the end.** Objectives met, corrections as slips, the drafted SRS cards
(`SrsDraftReviewPanel` — use its real actions) each as a slip, and the leave/restart confirmations as
a one-line slab state rather than a banner. Past sessions (`ScenarioHistoryPanel`) as a note on how
they are reached.

**7. States strip.** One row of small crops: checking with the model, the character speaking, mic
requesting / transcribing / denied / no device, speech recognition unavailable, an error.

**8. Chat and image translation — the proposal Robbie decides.** Look it up already *names* both:
`A QUESTION 質問` (`assistant-chat`) and `A SCREENSHOT 画像` (`assistant-chat-ocr`) are drawn along its
foot but deliberately **not answerable** (`features/lookup/constants.ts:4-20`: "this overlay is a
lookup, not a conversation"). Draw two options side by side and let Robbie pick:
- **A. Fold into Look it up** — reverse that written decision: with a model running, the two routes
  become answerable. A QUESTION answers in the lookup's answer area with a pager for long replies
  (`1 OF 3 ↓`); A SCREENSHOT shows how the image gets in (pick, paste or drop), the image on the left
  and the extracted lines with their translation on the right, low-confidence lines marked. The tutor
  pop-up retires.
- **B. One tutor sheet on the scrim** — chat and image translation as a standalone sheet on the
  lookup scrim, the same shape everywhere it is opened from (not a stage version and a scrim version).
Both show the no-model state (chat is gated on `assistantChatEnabled`).

**9. The map of ways in.** A note, no plate: every entry point and where it goes after this —
the Scenes pick (`App.tsx:2618`), palette entries (`App.tsx:309-312`), `openProgressionNode`
(`App.tsx:702-707`), `App.tsx:2315`, the toast actions (`useTutor.ts:192`), the titlebar tutor button.
Scenario entries go to The World's Scenes at level three. `TutorToast` stays; tutor settings already
live in app settings.

Each plate carries real copy from the app (`features/scenario-tutor/constants.ts`,
`features/tutor/constants.ts`, `features/kanji-detail/constants.ts`, the two real scenes in
`assets/screen-scenes.png`) — no lorem.
