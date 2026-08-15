# JPLearn menu — design system

Constraints and existing vocabulary for the menu in `01-sumi-3d.html`.

Every value here is copied from the mockup, not invented. **If one differs, the mockup is right and
this is stale.**

## What is in it

| Card | What it settles |
| --- | --- |
| `components/built.html` | **Start here.** The five objects everything past the menu is now made of — menu row, road tablet, hero card, heading slab, caption chip — at real size, on the real backdrop, with the numbers they are built from. |
| `foundations/backdrop.html` | The real valley, rendered at 1280×720 with the interface switched off, and the six menu items' measured footprints on it. Use `assets/valley-sunset.png` as the background of anything you design. |
| `foundations/color.html` | The six tokens, the six section accents, and the colour law: gold = earned, vermilion = the one thing to press, ink = not yet. |
| `foundations/type.html` | The four faces available and what each is for. Display vs label, mincho vs gothic. |
| `foundations/legibility.html` | Physics, not taste: the interface stands on a lit, moving, flat-shaded valley, so type needs a keyline, a ground, or a crushed backdrop. Shown failing and fixed. |
| `foundations/geometry.html` | Square corners, one skew angle, one hard shadow. **Square corners are a hard rule.** |
| `components/chip.html` | The chip family — top row, figure stack, keycaps, gauge track. |
| `components/action-slab.html` | The bottom-right slab: three states, and why its third line cannot lie. |

## What is settled, and no longer open

The **STUDY course** was the open problem here for a long time and is now built: a horizontal road
of standing stones with the step you are on as a large card at the centre, START and END posts at
its two ends, and one divider where the curriculum stops teaching and starts certifying. That shape
now carries **every section at both levels** — three modes of one layout:

- `path` — an ordered, gated sequence. Gates, seals, a cleared count, depth for what is behind you.
- `blocks` — the same, one level in, for a deck's blocks.
- `peers` — an unordered set. The same stones with none of the sequence furniture: nothing sunk,
  nothing locked, no marker, no cleared count.

The menu itself (level one) is a vertical column of the same rows, one open at a time. All of it
is in `components/built.html`.

## The four open problems

These are the screens the road does **not** fit. Each is a separate brief. Every figure below was
read out of the running app on 2026-08-15, not remembered.

### 1. A deck's blocks at real scale

The road paints the selected block plus four either side, and draws one bar per block in the strip
beneath. That holds for the 6 blocks of kanji N5. The real decks are:

| deck | blocks | cards | cards per block |
| --- | --- | --- | --- |
| kanji N5 | 6 | 99 | 8–29 |
| grammar | 6 | 64 | 5–18 |
| hiragana / katakana | 12 each | 104 each | 5–33 |
| kanji N4 | 17 | 177 | 6–19 |
| kanji N2 | 22 | 384 | 8–24 |
| kanji N3 | 23 | 366 | 7–24 |
| kanji N1 | **76** | 1,192 | 7–30 |

**The vocabulary levels are no longer in this table**, and that is the change since this brief was
first written. They used to be the worst of it — N1 was 137 blocks, N3 was 109 — and in August 2026
they stopped having blocks at all (problem 4). The app went from 604 blocks to 186. That removed the
extreme, not the problem: **one drawing still has to hold 6 and 76.**

At 76 you see nine tablets. The strip beneath draws one bar per block at widths 26 / 21 / 17 / 13 /
10px by distance from the selection, 5px gaps — about **1,190px of indicator in a 1,280px frame**,
before the caption chip that sits beside it. Reaching the last block is roughly 70 keypresses.

Every block has an authored name ("Numbers & Time", "Law & Order"), a card count, a mastery fraction
and a locked state: block N+1 opens when block N reaches **70%** of its cards answered at least once
— **80%** for the two kana decks, which are the exception, not the rule.

### 2. RECORDS

Its four items — STREAK, ACCURACY, TIME, RANK — are **figures you read, not places you go**, and
there is nothing inside a streak to open. It is the one screen in the app that is a dashboard and it
currently borrows a route.

