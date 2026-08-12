# -*- coding: utf-8 -*-
"""Six more people, in different CLOTHES — built in the figure's own language this time.

THE FIRST ATTEMPT WAS BOXES BOLTED ONTO A LATHE, and it looked like it. The authored figure is
not a box: every part of it is a REGULAR HEXAGON about Z with a vertex on +X, tapering as it
rises — the robe is r 8.6 at the hem, 6.3 at the waist and 5.6 at the shoulder, the head is a
hexagonal dome, the hair a hexagonal cap. Sticking axis-aligned slabs on that gives a figure
wearing furniture, which is exactly what shipped and exactly what Robbie called it.
So everything here is `hexring` and `skin`, on the same taper, at the same six-fold symmetry.
Nothing is axis-aligned and nothing is a cuboid.

    kasa      a conical travelling hat — the one silhouette readable at any distance
    haori     a jacket with a collar roll and a flared hem lip
    maekake   a stallholder's apron over-skirt and a headband
    monk      a shaved dome and a kesa stole
    pack      a furoshiki bundle carried high on the back
    child     two thirds the height, and a head that has not caught up

The objects are LEFT IN THE FILE, in `Extras/Extras_People`, and the .blend is saved. The first
version created, exported and deleted, which is why the models were in the mockup and nowhere
Robbie could open them.

Run:  python bl.py models/make_people.py
"""
import bmesh
import bpy
import math
import os

SRC = 'PROP_person_0'
OUT = os.path.join(os.path.dirname(bpy.data.filepath), 'people.glb')
ROW_Y = -15200.0            # clear of the valley; see the note in make_boatlamp.py

SKIN = (0.776, 0.546, 0.376)
HAIR = (0.017, 0.012, 0.009)
STRAW = (0.60, 0.45, 0.20)
INDIGO = (0.055, 0.075, 0.115)
SAFFRON = (0.42, 0.20, 0.045)
CANVAS = (0.48, 0.44, 0.35)
CORD = (0.20, 0.17, 0.15)

TAU6 = math.pi / 3.0


def hexring(bm, z, r, dy=0.0):
    """the shape every part of this figure is made of: a regular hexagon, vertex on +X"""
    return [bm.verts.new((math.cos(k * TAU6) * r, math.sin(k * TAU6) * r + dy, z))
            for k in range(6)]


def skin(bm, a, b):
    return [bm.faces.new((a[i], a[(i + 1) % 6], b[(i + 1) % 6], b[i])) for i in range(6)]


def fan(bm, ring, z, dy=0.0, flip=False):
    c = bm.verts.new((0.0, dy, z))
    out = []
    for i in range(6):
        t = (c, ring[i], ring[(i + 1) % 6])
        out.append(bm.faces.new(t[::-1] if flip else t))
    return out


def tube(bm, rings, cap_top=None, cap_bot=None, dy=0.0):
    out = []
    for i in range(len(rings) - 1):
        out += skin(bm, rings[i], rings[i + 1])
    if cap_top is not None:
        out += fan(bm, rings[-1], cap_top, dy)
    if cap_bot is not None:
        out += fan(bm, rings[0], cap_bot, dy, flip=True)
    return out


def robe_r(z):
    """the authored robe's own profile, so a garment over it sits parallel to it"""
    if z <= 44.8:
        return 8.6 + (6.3 - 8.6) * (z / 44.8)
    return 6.3 + (5.6 - 6.3) * min(1.0, (z - 44.8) / 9.0)


def base_bmesh():
    me = bpy.data.meshes[SRC]
    ca = me.color_attributes[0]
    cols = {p.index: tuple(round(x, 4) for x in ca.data[p.loop_indices[0]].color[:3])
            for p in me.polygons}
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    return bm, {f: cols.get(f.index, SKIN) for f in bm.faces}


def drop(bm, paint, col, tol=0.02):
    gone = [f for f, c in paint.items() if max(abs(c[i] - col[i]) for i in range(3)) < tol]
    for f in gone:
        paint.pop(f, None)
    bmesh.ops.delete(bm, geom=gone, context='FACES')


# ---------------- the six ----------------
def make_kasa(bm, paint):
    """A cone on a hexagon, with a real brim. The brim is what reads at two hundred units —
       a hat with no rim is a pointed head."""
    brim = hexring(bm, 64.6, 15.4)
    under = hexring(bm, 63.0, 13.8)
    peak = hexring(bm, 69.0, 3.2)
    for f in skin(bm, brim, peak) + fan(bm, peak, 70.6):
        paint[f] = STRAW
    for f in skin(bm, under, brim) + fan(bm, under, 64.2, flip=True):
        paint[f] = STRAW


def make_haori(bm, paint):
    """A jacket: parallel to the robe, a collar roll at the neck and a lip at the hem. Those two
       details are the whole difference between a coat and a wider torso."""
    hem = hexring(bm, 29.0, robe_r(29.0) + 1.7)
    body = hexring(bm, 31.5, robe_r(31.5) + 0.9)
    shoulder = hexring(bm, 50.5, robe_r(50.5) + 0.9)
    collar = hexring(bm, 53.4, robe_r(53.4) + 1.9)
    for f in tube(bm, [hem, body, shoulder, collar]):
        paint[f] = INDIGO
    for f in skin(bm, collar, hexring(bm, 54.6, robe_r(53.4) + 1.2)):
        paint[f] = SAFFRON


