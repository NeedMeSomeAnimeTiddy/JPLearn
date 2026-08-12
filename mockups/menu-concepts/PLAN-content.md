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

Taken 2026-08-12 with Robbie, over two sittings. The second one replaced STUDY entirely — see
the note below it.

1. **STUDY is a course you walk, not a library you browse.** Its five tiles are gone.
2. **Level four gets built** as part of this work — the corridor that holds the long lists.
3. **A block is followed by one more small screen that asks which game.** The app needs two
   answers before a round can start and the walk was only collecting one.
4. **RECORDS becomes four Overview panels**, each drilling into that panel's real rows.
5. **DRILLS becomes the minigame catalogue.** It is the one invented section; the app has no
   drills screen, and a festival full of stalls is the right place for a rack of games.
6. **JLPT is left alone.** `jlpt_prep` is unfinished in the app, so the section keeps its example
   content until there is something real to be faithful to.
7. Real names and structure, invented numbers.

### Why STUDY was rewritten after the first pass

The first version gave STUDY five tiles that opened decks, opened levels, opened blocks and then
asked for a game. DRILLS asked for a game, then a group, then a deck. **Both ended on the same
pair — a deck and a game — by different routes.** The first draft of this document called that
symmetry and put it in bold. It is duplication: two sections, one destination, no reason to visit
the second if you have been to the first.

The split that fixes it is not cosmetic. **STUDY answers "what should I do next" and DRILLS
answers "I want to play this one."** One is ordered, gated and decides for you; the other is
open, ungated and decides nothing. A course and an arcade. Once STUDY is a course it cannot be a
deck browser, so the five tiles go.

## The measured limits

| | limit | measured how |
|---|---|---|
| L2 row height | 99px, list starts at y=246 | live, 1440×810 |
| L3 row height | 79px (`.hud-list.five`) | live |
| **rows that fit** | **7** | (810 − 248) / 79 = 7.1 |
| L3 rows today | capped at 5 | `ftL3Rows`'s `.slice(0, 5)` |
| L4 | unbuilt | `ZEN_L4` pose transcribed, "the walk that uses it is not built yet" |
| STUDY's route | 2,090 units, gate to arbour | landmarks projected onto the stone chain |
| 16 nodes on it | **139 units apart** | 2,090 / 15 gaps; a person here is 66 tall |
| on the stones alone | 75 units apart — a shuffle | 1,021-unit chain, why the route is longer |
| the bamboo stairway | 3,157 units of run, 215 of rise | `ZEN_L4`'s pose, walked and shot |
| 6–44 blocks on it | 72–526 units apart | the six deck nodes' real block counts |

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

# STUDY — the course through the garden

Decided 2026-08-12: STUDY is a Duolingo-shaped path. You walk one route, in order, and the
course tells you where you are and what is next. There is no deck list and no way to jump
sideways — that is DRILLS' job now.

## The course already exists in the app

`domain/progression_curriculum.py` is a 16-node gated graph and nobody has to invent it:

```
tutorial → hiragana → katakana → vocabulary → grammar ─┬─ sentences  (side branch, leaf)
                                                       └─ scripted conv → listening → kanji
                                                          → free conv → reading
                                                          → JLPT N5 → N4 → N3 → N2 → N1
```

Every node carries a **real gate** (the previous node mastered) and a **real bar**: hiragana
wants all 46 characters, katakana all 46, vocabulary 40 words as an absolute floor, grammar 80%,
kanji 80 characters at 80%, each JLPT level 90%. Every node also carries a **real reward**, and
the rewards unlock features in `domain/feature_catalog.py` — Listening Mode, Conversation Mode,
Kanji Mode, Reading Mode, Themes, Achievements, Advanced Analytics, JLPT Dashboard, Tutor Chat.
That is the Duolingo carrot, already built and already persisted.

## Only six of the sixteen nodes are decks

The rest point out of the section, which is the thing that makes this the spine of the whole
menu rather than one section's furniture. From `NODE_DESTINATIONS`:

| node | what it is | where it goes |
|---|---|---|
| tutorial | onboarding, one-time and skippable | nowhere — shown complete |
| hiragana, katakana | decks | 12 blocks each, in place |
| vocabulary, grammar, sentences | decks | 44 / 6 / 8 blocks, in place |
| kanji | deck | 6 blocks (N5), in place |
| scripted conv, free conv | the tutor | **no home in the menu yet** |
| listening | a *game*, not a deck — `listening_audio_first` on hiragana | DRILLS |
| reading | the passage hub | READING |
| JLPT N5 … N1 | the exam hub | JLPT |

