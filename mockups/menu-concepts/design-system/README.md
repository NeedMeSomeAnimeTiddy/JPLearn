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

## The three open problems

These are the screens the road does **not** fit. Each is a separate brief.

### 1. A deck's blocks at real scale

The road paints the selected block plus four either side and draws one bar per block in the strip
beneath. That holds for the 6 blocks of kanji N5 and the 44 of vocabulary N5. The real decks are:

| deck | blocks | | deck | blocks |
| --- | --- | --- | --- | --- |
| hiragana / katakana | 12 | | vocab N5 | 44 |
| kanji N5 | 6 | | vocab N4 | 35 |
| kanji N4 | 17 | | vocab N3 | **109** |
| kanji N3 | 23 | | vocab N2 | 93 |
| kanji N2 | 22 | | vocab N1 | **137** |
| kanji N1 | **76** | | grammar / sentences | 6 / 8 |

At 137 you see 9 of them, the strip is ~2,000px of indicator in a 1,280px frame, and reaching the
last one is 130 keypresses. **One drawing has to hold 4 and 137.** Every block has an authored name
("Numbers & Time", "Days of the Month"), a card count of 3–36, a mastery fraction, and a locked
state: block N+1 opens when block N reaches 70% of its cards answered at least once (80% for the
two kana decks).

### 2. RECORDS

Its four items — STREAK, ACCURACY, TIME, RANK — are **figures you read, not places you go**, and
there is nothing inside a streak to open. It is the one screen in the app that is a dashboard and
it currently borrows a route. The whole of its data: streak 12 days current / 21 best / 2 freezes
left / last completed 8-9; accuracy 86%; study time 42 hours; rank 7th grade; level 7 with
640 / 900 XP this level, 260 to next, 12,480 total. There is no per-day series, so there is nothing
to plot as a line.

### 3. JLPT

Five levels N5→N1, each with a **readiness percentage**, and a level unlocks only when the one
before it reaches **30%**. Four papers under each — 文字語彙 VOCAB, 文法 GRAMMAR, 読解 READING,
聴解 LISTENING — at 5 mock exams each. The current screen shows the four papers and no readiness at
all, so the app knows two things the screen does not show: how ready you are, and what is gating
the next level.

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
