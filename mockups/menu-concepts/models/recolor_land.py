# -*- coding: utf-8 -*-
"""Repaint every landform from ONE function of world height, in memory, before export.

WHY THIS IS THE FIX AND THE SHADER WAS NOT.
Measured out of the .blend, the four landforms are painted on four different scales at the same
elevation (linear luminance of the Color attribute):

      Z band        terrain   Fuji   FarRange_009   Range_008
      < 800           0.228      -        0.098       0.055
      800-1900        0.208    0.141      0.105       0.061
      1900-3200       0.166    0.121      0.115       0.065
      3200-4500       0.519    0.171      0.135         -
      > 4500          0.767    0.623      0.150         -

Three to five times apart, and the terrain jumps 3.1x in one step at Z 3,200. No single material
in the renderer can reconcile that, which is why matching them from the outside kept producing a
new mismatch somewhere else: the mockup was being asked to undo four different paint jobs with
one expression.

So the paint is fixed where the paint lives. One ramp of world Z, applied to the terrain, Fuji
and every range, so a surface at a given height is the same colour whichever object it belongs
to. The renderer then has nothing to correct.

NOTHING IS SAVED. This runs in the same background Blender as export_world.py and only alters
the in-memory data before the export reads it, so the .blend on disk — and the session the user
has open right now — are untouched. Making it permanent is a separate, deliberate act.

The valley keeps its own painting. Below Z 900 the terrain is left exactly as authored (paths,
clearings, the festival ground); the ramp fades in from there, so the only thing overwritten is
the pale rock-and-snow band the author put on the high ground, which is the thing that made the
hills read brighter than the mountain.
"""
import bpy
import json
import sys
from mathutils import Vector

# ---- the one ramp, in scene-linear RGB, as (height, colour) stops ----
# field   the terrain's own measured colour below Z 800, so the ramp starts where the ground is
# rock    the same luminance desaturated and warmed: a change of material, not a change of light
# snow    well below the 0.767 the author had; a cap that out-shines the dawn sky reads as a lamp
# THE RAMP DARKENS AS IT CLIMBS, and the first version of it did not — which is why the land came
# back bright. The shader this replaced had a separate height-dimming term, MTN_LEVEL, taking the
# land to 0.48 of the field colour above y 2,600; moving the paint into the model dropped it, so
# every mountain came out at roughly the value of the meadow and the whole range went up about
# twenty luminance.
# The level is measured rather than guessed: with the mountains on a plain vertex-colour material
# their material.color scales albedo exactly the way these stops do, so sweeping it in the browser
# reads the answer straight off the frame —
#     x1.00   Fuji 124   ridge 115
#     x0.80        114         111
#     x0.65        106         108
#     x0.52         98         105
#     x0.42         92         103
# 0.52, applied to every stop ABOVE the valley. The first stop keeps the field colour exactly, so
# the ramp leaves the meadow at the value the meadow already is and there is no step where the
# two meet; the darkening then happens across 900 to 2,600, which is the fade from ground to
# mountain rather than a line.
LEVEL = 0.52
STOPS = [
    (900.0,  Vector((0.195, 0.253, 0.083))),
    (2600.0, Vector((0.230, 0.232, 0.196)) * LEVEL),
    (4300.0, Vector((0.286, 0.272, 0.248)) * LEVEL),
    (5200.0, Vector((0.620, 0.606, 0.578)) * LEVEL),
    (7400.0, Vector((0.680, 0.668, 0.646)) * LEVEL),
]

FUJI = 'Landscape_Props_Fuji_001'
TERRAIN_KEY = 'landscape_terrain'
RANGE_KEY = ('landscape_props_farrange', 'landscape_props_range')
# where the terrain stops being valley; below this its own paint is kept untouched
VALLEY_TOP = 900.0
VALLEY_FADE = 2200.0


def ramp(z):
    if z <= STOPS[0][0]:
        return STOPS[0][1].copy()
    for i in range(len(STOPS) - 1):
        z0, c0 = STOPS[i]
        z1, c1 = STOPS[i + 1]
        if z < z1:
            t = (z - z0) / (z1 - z0)
            t = t * t * (3.0 - 2.0 * t)          # smoothstep, so no stop shows as a line
            return c0.lerp(c1, t)
    return STOPS[-1][1].copy()


def smoothstep(x, a, b):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def repaint(o, keep_below):
    me = o.data
    if not me.color_attributes:
        return 0
    ca = me.color_attributes.active_color or me.color_attributes[0]
    mw = o.matrix_world
    zs = [(mw @ v.co).z for v in me.vertices]
    n = 0
    if ca.domain == 'POINT':
        for i in range(len(me.vertices)):
            z = zs[i]
            tgt = ramp(z)
            k = 1.0 if not keep_below else smoothstep(z, VALLEY_TOP, VALLEY_FADE)
            if k <= 0.0:
                continue
            c = ca.data[i].color
            ca.data[i].color = (
                c[0] + (tgt.x - c[0]) * k,
                c[1] + (tgt.y - c[1]) * k,
                c[2] + (tgt.z - c[2]) * k,
                c[3])
            n += 1
    else:
        for li, loop in enumerate(me.loops):
            z = zs[loop.vertex_index]
            tgt = ramp(z)
            k = 1.0 if not keep_below else smoothstep(z, VALLEY_TOP, VALLEY_FADE)
            if k <= 0.0:
                continue
            c = ca.data[li].color
            ca.data[li].color = (
                c[0] + (tgt.x - c[0]) * k,
                c[1] + (tgt.y - c[1]) * k,
                c[2] + (tgt.z - c[2]) * k,
                c[3])
            n += 1
    return n


touched = {'terrain': 0, 'fuji': 0, 'ranges': 0}
objs = {'terrain': [], 'fuji': [], 'ranges': []}
for o in bpy.context.scene.objects:
    if o.type != 'MESH':
        continue
    n = o.name.lower()
    if n.startswith(TERRAIN_KEY):
        objs['terrain'].append(o)
    elif o.name == FUJI:
        objs['fuji'].append(o)
    elif n.startswith(RANGE_KEY):
        objs['ranges'].append(o)

for o in objs['terrain']:
    touched['terrain'] += repaint(o, keep_below=True)
for o in objs['fuji'] + objs['ranges']:
    key = 'fuji' if o.name == FUJI else 'ranges'
    touched[key] += repaint(o, keep_below=False)

# ---- optionally make it permanent ----
# Off by default: this normally runs in the same background Blender as the export and only alters
# the in-memory data, so an open session is never at risk. `-- --save` writes the .blend, which is
# a deliberate act and wants the file closed in the UI first — Blender keeps the previous version
# as environment.blend1 either way.
saved = None
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if '--save' in argv:
    bpy.ops.wm.save_mainfile()
    saved = bpy.data.filepath

print('RECOLOURED ' + json.dumps({
    'corners': touched,
    'objects': {k: len(v) for k, v in objs.items()},
    'level': LEVEL,
    'saved': saved,
}))
