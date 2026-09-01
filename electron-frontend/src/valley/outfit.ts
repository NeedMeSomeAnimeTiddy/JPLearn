import { BufferAttribute, BufferGeometry, Color, InstancedMesh, Material, Vector3 } from 'three'
import { walkRnd } from './walk'

/* ==================================================================================================
   AND THEY ARE NOT ALL WEARING THE SAME THING.

   MEASURED IN THIS EXPORT: ten person models, 1,038 figures, and every single robe is the same
   slate — linear (0.0353, 0.0706, 0.1176), which is #374c60 in sRGB. Not eight colours over a
   thousand people, which is what the mockup was solving. One.

   That is worth stating precisely because the mockup's palette note reads as if the first eight
   entries were the world's own eight robes ("the ones Robbie painted... slate, pink, dusty blue,
   cream, sage, red, pine, lilac"). They were, in the export it was written against. Since then
   `models/swap_crowd.py` has put all ten of the newer models into `world.glb` and they share one
   dye — so the first entry of the palette is this valley's robe and the other twenty-one are what
   it is being given. Everything the mockup says about the register still holds; there is simply
   more to do than it describes.

   THE OUTFIT HAS TO BE A PER-INSTANCE FACT, and the only per-instance channel three gives an
   InstancedMesh without inventing one is `instanceColor`. It is a vec3, and three colours will not
   fit in three floats — so what it carries is three INDICES, one for the robe, one for the skin,
   one for the hair, with each one's FRACTIONAL PART being that person's own jitter. The shader
   floors for the palette entry and takes fract() for the wander.

   THE FIGURES ARE VERTEX-COLOURED, WHICH IS WHY THIS IS CHEAP AND EXACT. There is no texture on a
   person: `JP_VertexColor` and a COLOR_0 attribute, four to six flat colours over 270-422 vertices.
   Tinting by instanceColor the way three does it out of the box would dye the hands and the hair to
   match the coat. So each vertex is classified once into robe / trim / skin / hair / leave-alone,
   baked into the geometry as `aPart`, and the shader repaints the robe and leaves the face.

   CLASSIFIED BY MEASUREMENT, NOT BY A LIST OF COLOURS. A hard-coded #e3c1a3 would work today and
   break on the first re-export that touches the palette — and it would break SILENTLY, as a crowd
   with painted faces, which is not a thing anyone would think to test for.
   ================================================================================================== */

/* THE PALETTE, AND THE FIRST ENTRY IS THE VALLEY'S OWN. Everything after it is in the same
   register — the same lightness, the same restraint, more hues.

   THE MOCKUP'S SECOND ATTEMPT AT THIS LIST IS THE ONE THAT SURVIVED, and its reasoning is worth
   keeping because both failures are instructive. The first invented a palette from scratch —
   indigo, charcoal, bengara, the dyes a village would really have used — and read as MORE uniform
   than what it replaced, because it was a set of dark blues against a world of soft mid-tones. The
   second was too loud: measured, `#a3b56b` sat at saturation 0.33 and the per-figure jitter takes
   that to 0.42, which made the additions the brightest things in the crowd. The replacements are
   named dyes — ai-nezu, sabi-asagi, rikyū-nezu, koke-nezu, miru, susutake, kuwazome, chōji, kinari,
   suna, budō-nezu, fuji-nezu, hai-zakura — and the point of that family is that almost every one is
   a colour taken most of the way to grey, which is what a plant dye on hemp looks like. All at or
   under saturation 0.28; the spread is carried by value and hue instead. */
export const ROBE_PAL = [
  0x374c60, 0xeaa0b0, 0x70819d, 0xd5c7ae, 0x90a57c, 0xb1433e, 0x4e6856, 0xcab9da,
  0x3a4e5e, 0x4a5f70, 0x6b7f86, 0x7c8579, 0x77805f, 0x4f5744, 0x6f5647, 0x8a6f5a,
  0xbda98a, 0xd6cdbf, 0xa89f92, 0x6e5d6b, 0x8f8aa0, 0xb99a94,
]

