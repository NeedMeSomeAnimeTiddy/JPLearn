# -*- coding: utf-8 -*-
"""Build the boat lantern, keep it in the .blend, and export it as its own small glb.

IT STAYS IN THE FILE. The first version created it, exported it and deleted it again, on the
reasoning that `environment.blend` was not mine to grow — with the result that the lantern
existed in the mockup and nowhere Robbie could open it, which is worse than the thing it was
avoiding. It lives in `Extras/Extras_Props` now and the .blend is saved.

WHY IT IS STILL NOT IN world.glb. That file is 45MB and everything in the valley comes out of it
in one export; a prop that lives there costs a full re-export to nudge, and the page would then
have two copies of it. `export_world.py` skips the `Extras` collections by name.

Run through the addon socket:  python bl.py models/make_boatlamp.py

Style is taken from the world's own lanterns rather than invented: `RECX_Props_LanternBig` is 98
verts and 80 polys over 36 x 31 x 102 units with materials ['JP_VertexColor', 'EMIT_lantern'],
so this is built to the same budget and uses the same two materials — the paper takes EMIT so
the page's existing "any material named EMIT* is a lamp" rule picks it up for free.
"""
import bmesh
import bpy
import math
import os

NAME = 'Extra_boat_lantern'
OUT = os.path.join(os.path.dirname(bpy.data.filepath), 'boatlamp.glb')
ROW_Y = -15200.0            # the Extras row, clear of the valley (bounds are +/-16000)

PAPER = (0.92, 0.62, 0.30)      # linear; the EMIT material carries the glow, this is the albedo
IRON = (0.045, 0.040, 0.038)    # the cap, the base ring and the hook
CORD = (0.30, 0.10, 0.07)

SIDES = 10
# the barrel's profile: (height, radius). A chochin is widest at the middle and creased at both
# ends, and the crease is what makes it read as folded paper rather than as a can.
PROFILE = [(6.0, 6.5), (11.0, 12.4), (20.0, 13.6), (29.0, 12.4), (34.0, 6.5)]


def ring(bm, z, r, n=SIDES):
    return [bm.verts.new((math.cos(i / n * math.tau) * r,
                          math.sin(i / n * math.tau) * r, z)) for i in range(n)]


def skin(bm, a, b):
    return [bm.faces.new((a[i], a[(i + 1) % len(a)], b[(i + 1) % len(b)], b[i]))
            for i in range(len(a))]


def cap(bm, ringv, z, flip=False):
    c = bm.verts.new((0.0, 0.0, z))
    out = []
    n = len(ringv)
    for i in range(n):
        tri = (c, ringv[i], ringv[(i + 1) % n])
        out.append(bm.faces.new(tri[::-1] if flip else tri))
    return out


