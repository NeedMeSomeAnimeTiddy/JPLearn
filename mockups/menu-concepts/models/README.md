# models

Exported from the running page, not hand-made, and not the source of truth for anything. They exist
so a modelling pass starts from the real massing at the real scale.

| file | what |
|---|---|
| `environment.glb` | **the whole world** — terrain, lake, river, Fuji, the ranges, the wood, the shrine and the STUDY compound. 366 meshes, 254k triangles, 11 MB. |
| `study-compound.glb` | just STUDY, reset to the origin and axis-aligned. 210 meshes, 4k triangles. |

**The files ARE the scale spec.** Match them and nothing has to be converted; there is no
metres-to-units factor to get wrong. (For reference the world runs about 25 units to the metre, so
the hall’s body at 940 x 760 is roughly 38 x 30 m — a big 方丈, which is what it is.)

Regenerate with `NAV.exportGLB()` for the world or `NAV.exportGLB(markName)` for one landmark, from
the console or headless. Outline hulls are filtered out, a keyed export resets the group transform
so it lands at the origin, and every part keeps the name the code gave it.

## Reading `environment.glb` in Blender

- **Instancing is preserved** as `EXT_mesh_gpu_instancing` — the wood is 32 instanced nodes rather
  than 1,500 trees. Blender 3.x+ imports it; if your version does not, the trees will be missing
  rather than wrong.
- **279 of 403 nodes are named.** Everything you would navigate by is: `terrain`, `lake`, `river`,
  `fuji`, `range`, `far-range`, `sky-dome`, `torii-near`, `wood-cedar-valley`,
  `wood-broadleaf-valley`, `wood-*-ring`, `wood-*-coast`, `grass-a/b/c`, `cloud`, and every part of
  the STUDY compound (`hall-roof`, `wall-far`, `garden-north-*`, `fuda-kana`…). The unnamed
  remainder is the shrine, which was built before naming was a habit.
- The sky dome is a 46,000-unit sphere. Hide it first.
- Lights and the sun sprites come through too (`sun-disc`, `sun-bloom`); they are not geometry you
  want to model against.

## Replacing a part

Model it, export as `.glb` next to this file, and the loader swaps it in by name. Rules that matter:

- **Do not join objects.** One logical part, one object. The outline system welds vertex normals
  within a mesh; a joined mesh averages across seams that are not continuous and produces black
  flaps over the geometry.
- **Name everything.** Names survive into glTF and drive the raycast harness.
- Flat colour per material, no textures, no PBR maps. They are swapped for toon materials on load.
- +Y up, front facing -Y in Blender.