/* SKIN AND HAIR GET PALETTES OF THEIR OWN. Ten models over a thousand people is ten faces and ten
   heads of hair, which is a chorus line.

   THE AUTHORED TONE IS THE LIGHTEST AND EVERYTHING ELSE GOES DARKER. #e3c1a3 is what every face in
   this world is painted, and a face is a blank block at this scale — so a tone even a little paler
   stops reading as a face and starts reading as a mask. Ending the range at the world's own value
   keeps every face believable and still spans pale to deep. */
export const SKIN_PAL = [
  0xe3c1a3, 0xdcb693, 0xd3a781, 0xc6946c, 0xb8825b, 0xa8714c, 0x96603f, 0x835134,
  0x6d422b, 0x583523, 0x45291b,
]
/* WEIGHTED BY HOW MANY PEOPLE ACTUALLY HAVE EACH TONE, not picked evenly off the ramp — an even
   pick puts as many of the palest tone in a crowd as of the commonest, which no population looks
   like. This valley is in Japan, so the weight sits in the light to light-medium band and tapers
   hard; the tail is thin rather than zero, because a village is not uniform and a hard zero is a
   decision to exclude rather than a distribution. */
export const SKIN_WEIGHT = [24, 40, 48, 38, 24, 13, 6, 3, 2, 1, 1]
/* black and dark brown fill most of the list on purpose: the pick is biased toward the front and
   grey sits at index 10 of 12, so about one head in twenty-five is an elder's. The mockup's first
   table put grey at 8 of 10 and gave the village a pensioners' outing. */
export const HAIR_PAL = [
  0x14100e, 0x14100e, 0x14100e, 0x1c1512, 0x1c1512, 0x241a14, 0x2f2119, 0x3d2b1d,
  0x4d3826, 0x63513c, 0x8e8b84, 0xc2beb4,
]

/** a slight lean on the front of the robe palette, where the valley's own dye is */
export const ROBE_BIAS = 1.15
/** black and dark brown common, grey and white rare */
export const HAIR_BIAS = 2.4
/** how far one slate blue may differ from the next: robe, skin, hair */
export const VARY = [0.22, 0.1, 0.12] as const

/* GLSL array sizes are compile-time constants, so the arrays are a fixed length and the tail is
   filled with the last real entry — an out-of-range index can then only ever give a plausible
   colour rather than black. */
export const PAL_N = 32

export const OUTFIT_U = {
  /** 0 puts every authored robe back, for an A/B */
  uFit: { value: 1 },
  /** whether the obi is repainted with the robe */
  uFitSash: { value: 1 },
  uFitVary: { value: new Vector3(VARY[0], VARY[1], VARY[2]) },
  uRobePal: { value: [] as Color[] },
  uSkinPal: { value: [] as Color[] },
  uHairPal: { value: [] as Color[] },
}

function fill(hexes: readonly number[]): Color[] {
  const out: Color[] = []
  for (let i = 0; i < PAL_N; i++) out.push(new Color(hexes[Math.min(i, hexes.length - 1)]))
  return out
}

export function outfitPalettes(): void {
  OUTFIT_U.uRobePal.value = fill(ROBE_PAL)
  OUTFIT_U.uSkinPal.value = fill(SKIN_PAL)
  OUTFIT_U.uHairPal.value = fill(HAIR_PAL)
}

