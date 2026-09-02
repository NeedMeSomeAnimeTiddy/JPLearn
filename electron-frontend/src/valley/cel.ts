import {
  Color, DataTexture, LinearFilter, MeshToonMaterial, NearestFilter, RGBAFormat,
  type Material, type Mesh, type MeshStandardMaterial, type Object3D, type Texture,
} from 'three'

/* ==================================================================================================
   CEL — THE SHADING THE PORT NEVER BROUGHT OVER, and the other half of why the valley read as a
   flat dark silhouette next to the mockup.

   `GLTFLoader` hands back `MeshStandardMaterial`, which is a PBR response: a smooth, physically
   plausible falloff from lit to unlit. The mockup does not use it. Every material in the world is
   rebuilt as a `MeshToonMaterial` against a FOUR-STEP gradient map, which is what puts hard shading
   bands on a roof and a hard terminator down a lantern post -- the thing that, together with the ink
   outlines, makes this a drawing rather than a render. The port kept the PBR materials and patched
   the atmosphere onto them, so at night every surface fell smoothly to near-black and the whole
   valley collapsed into one silhouette.

   WHAT SURVIVES THE SWAP, and each of these was lost once in the mockup before it was noticed:
     - the MAP. A texture that exists is work somebody did; toon takes a map, so the image survives
       and only the PBR response is discarded.
     - the SIDE. Blender's `use_backface_culling = False` exports as glTF `doubleSided: true` and
       GLTFLoader sets `side = DoubleSide` -- but a fresh MeshToonMaterial defaults to FrontSide.
       This world is modelled with single-layer roofs whose faces point UP, so from underneath they
       were culled and you saw sky through them: the belfry between its hip beams, and the soffit of
       every eave in the file.
     - the NAME. A name is the only channel Blender has to say anything to this code that is not
       geometry -- `EMIT_*` materials are a self-service switch, and the lanterns read it.
     - the EMISSION. glTF carries `emissiveFactor` and `emissiveTexture`; a rebuild that copies only
       colour and map silently discards everything authored as Emission in Blender. That is why
       "just author it in the .blend" had not been an option.
     - the VERTEX COLOURS, which most of this world is painted with rather than textured.

   ONE CONVERTED MATERIAL PER SOURCE MATERIAL. Minting a fresh one per mesh would give twenty
   thousand materials that happen to be identical -- and `collapseToInstances` groups on material
   identity, so a per-mesh material silently makes the whole scene un-instanceable.
   ================================================================================================== */

/* THE SHADOW IS COOLER THAN THE LIGHT, which is the one colour decision in the ramp. Shadows in
   open air are lit by the sky and the sky is blue; a neutral grey ramp is the "old" mode and reads
   as dirt on the surface rather than as shade. Brightness is held constant across the tint (see the
   luminance normalisation below) so this moves hue only. */
const SHADOW_TINT = [0.74, 0.87, 1.16]

/**
 * A gradient map for `MeshToonMaterial`.
 *
 * `steps` is how many bands, `exp` is how fast the light arrives across them, and `floor` is how
 * much light a surface facing away still receives -- the sky, in a scene with no other bounce.
 *
 * THE FLOOR IS SEPARATE FROM THE EXPONENT and cannot be folded into it. `pow()` at 2.0 puts the
 * first texel of a 64-step ramp at 0.00024: the shadow side of anything on it goes black.
 */
export function toonRamp(
  steps: number, filter: typeof NearestFilter | typeof LinearFilter,
  exp = 0.72, floor = 0,
): DataTexture {
  const tex = new DataTexture(new Uint8Array(steps * 4), steps, 1, RGBAFormat)
  tex.minFilter = filter
  tex.magFilter = filter
  /* the array this was just constructed with -- three's typing has it optional because a
     DataTexture can be made from a canvas, and this one cannot */
  const d = tex.image.data as Uint8Array
  for (let i = 0; i < steps; i++) {
    const v = floor + (1 - floor) * Math.pow((i + 1) / steps, exp)
    const rgb = [0, 1, 2].map((c) => v * (SHADOW_TINT[c] + (1 - SHADOW_TINT[c]) * v))
    /* back to the value it started with: hue moves, brightness does not */
    const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
    const k = lum > 1e-5 ? v / lum : 1
    for (let c = 0; c < 3; c++) d[i * 4 + c] = Math.round(255 * Math.min(1, rgb[c] * k))
    d[i * 4 + 3] = 255
  }
  tex.needsUpdate = true
  return tex
}

