# JPLearn menu — design system

The component vocabulary of `01-sumi-3d.html`, pulled out as standalone preview pages so it can be
browsed, argued with and reused without opening a 20,000-line mockup.

**Every value in here is copied from the mockup, not invented.** If a number differs, the mockup is
right and this is stale — fix it here rather than "correcting" the mockup to match.

## What is in it

| Card | What it settles |
| --- | --- |
| `foundations/color.html` | The six tokens, the six section accents, and the **law**: gold = earned, vermilion = the one thing to press, ink = not yet. |
| `foundations/type.html` | Four faces split by job, not by language. Display vs label, mincho vs gothic. The `font` shorthand trap. |
| `foundations/legibility.html` | The rule that has been paid for three times: type over a lit valley needs a keyline or a ground. Shown failing and fixed, over a stand-in for the world. |
| `foundations/geometry.html` | Square corners, one angle (−8°), one shadow. How a stack fans. |
| `components/chip.html` | The chip family at all four scales — top row, figure stack, keycaps, gauge track. |
| `components/action-slab.html` | The bottom-right slab in its three states, and why its third line cannot lie. |
| `components/course-sheet.html` | The printed-sheet course. |
| `components/course-tally.html` | The numerals-and-hero course. |
| `components/course-stack.html` | The save-slot course. |

The three `course-*` cards are **candidates, not siblings** — one of them wins and the other two get
deleted, the way the four ladders before them did.

## Previewing locally

They are plain self-contained pages; open one directly, or serve the folder:

```bash
python mockups/menu-concepts/serve.py 5230
```

Then `http://localhost:5230/design-system/foundations/color.html`.

**The fonts will not be right off Windows.** `Segoe UI Black`, `Bahnschrift SemiCondensed` and
`BIZ UDPGothic` are system faces here and there are no webfonts — a preview on another platform falls
back and the proportions shift. Judge the structure there and the type on Windows.

## Syncing to Claude Design

Each page carries a first-line `<!-- @dsCard group="…" -->` marker, which is what the Design System
pane builds its card index from. To push changes:

1. `DesignSync` `list_files` on the project, to diff against what is already there.
2. `finalize_plan` with the paths you are writing and `localDir` set to this folder's parent.
3. `write_files` with `localPath` per file.

Push **one component at a time**, never as a wholesale replace.