So a node either **opens** (six of them) or **flies you** to the destination that owns it. The
menu already knows how to fly between places; a node that hands off is a camera move it can
already make.

## The route — measured, and it is the garden's own

The stepping stones are only the middle of it. Every landmark in the Zen area, projected onto the
line from the first stone to the last (`t` 0 → 1 spans 1,021 units, offset is sideways distance):

| t | landmark | offset |
|---|---|---|
| −1.11 | Komainu — guardian lion | 177 |
| −0.94 | **Sanmon** — the main gate, 384×379×259 | 425 |
| −0.54 | **Koro** — incense burner | **5** |
| −0.36 | **Shishi** — deer scarer | 140 |
| −0.20 | **Ishigumi / KareBed** — rock group and dry bed | 345 |
| −0.07 | **GateSmall** — inner threshold | **59** |
| 0 → 1 | **25 stepping stones** across the raked field (1,110 × 1,040) | 92 |
| 0.57 | KareField / Rakes / GardenWall — the raked garden itself | 92 |
| 1.11 | **GardenAzumaya** — the arbour | **8** |

**Main gate to arbour is about 2,090 units.** Sixteen nodes over that is **139 units apart** —
about two person-heights, which is a walk. On the stones alone it would have been 75 units, and
a person here is 66 tall, so that would have been a shuffle. This is why the route is the whole
processional way and not just the stones.

And the arrival already looks down it: the eye lands at (3050, −195, −6350), beside the komainu
at (3120, −6070), with its focus at (3900, −7300), which is mid-route. **You arrive standing at
the top of your own course.**

`Zen_Curve` — the Bezier the stones were laid along — is dropped at parse by `ENV_CAM_BLOCK`.
Un-dropping it would give the walk a smooth spine instead of sixteen straight hops.

## L2 — walk the route

The camera glides from node to node, one in focus at a time, arrows to step. Same machinery as
the existing level-three walk.

Each node shows its name, its bar (`4 / 12 blocks`, `31 / 46 characters`), and its state:
**done**, **here**, or **ahead**. The nine landmarks above are the milestones between them —
free scenery that tells you how far you have come, which is the job Duolingo gives its unit
headers and checkpoint chests.

**Locks are soft, matching the app.** A node ahead of you is dimmed and you can still walk to it
and enter, with the app's own warning first: *"This part of the course builds on earlier steps
you have not finished yet. You can start it now — it may just be harder without those
foundations."* That is `LOCKED_NODE_REASON`, verbatim. It also means the mockup can demo any part
of the course without pretending to have earned it.

The side branch is a real branch in the graph — sentences hangs off grammar as a leaf — but it
sits inline on the walk between grammar and scripted conversation, because a fork in a corridor
is a worse problem than a slightly wrong graph.

## L3 — the lessons, up the bamboo stairway

That node's blocks, which is where the six deck nodes land — and it stands on the route `ZEN_L4`
was placed for, which is what that marker has been waiting on since it was set.

**It is a stairway, not a grove.** The first look at this searched for objects named `Bamboo`,
found nine clumps, and concluded the level-four camera was aimed at some scenery. Standing at the
authored pose and taking a picture showed what is actually there: a **stone stairway climbing
through the bamboo**, lined with kasuga lanterns down both sides, with a timber handrail, jizo
and gorinto beside it, and walkers already on it. The steps are terrain — cut into
`Zen_Surfaces_ZenGround_001`, 4,182 × 4,541 with **236 units of rise** — which is why no object
is called "step" and why a name census could never have found it. "Up the bamboo" was literal.

Measured: about **3,157 units of ground run** for 215 of climb, a grade of roughly 1:15, which
matches the shallow steps in the render. It runs off the Zen court, so the course and the lessons
are physically joined — you walk the course through the garden and turn and climb to do a node.

**Why this route and not the stones.** The two levels want opposite things and the garden happens
to have both:

| | route | why |
|---|---|---|
| L2, the course | the processional way, 2,090 units | **nine landmarks** — a course wants milestones that say how far you have come |
| L3, the lessons | the bamboo stairway, 3,157 units | **no landmarks, even cadence** — a list of forty identical blocks wants uniformity and nothing competing with it |

And the arithmetic works because the course only ever reaches six deck nodes, whose block counts
run 6 to 44: over 3,157 units that is **72 to 526 units between placards**. The lists that would
break it — vocab N1's 137 — are not on the course. They sit behind the JLPT nodes, which hand off
to another section entirely.

