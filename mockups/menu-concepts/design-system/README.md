# JPLearn menu — design system

Constraints and existing vocabulary for the menu in `01-sumi-3d.html`.

Every value here is copied from the mockup, not invented. **If one differs, the mockup is right and
this is stale.**

## What is in it

| Card | What it settles |
| --- | --- |
| `foundations/frame-contract.html` | **Start here.** Where a screen is allowed to stand: the stage, the moat, the two bands, the overflow rule, and the skew arithmetic that puts a screen in the moat while its CSS looks correct. Everything built obeys it. |
| `components/screens.html` | The twelve screens that exist, each as a real 1280×720 plate at one hour, with which of the four shapes it is and which two still have open problems. |
| `components/built.html` | The five objects those screens are made of — menu row, road tablet, hero card, heading slab, caption chip — at real size, on the real backdrop, with the numbers they are built from. |
| `foundations/backdrops.html` | The ground each of the six sections actually stands on — six real plates with the interface switched off. The camera stands somewhere different in each section, so design against the one you are designing for. **JLPT and RECORDS are the two extremes.** |
| `foundations/backdrop.html` | The older single-plate version of the above, kept for the measured menu footprints on it. |
| `foundations/color.html` | The six tokens, the six section accents, and the colour law: gold = earned, vermilion = the one thing to press, ink = not yet. |
| `foundations/type.html` | The four faces available and what each is for. Display vs label, mincho vs gothic. |
| `foundations/legibility.html` | Physics, not taste: the interface stands on a lit, moving, flat-shaded valley, so type needs a keyline, a ground, or a crushed backdrop. Shown failing and fixed. |
| `foundations/geometry.html` | Square corners, one skew angle, one hard shadow. **Square corners are a hard rule.** |
| `components/chip.html` | The chip family — top row, figure stack, keycaps, gauge track. |
| `components/action-slab.html` | The bottom-right slab: three states, and why its third line cannot lie. |

## What is settled, and no longer open

**Every screen is built.** Twelve of them, across three levels, all shown in
`components/screens.html`. The four problems this file used to open with — a deck's blocks at real
scale, RECORDS, JLPT, the vocabulary feed's missing budget — are all drawings now. The reference
data behind each is kept below, because it is still what those screens are made of.

**Every screen stands on the frame contract**, added August 2026 and applied to all eleven:
x 160–1120 / y 192–576, bare valley 160px either side, whole-set summaries in the foot band, and
nothing scrolls. See `foundations/frame-contract.html` — it supersedes the old "y 200 to y 620, full
width", which is what let screens paint to both edges and bury the valley the menu exists to show.

**The road is no longer the shape of everything.** It used to carry every section at both levels.
It now carries one — DAILY — which is the one it is the right shape for.

## The two open problems

Both are **shape** problems rather than layout ones, and both have their own brief.

### ~~A. DRILLS is drawn as four tablets~~ — BUILT 2026-08-16

Seventeen modes in five groups on an axis of six decks, with the fold: a mode the current deck
does not offer leaves the road and the road closes over it. See `components/screens.html`.

### B. JLPT has no level three, so its level two is doing two jobs

The ascent carries a permanent detail panel for whichever level is selected. That panel is a level
three living inside level two, and it is why JLPT paid more for the frame contract than any other
screen — three columns of demand in a 960 stage, with the panel squeezed 340→288 and the plinths
losing their mastered counts to fit.

## The reference data behind each screen

Every figure below was read out of the running app on 2026-08-15, not remembered. These are no
longer briefs — the screens exist — but they are what the screens are made of, and a redesign that
contradicts one of them is wrong.

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
there is nothing inside a streak to open. It is the one screen in the app that is a dashboard, and
the ledger is built as one.

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

Historical note, kept because it is the mistake this screen was built to correct:
**the four papers an early version showed do not exist in the app.** 文字語彙 / 文法 / 読解 /
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

The built ascent shows all three of the things the early version did not: how ready you are, what is
gating the next level, and that the four modes are ways to sit the same exam rather than four exams.
What it does not yet have is anywhere to go when you choose one — see open problem B.

### 4. The vocabulary feed

Vocabulary's level three is not a block list — it is **today's words**: twelve tablets on the road in peers mode, nothing
sunk, nothing locked. Ordering is `domain/vocab_order` — the next word is the one whose kanji you
already know, and among those the one using the **most** of what you know, so every kanji block
cleared pulls vocabulary toward the front.

It shows the words, two denominators (291 of 744 readable, 67 kanji known) and **the daily budget**,
which is the single number the whole screen is generated from — the shipped app's own chip row,
none / 5 / 10 / 20 / 40. It is on the screen rather than in a setting for that reason.

The distinction it is built on: a road is a set of places you walk, in an order, and they are still
there tomorrow. A feed is a queue that is **replaced** tomorrow, and emptying it is the point. They
are not the same drawing.

## Hard constraints

1. **Screen-space 2D only.** The 3D world contributes camera movement, place and distance — never
   widgets. No boards, signs or tablets in the world.
2. **Square corners.** No `border-radius`, anywhere.
3. **It stands on a lit 3D valley** that moves and changes with time of day, from bright sand to
   green canopy to night. Six real per-section plates are in `assets/valley-*.png`; design on top of
   the one for your section, not on a flat colour and not on the generic sunset — see
   `foundations/backdrops.html` for which ground is which, and `foundations/legibility.html` for
   why it matters.
4. **Windows system fonts only** — no webfonts. See `foundations/type.html`.
5. **The frame is 1280×720 design px**, scaled up whole on larger screens (a 2560 display draws
   everything at exactly 2×). A screen's drawing gets **x 160–1120 by y 192–576 and nothing else** —
   see `foundations/frame-contract.html`, which replaced the old "y 200 to y 620, full width". Full
   width was the problem: the valley is the reason this menu exists, and a screen that paints to
   both edges has spent the whole budget of the idea. Whole-set summaries may use the foot band
   below y 576; the heading, brand and stat chips own the crown above y 192.
6. **Keyboard first.** Arrows move the selection, Enter opens it, Escape goes back. Anything drawn
   needs an obvious next and previous.

## Previewing locally

Self-contained pages; open one directly, or serve the folder:

```bash
python mockups/menu-concepts/serve.py 5230
```

Fonts will fall back off Windows — judge structure there and type on Windows.
