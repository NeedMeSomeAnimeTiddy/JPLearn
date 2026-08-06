# Main menu concept — Persona-style UI study

A 3D mockup of a JPLearn main menu with Persona-game energy, given a Japanese-cultural identity
instead of the current app theme.

Four concepts were built (墨 SUMI, 深夜 SHIN'YA, 祭 MATSURI, 終電 SHUDEN) plus a flat first pass at
SUMI. SUMI became the direction and the other four were deleted once it was settled — they are in
git history if the comparison is ever wanted again.

## Viewing

```bash
python mockups/menu-concepts/serve.py 5230
```

Then open http://localhost:5230 (or use the `menu-concepts` entry in `.claude/launch.json`, which
runs exactly this). Not `python -m http.server`: `serve.py` is the same thing with `no-store` on
every response, because a cached copy of one module against a fresh copy of another half-loads the
page in a way that looks like a bug in whatever you were working on.

## The concept

| File | Identity | After | Signature |
|---|---|---|---|
| `01-sumi-3d.html` | 墨 sunrise ink world (three.js + GSAP, see `RESEARCH.md`) | Persona 5 Royal | An authored Blender valley at dawn — Fuji, a lake, a wood and a shrine — under toon ramps, screen-space ink outlines, cloud shadows and height fog; washi menu type over the top; a gold origami crane spring-follows the cursor |

The world it loads is built in Blender: see `models/README.md`.

## Behavior

- Menu items are the app's six real destinations: 学習 STUDY (script hub), 復習 REVIEW,
  読解 READING (passages), 特訓 DRILLS (minigames), 検定 JLPT (prep), 記録 RECORDS (stats).
- Keyboard: arrows to select, `Enter` to confirm, `Esc`/`Backspace` to go back, `1–6` jump.
- The LOOK bar toggles the render: 陰影 CEL, 輪郭 INK, 雲影 CLOUD, 陽光 SUN, 地色 LIFT.
- `prefers-reduced-motion` collapses all animation to instant cuts.
- Square corners everywhere (project rule); organic shapes are SVG/clip-path, never border-radius.

Placeholder stats (streak 12, LV 7, 24 due, percentages) are hard-coded mock data.
