# models

`environment.blend` is the source of truth. The mockup loads `world.glb`, which is baked out of it —
never edited by hand, and never the thing to change.

## Regenerating `world.glb`

```bash
blender --background environment.blend --python recolor_land.py --python export_world.py
```

`recolor_land.py` repaints every landform from one ramp of world height before the export reads it;
`export_world.py` writes `world.glb` with instancing preserved. Neither writes the .blend unless
told to.

| flag | effect |
|---|---|
| `-- --above Z` | repaint only at or above height Z. A re-bake that changes one stop should name the band it changed, because the first bake overwrote the terrain's authored valley paint and a second full pass blends it twice. |
| `-- --save` | also write `environment.blend`. Deliberate act — **close the file in the Blender UI first**, or your open session will overwrite the bake when you next save. Blender keeps the previous version as `environment.blend1` either way. |

`inspect_land.py` is read-only: it prints each landform's paint against height, which is how the
four-different-scales problem was found.

The MCP add-on times out on this file (20,695 objects), so all of this runs in a background Blender.

**The files ARE the scale spec.** Match them and nothing has to be converted; there is no
metres-to-units factor to get wrong. (The world runs about 25 units to the metre, so the hall's body
at 940 x 760 is roughly 38 x 30 m — a big 方丈, which is what it is.)

## What the loader needs from the file

- **Name the ground `terrain`** (anything matching `terrain|ground|land`). A 384×384 heightfield is
  baked off it, and `landAt()` — which places the camera stand-off, the scatter and the grass —
  reads that. Without it the bake falls back to every mesh in the file and reads rooftops as ground.
  It warns loudly when this happens.
- **Every material is replaced.** The look — toon ramp, cloud shadows, height fog, screen-space ink —
  lives in patched shaders. Only base colour and vertex colours carry across, so **flat colour per
  material** is not a stylistic request, it is the only thing that survives.
- **The atmosphere is dropped.** Anything named `sky-dome`, `lake`, `river`, `cloud`, `sun-disc`,
  `sun-bloom` or `water` is discarded and kept from the generated world instead. Those are shader
  effects with geometry attached; relit as toon meshes the sky goes navy and the lake becomes grey
  card. **Don't model them.**
- **Do not join objects.** One logical part, one object.
- **Name everything.** Names survive into glTF and drive the raycast harness.
- +Y up, front facing -Y in Blender.

## Not in git

`world.glb` (42 MB) and `environment.blend` (18 MB) are untracked, and `lib/` is gitignored — so a
fresh clone cannot run the mockup without regenerating the model and restoring the vendored three.js
and GSAP. Worth fixing before anyone else needs to open this.