def build():
    for stale in (bpy.data.objects.get(NAME),):
        if stale:
            bpy.data.objects.remove(stale, do_unlink=True)

    me = bpy.data.meshes.new('PROP_chochin')
    bm = bmesh.new()
    groups = []                      # (faces, colour) — painted after the mesh is finished

    # --- the paper body ---
    rings = [ring(bm, z, r) for z, r in PROFILE]
    paper = []
    for i in range(len(rings) - 1):
        paper += skin(bm, rings[i], rings[i + 1])
    paper += cap(bm, rings[0], 3.0, flip=True)
    paper += cap(bm, rings[-1], 37.0)
    groups.append((paper, PAPER))

    # --- the iron cap and the base ring, which are what stop it looking like a balloon ---
    iron = []
    top_a = ring(bm, 36.0, 7.4)
    top_b = ring(bm, 40.0, 6.2)
    iron += skin(bm, top_a, top_b)
    iron += cap(bm, top_b, 41.2)
    base_a = ring(bm, 4.4, 7.4)
    base_b = ring(bm, 1.0, 6.6)
    iron += skin(bm, base_a, base_b)
    iron += cap(bm, base_b, 0.0, flip=True)

    # --- the hook it hangs from: a thin post up to the boat's rail ---
    post = []
    pr = 1.5
    p0 = [bm.verts.new((math.cos(i / 4 * math.tau) * pr, math.sin(i / 4 * math.tau) * pr, 40.5))
          for i in range(4)]
    p1 = [bm.verts.new((math.cos(i / 4 * math.tau) * pr, math.sin(i / 4 * math.tau) * pr, 56.0))
          for i in range(4)]
    post += skin(bm, p0, p1)
    post += cap(bm, p1, 57.0)
    iron += post
    groups.append((iron, IRON))

    # --- and a short cord tassel under it, because every one of these has one ---
    tr = 1.1
    c0 = [bm.verts.new((math.cos(i / 4 * math.tau) * tr, math.sin(i / 4 * math.tau) * tr, 0.2))
          for i in range(4)]
    c1 = [bm.verts.new((math.cos(i / 4 * math.tau) * tr * 0.5,
                        math.sin(i / 4 * math.tau) * tr * 0.5, -6.0)) for i in range(4)]
    tass = skin(bm, c0, c1) + cap(bm, c1, -7.0, flip=True)
    groups.append((tass, CORD))

    bm.normal_update()
    paint = {}
    for faces, col in groups:
        for f in faces:
            paint[f] = col
    bm.faces.index_update()
    idx = {f.index: paint.get(f, IRON) for f in bm.faces}
    bm.to_mesh(me)
    bm.free()
    paint = idx
    # PAINTED THROUGH THE MESH API. `bmesh.loops.layers.color` treats the float you give it as a
    # DISPLAY value while `color_attributes[..].data[i].color` takes LINEAR and encodes — so
    # writing linear numbers through bmesh ships everything one gamma decode too dark, silently.
    # The attribute must be named exactly `Color`: that is what JP_VertexColor's Color Attribute
    # node asks for, and anything else exports as white.
    ca = me.color_attributes[0] if me.color_attributes else None
    if ca is None or ca.domain != 'CORNER':
        ca = me.color_attributes.new(name='Color', domain='CORNER', type='BYTE_COLOR')
    for poly in me.polygons:
        c = paint.get(poly.index, IRON)
        for li in poly.loop_indices:
            ca.data[li].color = (c[0], c[1], c[2], 1.0)
    me.update()

    ob = bpy.data.objects.new(NAME, me)
    ob.location = (-170.0, ROW_Y, 0.0)      # at the head of the same row as the six figures
    extras = bpy.data.collections.get('Extras')
    if extras is None:
        extras = bpy.data.collections.new('Extras')
        bpy.context.scene.collection.children.link(extras)
    props = bpy.data.collections.get('Extras_Props')
    if props is None:
        props = bpy.data.collections.new('Extras_Props')
        extras.children.link(props)
    props.objects.link(ob)

    # the world's own two materials, so nothing new is invented and the page's EMIT rule applies
    for mat_name in ('JP_VertexColor', 'EMIT_lantern'):
        mat = bpy.data.materials.get(mat_name)
        if mat is None:
            mat = bpy.data.materials.new(mat_name)
        me.materials.append(mat)
    emit_slot = 1
    for poly in me.polygons:
        poly.material_index = emit_slot if paint.get(poly.index) == PAPER else 0
    me.shade_flat()
    return ob


def export(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    kw = dict(filepath=OUT, export_format='GLB', use_selection=True,
              export_apply=True, export_yup=True, export_cameras=False,
              export_lights=False, export_extras=False)
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='MATERIAL', **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    return os.path.getsize(OUT)


ob = build()
size = export(ob)
print('built %s: %d verts, %d polys, dims %.1f x %.1f x %.1f'
      % (ob.name, len(ob.data.vertices), len(ob.data.polygons),
         ob.dimensions.x, ob.dimensions.y, ob.dimensions.z))
print('exported %s (%d bytes)' % (OUT, size))
bpy.ops.wm.save_mainfile()
print('SAVED %s — the lantern lives in Extras/Extras_Props at y=%d' % (bpy.data.filepath, ROW_Y))
