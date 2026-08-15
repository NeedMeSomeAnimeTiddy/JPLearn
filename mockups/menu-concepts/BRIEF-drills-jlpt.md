# Brief — DRILLS' shape, and JLPT's missing level three

For the Claude Design project **JPLearn — menu design system**. Copy the whole of the
following into a new session there. Everything under the rule is the prompt.

---

Design **two screens** for the JPLearn menu, and only two. Both already exist in the app as
data and neither has a drawing that fits it. Nine other screens are already built and are not
in scope — do not redesign them, do not produce a general "UI kit", do not make variants of
screens I have not asked for. Two screens, each in the frame contract, each in one file.

## Read these first, from this project

- **`foundations/frame-contract.html`** — binding. It is where a screen is allowed to stand and
  it is not negotiable: the drawing lives inside **x 160–1120 by y 192–576**, there is bare
  valley 160px down each side that nothing crosses, the crown above y 192 is furniture only, and
  whole-set summaries may use the foot band below y 576. Read the section on skew being paint
  rather than layout before you place anything — a plate authored at `left: 160` does not paint
  at 160, and how far off depends on its height. That one fact is what puts a screen in the moat
  while its CSS looks correct.
- **`components/screens.html`** — the eleven screens that exist, each as a real plate, and which
  of the four shapes each one is. **Choosing the wrong shape is the mistake this menu has made
  twice**, and both screens below are a third instance of it.
- **`foundations/backdrops.html`** — the ground each section actually stands on. Put
  `assets/valley-drills.png` behind the DRILLS screen and `assets/valley-jlpt.png` behind the
  JLPT one. JLPT's is the hardest ground in the set: a vermilion pagoda dead centre, cream steps,
  lit lanterns, a crowd. If a design works there it works anywhere.
- `foundations/color.html`, `type.html`, `geometry.html`, `legibility.html`, and
  `components/built.html` for the objects everything is assembled from.

Every figure below was read out of the running app, not invented.

---

# SCREEN ONE — DRILLS, level two

## The problem

DRILLS is drawn as a four-tablet carousel: a small unordered set you pick between. It is not
that. It is **seventeen practice modes in five skill groups, across six decks, with a sparse
availability matrix** — and the carousel is describing a decision nobody is offered, which is
exactly the category error STUDY's road made before it was rebuilt as a chain.

## What is actually there

**Five skill groups**, each with its own one-line helper the app already writes:

| group | helper | modes |
| --- | --- | --- |
| Recognition | Fast pattern spotting and meaning detection | 4 |
| Recall | Produce answers from memory with precision | 5 |
| Listening | Train audio-first understanding and spoken recall | 2 |
| Challenge | Harder contextual rounds for deeper fluency | 5 |
| Mixed | Blend multiple modes into one focused run | 1 |

**Seventeen modes.** Titles and descriptions are the app's own:

- **Recognition** — Romaji Sprint (type the romaji reading as fast as you can) · Meaning Match
  (pick the meaning from four) · Character Match (pick the character for the meaning) ·
  Compound Builder (build compounds from individual kanji meanings)
- **Recall** — Stroke Order · Handwriting (draw one character in correct stroke order) ·
  Typed Recall (type the meaning, near-miss tolerant) · Speech Recall (say the meaning aloud,
  transcribed and graded offline) · Conjugation Drill
- **Listening** — Recognition (hear a word, choose its meaning, character hidden until feedback)
  · Dictation (hear a word, type it in Japanese, no visual hints)
- **Challenge** — Sentence Assembly · Particle Cloze · Vibe Check (read social tone and pick the
  register) · Imposter (find the token with a deliberate grammar error) · Context Cloze
- **Mixed** — Interleave Mix (cycle reading, meaning and character rounds in one run)

**The part that makes this a two-axis screen and not a list.** A mode is played *on a deck*, and
the six decks do not offer the same modes:

| deck | modes offered |
| --- | --- |
| Hiragana | 12 |
| Katakana | 12 |
| Kanji N5 | 12 |
| Vocabulary N5 | 12 |
| Grammar Patterns | 11 |
| Sentence Examples | 9 |

Seven modes are universal — Meaning Match, Character Match, Speech Recall, Imposter, Context
Cloze, Listening Recognition, Interleave Mix. The rest are narrow, and **four of them exist on
exactly one deck**: Stroke Order is Kanji N5 only, Conjugation Drill and Compound Builder are
Vocabulary only, Vibe Check is Grammar only. Romaji Sprint, Handwriting and Dictation are three
decks each; Sentence Assembly and Typed Recall four; Particle Cloze five.

## What the screen has to answer

