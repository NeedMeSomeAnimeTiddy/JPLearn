import { describe, expect, it } from 'vitest'
import {
  BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry,
} from 'three'
import {
  CAST_PAPER, CAST_STONE, GAIN_PAPER, GAIN_STONE, LAMP_NOT, LAMP_PAPER, LAMP_RE, buildLanterns,
} from './lanterns'

/** a mesh the way the world hands one over, optionally sharing a material */
function lamp(name: string, mat = new MeshStandardMaterial()): Mesh {
  const m = new Mesh(new PlaneGeometry(1, 1), mat)
  m.name = name
  return m
}

function world(...meshes: Mesh[]): Object3D {
  const root = new Object3D()
  for (const m of meshes) root.add(m)
  return root
}

describe('what counts as a lantern', () => {
  it('catches every kind the world actually names', () => {
    /* MEASURED AGAINST THE MODEL, not invented: the glb carries 6 Chochin, 53 Legacy_Props_Lamp
       and one LanternBig, and the regex has to reach all three shapes of name. */
    for (const n of [
      'Nature_Wildlife_Chochin_001', 'Legacy_Props_Lamp_004', 'RECX_Props_LanternBig_073',
      'Onsen_Props_Gaslamp_012', 'Zen_Props_Toro_003', 'Garden_Props_Andon_001',
    ]) {
      expect(LAMP_RE.test(n)).toBe(true)
      expect(LAMP_NOT.test(n)).toBe(false)
    }
  })

  it('survives the rename instancing gives it', () => {
    /* `collapseToInstances` batches 53 lamps into one mesh called `inst:Legacy_Props_Lamp_001`,
       and this walk runs after it -- so an anchored regex would find nothing at all. */
    expect(LAMP_RE.test('inst:Legacy_Props_Lamp_001')).toBe(true)
  })

  it('lights the lantern and not the pole it stands on', () => {
    for (const n of ['Festival_Props_LampPost_002', 'Onsen_Props_LanternStand_001',
      'Zen_Props_ToroBase_009', 'Path_Props_LampBracket_004']) {
      expect(LAMP_NOT.test(n)).toBe(true)
    }
  })

  it('tells paper from stone, because they are not the same brightness', () => {
    /* a chochin is a candle behind paper and a toro is one behind granite; the mockup found the
       stone ones at 0.18 read as unlit from any distance -- "a garden of 250 unlit lanterns" */
    expect(LAMP_PAPER.test('Nature_Wildlife_Chochin_001')).toBe(true)
    expect(LAMP_PAPER.test('Zen_Props_Toro_003')).toBe(false)
    expect(GAIN_PAPER).toBeGreaterThan(GAIN_STONE * 2)
  })
})

describe('turning them up', () => {
  it('gives paper and stone their own clone, even off one source material', () => {
    /* one source material is shared across both kinds in this world, and a paper lantern and a
       stone one must not end up sharing a clone -- they would then have to agree on a gain */
    const shared = new MeshStandardMaterial()
    const field = buildLanterns(world(lamp('Props_Chochin_001', shared), lamp('Props_Toro_001', shared)))
    expect(field.mats).toHaveLength(2)
    expect(field.mats[0].mat).not.toBe(field.mats[1].mat)
    expect(field.mats.map((l) => l.gain).sort()).toEqual([GAIN_STONE, GAIN_PAPER])
  })

  it('does not touch the source material, so nothing else in the world changes', () => {
    const shared = new MeshStandardMaterial()
    const before = shared.emissive.getHex()
    const field = buildLanterns(world(lamp('Props_Chochin_001', shared)))
    field.setOn(1)
    expect(shared.emissive.getHex()).toBe(before)
  })

  it('keeps what the model authored and only decides how far up it is turned', () => {
    /* an EMIT material set in Blender wins over the built-in flame colour */
    const authored = new MeshStandardMaterial({ emissive: new Color(0x3366ff) })
    const field = buildLanterns(world(lamp('Props_Chochin_001', authored)))
    field.setOn(1)
    const e = field.mats[0].mat.emissive
    /* blue in, blue out -- scaled by the paper gain rather than replaced by orange */
    expect(e.b).toBeGreaterThan(e.r)
  })

  it('falls back to the flame for a lantern the model left unlit', () => {
    const field = buildLanterns(world(lamp('Props_Chochin_001')))
    field.setOn(1)
    const e = field.mats[0].mat.emissive
    expect(e.r).toBeGreaterThan(e.g)
    expect(e.g).toBeGreaterThan(e.b)
  })

  it('starts out, so nothing is lit before the day cycle has said the hour', () => {
    const field = buildLanterns(world(lamp('Props_Chochin_001')))
    expect(field.mats[0].mat.emissive.getHex()).toBe(0x000000)
  })

  it('goes out again at dawn rather than fading to a colour', () => {
    const field = buildLanterns(world(lamp('Props_Chochin_001')))
    field.setOn(1)
    expect(field.mats[0].mat.emissive.getHex()).not.toBe(0x000000)
    field.setOn(0)
    expect(field.mats[0].mat.emissive.getHex()).toBe(0x000000)
  })

  it('ignores anything that is not a lit material', () => {
    const field = buildLanterns(world(lamp('Props_Rock_001'), lamp('Props_LampPost_001')))
    expect(field.mats).toHaveLength(0)
    expect(field.meshes).toBe(0)
  })
})

