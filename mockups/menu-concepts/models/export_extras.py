# -*- coding: utf-8 -*-
"""Export whatever is in Extras_People / Extras_Props as people.glb / boatlamp.glb.

SEPARATE FROM THE GENERATORS ON PURPOSE. `make_people.py` BUILDS the figures from scratch and
would overwrite anything edited by hand since — and the figures have been edited by hand since
(the haori's robe was rebuilt, the monk lost its skull cone, the kasa was lowered, and four of
them were duplicated and given long hair). This script only ever reads the scene and writes the
glbs, so it is the safe one to run after a session of modelling.

    python bl.py models/export_extras.py
"""
import bpy
import os
import re

HERE = os.path.dirname(bpy.data.filepath)
JOBS = [('Extras_People', 'people.glb', re.compile(r'person', re.I)),
        ('Extras_Props', 'boatlamp.glb', re.compile(r'lantern|lamp', re.I))]


def export(objs, out):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True,
              export_yup=True, export_cameras=False, export_lights=False, export_extras=False)
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='MATERIAL', **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    return os.path.getsize(out)


for cname, fname, pat in JOBS:
    col = bpy.data.collections.get(cname)
    if not col:
        print('%s: no such collection' % cname)
        continue
    objs = sorted([o for o in col.objects if o.type == 'MESH' and pat.search(o.name)],
                  key=lambda o: o.name)
    if not objs:
        print('%s: nothing matching %s' % (cname, pat.pattern))
        continue
    out = os.path.join(HERE, fname)
    size = export(objs, out)
    print('%s -> %s (%d bytes)' % (cname, fname, size))
    for o in objs:
        print('    %-28s mesh %-28s %3dv %3dp'
              % (o.name, o.data.name, len(o.data.vertices), len(o.data.polygons)))