**It has far more data than this brief used to claim.** The earlier version said there was no
per-day series and nothing to plot. That was wrong. `daily-activity` returns up to **365 days** of
`{date, count, accuracy}` — two channels, not one — and the live database has **319 active days** in
the last year, 7–59 reviews a day, 75–100% accuracy a day. The app already draws it as a
contribution calendar (`features/heatmap`, 365-day lookback, five intensity steps at 12 reviews a
step).

The rest of what it can read: `achievement-milestones` gives **15,406 total reviews**, a best-streak
figure, three review milestones (100 / 500 / 1,000), five streak milestones (3 / 7 / 14 / 30 / 100)
and a set of node-mastery badges, each with an earned flag. `xp-progress` gives level, total XP, XP
into this level and XP to the next.

### 3. JLPT

**The four papers this screen currently shows do not exist in the app.** 文字語彙 / 文法 / 読解 /
聴解 at "5 mock exams each" was invented for the mockup. What the app actually has, in
`views/JLPTPrepView.tsx` and `domain/jlpt_readiness.py`:

- **Five levels N5→N1**, each with a readiness percentage — mastered vocabulary plus mastered kanji
  over the level's total.
- Under each, that figure **broken into two bars**, kanji and vocabulary, each with its own
  mastered / total count.
- **Two different thresholds, and the screen must not conflate them**: **30%** on the previous level
  is what *unlocks* the next one; **80%** is what marks a level **Ready**.
- **Four modes, not four papers**: Diagnostic (20 questions spanning every level, to find your
  target), Mock Exam (timed 30 minutes, one level, returns a projected score), Adaptive Review
  (SRS-due cards for that level), Weak Areas (leeches and lowest-accuracy cards first).
- A mock exam is scored against the level's **real pass mark** — N5 80, N4 90, N3 95, N2 90, N1 100
  — plus a vocabulary/grammar section maximum and section pass mark.

So the app knows three things the screen does not show: how ready you are, what is gating the next
level, and that these four buttons are ways to sit the same exam rather than four exams.

### 4. The vocabulary feed has no control

The newest screen, and the only one here that is already built. Vocabulary's level three is no
longer a block list — it is **today's words**: twelve tablets on the road in peers mode, nothing
sunk, nothing locked. Ordering is `domain/vocab_order` — the next word is the one whose kanji you
already know, and among those the one using the **most** of what you know, so every kanji block
cleared pulls vocabulary toward the front.

It shows the words and two denominators (291 of 744 readable, 67 kanji known). **It does not show
the daily budget**, which is the single number the entire screen is generated from. The shipped app
has a chip row — none / 5 / 10 / 20 / 40 — and the mockup hardcodes twelve with nowhere to change
it.

There is a deeper mismatch under that. A road is a set of places you walk, in an order, and they are
still there tomorrow. A feed is a queue that is **replaced** tomorrow, and finishing it is the point.
Both are currently the same drawing.

## Hard constraints

1. **Screen-space 2D only.** The 3D world contributes camera movement, place and distance — never
   widgets. No boards, signs or tablets in the world.
2. **Square corners.** No `border-radius`, anywhere.
3. **It stands on a lit 3D valley** that moves and changes with time of day, from bright sand to
   green canopy to night. Two real frames are in `assets/`; design on top of a plate, not on a flat
   colour — see `foundations/legibility.html` for why.
4. **Windows system fonts only** — no webfonts. See `foundations/type.html`.
5. **The frame is 1280×720 design px**, scaled up whole on larger screens (a 2560 display draws
   everything at exactly 2×). A heading slab occupies the top left down to y 195; a new screen's
   drawing gets roughly **y 200 to y 620, full width**. A caption strip is pinned at the frame's
   foot.
6. **Keyboard first.** Arrows move the selection, Enter opens it, Escape goes back. Anything drawn
   needs an obvious next and previous.

## Previewing locally

Self-contained pages; open one directly, or serve the folder:

```bash
python mockups/menu-concepts/serve.py 5230
```

Fonts will fall back off Windows — judge structure there and type on Windows.
