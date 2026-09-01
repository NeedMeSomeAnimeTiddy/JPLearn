import { Color, Mesh, MeshStandardMaterial, Object3D } from 'three'

/* ==================================================================================================
   THE LANTERNS — what makes the mockup's night a place and this port's night an empty valley.

   TWO MECHANISMS, AND THE SPLIT IS THE WHOLE DESIGN. A lantern has to LOOK lit and it has to LIGHT
   things, and those are different problems at wildly different prices.

     - LOOKING lit is emissive, and emissive is free: a colour added to a surface. All of them can
       glow at once and the cost is nothing. From the menu's standing point, six thousand units up
       the valley, this is the entire effect — a scatter of warm points in the dark.
     - LIGHTING things is a point light, and three's renderer is forward: every light in the scene
       is looped over for every fragment of every lit material, whether or not it reaches them. The
       mockup keeps a pool of six that follow the camera for the near field.

   THIS PORT DOES THE FIRST AND NOT THE SECOND, deliberately. The menu never gets closer than a
   destination fly-in, and a point light with a 1,400-unit reach is a pool on the ground around one
   lantern — at six thousand units none of them would reach anything anyway. The pool is what to add
   if the camera ever walks the town, and it has to be added as SIX PERMANENT LIGHTS at zero
   intensity rather than lights that appear at dusk: the light count is part of every material's
   program cache key, so adding them at nightfall would recompile the world's shaders in the middle
   of a sunset.

   AND THE PAPER ONES ARE NOT THE STONE ONES. A chochin is a candle behind paper and a toro is a
   candle behind a slab of granite, so what they SHOW differs by more than a factor of two. The
   mockup found the stone ones at 0.18 read as unlit from any distance — "a garden of 250 unlit
   lanterns next to a handful of bright paper ones" — and that is a glow problem rather than a light
   one: what a stone lantern CASTS really is that much dimmer, but the lantern itself still has to
   be visibly on.
   ================================================================================================== */

/** what a lantern is, by name, straight from the mockup */
export const LAMP_RE = /(^|[_\-.])(chochin|gaslamp|lant|lantern|andon|toro|lamp)/i
/** and what is only the thing it stands on */
export const LAMP_NOT = /(pole|post|stand|bracket|base)/i
/** the ones that are a candle behind paper rather than behind stone */
export const LAMP_PAPER = /(chochin|gaslamp|andon|lamp)/i

/* AND A MATERIAL CAN SAY SO ITSELF, which is the rule that reaches the windows. Object names
   carry the lamp patterns above, but a building is not called a lantern -- `PROP_inn_1` and
   `PROP_bathhouse` are inns and bathhouses, and what glows on them is a material slot named
   `EMIT_window`. Any material whose NAME begins with EMIT is a lamp, at paper strength, and
   adding one in Blender is the whole of adding a light to this world. Measured here: two of the
   world's fifty-three materials qualify, over fifteen meshes. */
export const LAMP_EMIT_MAT = /^emit/i

/** the flame's own colour, for anything the model did not author an emission for */
export const LAMP_COLOUR = 0xffa94e
export const GAIN_PAPER = 1.35
export const GAIN_STONE = 0.5

/** a material that has been made into a lantern, and what it needs to be turned up */
export interface LampMat {
  mat: MeshStandardMaterial
  gain: number
  /* WHAT BLENDER AUTHORED, IF ANYTHING. An EMIT material or an Emission value set in the model wins
     over the built-in flame colour — the cycle then only decides how far up it is turned. */
  base: Color | null
}

export interface LanternField {
  mats: LampMat[]
  /** how many meshes were caught, for the boot line */
  meshes: number
  /** turn the whole valley's lanterns up or down; 0 is out, 1 is full night */
  setOn: (on: number) => void
}

const FLAME = new Color(LAMP_COLOUR)

/**
 * Find every lantern in the world and give it a flame it can turn up.
 *
 * MUST RUN BEFORE THE ATMOSPHERE PATCH. `Material.clone()` copies `userData` but NOT
 * `onBeforeCompile`, so a clone taken after `breathe` would carry the `atmos` flag, take the
 * patch's early return, and silently lose the mist, the cover and the rim — one lantern-shaped
 * hole in the air per material. Cloning first means `breathe` simply walks the clones too.
 */
export function buildLanterns(root: Object3D): LanternField {
  const mats: LampMat[] = []
  /* KEYED ON THE MATERIAL AND ON WHAT IT IS MADE OF. One source material is shared across both
     kinds here, and a paper lantern and a stone one must not end up sharing a clone. */
  const swap = new Map<string, MeshStandardMaterial>()
  let meshes = 0

  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    /* `collapseToInstances` renames what it batches to `inst:<first member>`, so the name test has
       to survive that prefix -- which it does, because it is unanchored. */
    const src = mesh.material as MeshStandardMaterial | MeshStandardMaterial[]
    if (Array.isArray(src) || !src?.isMeshStandardMaterial) return
    /* the material's own name wins: an EMIT slot is a light wherever it has been put */
    const emit = LAMP_EMIT_MAT.test(src.name ?? '')
    if (!emit && (!LAMP_RE.test(o.name) || LAMP_NOT.test(o.name))) return

    const paper = emit || LAMP_PAPER.test(o.name)
    const key = src.uuid + (paper ? '|p' : '|s')
    let clone = swap.get(key)
    if (!clone) {
      clone = src.clone()
      const authored = clone.emissive
        && (clone.emissive.r + clone.emissive.g + clone.emissive.b) > 0.004
      mats.push({
        mat: clone,
        gain: paper ? GAIN_PAPER : GAIN_STONE,
        base: authored ? clone.emissive.clone() : null,
      })
      swap.set(key, clone)
    }
    mesh.material = clone
    meshes++
  })

  const setOn = (on: number) => {
    for (const l of mats) l.mat.emissive.copy(l.base ?? FLAME).multiplyScalar(on * l.gain)
  }
  /* out at build time: the day cycle turns them up, and it runs before the first frame */
  setOn(0)

  return { mats, meshes, setOn }
}