/* ---- classifying a model ----------------------------------------------------------------------
   SKIN AND HAIR HAVE TO BE TOLD APART, AND NEITHER POSITION NOR SIZE CAN DO IT. Long hair hangs
   below the robe's shoulder line, so a geometric rule files it as clothing and paints a woman's
   hair with the obi's colour. Every model shares one skin colour and one hair colour — measured,
   byte-identical across all ten — but so does the base ROBE and so does the OBI, so "the colour
   most models share" catches four things rather than two.

   The reference is READ OFF THE PLAINEST MODEL instead: a figure with the fewest colour groups that
   still has two of them above its own shoulders is the base one, and in that one the split IS
   geometric — the lighter of the two is skin and the darker is hair. Those colours are then matched
   by value in every other model, however far down its hair reaches or what it has on its head.

   PLAINEST FIRST, BUT KEEP TRYING. Taking only the model with the fewest groups picks the MONK
   here — robe, skin, kesa, obi, and no hair at all, because a monk is shaved — so the pair could
   never be found and every face in the valley would go unrecognised. Walk the candidates from
   plainest upwards and accept the first that actually has two things above its own shoulders. */

export interface ColourGroup {
  n: number
  lo: number
  hi: number
  r: number
  g: number
  b: number
  k: string
  part: number
}

export function outfitGroups(geo: BufferGeometry): { groups: ColourGroup[] } | null {
  const col = geo.getAttribute('color')
  const pos = geo.getAttribute('position')
  if (!col || !pos) return null
  const groups = new Map<string, ColourGroup>()
  for (let i = 0; i < pos.count; i++) {
    const r = col.getX(i)
    const g = col.getY(i)
    const b = col.getZ(i)
    const k = `${r.toFixed(4)},${g.toFixed(4)},${b.toFixed(4)}`
    let e = groups.get(k)
    if (!e) { e = { n: 0, lo: Infinity, hi: -Infinity, r, g, b, k, part: 0 }; groups.set(k, e) }
    e.n++
    const y = pos.getY(i)
    if (y < e.lo) e.lo = y
    if (y > e.hi) e.hi = y
  }
  return { groups: [...groups.values()] }
}

const lum = (e: ColourGroup): number => e.r * 0.3 + e.g * 0.59 + e.b * 0.11
/* the shoulder line: the top of the robe, less a sixth of the robe's own height */
const shoulderOf = (robe: ColourGroup): number => robe.hi - (robe.hi - robe.lo) * 0.15

export interface OutfitRef {
  skin: ColourGroup | null
  hair: ColourGroup | null
  from: string
}

export function outfitReference(geos: readonly BufferGeometry[]): OutfitRef {
  const cand: { g: BufferGeometry; groups: ColourGroup[] }[] = []
  for (const g of geos) {
    const info = outfitGroups(g)
    if (info && info.groups.length >= 3) cand.push({ g, groups: info.groups })
  }
  cand.sort((a, b) => a.groups.length - b.groups.length)
  for (const c of cand) {
    const list = c.groups.slice().sort((a, b) => b.n - a.n)
    const robe = list[0]
    const line = shoulderOf(robe)
    const head = list.filter((e) => e !== robe && e.lo >= line)
    if (head.length < 2) continue
    /* lightest is the face, darkest is the hair — true with a straw hat between them too */
    head.sort((a, b) => lum(b) - lum(a))
    return {
      skin: head[0],
      hair: head[head.length - 1],
      from: `${c.g.name || 'unnamed'} (${c.groups.length} groups)`,
    }
  }
  return { skin: null, hair: null, from: '' }
}

/* MATCHED WITH A TOLERANCE, NOT BY AN EXACT KEY. The mockup found its authored hair at linear
   (0.016807, 0.011612, 0.009134) and its generated figures at (0.0166, 0.0116, 0.0091) — one byte
   apart, because the generator was written with the reference rounded to three places. A string key
   on four decimals therefore matched skin in every model and hair in none, and a head of hair that
   fails to be recognised as hair gets painted with the obi's colour. 0.02 is far wider than any
   byte-rounding difference and far narrower than the gap between any two parts of the figure. */
export const OUTFIT_TOL = 0.02

