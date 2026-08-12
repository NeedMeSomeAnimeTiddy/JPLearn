# -*- coding: utf-8 -*-
"""Undo a double gamma decode on the Extras figures' vertex colours, in place.

THE BUG. `mesh.color_attributes[..].data[i].color` reads and writes LINEAR floats on a
BYTE_COLOR attribute — it encodes to sRGB on the way in and decodes on the way out.
`bmesh.loops.layers.color` does not: the float you assign there is stored as the byte more or
less directly, i.e. it is treated as a DISPLAY value. `make_people.py` read the base figure's
colours through the first API (getting linear 0.7758 for skin) and wrote them through the second
(storing byte 198 = display 0.776). Every colour therefore came out one gamma decode too dark:
the exporter read display 0.776 back as linear 0.5647 and shipped that.

Confirmed against the authored figure, which never went through bmesh: `world.glb`'s
PROP_person_0 has skin 0.775822 and `people.glb`'s variants had 0.564712, and
srgb_to_display(0.564712) = 0.7765. The same factor is on every colour in all ten models, which
is why the page could not match the skin reference in any of them and painted faces as clothing.

THE FIX, and why it is exact rather than a guess: `.color_srgb` returns the stored byte as a
0..1 display value — which IS the number that was originally meant. So assigning
`.color = .color_srgb` re-encodes each loop to the byte it should have had, with no arithmetic
and no palette table to keep in step. Idempotence is checked, not assumed: the script refuses to
run twice by comparing the skin group against the authored reference first.

Geometry is not touched, so hand edits since the models were generated survive.

    python bl.py models/fix_people_gamma.py
"""
import bpy
import os

REF_MESH = 'PROP_person_0'          # authored, never round-tripped through bmesh
TOL = 0.02


def groups(me):
    """(colour -> loop count) for one mesh, in whatever space .color reports"""
    ca = me.color_attributes[0] if me.color_attributes else None
    if ca is None or ca.domain != 'CORNER':
        return {}
    out = {}
    for i in range(len(ca.data)):
        k = tuple(round(x, 4) for x in ca.data[i].color[:3])
        out[k] = out.get(k, 0) + 1
    return out


ref = bpy.data.meshes.get(REF_MESH)
if ref is None:
    raise SystemExit('no %s to take a reference from' % REF_MESH)
ref_groups = sorted(groups(ref).items(), key=lambda t: -t[1])
# the authored figure is robe / skin / hair / obi; skin is the lightest of the four
lum = lambda c: c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11
ref_skin = max((c for c, _ in ref_groups), key=lum)
print('authored skin reference: %s' % (ref_skin,))

col = bpy.data.collections.get('Extras_People')
if col is None:
    raise SystemExit('no Extras_People collection')

done, skipped = [], []
for ob in sorted(col.objects, key=lambda o: o.name):
    me = ob.data
    g = groups(me)
    if not g:
        skipped.append((ob.name, 'no corner colour attribute'))
        continue
    mine_skin = max(g.keys(), key=lum)
    if max(abs(mine_skin[i] - ref_skin[i]) for i in range(3)) < TOL:
        skipped.append((ob.name, 'already matches the reference'))
        continue
    ca = me.color_attributes[0]
    for i in range(len(ca.data)):
        d = ca.data[i]
        s = d.color_srgb
        d.color = (s[0], s[1], s[2], 1.0)
    me.update()
    after = max(groups(me).keys(), key=lum)
    ok = max(abs(after[i] - ref_skin[i]) for i in range(3)) < TOL
    done.append((ob.name, mine_skin, after, ok))

for name, before, after, ok in done:
    print('  %-28s skin %s -> %s  %s'
          % (name, tuple(round(v, 3) for v in before), tuple(round(v, 3) for v in after),
             'matches authored' if ok else 'STILL WRONG'))
for name, why in skipped:
    print('  %-28s skipped: %s' % (name, why))

if done and all(ok for _, _, _, ok in done):
    bpy.ops.wm.save_mainfile()
    print('SAVED %s' % bpy.data.filepath)
else:
    print('NOT SAVED — %d fixed, %d skipped' % (len(done), len(skipped)))