describe('the ones that do not stay put', () => {
  it('keeps a boat lantern out of the grid, which is baked once at load', () => {
    /* the lamp grid is a floor plan worked out at load and never touched again -- so a flame on a
       hull left in it lights the mooring it was exported at for the rest of the run, while the
       boat carrying it crosses the lake in the dark. Measured on this world: 879 flames, 12 of
       them chochin primitives on six boats. */
    const field = buildLanterns(world(
      lamp('Nature_Wildlife_Chochin_001'), lamp('Legacy_Props_Lamp_004'),
    ))
    expect(field.spots).toHaveLength(1)
    expect(field.moving).toHaveLength(1)
  })

  it('still lights it, because it is a lantern either way', () => {
    /* out of the GRID, not out of the world: it is drawn, it glows, and it bleeds */
    const field = buildLanterns(world(lamp('Nature_Wildlife_Chochin_001')))
    expect(field.meshes).toBe(1)
    expect(field.lit).toHaveLength(1)
    expect(field.mats).toHaveLength(1)
  })
})

/* ==================================================================================================
   AND WHAT HAPPENS ONCE THE .BLEND MARKS ITS OWN FLAMES.
   ================================================================================================== */

/** a mesh whose material is named, which is the only channel Blender has to say "this is a flame" */
function marked(name: string, matName: string): Mesh {
  const mat = new MeshStandardMaterial()
  mat.name = matName
  return lamp(name, mat)
}

describe('when the model marks its own flames', () => {
  it('stops guessing, and that is the whole point of EMIT', () => {
    /* THE BUG THIS TEST EXISTS FOR. With both rules live, a stone lantern is collected twice --
       once for its fire box, which carries the EMIT material, and once for the whole granite body
       whose NAME matches `toro`. The mockup measured 686 lamps where there were 362, and the body
       then wore a flame's emissive over its entire surface, which is the lava look. */
    const field = buildLanterns(world(
      marked('Zen_Props_ToroFire_001', 'EMIT_lantern'),
      lamp('Zen_Props_Toro_001'),
    ))
    expect(field.authored).toBe(true)
    expect(field.meshes).toBe(1)
  })

  it('goes on guessing when there is nothing to go on', () => {
    /* an export with no EMIT materials at all is the case the name rules were written for, and
       they have to keep working or every world before this one goes dark */
    const field = buildLanterns(world(lamp('Zen_Props_Toro_001'), lamp('Props_Chochin_002')))
    expect(field.authored).toBe(false)
    expect(field.meshes).toBe(2)
  })

  it('takes a marked mesh whatever it is called, since a building is not called a lantern', () => {
    const field = buildLanterns(world(marked('PROP_bathhouse', 'EMIT_window')))
    expect(field.meshes).toBe(1)
  })
})

