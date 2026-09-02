import { describe, expect, it } from 'vitest'
import { Color, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry } from 'three'
import {
  GAIN_PAPER, GAIN_STONE, LAMP_NOT, LAMP_PAPER, LAMP_RE, buildLanterns,
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
