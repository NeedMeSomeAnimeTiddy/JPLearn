# -*- coding: utf-8 -*-
"""Find the shoji panels on the buildings by their geometry, and RENDER what was found.

NOTHING IS SAVED. Run this in a BACKGROUND Blender:

    blender -b environment.blend --python find_windows.py

It loads its own copy of the file, marks the faces it believes are windows, renders a few views
of them in magenta, and quits. `bpy.ops.wm.save_mainfile()` is not called anywhere in here and
must not be added — the whole point is that Robbie sees the selection before the .blend changes.

WHY GEOMETRY AND NOT COLOUR. The panels look pale in the mockup's renders because the street
lamps are on them, not because they are painted pale: `Onsen_Buildings_Inn2_001` carries 47
distinct face colours and every one of them is a brown. A luminance test from the page returned
282 candidates on a building with about two dozen windows, and half of them were decking.

THE SIGNATURE IS THAT YOU CANNOT SEE A WINDOW WITHOUT LOOKING INTO A HOLE. Every panel on these
inns sits behind a modelled balcony. So: cast each upright, window-sized face outward along its
own normal and ask whether it hits its OWN building on the way out. The balcony floor and rail
are between it and the street, so it does; a plain wall panel does not.

Three filters on top of that, each of which removed a specific kind of false positive when this
was run against Inn2:
  * the occluder has to be in the BAND — 80 to 240 units. Below that the face is jammed against
    something (interior partitions, coincident faces, the back of a board: 88 of the first run's
    204 hits were under 25 units away) and above it the "occluder" is the far side of the
    building seen across an open space.
  * WINDOW-SIZED, which for a triangle of a quad panel is 3,000 to 30,000 square units. The
    railings' slats come in far under it and the wall planes far over.
  * IN A ROW. Windows are never alone: a panel with no other panel at the same height on the
    same facade is a false positive. Cheap to test, and it is the filter that separates a real
    grid of openings from scattered luck.
"""
import bpy
import os
import math
import collections
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(bpy.data.filepath)
OUT = os.path.join(HERE, 'window-check')

# MEASURED, AND THE FIRST GUESS WAS WRONG BY A FACTOR OF TWO. 80-240 units caught nothing on a
# single inn: the faces out at 120-160 turned out to be the railing SLATS, seen through their own
# balcony, and every one of them is under 2,000 square units. Funnelling Inn2 stage by stage —
# 5,484 polys, 3,685 upright, 505 over 500 units of area, 225 occluded within 400 — and then
# looking at the joint distribution shows the window-sized ones (3,000 to 30,000) sit at 60 to 79
# units, with a second group jammed at 0-19 that is something else. The heights of that whole set
# fall on 220 / 340 / 480 / 620 with nine faces each, which is a floor grid, and they face +Y and
# -Y, which are the two long facades. That is the thing we are looking for.
# AND THE RENDER SETTLED IT: A WINDOW HERE IS A PANE WITH A GRILLE IN FRONT OF IT.
# Marking the two groups in different colours and looking at Inn2 showed the whole answer at
# once. The 40-200 band — the balcony depth, which was the theory — caught a vertical strip down
# the building's corner and nothing else: a false positive. The 0-40 group caught every
# ground-floor barred lattice window on the inn, exactly and only those. And the upper floors,
# where the mockup's night renders show four storeys of pale rectangles, caught nothing in either
# colour, because THERE IS NO WINDOW GEOMETRY UP THERE — those rectangles are the wall behind
# each balcony with the street lamps on it.
# So the balcony test is dropped and the short one kept. It is a better signature anyway, and an
# explainable one: the pane sits a few units behind its own grille.
NEAR, FAR = 0.0, 40.0
NEAR2 = -1.0                   # nothing goes in the second group now; kept so the render can A/B
A_MIN, A_MAX = 3000.0, 30000.0  # one triangle of a window-sized quad
ROW_TOL = 12.0                  # two panels are "in a row" within this many units of height
WANT = ('Onsen_Buildings_', 'Zen_Buildings_', 'Torii_Buildings_', 'Festival_Buildings_',
        'Pagoda_Buildings_', 'Garden_Buildings_')


def in_rows(hits):
    """IN A ROW. Windows are never alone: group by facade and by height, keep heights that hold
    more than one panel. It is the filter that separates a grid of openings from scattered luck."""
    by_face = collections.defaultdict(list)
    for idx, c, n, _d in hits:
        by_face[(round(n.x, 1), round(n.y, 1))].append((idx, c))
    keep = []
    for _key, group in by_face.items():
        rows = collections.defaultdict(list)
        for idx, c in group:
            rows[round(c.z / ROW_TOL)].append(idx)
        for _z, members in rows.items():
            if len(members) >= 2:
                keep.extend(members)
    return keep


