import {
  MeshStandardMaterial, Object3D, SRGBColorSpace, Texture, TextureLoader, type Mesh,
} from 'three'

/* ==================================================================================================
   THE NIGHT LIGHTMAP — because six point lights cannot light a village, and no amount of tuning
   them will.

   three's renderer is forward: every light in the scene is looped over for every fragment of every
   lit material, and the count is compiled into the shader. Three hundred and sixty-two lanterns is
   not a number to tune, it is a different renderer. So the near field gets the lanterns' own
   emissive (see `lanterns.ts`) and everything else — the windows, the ground under the eaves, the
   glow down the onsen spine — comes from a texture baked once in Blender, where there is no light
   budget at all.

   THE CONTRACT IS THE SECOND UV SET, and that is deliberate. There is no list of object names to
   keep in step here and none in the .blend either: anything that comes back from the export
   carrying a `uv1` gets the night lightmap, and anything that does not, does not. Adding a building
   to the bake later means unwrapping it in Blender and nothing else. Measured on this world:
   eighteen of three hundred and fifty-six primitives carry it.

   AND CHANNEL 1 IS THE WHOLE POINT. Textures in three default to UV channel 0; a lightmap that
   samples the albedo UVs is a lightmap smeared across whatever tiling the surface happened to be
   painted with, which looks like a bug in the bake rather than a bug in the wiring.

   IT IS 8 MB OF PNG, which phase 0 already flagged as something that ought to be a compressed
   texture. It is loaded after the world and applied when it lands, so a slow disk costs a few dark
   windows for a moment and never a blocked boot — and a build without the file at all simply has no
   lit windows, which is exactly what the app did yesterday.
   ================================================================================================== */

export const NIGHT_LM_URL = './models/night_lightmap.png'

/* HOW HARD THE BAKE READS AT FULL NIGHT. The bake carries its own exposure, so this is a trim
   rather than a brightness: one number to reconcile a Blender render against ACES here. */
export const NIGHT_LM_GAIN = 1.0

export interface NightMap {
  /** the materials that carry a second UV set, and so take the bake */
  mats: MeshStandardMaterial[]
  texture: Texture | null
  /** 0 by day, 1 at full night — driven by the same `lampOn` the lanterns are */
  setOn: (on: number) => void
  dispose: () => void
}

/**
 * Collect every material whose mesh was unwrapped for the bake, and fetch the bake.
 *
 * Returns immediately; the texture is attached when it arrives.
 */
export function buildNightMap(root: Object3D, url = NIGHT_LM_URL): NightMap {
  const mats: MeshStandardMaterial[] = []
  const seen = new Set<string>()

  /* EIGHTEEN MESHES, ONE MATERIAL, measured on this world -- the ground meshes the bake was
     authored for (`Onsen_Surfaces_TownGround`, `Festival_Surfaces_FestivalGround`,
     `PAGX_Surfaces_Court` and the rest) all share it, so the whole town takes the bake off one
     `lightMapIntensity`. */
  let withUv1 = 0
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || !mesh.geometry?.getAttribute?.('uv1')) return
    withUv1++
    const mat = mesh.material as MeshStandardMaterial | MeshStandardMaterial[]
    if (Array.isArray(mat) || !mat?.isMeshStandardMaterial) return
    if (seen.has(mat.uuid)) return
    seen.add(mat.uuid)
    mats.push(mat)
  })

  const state: NightMap = {
    mats,
    texture: null,
    /* off until the day says otherwise; the cycle writes before the first frame */
    setOn: (on: number) => {
      for (const m of mats) m.lightMapIntensity = on * NIGHT_LM_GAIN
    },
    dispose: () => {
      for (const m of mats) { m.lightMap = null; m.needsUpdate = true }
      state.texture?.dispose()
      state.texture = null
    },
  }
  state.setOn(0)

  if (!mats.length) {
    console.warn('[valley] nothing in the world carries a uv1; the bake has nowhere to go')
    return state
  }

  new TextureLoader().load(
    url,
    (tex) => {
      tex.colorSpace = SRGBColorSpace
      /* glTF UVs, so the same convention the model's own maps already use */
      tex.flipY = false
      tex.channel = 1
      state.texture = tex
      for (const m of mats) { m.lightMap = tex; m.needsUpdate = true }
      console.info(`[valley] night lightmap on ${mats.length} materials, ${withUv1} meshes`)
    },
    undefined,
    () => {
      /* NOT AN ERROR. The UVs are in the model and the bake is a separate artifact; a build without
         it has a dark town at night, which is a smaller wrong thing than a boot that fails. */
      console.info(`[valley] no ${url} — the UVs are there, the bake is not`)
    },
  )

  return state
}
