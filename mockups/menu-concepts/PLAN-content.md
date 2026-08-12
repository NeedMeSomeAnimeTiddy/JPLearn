# What each level of the menu holds

Written 2026-08-12. The companion to `PLAN-places.md`: that one says where each destination
stands, this one says what you find when you get there. Nothing here is implemented yet.

The target is **structural fidelity with invented numbers**: every tile, deck, block, game and
passage is the real one from the app, in the real hierarchy, with the real counts. Percentages,
scores and streaks stay invented and nothing on screen claims otherwise. There is no backend
behind this page and there is not going to be one.

**Everything is named in English in this document.** The Japanese strings appear only in the
`renders as` columns, because that is what they are — content the page draws, not names for
things. A tile called SENTENCES is called SENTENCES here even though it draws 例文.

## READ THIS FIRST — the same trap PLAN-places.md warns about

The first pass of this plan was written against `places/study.js` and `places/shrine.js`, and it
was wrong for exactly the reason that document already records in its own opening section:
**`hideGeneratedWorld` switches off every direct child of `backScene` the moment `world.glb`
loads — 178 objects.** That includes STUDY's four plaques in their four garden quarters and
DAILY's votive-tablet wall. They are still built, still in the scene graph, still answering a
traverse. None of them is on screen.

So: **no world geometry constrains any tile count.** Level two is the HUD's row list, which is
screen-space, in all six sections. Read this file, not the modules.

## The decisions this encodes

Taken 2026-08-12 with Robbie, in one sitting.

1. **STUDY has five tiles**, not four: KANA, KANJI, VOCAB, GRAMMAR, SENTENCES.
2. **Level four gets built** as part of this work — the corridor that holds the long lists.
3. **A block is followed by one more small screen that asks which game.** The app needs two
   answers before a round can start and the walk was only collecting one.
4. **RECORDS becomes four Overview panels**, each drilling into that panel's real rows.
5. **DRILLS becomes the minigame catalogue.** It is the one invented section; the app has no
   drills screen, and a festival full of stalls is the right place for a rack of games.
6. **JLPT is left alone.** `jlpt_prep` is unfinished in the app, so the section keeps its example
   content until there is something real to be faithful to.
7. Real names and structure, invented numbers.

## The measured limits

| | limit | measured how |
|---|---|---|
| L2 row height | 99px, list starts at y=246 | live, 1440×810 |
| L3 row height | 79px (`.hud-list.five`) | live |
| **rows that fit** | **7** | (810 − 248) / 79 = 7.1 |
| L3 rows today | capped at 5 | `ftL3Rows`'s `.slice(0, 5)` |
| L4 | unbuilt | `ZEN_L4` pose transcribed, "the walk that uses it is not built yet" |

**The shape rule that falls out of it: a level is either a SHOT or a CORRIDOR.** A shot is five
siblings you choose between while standing still. A corridor is any length and you walk it. L2
and L3 are shots. L4 is the corridor. Where a tile has no natural five-way split, the corridor
stands in one level early — see SENTENCES and READING below, the only two that do this.

## The app, as it actually is

Six views: `home`, `script_hub`, `minigame`, `jlpt_prep`, `passage_hub`, `daily_games`. Study
Overview, the dictionary and settings are titlebar overlays, not views.

- **6 script sections** — hiragana, katakana, kanji_n5, vocab_n5, grammar_patterns,
  sentence_examples. A seventh deck, conjugation_training, exists but is reachable only through
  the Conjugation Drill game.
- **43 decks, 604 blocks.** Every block is thematically named; none are "Group 12".
- **17 minigames**, gated per script: 12 each for hiragana, katakana, kanji, vocab; 11 for
  grammar; 9 for sentences.
- **Session setup**: Short/Medium/Long = 8/12/20 items, lives, focused review (leeches),
  confidence capture.
- **4 daily games**, each Daily or Practice, with a streak and freezes.
- **30 passages**, two authors, 73–2,539 words, every one labelled `beginner`.
- **JLPT**: 5 levels × 4 modes, 30% readiness to unlock the next level, 30-minute mock.

---

# STUDY — the hall and its four gardens

## L2 — five tiles

| tile | renders as | app section | L3 is | L4 |
|---|---|---|---|---|
| KANA | かな | hiragana + katakana | 2 rows: HIRAGANA, KATAKANA | 12 blocks each |
| KANJI | 漢字 | kanji_n5 … kanji_n1 | 5 rows: N5 N4 N3 N2 N1 | 6 / 17 / 23 / 22 / 76 |
| VOCAB | 語彙 | vocab_n5 … vocab_n1 | 5 rows: N5 N4 N3 N2 N1 | 44 / 35 / 109 / 93 / 137 |
| GRAMMAR | 文法 | grammar_patterns + conjugation_training | 2 rows: PATTERNS, CONJUGATION | 6 / 4 |
| SENTENCES | 例文 | sentence_examples | — corridor stands in | 8 blocks |