describe('where the light comes out', () => {
  /* A ROW OF LANTERNS ON ONE MESH. The festival's chochin arrive as spans: one instance 400 units
     long carrying a whole strung row, which under a bounding-box centre got ONE light in the middle
     with a 300-unit reach -- so a row of eight lit the ground under the middle two. */
  function span(name: string, matName: string, length: number, at: number[][]): Mesh {
    const g = new BufferGeometry()
    const pts: number[] = []
    for (const [x, y, z] of at) {
      /* a little triangle where each lantern hangs */
      pts.push(x, y, z, x + 2, y, z, x, y + 2, z)
    }
    g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
    void length
    const mat = new MeshStandardMaterial()
    mat.name = matName
    const m = new Mesh(g, mat)
    m.name = name
    return m
  }

  it('puts one spot per lantern along a span rather than one in the middle of it', () => {
    /* NOT CALLED `Chochin`, and that is not squeamishness: `LAMP_MOVING` matches that word
       anywhere in a name and sends the whole mesh to the boats' eight moving slots instead. The
       festival's own rows are named for the stall they hang over. */
    const field = buildLanterns(world(span('Festival_Props_LampRow', 'EMIT_lantern', 400, [
      [0, 0, 0], [200, 0, 0], [400, 0, 0],
    ])))
    expect(field.spots).toHaveLength(3)
  })

  it('gives a compact lantern exactly one, because every face is inside one cluster', () => {
    /* a gas lamp is 16 units across and a kasuga 22 -- both well under the 130-unit radius */
    const field = buildLanterns(world(span('Onsen_Props_GasLamp', 'EMIT_lantern', 16, [
      [0, 0, 0], [8, 0, 0], [16, 0, 0], [8, 8, 0],
    ])))
    expect(field.spots).toHaveLength(1)
  })

  it('clusters in WORLD units, which is the thing this export makes hard', () => {
    /* THE QUANTIZATION TRAP, for the third time in this port. `KHR_mesh_quantization` normalises
       every primitive to about +/-1 and puts the real size in the node transform, so a 130-unit
       radius read as local units swallows the whole object and a strung row collapses back to the
       single light this exists to prevent. Same geometry, two scales, two answers. */
    const near = span('Festival_Props_Row', 'EMIT_lantern', 4, [[0, 0, 0], [2, 0, 0], [4, 0, 0]])
    const far = span('Festival_Props_Row', 'EMIT_lantern', 4, [[0, 0, 0], [2, 0, 0], [4, 0, 0]])
    far.scale.setScalar(100)
    far.updateMatrixWorld(true)
    expect(buildLanterns(world(near)).spots).toHaveLength(1)
    expect(buildLanterns(world(far)).spots).toHaveLength(3)
  })

  it('remembers what kind of lamp each flame is, because they do not cast alike', () => {
    /* 灯籠 is a candle behind a stone screen and chochin is an open flame in paper. Swept in the
       Zen court at 0.55 / 0.38 / 0.26 of a chochin, only 0.26 gives each lantern its own pool of
       warm gravel falling off into the dark; the first two are a garden with the lights on. */
    const paper = buildLanterns(world(marked('Festival_Props_Lamp_001', 'EMIT_lantern'))).spots[0]
    expect(paper.gain).toBe(CAST_PAPER)
    const stone = buildLanterns(world(lamp('Zen_Props_Toro_001'))).spots[0]
    expect(stone.gain).toBe(CAST_STONE)
    expect(CAST_STONE).toBeLessThan(CAST_PAPER / 3)
  })

  it('gives a boat lantern one light wherever it hangs, and never a row of them', () => {
    /* there are eight moving slots for the whole lake -- see `boatlamp.ts` -- so a span's worth
       would eat them all */
    const field = buildLanterns(world(span('Lake_Props_Chochin_001', 'EMIT_lantern', 400, [
      [0, 0, 0], [200, 0, 0], [400, 0, 0],
    ])))
    expect(field.moving).toHaveLength(1)
    expect(field.spots).toHaveLength(0)
  })
})
