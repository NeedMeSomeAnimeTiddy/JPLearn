# -*- coding: utf-8 -*-
"""Export environment.blend as world.glb, run by a BACKGROUND Blender.

Driven from the command line rather than through the MCP for two reasons: a 20,695-object export
takes far longer than the MCP's request timeout, and doing it in a background process leaves the
user's open session untouched.

WHAT GETS EXCLUDED, and why each one:
  - the water, because the mockup's lake carries a planar reflection that a flat exported plane
    cannot; the loader drops it by name anyway, so exporting it is pure file size
  - the cameras are KEPT: they are seven framing decisions and the whole menu is going to be
    driven from them
Everything else goes: the terrain, the vegetation, the legacy props with their textures, the
figures, the sky dome. The .blend is the world.
"""
import bpy
import os
import sys
import json
import re

OUT = os.path.join(os.path.dirname(bpy.data.filepath), 'world.glb')

# ---- exclude only what the mockup keeps ownership of ----
dropped = []
for o in list(bpy.context.scene.objects):
    n = o.name.lower()
    if '_water_' in n or n.startswith('landscape_water'):
        dropped.append(o.name)
        o.hide_set(True)
        o.hide_viewport = True
        o.hide_render = True

print('EXCLUDED ' + json.dumps(dropped))

# ---- the export ----
kw = dict(
    filepath=OUT,
    export_format='GLB',
    use_visible=True,          # honours the hides above
    export_apply=True,         # no modifiers in this file, but harmless and future-proof
    export_yup=True,           # three.js is Y-up; Blender is Z-up
    export_cameras=True,       # the seven framing decisions
    export_lights=False,       # the scene has its own three-light rig, tuned
    export_materials='EXPORT',
    export_texcoords=True,
    export_normals=True,
    export_vertex_color='MATERIAL',   # vertex colours are what most of the materials are
    export_extras=False,
    export_animations=False,
)

# THE OPERATOR DOES NOT INTROSPECT and its keywords have been renamed repeatedly across
# versions, so guessing a version and hard-coding its spelling is how this breaks silently on
# the next upgrade. Try the call, strip whatever it rejects, try again -- and print what was
# dropped, because a keyword silently disappearing is exactly how an export quietly loses
# vertex colours or instancing.
def export(**kwargs):
    dropped_kw = []
    for _ in range(40):
        try:
            bpy.ops.export_scene.gltf(**kwargs)
            return dropped_kw
        except TypeError as e:
            m = re.search(r'keyword "([^"]+)" unrecognized', str(e))
            if not m or m.group(1) not in kwargs:
                raise
            dropped_kw.append(m.group(1))
            kwargs.pop(m.group(1))
    raise RuntimeError('too many unrecognised keywords')

# GPU instancing is the difference between a few hundred draw calls and twenty thousand
kw['export_gpu_instances'] = True
rejected = export(**kw)
instanced = 'export_gpu_instances' not in rejected
print('REJECTED_KW ' + json.dumps(rejected))

size = os.path.getsize(OUT) if os.path.exists(OUT) else 0
print('EXPORTED ' + json.dumps({
    'path': OUT,
    'mb': round(size / 1048576, 1),
    'instanced': instanced,
}))