/* FOUR STEPS AND NEAREST, which is what the material is FOR. From the three.js docs,
   MeshToonMaterial renders with DISCRETE shading steps rather than a smooth gradient, and the
   gradient map is documented as wanting NearestFilter because quantising is the intended behaviour.
   Sixteen steps instead of four moves the bands; it never removes them. */
export const RAMP = toonRamp(4, NearestFilter)

/* AND THE DISTANT LANDFORM IS SMOOTH, deliberately. A toon ramp's lowest step is a large invisible
   fill -- at four steps a face turned completely away from the key still returns 37% of full
   diffuse -- which is right for a lantern post and wrong for a mountain, where it flattens the
   whole form. Sixty-four steps under a linear filter is a smooth ramp in everything but name, with
   a floor that keeps the shadow flank from going to nothing. Distant terrain rendered smooth
   against a cel-shaded foreground is the normal arrangement in stylised games, not a compromise. */
export const RAMP_MTN = toonRamp(64, LinearFilter, 1.8, 0.26)

/** the landforms, which take the smooth ramp rather than the four-step one */
const LANDFORM = /Landscape_Props_(Fuji|Range|FarRange)|_Terrain/i

/** the sky dome is drawn as-is: it is a backdrop, not a surface with a light on it */
const SKYDOME = /sky-?dome/i

export interface CelStats {
  /** how many meshes were walked */
  meshes: number
  /** how many distinct source materials became toon materials */
  materials: number
  /** of those, how many took the smooth landform ramp */
  landform: number
  /** how many carried an emission through from the .blend */
  emissive: number
}

/**
 * Rebuild every material in the loaded world as a toon material.
 *
 * Runs BEFORE `breathe`, so the atmosphere patches the material that will actually be drawn --
 * patching the standard material and then replacing it is how the cloud shadows would go missing.
 */
export function celWorld(root: Object3D): CelStats {
  const cache = new Map<string, MeshToonMaterial>()
  const stats: CelStats = { meshes: 0, materials: 0, landform: 0, emissive: 0 }

  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    if (SKYDOME.test(o.name)) return
    stats.meshes++

    const land = LANDFORM.test(o.name)
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const out = list.map((raw) => {
      const src = raw as MeshStandardMaterial
      if (!src) return raw
      /* already converted -- ten thousand trees share one material and are walked once each */
      if ((src as unknown as { isMeshToonMaterial?: boolean }).isMeshToonMaterial) return raw
      /* THE CACHE KEY CARRIES THE THINGS THAT MAKE TWO USES OF ONE SOURCE MATERIAL DIFFERENT:
         whether this mesh is painted per vertex, and which ramp it is on. Sidedness is already in
         `src.uuid`, since a material that differs in it is a different material. */
      const key = `${src.uuid}|${mesh.geometry.attributes.color ? 'vc' : ''}|${land ? 'mtn' : ''}`
      const hit = cache.get(key)
      if (hit) return hit

      const m = new MeshToonMaterial({
        color: src.color ? src.color.clone() : new Color(0x8899aa),
        map: (src.map as Texture | null) ?? null,
        gradientMap: land ? RAMP_MTN : RAMP,
        side: src.side,
      })
      m.name = src.name ?? ''
      if (src.emissive) {
        m.emissive.copy(src.emissive)
        m.emissiveIntensity = src.emissiveIntensity ?? 1
        if (src.emissiveMap) m.emissiveMap = src.emissiveMap
        if (m.emissive.getHex() !== 0) stats.emissive++
      }
      if (mesh.geometry.attributes.color) {
        m.vertexColors = true
        /* a painted mesh with no texture wants the paint, not the source's base tint on top of it */
        if (!m.map) m.color.setHex(0xffffff)
      }
      cache.set(key, m)
      stats.materials++
      if (land) stats.landform++
      return m
    })

    mesh.material = (Array.isArray(mesh.material) ? out : out[0]) as Material | Material[]
    mesh.castShadow = true
    mesh.receiveShadow = true
  })

  return stats
}