function same(a: ColourGroup, b: ColourGroup | null): boolean {
  return !!b && Math.abs(a.r - b.r) < OUTFIT_TOL && Math.abs(a.g - b.g) < OUTFIT_TOL
    && Math.abs(a.b - b.b) < OUTFIT_TOL
}

/** the five parts: 0 leave as authored, 1 robe, 2 trim, 3 skin, 4 hair */
export function outfitParts(geo: BufferGeometry, ref: OutfitRef): boolean {
  if (!geo || geo.getAttribute('aPart')) return false
  const info = outfitGroups(geo)
  if (!info) return false
  const pos = geo.getAttribute('position')
  const col = geo.getAttribute('color')
  const list = info.groups.slice().sort((a, b) => b.n - a.n)

  /* skin and hair first, BY COLOUR, because a woman's hair reaches past the shoulders and any rule
     that reads position files it as clothing */
  let robe: ColourGroup | null = null
  for (const g of list) {
    if (same(g, ref.skin)) { g.part = 3; continue }
    if (same(g, ref.hair)) { g.part = 4; continue }
    if (!robe) { robe = g; g.part = 1; continue }
    g.part = -1
  }
  if (!robe) return false

  /* THE ROBE IS THE BIGGEST GROUP THAT IS NEITHER, AND THE REST IS MEASURED AGAINST IT — not
     against the figure's total height, which a HAT breaks: a kasa moves the top of the box to the
     brim and the face's own bottom edge then falls below any fixed fraction. Anything at or above
     the robe's shoulders keeps the colour it was given (straw stays straw, and so does the pack on
     a pedlar's back); anything below is trim and takes the obi treatment. */
  const shoulders = shoulderOf(robe)
  for (const g of list) if (g.part === -1) g.part = g.lo >= shoulders ? 0 : 2

  const by = new Map(list.map((g) => [g.k, g.part]))
  const arr = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    const k = `${col.getX(i).toFixed(4)},${col.getY(i).toFixed(4)},${col.getZ(i).toFixed(4)}`
    arr[i] = by.get(k) ?? 0
  }
  geo.setAttribute('aPart', new BufferAttribute(arr, 1))
  return true
}

/* ---- who wears what ---------------------------------------------------------------------------- */

function pick(k: number, salt: number, n: number, bias: number): number {
  return Math.min(n - 1, Math.floor((walkRnd(k, salt) ** bias) * n))
}

/** the index whose share of the total the hash lands in */
function weighted(k: number, salt: number, weights: readonly number[], n: number): number {
  if (weights.length !== n) return pick(k, salt, n, 1)
  let total = 0
  for (let i = 0; i < n; i++) total += weights[i]
  let r = walkRnd(k, salt) * total
  for (let i = 0; i < n; i++) { r -= weights[i]; if (r < 0) return i }
  return n - 1
}

/** three palette indices with each one's own jitter in the fractional part */
export function outfitCode(k: number, out: Color): Color {
  out.r = pick(k, 91, ROBE_PAL.length, ROBE_BIAS) + walkRnd(k, 92) * 0.999
  out.g = weighted(k, 95, SKIN_WEIGHT, SKIN_PAL.length) + walkRnd(k, 96) * 0.999
  out.b = pick(k, 97, HAIR_PAL.length, HAIR_BIAS) + walkRnd(k, 98) * 0.999
  return out
}

/* ---- the shader -------------------------------------------------------------------------------
   THE LOOKUP HAPPENS IN THE VERTEX STAGE. `aPart` is per-vertex, so the vertex already knows
   whether it is robe, obi, skin or hair — it can fetch its own colour out of the right palette once
   and hand the fragment a finished vec3. Doing it per fragment would mean carrying all three
   palettes' worth of indices through and branching there instead, for the same answer. */
