import { describe, expect, it } from 'vitest'
import {
  DoubleSide, FrontSide, Mesh, MeshToonMaterial, Object3D, PlaneGeometry, ShaderMaterial,
} from 'three'
import { POND_U, buildPonds } from './pond'
import { LAKE_U } from './lake'

function surface(name: string): Mesh {
  const m = new Mesh(new PlaneGeometry(1, 1), new MeshToonMaterial())
  m.name = name
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function world(...meshes: Object3D[]): Object3D {
  const root = new Object3D()
  for (const m of meshes) root.add(m)
  return root
}

/** the lake's material, as `buildLake` makes it: its uniforms are the shared LAKE_U */
function lakeMaterial(): ShaderMaterial {
  return new ShaderMaterial({ uniforms: LAKE_U, vertexShader: 'void main(){}', fragmentShader: 'void main(){}' })
}

describe('which water is which', () => {
  it('sends the garden pond to the lake and the baths to their own shader', () => {
    const pond = surface('Garden_Surfaces_GardenWater_001')
    const bath = surface('Onsen_Surfaces_OnsenPools_001')
    const ponds = buildPonds(world(pond, bath), lakeMaterial())
    expect(ponds.garden).toEqual([pond])
    expect(ponds.pools).toEqual([bath])
  })

  it('leaves everything else alone', () => {
    const ground = surface('Nature_Surfaces_Terrain_001')
    const before = ground.material
    const ponds = buildPonds(world(ground), lakeMaterial())
    expect(ponds.garden).toHaveLength(0)
    expect(ponds.pools).toHaveLength(0)
    expect(ground.material).toBe(before)
  })
})

describe('the garden pond', () => {
  it('shares the lake\'s uniforms rather than cloning them', () => {
    /* `Material.clone()` runs `cloneUniforms`, which would hand the pond a dead copy of
       `texMatrix` -- it would carry the reflection as it stood on the frame this ran and never
       move again */
    const pond = surface('Garden_Surfaces_GardenWater_001')
    const lake = lakeMaterial()
    buildPonds(world(pond), lake)
    const mat = pond.material as ShaderMaterial
    expect(mat).not.toBe(lake)
    expect(mat.uniforms).toBe(lake.uniforms)
    expect(mat.uniforms.texMatrix).toBe(LAKE_U.texMatrix)
  })

  it('is double-sided, because this mesh\'s faces point downward', () => {
    /* a FrontSide material is back-face culled from above and the water is simply not drawn --
       what you then see is the pond BED through where the surface should be */
    const pond = surface('Garden_Surfaces_GardenWater_001')
    const lake = lakeMaterial()
    lake.side = FrontSide
    buildPonds(world(pond), lake)
    expect((pond.material as ShaderMaterial).side).toBe(DoubleSide)
  })

  it('goes on the list the mirror has to hide', () => {
    /* a material that samples `tReflect` drawn INTO `tReflect` is a feedback loop */
    const pond = surface('Garden_Surfaces_GardenWater_001')
    const ponds = buildPonds(world(pond), lakeMaterial())
    expect(ponds.hideFromMirror).toContain(pond)
  })

  it('falls back to the bath shader when there is no lake to borrow from', () => {
    /* `?water=off` builds no lake; the pond must still be water rather than a toon slab */
    const pond = surface('Garden_Surfaces_GardenWater_001')
    const ponds = buildPonds(world(pond), null)
    expect(ponds.garden).toHaveLength(0)
    expect(ponds.pools).toEqual([pond])
  })
})

describe('the baths', () => {
  it('share one material across every pool', () => {
    const a = surface('Onsen_Surfaces_OnsenPools_001')
    const b = surface('Onsen_Surfaces_OnsenPools_002')
    const ponds = buildPonds(world(a, b), lakeMaterial())
    expect(a.material).toBe(b.material)
    expect(a.material).toBe(ponds.material)
  })

  it('are double-sided too', () => {
    const bath = surface('Onsen_Surfaces_OnsenPools_001')
    buildPonds(world(bath), lakeMaterial())
    expect((bath.material as ShaderMaterial).side).toBe(DoubleSide)
  })

  it('ask three for tone mapping and the sRGB encode by hand', () => {
    /* three appends neither to a ShaderMaterial. Without them the pond writes linear values into
       an sRGB framebuffer, and no amount of picking lighter colours fixes it -- the error is a
       curve, not an offset. */
    const bath = surface('Onsen_Surfaces_OnsenPools_001')
    buildPonds(world(bath), lakeMaterial())
    const frag = (bath.material as ShaderMaterial).fragmentShader
    expect(frag).toContain('#include <tonemapping_fragment>')
    expect(frag).toContain('#include <colorspace_fragment>')
  })
})

describe('the shared air', () => {
  it('takes the same fog and mist every other surface does', () => {
    expect(POND_U.fogColor).toBe(LAKE_U.fogColor)
    expect(POND_U.fogDensity).toBe(LAKE_U.fogDensity)
  })

  it('moves on one uniform', () => {
    const was = POND_U.uTime.value
    buildPonds(world(surface('Onsen_Surfaces_OnsenPools_001')), null).tick(0.25)
    expect(POND_U.uTime.value).toBeCloseTo(was + 0.25)
  })
})

describe('shadows', () => {
  it('neither casts nor receives, because a bath with a shadow map on it is a hole', () => {
    const bath = surface('Onsen_Surfaces_OnsenPools_001')
    const pond = surface('Garden_Surfaces_GardenWater_001')
    buildPonds(world(bath, pond), lakeMaterial())
    for (const m of [bath, pond]) {
      expect(m.castShadow).toBe(false)
      expect(m.receiveShadow).toBe(false)
    }
  })
})