def candidates(o):
    """(the recessed panels, the near group) — two sets, so a render can tell them apart"""
    me = o.data
    verts = [v.co.copy() for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons]
    try:
        bvh = BVHTree.FromPolygons(verts, polys, all_triangles=False, epsilon=0.0)
    except Exception as e:      # noqa: BLE001 — a degenerate mesh is a skip, not a crash
        print('   ! bvh failed on %s: %s' % (o.name, e))
        return [], []
    far, near = [], []
    for p in me.polygons:
        n = p.normal
        if abs(n.z) > 0.5:                       # Blender Z is up; a window is upright
            continue
        if not (A_MIN <= p.area <= A_MAX):
            continue
        hit, _hn, _idx, dist = bvh.ray_cast(p.center + n * 0.5, n, 400.0)
        if hit is None:
            continue
        rec = (p.index, p.center.copy(), n.copy(), dist)
        if NEAR <= dist <= FAR:
            far.append(rec)
        elif dist >= NEAR2 and NEAR2 >= 0.0:
            near.append(rec)
    return in_rows(far), in_rows(near)


def mark():
    """assign a loud material to every caught face, and say what was caught"""
    cold = bpy.data.materials.new('WINDOW_REST')
    cold.diffuse_color = (0.22, 0.21, 0.20, 1.0)
    hot = bpy.data.materials.new('WINDOW_CHECK')          # slot 1 — the 40-200 band
    hot.diffuse_color = (1.0, 0.0, 0.72, 1.0)
    warm = bpy.data.materials.new('WINDOW_NEAR')          # slot 2 — the 0-40 group, for judging
    warm.diffuse_color = (0.0, 0.85, 1.0, 1.0)

    total = near_total = 0
    report = []
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH' or not any(o.name.startswith(w) for w in WANT):
            continue
        if len(o.data.polygons) > 40000:
            continue
        found, close = candidates(o)
        # every building is greyed and only the catches are lit, so a render reads at a glance
        me = o.data
        me.materials.clear()
        for m in (cold, hot, warm):
            me.materials.append(m)
        for p in me.polygons:
            p.material_index = 0
        for i in close:
            me.polygons[i].material_index = 2
        for i in found:
            me.polygons[i].material_index = 1
        if found or close:
            total += len(found)
            near_total += len(close)
            report.append((o.name, len(found), len(close), len(me.polygons)))
    report.sort(key=lambda r: -(r[1] + r[2]))
    print('CAUGHT %d in the band (magenta) and %d near (cyan), across %d buildings'
          % (total, near_total, len(report)))
    for name, n, c, polys in report:
        print('   %-38s band %4d (~%3d panels)   near %4d   of %6d faces'
              % (name, n, n // 2, c, polys))
    return total + near_total


def frame(name, target, offset, res=(1400, 800)):
    """render one view: camera at target+offset looking at target"""
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new('chk')
    cam_data.lens = 42
    # A BLENDER CAMERA CLIPS AT 100 UNITS BY DEFAULT and this world is 57,000 across, so the
    # first four renders off this script were a flat grey field with the whole town behind the
    # far plane. It reads exactly like "nothing was caught".
    cam_data.clip_start = 1.0
    cam_data.clip_end = 200000.0
    cam = bpy.data.objects.new('chk', cam_data)
    scene.collection.objects.link(cam)
    loc = Vector(target) + Vector(offset)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - loc).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_cavity = True          # so the grey keeps its edges
    scene.render.film_transparent = False
    scene.world.color = (0.55, 0.62, 0.72)
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print('RENDERED %s.png' % name)


def box(name):
    o = bpy.data.objects.get(name)
    if not o:
        return None
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs)))
    hi = Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
    return lo, hi, (lo + hi) / 2


os.makedirs(OUT, exist_ok=True)
n = mark()
if n:
    # STAND BACK BY THE BUILDING'S OWN SIZE. Fixed offsets put the camera inside a 590-unit shop
    # and half a mile from a 1,300-unit bathhouse; the first pass at these framed one of each.
    for who, dirn in (('Onsen_Buildings_Inn2_001', (1.0, 1.0, 0.42)),
                      ('Onsen_Buildings_Inn1_001', (1.0, -1.0, 0.42)),
                      ('Onsen_Buildings_Bathhouse_001', (1.0, 1.0, 0.50)),
                      ('Onsen_Buildings_Shop1_001', (1.0, 1.0, 0.55)),
                      ('Onsen_Buildings_Shop2_001', (-1.0, 1.0, 0.55))):
        b = box(who)
        if not b:
            continue
        span = b[1] - b[0]
        d = max(span.x, span.y, span.z) * 1.5
        frame(who.replace('Onsen_Buildings_', ''), b[2],
              (dirn[0] * d, dirn[1] * d, dirn[2] * d))
print('DONE — nothing was saved')
