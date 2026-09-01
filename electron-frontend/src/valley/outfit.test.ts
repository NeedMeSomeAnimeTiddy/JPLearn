import { describe, expect, it } from 'vitest'
import {
  BufferAttribute, BufferGeometry, Color, InstancedMesh, MeshStandardMaterial,
} from 'three'
import {
  HAIR_PAL, OUTFIT_TOL, PAL_N, ROBE_PAL, SKIN_PAL, buildOutfits, outfitCode, outfitParts,
  outfitPatch, outfitReference,
} from './outfit'

/* THE COLOURS THIS EXPORT ACTUALLY CARRIES, read out of `world.glb`: every one of the ten person
   models paints its robe, skin, hair and obi with exactly these, byte for byte. */
const ROBE = [0.0353, 0.0706, 0.1176]
const SKIN = [0.7765, 0.5451, 0.3765]
const HAIR = [0.0157, 0.0118, 0.0078]
const OBI = [0.4353, 0.0510, 0.0431]
const STRAW = [0.5961, 0.4510, 0.2000]
const KESA = [0.4196, 0.2000, 0.0431]

/** a figure: a list of [colour, yLow, yHigh, vertexCount] bands, on a 0..1 body */
function model(name: string, bands: [number[], number, number, number][]): BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  for (const [c, lo, hi, n] of bands) {
    for (let i = 0; i < n; i++) {
      pos.push(0, lo + ((hi - lo) * i) / Math.max(1, n - 1), 0)
      col.push(c[0], c[1], c[2])
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  g.name = name
  return g
}

/* the four this world's plainest figure has, in the proportions it has them */
const child = () => model('child', [
  [ROBE, 0, 0.82, 114], [SKIN, 0.82, 0.98, 60], [HAIR, 0.78, 1, 60], [OBI, 0.59, 0.66, 48],
])
/* the monk has no hair at all, which is what breaks "take the model with the fewest groups" */
const monk = () => model('monk', [
  [ROBE, 0, 0.84, 114], [SKIN, 0.83, 1, 60], [KESA, 0.62, 0.84, 48], [OBI, 0.60, 0.67, 48],
])
/* a straw hat sits above the shoulders and must keep being straw */
const kasa = () => model('kasa', [
  [ROBE, 0, 0.78, 114], [STRAW, 0.89, 1, 84], [SKIN, 0.78, 0.93, 60],
  [HAIR, 0.74, 0.95, 60], [OBI, 0.56, 0.62, 48],
])

function dressed(geo: BufferGeometry, n = 2): InstancedMesh {
  const m = new InstancedMesh(geo, new MeshStandardMaterial({ name: 'JP_VertexColor' }), n)
  m.name = 'inst:Festival_People_Person0_001'
  return m
}

describe('finding the face', () => {
  it('reads the reference off the plainest figure that actually has a head', () => {
    /* the monk has the fewest groups -- robe, skin, kesa, obi, and no hair, because a monk is
       shaved -- so "fewest groups wins" finds one thing above the shoulders and gives up */
    const ref = outfitReference([monk(), child(), kasa()])
    expect(ref.from).toContain('child')
    expect(ref.skin?.r).toBeCloseTo(SKIN[0], 4)
    expect(ref.hair?.r).toBeCloseTo(HAIR[0], 4)
  })

  it('takes the lighter of the two as skin and the darker as hair', () => {
    const ref = outfitReference([child()])
    expect(ref.skin!.r + ref.skin!.g + ref.skin!.b)
      .toBeGreaterThan(ref.hair!.r + ref.hair!.g + ref.hair!.b)
  })

  it('says so rather than guessing when there is no head to find', () => {
    const flat = model('flat', [[ROBE, 0, 1, 60], [OBI, 0.2, 0.3, 20], [KESA, 0.1, 0.2, 20]])
    const ref = outfitReference([flat])
    expect(ref.skin).toBeNull()
  })
})

describe('classifying a model', () => {
  const ref = outfitReference([child()])

  it('paints the robe, keeps the face, keeps the hat', () => {
    const g = kasa()
    expect(outfitParts(g, ref)).toBe(true)
    const a = g.getAttribute('aPart')
    const part = (i: number) => a.getX(i)
    /* the bands are laid down in order: robe, straw, skin, hair, obi */
    expect(part(0)).toBe(1)
    expect(part(114)).toBe(0)
    expect(part(114 + 84)).toBe(3)
    expect(part(114 + 84 + 60)).toBe(4)
    expect(part(114 + 84 + 60 + 60)).toBe(2)
  })

  it('finds the hair by colour, not by height', () => {
    /* long hair hangs below the shoulder line, and any rule that reads position files it as
       clothing and paints a woman's hair with the obi's colour */
    const long = model('long', [
      [ROBE, 0, 0.82, 114], [SKIN, 0.82, 0.98, 60], [HAIR, 0.30, 0.98, 60], [OBI, 0.59, 0.66, 48],
    ])
    outfitParts(long, ref)
    expect(long.getAttribute('aPart').getX(114 + 60)).toBe(4)
  })

  it('matches with a tolerance rather than an exact key', () => {
    /* the mockup found its authored hair and its generated hair one byte apart, because the
       generator rounded the reference to three places -- so an exact key matched skin everywhere
       and hair nowhere, and hair that is not recognised gets painted with the obi */
    const nudged = HAIR.map((v) => v + OUTFIT_TOL * 0.4)
    const g = model('nudged', [
      [ROBE, 0, 0.82, 114], [SKIN, 0.82, 0.98, 60], [nudged, 0.78, 1, 60], [OBI, 0.59, 0.66, 48],
    ])
    outfitParts(g, ref)
    expect(g.getAttribute('aPart').getX(114 + 60)).toBe(4)
  })

  it('is baked once per model', () => {
    const g = child()
    expect(outfitParts(g, ref)).toBe(true)
    expect(outfitParts(g, ref)).toBe(false)
  })
})

describe('who wears what', () => {
  it('carries three palette indices down a channel built for one colour', () => {
    const c = outfitCode(7, new Color())
    expect(Math.floor(c.r)).toBeLessThan(ROBE_PAL.length)
    expect(Math.floor(c.g)).toBeLessThan(SKIN_PAL.length)
    expect(Math.floor(c.b)).toBeLessThan(HAIR_PAL.length)
    /* and the fractional part is this person's own wander, so no two indigos are alike */
    expect(c.r % 1).toBeGreaterThan(0)
  })

  it('gives the same person the same clothes every reload', () => {
    expect(outfitCode(31, new Color()).getHex()).toBe(outfitCode(31, new Color()).getHex())
  })

  it('draws skin from the population rather than evenly off the ramp', () => {
    /* an even pick puts as many of the palest tone in a crowd as of the commonest */
    const n = new Array(SKIN_PAL.length).fill(0)
    for (let k = 0; k < 4000; k++) n[Math.floor(outfitCode(k, new Color()).g)]++
    /* the weights peak at index 2 and taper hard */
    expect(n[2]).toBeGreaterThan(n[0])
    expect(n[2]).toBeGreaterThan(n[8] * 8)
    expect(n[SKIN_PAL.length - 1]).toBeGreaterThan(0)
  })

  it('keeps grey hair rare, rather than giving the village a pensioners outing', () => {
    let grey = 0
    for (let k = 0; k < 4000; k++) if (Math.floor(outfitCode(k, new Color()).b) >= 10) grey++
    expect(grey / 4000).toBeLessThan(0.09)
    expect(grey).toBeGreaterThan(0)
  })

  it('leans on the front of the robe palette, where the valley own dye is', () => {
    let first = 0
    for (let k = 0; k < 4000; k++) if (Math.floor(outfitCode(k, new Color()).r) === 0) first++
    expect(first / 4000).toBeGreaterThan(1 / ROBE_PAL.length)
  })

  it('never indexes past the palettes the shader declares', () => {
    for (let k = 0; k < 2000; k++) {
      const c = outfitCode(k, new Color())
      for (const v of [c.r, c.g, c.b]) expect(Math.floor(v)).toBeLessThan(PAL_N)
    }
  })
})

describe('the patch', () => {
  it('chains rather than replacing, and extends the cache key', () => {
    const mat = new MeshStandardMaterial()
    let idle = 0
    mat.onBeforeCompile = () => { idle++ }
    mat.customProgramCacheKey = () => 'air|crowd'
    outfitPatch(mat)
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <color_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>',
    }
    mat.onBeforeCompile(shader as never, null as never)
    expect(idle).toBe(1)
    expect(shader.vertexShader).toContain('vPart = aPart;')
    expect(shader.fragmentShader).toContain('fitSash( vFit )')
    expect(mat.customProgramCacheKey()).toBe('air|crowd|outfit')
  })

  it('patches a material once however many meshes wear it', () => {
    const mat = new MeshStandardMaterial()
    outfitPatch(mat)
    const first = mat.onBeforeCompile
    outfitPatch(mat)
    expect(mat.onBeforeCompile).toBe(first)
  })
})

describe('dressing the valley', () => {
  it('dresses the whole allocation, not just what is filled', () => {
    /* a walker mesh is built at its capacity and filled afterwards, and an undressed instance
       would be the one figure in the valley still in the authored colour */
    const m = dressed(child(), 8)
    m.count = 3
    const w = buildOutfits([m])
    expect(w.figures).toBe(8)
    expect(m.instanceColor).not.toBeNull()
  })

  it('reports which models the reference was found in, so a re-export says so', () => {
    const w = buildOutfits([dressed(child()), dressed(kasa()), dressed(monk())])
    expect(w.models).toBe(3)
    /* skin in all three, hair in two -- the monk is shaved */
    expect(w.found.skin).toBe(3)
    expect(w.found.hair).toBe(2)
  })

  it('leaves faces alone rather than guessing when it cannot find them', () => {
    const flat = model('flat', [[ROBE, 0, 1, 60], [OBI, 0.2, 0.3, 20]])
    const w = buildOutfits([dressed(flat)])
    expect(w.figures).toBe(0)
    expect(flat.getAttribute('aPart')).toBeUndefined()
  })
})