const OUTFIT_GLSL = `
  varying vec3 vFit;
  varying float vPart;
  uniform float uFit, uFitSash;
  uniform vec3 uRobePal[ ${PAL_N} ];
  uniform vec3 uSkinPal[ ${PAL_N} ];
  uniform vec3 uHairPal[ ${PAL_N} ];
  /* the fractional part of each index is this person's own wander -- a brightness nudge only,
     which is what fading cloth and differing complexions actually look like. A hue shift here
     would invent colours the palette never had. */
  vec3 fitPick( vec3 pal[ ${PAL_N} ], float code, float amt ) {
    int i = int( clamp( floor( code ), 0.0, float( ${PAL_N} - 1 ) ) );
    return pal[ i ] * ( 1.0 + ( fract( code ) - 0.5 ) * 2.0 * amt );
  }
  vec3 fitHSV( vec3 c ) {
    float mx = max( c.r, max( c.g, c.b ) ), mn = min( c.r, min( c.g, c.b ) );
    float d = mx - mn;
    float h = 0.0;
    if ( d > 1e-5 ) {
      if ( mx == c.r ) h = mod( ( c.g - c.b ) / d, 6.0 );
      else if ( mx == c.g ) h = ( c.b - c.r ) / d + 2.0;
      else h = ( c.r - c.g ) / d + 4.0;
    }
    return vec3( h / 6.0, mx > 1e-5 ? d / mx : 0.0, mx );
  }
  vec3 fitRGB( vec3 c ) {
    vec3 k = clamp( abs( mod( c.x * 6.0 + vec3( 0.0, 4.0, 2.0 ), 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 );
    return c.z * mix( vec3( 1.0 ), k, c.y );
  }
  /* EVERY OBI IN THIS WORLD IS THE SAME RED -- measured, linear (0.4353, 0.0510, 0.0431), which is
     #b1433e -- so red is home, and an obi that wanders off it stops looking like this world's obi.
     It gets a small nudge off the robe's own hue so no two are quite alike, and it only LEAVES the
     red family when it has to: on a red or pink robe a red sash is not a sash, it is a smudge, so
     those ones swing across the wheel instead. */
  vec3 fitSash( vec3 robe ) {
    vec3 h = fitHSV( robe );
    float dRed = min( h.x, 1.0 - h.x );
    float away = smoothstep( 0.13, 0.02, dRed );
    float hue = mix( fract( 0.015 + ( h.x - 0.5 ) * 0.055 + 1.0 ), fract( h.x + 0.45 ), away );
    float sat = mix( 0.66, clamp( h.y * 1.15 + 0.3, 0.0, 0.9 ), away );
    /* and the band always reads: lighter than a dark robe, darker than a pale one */
    float val = clamp( 0.64 + ( 0.5 - h.z ) * 0.34, 0.26, 0.88 );
    return fitRGB( vec3( hue, sat, val ) );
  }`

/**
 * Chain the wardrobe onto a material.
 *
 * CHAINED, like the idle and the windows, and its own cache key for the same reason: three's
 * default key is `onBeforeCompile.toString()`, so a material whose hook reads like another's shares
 * its compiled program.
 */
