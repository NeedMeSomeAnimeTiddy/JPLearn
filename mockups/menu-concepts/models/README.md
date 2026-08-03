# models

`study-compound.glb` is exported from the running page by `NAV.exportGLB('study')` — it is not
hand-made and it is not the source of truth for anything. It exists so a modelling pass starts from
the real massing at the real scale.

**The file IS the scale spec.** Match it and nothing has to be converted; there is no metres-to-units
factor to get wrong. (For reference the world runs about 25 units to the metre, so the hall's body
at 940 x 760 is roughly 38 x 30 m — a big 方丈, which is what it is.)

Regenerate with `NAV.exportGLB(markName)` from the console or headless. Outline hulls are filtered
out, the group's transform is reset so it lands at the origin axis-aligned, and every part keeps the
name the code gave it.

## Replacing a part

Model it, export as `.glb` next to this file, and the loader swaps it in by name. Rules that matter:

- **Do not join objects.** One logical part, one object. The outline system welds vertex normals
  within a mesh; a joined mesh averages across seams that are not continuous and produces black
  flaps over the geometry.
- **Name everything.** Names survive into glTF and drive the raycast harness.
- Flat colour per material, no textures, no PBR maps. They are swapped for toon materials on load.
- +Y up, front facing -Y in Blender.
