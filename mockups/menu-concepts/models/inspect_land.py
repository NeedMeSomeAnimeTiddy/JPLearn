# -*- coding: utf-8 -*-
"""Read-only: the paint on each landform against absolute height, in the .blend itself.

Run by a BACKGROUND Blender, for the reasons export_world.py gives — the MCP times out on a file
this size, and a background process cannot disturb an open session.

Blender is Z-up and the export rotates to Y-up, so Blender Z here is world Y in three.js.
"""
import bpy
import json

BANDS = [(-1e9, 800), (800, 1900), (1900, 3200), (3200, 4500), (4500, 1e9)]


def paint_by_height(o):
    me = o.data
    if not me.color_attributes:
        return None
    ca = me.color_attributes.active_color or me.color_attributes[0]
    mw = o.matrix_world
    acc = [{'n': 0, 'r': 0.0, 'g': 0.0, 'b': 0.0} for _ in BANDS]
    if ca.domain == 'POINT':
        pairs = ((i, ca.data[i].color) for i in range(len(me.vertices)))
    else:
        seen = {}
        for li, loop in enumerate(me.loops):
            seen.setdefault(loop.vertex_index, ca.data[li].color)
        pairs = seen.items()
    for vi, c in pairs:
        z = (mw @ me.vertices[vi].co).z
        for k, (lo, hi) in enumerate(BANDS):
            if lo <= z < hi:
                a = acc[k]
                a['n'] += 1
                a['r'] += c[0]
                a['g'] += c[1]
                a['b'] += c[2]
                break
    out = []
    for k, (lo, hi) in enumerate(BANDS):
        a = acc[k]
        if not a['n']:
            continue
        n = a['n']
        rgb = [round(a['r'] / n, 3), round(a['g'] / n, 3), round(a['b'] / n, 3)]
        out.append({'z': '%s..%s' % (int(lo) if lo > -1e8 else '', int(hi) if hi < 1e8 else ''),
                    'n': n, 'rgb': rgb,
                    'lum': round(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2], 3)})
    return out


WANT = ('Landscape_Terrain_Terrain_001', 'Landscape_Props_Fuji_001',
        'Landscape_Props_FarRange_009', 'Landscape_Props_Range_008')
res = {}
for name in WANT:
    o = bpy.context.scene.objects.get(name)
    if o:
        res[name] = {'mat': [m.name for m in o.data.materials], 'bands': paint_by_height(o)}

# what do the two materials actually do with the colour attribute?
mats = {}
for mn in ('Material_1', 'JP_VertexColor'):
    m = bpy.data.materials.get(mn)
    if not m or not m.use_nodes:
        continue
    nodes = []
    for nd in m.node_tree.nodes:
        e = {'type': nd.type, 'name': nd.name}
        if nd.type == 'BSDF_PRINCIPLED':
            bc = nd.inputs.get('Base Color')
            e['baseColorLinked'] = bool(bc and bc.is_linked)
            if bc and not bc.is_linked:
                e['baseColor'] = [round(v, 3) for v in bc.default_value[:3]]
        if nd.type in ('VERTEX_COLOR', 'ATTRIBUTE'):
            e['layer'] = getattr(nd, 'layer_name', None) or getattr(nd, 'attribute_name', None)
        nodes.append(e)
    mats[mn] = nodes

print('PAINTREPORT ' + json.dumps({'objects': res, 'materials': mats}))
