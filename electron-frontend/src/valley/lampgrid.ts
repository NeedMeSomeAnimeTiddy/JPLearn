import {
  Color, DataTexture, FloatType, NearestFilter, RGBAFormat, Vector2, Vector4, type Vector3,
} from 'three'

/* ==================================================================================================
   THE LANTERNS LIGHT THINGS, WHICH UNTIL NOW THEY DID NOT.

   A lantern has to LOOK lit and it has to LIGHT things, and this port only ever did the first: 879
   emissive surfaces glowing in the dark and casting nothing. Measured against the mockup at the same
   camera and hour, the difference is not subtle -- 8,386 warm-lit pixels there against 2,203 here,
   3.8 times the area, at a slightly LOWER peak. Its lamps spread light; ours were hot points.

   NOT POINT LIGHTS. Three's renderer is forward: every light is looped over for every fragment of
   every lit material whether or not it reaches them, so 879 of them is not a thing that can be
   asked for. The mockup's answer is a spatial grid in the shader, and it is what this is:

     - a DATA texture, one texel per lamp, carrying its position in RGB and its strength in A;
     - a GRID texture over the valley's floor plan, 192 x 192, each texel holding the IDS OF THE
       FOUR NEAREST LAMPS to that cell;
     - and four texture reads per fragment, which is a fixed cost no matter how many lanterns the
       valley grows.

   FOUR IS ENOUGH BECAUSE THE REACH IS SHORT. At 300 units a lamp is dark by 780, and nowhere in
   this town do five lanterns reach the same square metre with anything worth adding.

   AND THE FLICKER LIVES IN THE DATA TEXTURE, which is the whole reason it is affordable: a lamp's
   strength is already one number there, so making 879 flames breathe independently is not a new
   system, a new material or a new draw call -- it is writing 879 floats and re-uploading fourteen
   kilobytes. As a uniform it would have to be the same for every lamp in the valley, which reads as
   the whole village dimming at once and is worse than none.
   ================================================================================================== */

/** the floor plan's resolution. 192 x 192 cells over whatever the lamps span */
export const LAMP_GRID_N = 192
/** how far a lamp reaches before the falloff has taken it; dark by 2.6x this */
export const LAMP_REACH = 300
/* HOW HARD THE POOL IS, AND IT IS NOT THE MOCKUP'S 1.8 -- because this walk finds more flames than
   its does. `NAV.lamps()` reports 588 there; `buildLanterns` finds 879 here, and every one of them
   is a light in the grid, so the same per-lamp figure delivers half again as much light to the same
   streets. Matched on the frame instead of on the constant: measured at the same camera and hour,
   1.8 put 29,998 warm-lit pixels on screen against the mockup's 8,439, and 0.7 puts about 8,100.
   If the lamp walk ever changes what it counts, this is the number that moves with it. */
export const LAMP_I = 0.7
export const LAMP_LIGHT_COLOUR = 0xffa64a

/* ==================================================================================================
   AND EIGHT LAMPS THAT ARE NOT IN THE GRID, because they are on boats.

   THE GRID IS A FLOOR PLAN BAKED ONCE. Every cell holds the ids of the four nearest lamps to it,
   worked out at load and never touched again -- which is exactly what makes it affordable, and
   exactly why a lamp that MOVES cannot live in it. A sailing boat's chochin would light the mooring
   it was exported at for the rest of the run.

   SO THEY ARE PLAIN UNIFORMS INSTEAD, and at this count that is the cheaper answer anyway: eight
   vec4s and a loop with a uniform bound costs every lit fragment eight distance tests, against a
   rebuild of a 192 x 192 grid every frame. The bound is a uniform rather than a literal, so the
   whole draw takes the same branch and there is no divergence to pay for. `uMoveN` is the real off
   switch -- zeroing it skips the loop outright rather than adding eight lights of strength zero.
   ================================================================================================== */
export const MOVE_LAMPS = 8

export const LAMP_U = {
  uLampData: { value: null as DataTexture | null },
  uLampGrid: { value: null as DataTexture | null },
  uLampDataSize: { value: new Vector2(1, 1) },
  uLampOrigin: { value: new Vector2() },
  uLampInvSpan: { value: new Vector2(1, 1) },
  uLampColor: { value: new Color(LAMP_LIGHT_COLOUR) },
  uLampReach: { value: LAMP_REACH },
  uLampI: { value: LAMP_I },
  /** 0 by day; the same `lampOn` the emissives take */
  uLampOn: { value: 0 },
  /** how many of the slots below are live this frame; 0 skips the loop */
  uMoveN: { value: 0 },
  /** xyz where a travelling flame is, w how hard it is burning this frame */
  uMoveL: { value: Array.from({ length: MOVE_LAMPS }, () => new Vector4()) },
}