1. **What can I practise right now** — the five groups, and the modes inside the one I am on.
2. **On what** — the deck, which changes which modes exist at all.
3. **Which of these is not available on this deck, and why** — a mode that vanishes without
   explanation reads as a bug. Stroke Order not being offered on Hiragana is a fact about
   hiragana, not an omission.

Nothing here is ordered and nothing is gated: every available mode is playable now. That makes
it **peers or a list**, not a chain — but it is peers *within groups*, with a second axis over
the top, which is a shape this menu does not yet have. That shape is the brief.

## Constraints particular to this screen

- Seventeen modes will not all fit the stage as equals, and they should not: use the contract's
  overflow rule. Five groups is a set that fits; seventeen modes is not.
- Two axes, one keyboard. Arrows move, Enter opens, Escape goes back — that is the whole
  grammar and the screen may not introduce a third key or a mode toggle. The vocabulary feed
  solved a version of this by making its five budget chips ordinary focusables in the same row
  order as everything else; look at `assets/screen-feed.png`.
- The DRILLS backdrop is the most neutral in the set and gives a design no help — low contrast
  throughout, so whatever you draw needs its own edges.

---

# SCREEN TWO — JLPT, level three

## The problem

JLPT's level two — the ascent, in `assets/screen-ascent.png` — is built and works. Five columns
whose height is readiness, a 0–100 measure at the left, and both thresholds drawn straight across
all five. **It is the detail panel on its right that is wrong**, and not because of how it looks.

That panel is a level three living inside level two. Every other section in this menu has the
shape at level two and the thing you actually do at level three; JLPT tries to do both at once.
It cost the screen dearly under the frame contract — measure, columns and panel were three
columns of demand adding to 1230px painted that had to become 960, so the panel was squeezed
340→288 and the plinths lost their mastered counts to fit.

**Design the level three.** Entering a level from the ascent opens it. The ascent then keeps only
the ladder, the measure and the two thresholds — which is what it is for.

## What is actually there, per level

- **A readiness percentage**, 0–100: mastered vocabulary plus mastered kanji over that level's
  total. This is the number the ascent's column height already draws.
- **That figure split in two**: kanji and vocabulary, each with its own mastered / total. Real
  N5 figures — kanji 96 / 99, vocabulary 696 / 744.
- **Two thresholds that must not be conflated**: **30%** on the *previous* level is what unlocks
  this one. **80%** on *this* level is what marks it Ready to sit. They mean different things and
  the ascent already draws them as deliberately different marks — a dashed gold rule and a solid
  washi one. Keep that distinction; do not invent a third.
- **Four modes**, which are four ways to sit the same exam rather than four exams:
  - **Diagnostic** — 20 questions across every level, to find your target
  - **Mock Exam** — timed 30 minutes, one level, returns a projected score
  - **Adaptive Review** — the SRS-due cards for that level
  - **Weak Areas** — leeches and lowest-accuracy cards first
- **A real pass mark, out of 180**, which the current panel does not show at all:

  | level | pass mark | vocab+grammar section max | section pass mark |
  | --- | --- | --- | --- |
  | N5 | 80 | 120 | 38 |
  | N4 | 90 | 120 | 38 |
  | N3 | 95 | 60 | 19 |
  | N2 | 90 | 60 | 19 |
  | N1 | **100** | 60 | 19 |

  **The sectional pass mark can fail you on its own.** A total above the pass mark with a
  vocab/grammar section below 19 is still a fail, and that is the single most useful fact this
  screen could tell someone deciding whether to book an exam. Nothing in the app's menu says it.

## What the screen has to answer

1. **How ready am I, and out of what** — the split, against the 80% line.
2. **What would happen if I sat it** — the pass mark, the section pass mark, and the fact that
   the second one is a separate gate.
3. **What do I do about it** — the four modes, with Adaptive Review and Weak Areas plainly the
   ones that move the number and Mock Exam plainly the one that measures it.

## Constraints particular to this screen

- Four modes is a small unordered set, so the modes are **peers**. The level's readiness is a
  **dashboard**. This screen is a dashboard with an action set at its foot, not a chain.
- **The JLPT backdrop is the hardest ground in the design system.** Design on it, not on the
  sunset plate. Dark plates disappeared into that pagoda once already and had to have a crush
  layer added afterwards.
- A locked level must still open and still read: it shows what is gating it (`N2 must reach 30%`)
  and its own figures at zero, not an empty screen.

---

## Deliver

Two files, each one screen, each 1280×720, each on its own section's backdrop plate, each
obeying the frame contract exactly. For each, say in a short note at the top of the file:

- which of the four shapes it is, and why that shape and not the others;
- which parts of the drawing are on the stage, which are furniture, which are in the foot band;
- what the overflow rule is doing, in numbers — what folds, what count appears where.

Give me **one design per screen**, not a set of variants. If a decision genuinely forks, draw
your preferred answer and describe the fork in the note.
