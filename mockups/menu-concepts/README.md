# Main menu concepts — Persona-style UI study

Four self-contained HTML mockups of a JPLearn main menu with Persona-game energy
(P5R / P3R / P4G / P5-transit), each with a Japanese-cultural identity instead of the
current app theme. No build step, no external assets — every file is standalone.

## Viewing

```bash
python -m http.server 5230 --directory mockups/menu-concepts
```

Then open http://localhost:5230 (or use the `menu-concepts` entry in `.claude/launch.json`).
Opening the files directly from disk also works.

## The concepts

| # | File | Identity | After | Signature |
|---|------|----------|-------|-----------|
| 01 | `01-sumi-3d.html` | 墨月夜 twilight ink world (three.js + GSAP, see `RESEARCH.md`) | Persona 5 Royal | Washi shards floating in an indigo night with sumi-e mountains, moon, drifting thought-kanji and mist; a gold origami crane spring-follows the cursor and banks through transitions; two selectable camera grammars (velocity-matched whip-pan, sine orbit with analytic bank) |
| 01v1 | `01-sumi.html` | 墨 flat original | Persona 5 Royal | Hanko stamp slams on hover; ink-flood transition with a name-card flash |
| 02 | `02-shinya.html` | 深夜 midnight sea & moon | Persona 3 Reload | Menu reflects in the water; wave-sweep transition into an underwater submenu |
| 03 | `03-matsuri.html` | 祭 summer festival | Persona 4 Golden | Hanafuda card fan — siblings lean away; noren-curtain transition; ema-plaque submenu |
| 04 | `04-shuden.html` | 終電 last train platform | Persona 5 / Tokyo transit | Split-flap departure board with a live clock; train-rush transition into an in-train LCD submenu |

## Shared behavior

- Menu items are the app's six real destinations: 学習 STUDY (script hub), 復習 REVIEW,
  読解 READING (passages), 特訓 DRILLS (minigames), 検定 JLPT (prep), 記録 RECORDS (stats).
- Keyboard: arrows to select, `Enter` to confirm, `Esc`/`Backspace` to go back, `1–6` jump.
- Every concept has a themed submenu to demonstrate the menu → section transition both ways.
- `prefers-reduced-motion` collapses all animation to instant cuts.
- Square corners everywhere (project rule); organic shapes are SVG/clip-path, never border-radius.
- Date / streak / level HUD chips are diegetic per concept (commuter pass, tanzaku tags, moon phase).

Placeholder stats (streak 12, LV 7, 24 due, percentages) are hard-coded mock data.