export function outfitPatch(mat: Material): Material {
  const flagged = mat as Material & { userData: { outfit?: boolean } }
  if (flagged.userData.outfit) return mat
  flagged.userData.outfit = true

  const prev = mat.onBeforeCompile
  const prevKey = mat.customProgramCacheKey

  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer)
    Object.assign(shader.uniforms, OUTFIT_U)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${OUTFIT_GLSL}
        uniform vec3 uFitVary;
        attribute float aPart;`)
      /* three has just multiplied instanceColor into vColor for every fragment of the figure, head
         and hands included. Put the authored colour back, and resolve THIS vertex's own colour out
         of the palette its part points at. */
      .replace('#include <color_vertex>', `#include <color_vertex>
        vPart = aPart;
        vFit = vec3( 1.0 );
        #ifdef USE_COLOR
          vColor.rgb = color.rgb;
        #endif
        #ifdef USE_INSTANCING_COLOR
          if ( aPart > 2.5 ) {
            vFit = aPart > 3.5
              ? fitPick( uHairPal, instanceColor.b, uFitVary.z )
              : fitPick( uSkinPal, instanceColor.g, uFitVary.y );
          } else {
            vFit = fitPick( uRobePal, instanceColor.r, uFitVary.x );
          }
        #endif`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${OUTFIT_GLSL}`)
      /* vColor IS A vec4 IN THIS BUILD, not the vec3 it was for years -- `color_pars_fragment`
         declares `varying vec4 vColor` and `color_fragment` is a whole-vector multiply. Writing
         `vec3 fit = vColor` compiles nowhere, and writing it into diffuseColor without the swizzle
         would put the robe's blue into the figure's alpha. */
      .replace('#include <color_fragment>', `
        {
          vec3 fit = vColor.rgb;
          if ( vPart > 0.5 ) {
            /* 2 is the obi -- derived from the robe rather than picked, so it can never clash;
               1, 3 and 4 already arrived resolved from the vertex stage */
            vec3 want = ( vPart > 1.5 && vPart < 2.5 )
              ? mix( vColor.rgb, fitSash( vFit ), uFitSash ) : vFit;
            fit = mix( vColor.rgb, want, uFit );
          }
          diffuseColor.rgb *= fit;
        }`)

    if (!shader.fragmentShader.includes('fitSash( vFit )')
      || !shader.vertexShader.includes('vPart = aPart;')) {
      console.error(`[valley] the outfit patch did not take on ${mat.name}`)
    }
  }
  mat.customProgramCacheKey = () => `${prevKey ? prevKey.call(mat) : ''}|outfit`
  mat.needsUpdate = true
  return mat
}

export interface Wardrobe {
  /** how many models were classified */
  models: number
  /** how many figures were dressed */
  figures: number
  /** which model the skin and hair reference came off */
  from: string
  /** how many models each reference was found in */
  found: { skin: number; hair: number }
}

const _c = new Color()

/**
 * Dress everyone.
 *
 * RUNS AFTER THE WALKERS AND THE BOAT RIDERS EXIST, because those are crowd geometries on meshes of
 * their own — and a passenger in the authored slate next to a walker in twenty-two colours is worse
 * than either alone.
 */
export function buildOutfits(meshes: readonly InstancedMesh[]): Wardrobe {
  const out: Wardrobe = { models: 0, figures: 0, from: '', found: { skin: 0, hair: 0 } }
  if (!meshes.length) return out
  outfitPalettes()

  const geos = [...new Set(meshes.map((m) => m.geometry))]
  const ref = outfitReference(geos)
  out.from = ref.from
  if (!ref.skin || !ref.hair) {
    console.warn('[valley] could not identify skin and hair; leaving faces alone')
    return out
  }

  const mats = new Set<Material>()
  let k = 0
  for (const m of meshes) {
    if (outfitParts(m.geometry, ref)) out.models++
    if (!m.isInstancedMesh) continue
    const mat = m.material as Material | Material[]
    if (!Array.isArray(mat)) mats.add(mat)
    /* THE WHOLE ALLOCATION, NOT JUST `count`. A walker mesh is built at its capacity and filled
       afterwards, and an undressed instance would be the one figure in the valley still in the
       authored colour. */
    const n = m.instanceMatrix.count
    for (let i = 0; i < n; i++) m.setColorAt(i, outfitCode(k++, _c))
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    out.figures += n
  }
  for (const mat of mats) outfitPatch(mat)

  /* self-checking: a re-export that changes the palette says so instead of quietly tinting faces */
  for (const g of geos) {
    const info = outfitGroups(g)
    if (!info) continue
    for (const e of info.groups) {
      if (same(e, ref.skin)) out.found.skin++
      if (same(e, ref.hair)) out.found.hair++
    }
  }
  return out
}