/* THE BLOCK EVERY LIT MATERIAL NEEDS. It goes in at `lights_fragment_end`, where three has finished
   gathering direct light and `diffuseColor` is still the albedo at this point -- before the toon ramp
   quantises anything.

   TIMES THE SURFACE'S OWN COLOUR, and the mockup records leaving that out as the mistake that washed
   its whole town to one gold. Adding a fixed orange to every fragment is not light, it is coloured
   fog: a blue wall and a red one receive the same amount of the same hue and both drift toward the
   lamp's colour. Light is REFLECTED -- what you see is the lamp's spectrum multiplied by what the
   surface keeps of it, so a red awning under a warm lamp goes deeper red and a blue one barely lifts.
   That multiply is the difference between lighting a scene and tinting it. */
export const LAMP_HEAD = `
  uniform sampler2D uLampData, uLampGrid;
  uniform vec2 uLampDataSize, uLampOrigin, uLampInvSpan;
  uniform vec3 uLampColor;
  uniform float uLampReach, uLampI, uLampOn;
  uniform int uMoveN;
  uniform vec4 uMoveL[ ${MOVE_LAMPS} ];`

export const LAMP_GLSL = `
  if ( uLampOn > 0.001 ) {
    vec3 lampN = normalize( vAtmosN );
    vec3 lamp = vec3( 0.0 );
    /* the boats' lanterns, which move -- see MOVE_LAMPS. Same falloff as the grid's, so a lantern
       carried off a jetty and onto a hull does not change brightness as it crosses. */
    for ( int i = 0; i < ${MOVE_LAMPS}; i++ ) {
      if ( i >= uMoveN ) break;
      vec3 md = uMoveL[ i ].xyz - vAtmosPos;
      float mdist = max( length( md ), 1e-4 );
      float matt = uMoveL[ i ].w / ( 1.0 + mdist * mdist / ( uLampReach * uLampReach ) );
      matt *= max( 0.0, 1.0 - mdist / ( uLampReach * 2.6 ) );
      lamp += uLampColor * ( matt * max( dot( lampN, md / mdist ), 0.0 ) );
    }
    vec2 g = ( vAtmosPos.xz - uLampOrigin ) * uLampInvSpan;
    if ( g.x > 0.0 && g.x < 1.0 && g.y > 0.0 && g.y < 1.0 ) {
      vec4 cell = texture2D( uLampGrid, g );
      for ( int i = 0; i < 4; i++ ) {
        float id = i == 0 ? cell.x : i == 1 ? cell.y : i == 2 ? cell.z : cell.w;
        if ( id < 0.0 ) continue;
        vec2 duv = ( vec2( mod( id, uLampDataSize.x ), floor( id / uLampDataSize.x ) ) + 0.5 )
                   / uLampDataSize;
        vec4 L = texture2D( uLampData, duv );
        vec3 d = L.xyz - vAtmosPos;
        float dist = max( length( d ), 1e-4 );
        /* a soft-edged inverse square: the +reach^2 keeps the pool from becoming a white hole
           directly under the lamp, which is what an honest 1/d^2 does at 100 units, and the
           windowing takes it cleanly to nothing by 2.6x the reach so a cell boundary never shows */
        float att = L.w / ( 1.0 + dist * dist / ( uLampReach * uLampReach ) );
        att *= max( 0.0, 1.0 - dist / ( uLampReach * 2.6 ) );
        lamp += uLampColor * ( att * max( dot( lampN, d / dist ), 0.0 ) );
      }
    }
    reflectedLight.directDiffuse += lamp * diffuseColor.rgb * uLampI * uLampOn;
  }`

export interface LampGrid {
  lamps: number
  data: [number, number]
  grid: number
  span: [number, number]
  ms: number
  /** write the flicker into every lamp's strength and re-upload; `on` folds the day in */
  flicker: (t: number, amt: number, on: number) => void
}

/**
 * Build the two textures from every flame in the valley.
 *
 * THE COST IS PAID ONCE AND IT IS NOT NOTHING: 192 x 192 cells against 879 lamps is 32 million
 * distance tests done flat. So the lamps are bucketed first at the reach's own scale and each cell
 * only tests the buckets that could possibly reach it -- which turns a number that scales with
 * (cells x lamps) into one that scales with cells, and takes the build from about a second to a few
 * tens of milliseconds. The boot line reports it, because a cost nobody prints is a cost nobody
 * notices growing.
 */
