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

## Loading one

`NAV.loadEnv()` in the mockup replaces the generated world with `environment.glb`; `NAV.loadEnv(url)`
for any other file, `NAV.unloadEnv()` to put the generated one back from the same camera. Nothing
loads unless asked — every measurement in `RESEARCH.md` was taken against the analytic world.

What the loader does, and what it therefore needs from your file:

- **It rebuilds the heightfield from your terrain.** `landAt()` is what places the camera stand-off,
  the tree scatter, the grass and the STUDY compound, and a loaded model makes the analytic version
  a lie. So a 384×384 field is baked off the mesh and `landAt` reads that instead. **Name your ground
  object `terrain`** (or anything matching `terrain|ground|land`). Without it the bake falls back to
  every mesh in the file and reads rooftops as ground — it warns loudly when this happens.
- **It replaces every material.** The look — toon ramp, cloud shadows, height fog, sky rim, aerial
  tint — lives in patched shaders, and a model keeping its own PBR materials is lit by none of it.
  Only base colour and vertex colours carry across, so **flat colour per material** is not a
  stylistic request, it is the only thing that survives.
- **It leaves the atmosphere alone.** Anything named `sky-dome`, `lake`, `river`, `cloud`,
  `sun-disc`, `sun-bloom` or `water` is dropped from your file and kept from the generated world.
  Those are shader effects with geometry attached; relit as toon meshes the sky goes navy and the
  lake becomes grey card. **Don't model them.**
- **It does not build outlines yet.** Loaded meshes get no inverted-hull outline, so a loaded world
  is noticeably flatter than the generated one. Known gap.

Round-trip caveat: re-importing `environment.glb` puts one instanced prop (`scatter_23`) close to
the camera, because `EXT_mesh_gpu_instancing` does not survive export→import cleanly here. That is
an artefact of exporting this scene and re-reading it, not of the loader; a file authored in Blender
will not have it.

Rules that matter:

- **Do not join objects.** One logical part, one object. The outline system welds vertex normals
  within a mesh; a joined mesh averages across seams that are not continuous and produces black
  flaps over the geometry.
- **Name everything.** Names survive into glTF and drive the raycast harness.
- Flat colour per material, no textures, no PBR maps. They are swapped for toon materials on load.
- +Y up, front facing -Y in Blender.