def make_maekake(bm, paint):
    """An apron worn as an over-skirt, and a tenugui wound round the head."""
    low = hexring(bm, 5.0, robe_r(5.0) + 0.55)
    high = hexring(bm, 33.5, robe_r(33.5) + 0.55)
    band = hexring(bm, 36.2, robe_r(36.2) + 1.25)
    for f in tube(bm, [low, high]):
        paint[f] = CANVAS
    for f in tube(bm, [high, band]):
        paint[f] = CORD
    for f in tube(bm, [hexring(bm, 60.0, 5.1), hexring(bm, 63.6, 5.1)]):
        paint[f] = CANVAS


def make_monk(bm, paint):
    """No hair, a shaved crown, and a kesa over the shoulders."""
    drop(bm, paint, HAIR)
    for f in tube(bm, [hexring(bm, 62.6, 4.5), hexring(bm, 64.6, 3.4)], cap_top=65.6):
        paint[f] = SKIN
    for f in tube(bm, [hexring(bm, 40.0, robe_r(40.0) + 0.6),
                       hexring(bm, 52.4, robe_r(52.4) + 0.6),
                       hexring(bm, 53.8, robe_r(53.8) + 1.5)]):
        paint[f] = SAFFRON


def make_pack(bm, paint):
    """A furoshiki bundle high on the back, and the knot above it."""
    dy = 9.6
    for f in tube(bm, [hexring(bm, 34.0, 5.4, dy), hexring(bm, 47.0, 6.2, dy)],
                  cap_top=48.6, cap_bot=32.6, dy=dy):
        paint[f] = CANVAS
    for f in tube(bm, [hexring(bm, 48.0, 2.2, dy), hexring(bm, 51.0, 1.4, dy)],
                  cap_top=51.8, dy=dy):
        paint[f] = CORD


def make_child(bm, paint):
    for v in bm.verts:
        head = v.co.z > 52.0
        s = 0.92 if head else 0.74
        v.co.x *= s
        v.co.y *= s
        v.co.z = 31.2 + (v.co.z - 52.0) * 0.88 if head else v.co.z * 0.60


VARIANTS = [('kasa', make_kasa), ('haori', make_haori), ('maekake', make_maekake),
            ('monk', make_monk), ('pack', make_pack), ('child', make_child)]


def collection(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    elif parent and c.name not in [x.name for x in parent.children]:
        parent.children.link(c)
    return c


def build(tag, fn, col, i):
    name = 'PROP_person_' + tag
    for stale in (bpy.data.objects.get('Extra_person_' + tag),):
        if stale:
            bpy.data.objects.remove(stale, do_unlink=True)
    me_old = bpy.data.meshes.get(name)
    bm, paint = base_bmesh()
    fn(bm, paint)
    bm.normal_update()
    # remember which face wants which colour, then throw the bmesh away UNPAINTED
    bm.faces.index_update()
    idx = {f.index: paint.get(f, SKIN) for f in bm.faces}
    me = me_old or bpy.data.meshes.new(name)
    me.clear_geometry()
    bm.to_mesh(me)
    bm.free()
    me.name = name
    # PAINTED THROUGH THE MESH API, NOT THROUGH BMESH — the two disagree about colour space and
    # the disagreement is silent. `color_attributes[..].data[i].color` takes LINEAR and encodes to
    # sRGB bytes on the way in; `bmesh.loops.layers.color` takes the float as a DISPLAY value and
    # stores it more or less as the byte. The first version read the base figure's linear colours
    # through the mesh API and wrote them through bmesh, so every colour shipped one gamma decode
    # too dark — skin 0.776 became 0.565 — and the page could not recognise a face in any of the
    # ten models. See models/fix_people_gamma.py, which repaired it in place.
    ca = me.color_attributes[0] if me.color_attributes else None
    if ca is None or ca.domain != 'CORNER':
        ca = me.color_attributes.new(name='Color', domain='CORNER', type='BYTE_COLOR')
    for poly in me.polygons:
        c = idx.get(poly.index, SKIN)
        for li in poly.loop_indices:
            ca.data[li].color = (c[0], c[1], c[2], 1.0)
    me.update()
    if not me.materials:
        me.materials.append(bpy.data.materials.get('JP_VertexColor'))
    me.shade_flat()
    ob = bpy.data.objects.new('Extra_person_' + tag, me)
    ob.location = (i * 34.0 - 85.0, ROW_Y, 0.0)
    col.objects.link(ob)
    return ob


extras = collection('Extras')
folk = collection('Extras_People', extras)
made = [build(tag, fn, folk, i) for i, (tag, fn) in enumerate(VARIANTS)]

bpy.ops.object.select_all(action='DESELECT')
for ob in made:
    ob.select_set(True)
bpy.context.view_layer.objects.active = made[0]
kw = dict(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True,
          export_yup=True, export_cameras=False, export_lights=False, export_extras=False)
try:
    bpy.ops.export_scene.gltf(export_vertex_color='MATERIAL', **kw)
except TypeError:
    bpy.ops.export_scene.gltf(**kw)

for ob in made:
    d = ob.dimensions
    print('  %-24s %3d verts %3d polys  %.1f x %.1f x %.1f'
          % (ob.data.name, len(ob.data.vertices), len(ob.data.polygons), d.x, d.y, d.z))
print('exported %s (%d bytes)' % (OUT, os.path.getsize(OUT)))
bpy.ops.wm.save_mainfile()
print('SAVED %s — the six live in Extras/Extras_People at y=%d' % (bpy.data.filepath, ROW_Y))