export function buildLampGrid(spots: readonly Vector3[]): LampGrid | null {
  if (!spots.length) return null
  const t0 = performance.now()

  /* the floor plan, with a margin so a lamp at the edge still has its pool inside the grid */
  const pad = LAMP_REACH * 2.6
  let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity
  for (const s of spots) {
    if (s.x < x0) x0 = s.x
    if (s.x > x1) x1 = s.x
    if (s.z < z0) z0 = s.z
    if (s.z > z1) z1 = s.z
  }
  x0 -= pad; x1 += pad; z0 -= pad; z1 += pad
  const spanX = Math.max(1, x1 - x0)
  const spanZ = Math.max(1, z1 - z0)

  /* ---- the lamps, one texel each ---- */
  const n = spots.length
  const W = Math.min(64, n)
  const H = Math.ceil(n / W)
  const data = new Float32Array(W * H * 4)
  for (let i = 0; i < n; i++) {
    const s = spots[i]
    data[i * 4] = s.x
    data[i * 4 + 1] = s.y
    data[i * 4 + 2] = s.z
    data[i * 4 + 3] = 1
  }
  const dataTex = new DataTexture(data, W, H, RGBAFormat, FloatType)
  dataTex.minFilter = NearestFilter
  dataTex.magFilter = NearestFilter
  dataTex.needsUpdate = true

  /* ---- the buckets, so the grid build is not quadratic ---- */
  const bs = pad
  const bx = Math.max(1, Math.ceil(spanX / bs))
  const bz = Math.max(1, Math.ceil(spanZ / bs))
  const buckets: number[][] = Array.from({ length: bx * bz }, () => [])
  for (let i = 0; i < n; i++) {
    const s = spots[i]
    const cx = Math.min(bx - 1, Math.max(0, Math.floor((s.x - x0) / bs)))
    const cz = Math.min(bz - 1, Math.max(0, Math.floor((s.z - z0) / bs)))
    buckets[cz * bx + cx].push(i)
  }

  /* ---- and, per cell, the four nearest ---- */
  const N = LAMP_GRID_N
  const grid = new Float32Array(N * N * 4)
  const best = [-1, -1, -1, -1]
  const bestD = [Infinity, Infinity, Infinity, Infinity]
  for (let cz = 0; cz < N; cz++) {
    const wz = z0 + ((cz + 0.5) / N) * spanZ
    const bzi = Math.min(bz - 1, Math.max(0, Math.floor((wz - z0) / bs)))
    for (let cx = 0; cx < N; cx++) {
      const wx = x0 + ((cx + 0.5) / N) * spanX
      const bxi = Math.min(bx - 1, Math.max(0, Math.floor((wx - x0) / bs)))
      for (let k = 0; k < 4; k++) { best[k] = -1; bestD[k] = Infinity }
      for (let oz = -1; oz <= 1; oz++) {
        const zz = bzi + oz
        if (zz < 0 || zz >= bz) continue
        for (let ox = -1; ox <= 1; ox++) {
          const xx = bxi + ox
          if (xx < 0 || xx >= bx) continue
          for (const i of buckets[zz * bx + xx]) {
            const s = spots[i]
            const dx = s.x - wx
            const dz = s.z - wz
            const d = dx * dx + dz * dz
            if (d >= bestD[3]) continue
            let k = 3
            while (k > 0 && d < bestD[k - 1]) { bestD[k] = bestD[k - 1]; best[k] = best[k - 1]; k-- }
            bestD[k] = d
            best[k] = i
          }
        }
      }
      const o = (cz * N + cx) * 4
      grid[o] = best[0]; grid[o + 1] = best[1]; grid[o + 2] = best[2]; grid[o + 3] = best[3]
    }
  }
  const gridTex = new DataTexture(grid, N, N, RGBAFormat, FloatType)
  gridTex.minFilter = NearestFilter
  gridTex.magFilter = NearestFilter
  gridTex.needsUpdate = true

  LAMP_U.uLampData.value = dataTex
  LAMP_U.uLampGrid.value = gridTex
  LAMP_U.uLampDataSize.value.set(W, H)
  LAMP_U.uLampOrigin.value.set(x0, z0)
  LAMP_U.uLampInvSpan.value.set(1 / spanX, 1 / spanZ)

  const flicker = (t: number, amt: number, on: number) => {
    LAMP_U.uLampOn.value = on
    if (on < 0.01) return
    const a = amt * on
    for (let i = 0; i < n; i++) {
      /* two sines at incommensurable rates with a per-lamp phase: no two lanterns share a beat,
         and none of them repeats inside a minute */
      const p = i * 1.7
      data[i * 4 + 3] = 1 + a * (Math.sin(t + p) * 0.6 + Math.sin(t * 2.37 + p * 3.1) * 0.4)
    }
    dataTex.needsUpdate = true
  }

  return {
    lamps: n, data: [W, H], grid: N,
    span: [Math.round(spanX), Math.round(spanZ)],
    ms: Math.round(performance.now() - t0),
    flicker,
  }
}