KANA keeps hiragana and katakana together at L2 because they are one subject taught in two
alphabets, and splits them at L3 because they are two decks with two block lists. GRAMMAR does
the same trick for a different reason: conjugation_training is a real deck with 4 real blocks and
no door of its own in the app, and pairing it with the patterns deck gives it one.

SENTENCES is the one tile with a single deck, no levels and more than seven blocks. It drills
straight from L2 into the corridor. **This needs L2→L4 support in the code**, which does not
exist yet.

## L3 — the five JLPT levels (KANJI and VOCAB only)

Already built and correct. The rows render as 入門 / 初級 / 中級 / 上級 / 最上級 against N5 … N1.
The block counts above are the real ones and replace the synthesised `L3_KAN_LEVELS` and
`L3_LEVELS` tables. `L3_LEVELS` for vocab currently says 32/31/105/89/133; the true figures are
**44/35/109/93/137**.

## L4 — the corridor

The real block names. A sample of what each list holds:

- **hiragana / katakana, 12 each** — Vowels · K-row · S-row · T-row · N-row · H-row · M-row ·
  Y/R/W + N · Voiced G + Z · Voiced D + B · Semi-voiced P · Digraphs
- **kanji N5, 6** — Numbers & Time (24) · Nature & World (29) · People & Body (14) ·
  Study & Language (9) · Actions & Travel (15) · Time, Talk & Money (8)
- **kanji N4, 17** — Society & Roles · Mind & Thought · Daily Life · Time & Action ·
  Work & Business · Study & Language · …
- **kanji N1, 76** — Law & Order · Society & Power · Literary Arts · State & Monarchy · …
- **vocab N5, 44** — Greetings (15) · Numbers (6) · Time & Days (12) · Family (8) · Body (6) ·
  Food & Drink (13) · School & Study (12) · Places (8) · Transport (7) · Adjectives (17) ·
  Verbs (20) · Common Nouns (21) · … 32 more
- **vocab N1, 137** — Law & Justice · Thought & Reason · Conflict & Crisis · Arts & Expression ·
  … ending Being & Essence · Reach & Consequence · Depth & Detail · Odds & Ends
- **grammar_patterns, 6** — Copula & Existence (6) · Core Particles (13) · Verb Forms (12) ·
  Descriptions & Questions (18) · Connectives (5) · Key Expressions (10)
- **conjugation_training, 4** — Verb Forms (12) · i-Adjectives (4) · na-Adjectives (3) ·
  Practical Patterns (5)
- **sentence_examples, 8** — Copula / Existence · Core Particles · Verb Forms · i-Adjectives ·
  na-Adjectives · Question Words · Connectives · Common Patterns

Each placard carries the block name, its card count, and its state. **Blocks lock**: a block
opens once the previous one has 80% of its cards answered at least once (70% for thematic
category blocks). The corridor should show that — a locked block is a placard you can see and
cannot turn.

## L5 — the game

Picking a block asks one question: which game. The list is that deck's own, from
`SCRIPT_MINIGAMES` — 12 for kana, kanji and vocab, 11 for grammar, 9 for sentences. Session
length, lives, focused review and confidence capture are the app's four toggles; whether the
menu asks for them or takes the defaults (Medium, 12 items) is still open.

---

# DAILY — the shrine

## L2 — the four games

Correct already, and the only section that needed no change: Crossword, Word Search, Match Pairs,
Typing Blitz. These are exactly `_DAILY_GAME_TYPES`. They render as クロスワード, 単語探し,
札合わせ, 早打ち.

## L3 — two rows

TODAY'S and PRACTICE. That is the app's whole `DAILY_GAMES_MODES`, and the difference matters:
Practice uses your available words without touching today's progress or your streak. Today's row
should carry its state — New or Complete — from `DailyGamesStatePayload`.

No L4. A puzzle is not a list; you do not browse a crossword.

**Open problem.** DAILY's L3 today is the shrine's six-placard walk, and that walk is part of the
generated world, so it is hidden along with everything else. The mode pair has to be a
screen-space level like the others, or the walk needs authored geometry in the .blend.

The six placards' current content — which decks the puzzle drew its words from — should not come
back. The app does not expose that, and it was the invented part of an otherwise honest section.

---

# READING — the hot-spring town

## L2 — four length bands

Every real passage is labelled `beginner` and there are two authors, so difficulty and author are
both dead axes. Length is the one real dimension in the data, and it is the one a reader actually
chooses on:

| tile | words | count |
|---|---|---|
| SHORTEST | under 400 | 11 |
| SHORT | 400–999 | 9 |
| MEDIUM | 1,000–1,499 | 6 |
| LONG | 1,500 and up | 4 |

