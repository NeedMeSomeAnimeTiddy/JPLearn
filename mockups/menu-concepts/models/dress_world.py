# -*- coding: utf-8 -*-
"""Put the new geometry into the world itself: the ten figures on the crowd, a lantern on each boat.

GEOMETRY ONLY. No lift, no material, no markers, no curves — those were the things that broke the
file last time and they belong in the mockup. This script changes which mesh an object draws and
adds six lantern objects. Nothing moves and nothing is recoloured.

  * every `*_People_Person*` object is repointed at one of the ten models in Extras_People,
    chosen from a stable hash of its own name, and keeps the exact spot it was placed on
  * each of the six boats gets `Nature_Wildlife_Chochin_00N` at its stern, in world space with
    the boat's own rotation and scale

TWO THINGS THAT MUST NOT BE REPEATED FROM LAST TIME:
  1. `PROP_person_0..7` are given a FAKE USER before anything is repointed. Taking them to zero
     users is what made Blender drop them on save last time, and the .blend1 backup was written
     by the same save so it had already lost them too. A fake user keeps them in the file whether
     or not anything draws them.
  2. The lantern is NOT named with 'Boat' in it. The page's rider weld skips
     /Boat|Duck|Heron|Water|Surfaces/, and it is that weld which makes a thing on a hull travel
     with the hull — a lantern called BoatLantern would be left behind at the mooring.

    python bl.py models/dress_world.py
    python bl.py -c "REVERT=1; exec(open(r'<abs path>').read())"
"""
import bpy
import hashlib
from mathutils import Matrix, Vector

MARK = 'dressed_from'
AFT = 0.18          # how far along the hull from the stern, as a fraction of its length
# THE DECK IS THE 90TH PERCENTILE OF THE HULL'S VERTICES, NOT ITS BOUNDING BOX. `PROP_boat_0` is
# a 29-unit open rowboat with a 140-unit POLE in it — four vertices out of 72 — so a lantern put
# at the top of the bounding box hangs three feet above the boat in mid-air, which is exactly
# what the first attempt did. A percentile ignores a mast; a bounding box cannot.
DECK_PCT = 0.90
REVERT = bool(globals().get('REVERT'))


def people():
    """SELECTED BY THE MESH THEY DRAW, not by their name. `*_People_Person*` misses 66 of them:
    58 in `PAGX_People_NNN`, six `Zen_Garden_Person*`, and the two `Nature_Wildlife_Person*` who
    are the boats' passengers. Anything drawing one of the eight authored figures is crowd."""
    src = {'PROP_person_%d' % i for i in range(8)}
    return [o for o in bpy.data.objects if o.type == 'MESH' and o.data.name in src]


def models():
    col = bpy.data.collections.get('Extras_People')
    if not col:
        return []
    return sorted((o.data for o in col.objects if o.type == 'MESH'), key=lambda m: m.name)


if REVERT:
    n = 0
    for o in bpy.data.objects:
        was = o.get(MARK)
        if not was:
            continue
        me = bpy.data.meshes.get(was)
        if me:
            o.data = me
        del o[MARK]
        n += 1
    lit = [o for o in bpy.data.objects if 'Chochin' in o.name]
    for o in lit:
        bpy.data.objects.remove(o, do_unlink=True)
    print('reverted %d figures, removed %d lanterns' % (n, len(lit)))
    bpy.ops.wm.save_mainfile()
    print('SAVED', bpy.data.filepath)
    raise SystemExit

pool = models()
if not pool:
    raise SystemExit('no Extras_People collection to draw models from')

# 1 — keep the authored meshes alive no matter what ends up drawing them
kept = []
for i in range(8):
    me = bpy.data.meshes.get('PROP_person_%d' % i)
    if me and not me.use_fake_user:
        me.use_fake_user = True
        kept.append(me.name)
print('fake user set on: %s' % (kept or 'already set'))

# 2 — the crowd
targets = [o for o in people() if not o.get(MARK)]
used = {}
for o in targets:
    o[MARK] = o.data.name
    me = pool[hashlib.md5(o.name.encode('utf-8')).digest()[0] % len(pool)]
    o.data = me
    used[me.name] = used.get(me.name, 0) + 1
print('crowd: %d figures onto %d models' % (len(targets), len(used)))
for k in sorted(used):
    print('   %-28s %d' % (k, used[k]))

# 3 — a lantern at every stern
lamp = bpy.data.meshes.get('PROP_boat_lantern')
boats = sorted([o for o in bpy.data.objects if 'Boat' in o.name and o.type == 'MESH'],
               key=lambda o: o.name)
for o in list(bpy.data.objects):
    if 'Chochin' in o.name:
        bpy.data.objects.remove(o, do_unlink=True)
made = 0
if lamp and boats:
    home = boats[0].users_collection[0]
    for i, b in enumerate(boats):
        xs = [v.co.x for v in b.data.vertices]
        zs = sorted(v.co.z for v in b.data.vertices)
        deck = zs[int(len(zs) * DECK_PCT)]
        local = Vector((min(xs) + (max(xs) - min(xs)) * AFT, 0.0, deck - 2.0))
        ob = bpy.data.objects.new('Nature_Wildlife_Chochin_%03d' % (i + 1), lamp)
        # the boat's own frame, so the lantern inherits its heading and its scale
        ob.matrix_world = b.matrix_world @ Matrix.Translation(local)
        home.objects.link(ob)
        made += 1
        print('   %-28s at %s on %s'
              % (ob.name, tuple(round(v) for v in ob.matrix_world.translation), b.name))
print('lanterns: %d in %s' % (made, home.name if made else '-'))

bpy.ops.wm.save_mainfile()
print('SAVED', bpy.data.filepath)