Climbing is also the right shape for the thing: the course is a walk on the level, one deck is a
hill.

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
cannot turn. This is a second gate chain inside every node's gate, and it is the app's, not an
invention: it is what makes a node feel like a unit of five lessons rather than one wall.

Only the six deck nodes reach this level. The other ten fly out to their own section instead.

## L4 — the game

Picking a block asks one question: which game. The list is that deck's own, from
`SCRIPT_MINIGAMES` — 12 for kana, kanji and vocab, 11 for grammar, 9 for sentences. Session
length, lives, focused review and confidence capture are the app's four toggles; whether the
menu asks for them or takes the defaults (Medium, 12 items) is still open.

**The course is one level shallower than the browser was.** Path → blocks → game is three steps
where tiles → level → blocks → game was four, and the path does the work of two of them: it
picks the deck *and* tells you which one you should be on.

## What this costs

Stated plainly, because none of it is free:

- **The five tiles are gone**, and with them the only way to go straight to a deck. If you feel
  like doing katakana today and the course says vocabulary, the course wins. That is Duolingo's
  bargain and it is the point, but it is a real loss against the app, whose Home screen has a
  deck carousel precisely so you can pick.
- **Two nodes have nowhere to fly to.** Scripted conversation and free conversation are real
  curriculum nodes pointing at the tutor, and the menu has no tutor. They will either sit on the
  path as dead stones or need a seventh place.
- **The grouping is not the app's.** The graph is 16 flat nodes; the landmarks that make them
  feel like units are the garden's, chosen here. Nothing breaks if the app disagrees later,
  because the milestones are scenery rather than data.
- **The route needs authoring.** Sixteen stops from the main gate to the arbour is a camera path
  nobody has composed yet. The level below it is in better shape: `ZEN_L4` already stands at the
  foot of the stairway looking up it, so the lessons have their shot and only the course does not.

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

## What keeps this from being STUDY again

Both sections can start a round, and in the first draft that made them the same section by two
routes. What separates them now is not the destination but **who decides**:

| | STUDY | DRILLS |
|---|---|---|
| the question | what should I do next | I want to play this one |
| order | fixed — one route, walked | none — any stall, any time |
| gates | yes, soft, from the curriculum | none |
| picks the deck | the course does | you do |
| picks the game | you do, at the end | you do, at the start |
| progress | advances the course | does not |

That last row is the load-bearing one, and it is worth carrying into the transplant: **a round
started from DRILLS should not advance the path.** The app already has this distinction and calls
it Practice — see DAILY, where the practice mode explicitly leaves your streak and your daily
progress alone. DRILLS is that idea applied to the whole minigame catalogue.

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

- **the tutor** — scenario practice and free chat. This was a nice-to-have in the first draft and
  is now blocking: they are two nodes *on the course*, so the path has two stones that lead
  nowhere until the tutor has a place.
- **the dictionary** and kanji detail
- **settings**, **pomodoro**, **word of the day**, **CSV export**

The curriculum map has come off this list — it is STUDY now.

The menu's own UP NEXT button is the app's "Up next" block and matches it well, so the
recommendation engine at least is represented. Worth noting the two now overlap: UP NEXT and the
course are both answering "what next", from `recommendations` and from `progression` respectively.
They should agree, and if they ever disagree the button is the one that is wrong.

# Open items

1. **The route is uncomposed.** Sixteen stops from the main gate to the arbour, 139 units apart.
   Whether the camera stops at each or glides past with the type doing the work is a composition
   question nobody has answered.
2. **`Zen_Curve` is dropped at parse.** Un-dropping it gives the walk a real spine instead of
   sixteen straight hops between points. It is one line in `ENV_CAM_BLOCK`.
3. **Two dead stones** — scripted and free conversation, above.
4. **READING still wants the corridor one level early**, and the code has no L2→L4 path.
5. **DAILY's L3 has nowhere to stand** now the shrine walk is hidden.
6. **Session settings** — does the game screen ask for length and toggles, or take the defaults?
7. **`L3_LEVELS` is stale** — 32/31/105/89/133 in the file against 44/35/109/93/137 in the app.
   Still worth fixing even though STUDY no longer shows a level list: the numbers are wrong
   wherever they are read.
8. **One stray stone.** `Zen_Garden_TobiIshi_001` reports a world position of exactly (0, 0, 0),
   which is 8,800 units from every other stone in the chain. Either an unplaced object or a
   parent whose transform never arrived — worth a look in the .blend before the path is laid.