## L3 — the corridor

11 and 9 are both over seven, so READING skips the shot and walks the canal. The hot-spring town
has one, with boats on it.

Thirty real titles, shortest to longest, from 73 words to 2,539. Twenty-nine are by 小川未明
(Ogawa Mimei); one, at 555 words, is by 岡本かの子 (Okamoto Kanoko). Each placard carries the
title, its reading, its author and its word count — all real fields on the passage record.

**Do not show a completion percentage.** The app's passage progress is a three-state ring
(not-started / in-progress / completed) held in `useState` with no persistence — it resets every
launch. Three states is what the menu may show. A percentage is not computed anywhere.

---

# DRILLS — the festival and its tower

The one invented section, now with a real job: the rack of all 17 games. It is a lens on
`script_hub` rather than a screen the app has, and the festival stalls are what make it read as a
place rather than a settings page.

## L2 — four groups, by what the game asks of you

| tile | games |
|---|---|
| RECALL | Romaji Sprint · Meaning Match · Character Match · Typed Recall · Recognition |
| PRODUCTION | Stroke Order · Handwriting · Dictation · Compound Builder |
| SENTENCE | Sentence Assembly · Particle Cloze · Context Cloze · Conjugation Drill · Imposter |
| SPEAKING | Speech Recall · Vibe Check · Interleave Mix |

5 + 4 + 5 + 3 = 17, every one real, no game in two groups.

## L3 — the games in that group

Three to five rows, so it fits the shot. Each row is the game's real title and its real one-line
description from `constants.tsx` ("Type the romaji reading as quickly as you can").

## L4 — which decks it works on

Two to six rows, from `SCRIPT_MINIGAMES` read backwards. Stroke Order is kanji only; Meaning
Match runs on all six; Compound Builder is vocab only. Picking a deck starts that game on it.

**This is the same room by the other door.** STUDY walks material → material → material → game.
DRILLS walks game → game → material. Both end on a (deck, game) pair, which is exactly what
`script_hub` needs to start a round. Worth saying out loud because it is the thing that makes
DRILLS more than a catalogue.

---

# JLPT — the five-storey pagoda

**Left as it is.** `jlpt_prep` is unfinished in the app, and there is no point being faithful to
something still moving. Current content stays: the four exam paper sections at L2, five mock
exams at L3, all invented.

For whenever it is finished, the note to come back to: the app's own order is **level first, then
mode** — pick N5 … N1, then Diagnostic / Mock Exam / Adaptive Review / Weak Areas, with a level
locked until the one below reaches 30% readiness. The pagoda has five storeys, so the building is
already making the argument.

---

# RECORDS — the lantern grove and bell tower

## The bug it has today

RECORDS has no `L3DATA`, so `ftL3Rows` returns an empty array, `hudDraw` bails on the empty list,
and the level-two rows stay on screen while `HUD.level` reports 3. Pressing Enter looks like
nothing happened because nothing did.

## L2 — four Overview panels

| tile | Overview panel | L3 |
|---|---|---|
| MASTERY | Mastery, Kanji by JLPT Level | the six scripts, with mastery % each |
| ACTIVITY | Study Activity, Session History | last five sessions: date, items, accuracy |
| WEAK POINTS | Mistake Breakdown, Minigame Performance | five worst items or games |
| ACHIEVEMENTS | Achievements | review milestones · streak milestones · mastered nodes |

Every L3 is five rows or fewer, so RECORDS is shots all the way down and needs no corridor. The
lookout is a place you stand and read.

Deck Snapshot and Export CSV are the two Overview panels with no home here. Export is a file
dialog and does not belong in a valley; Deck Snapshot duplicates MASTERY.

---

# What still has no home anywhere

Named so the transplant does not discover them late:

- **the curriculum map** — `JPLEARN_GRAPH`'s 16 nodes, the centrepiece of the app's Home screen
- **the tutor** — scenario practice and free chat, both real progression nodes
- **the dictionary** and kanji detail
- **settings**, **pomodoro**, **word of the day**, **CSV export**

The menu's own UP NEXT button is the app's "Up next" block and matches it well, so the
recommendation engine at least is represented.

# Open items

1. **L2 → L4 for SENTENCES and READING.** Two tiles want the corridor one level early and the
   code has no path for it.
2. **DAILY's L3 has nowhere to stand** now the shrine walk is hidden.
3. **The corridor is unbuilt.** `ZEN_L4`'s pose exists for STUDY only; the other five sections
   need their own, or a derived fallback.
4. **Session settings** — does the game screen ask for length and toggles, or take the defaults?
5. **`L3_LEVELS` is stale** — 32/31/105/89/133 in the file against 44/35/109/93/137 in the app.
