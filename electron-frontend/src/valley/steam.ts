import {
  Box3, Color, DoubleSide, FogExp2, InstancedMesh, Matrix4, Mesh, Object3D, PlaneGeometry, Scene,
  ShaderMaterial, Vector3,
} from 'three'
import { WIND_DIR } from './atmosphere'
import { LAMP_EMIT_MAT } from './lanterns'
import { walkRnd } from './walk'

/* ==================================================================================================
   STEAM OFF THE BATHS, SMOKE OFF THE ROOFS.

   AN ONSEN TOWN WITH NO STEAM IS MISSING THE THING IT IS NAMED AFTER, and this one nearly had none.
   The world does ship twelve `Onsen_Props_Steam` columns, and the still-things table already had
   them rising and turning on the `puff` rule — but each is 40 x 82 x 36 units against inns that
   stand 700 to 950 tall and people who are 65. A column of steam the height of a person and a half.
   You have to be told it is there.

   RISING MOTION IN THE MIDDLE DISTANCE IS THE CHEAPEST LIFE THERE IS, and it is the right kind for a
   menu: it never darts, it has no edges to catch the eye, and at the wide shot it reads as the town
   breathing rather than as something moving. A puff climbs fifteen units a second, so it takes half
   a minute to leave its vent — a drift you notice only if you look.

   ONE INSTANCED QUAD PER PUFF, EVERYTHING IN THE MATRIX. Four numbers a puff smuggled through the
   unused corners of `instanceMatrix`, so there are no instanced attributes to allocate, upload or
   keep in step, and the matrix was going to be uploaded anyway. Nothing is written per frame at
   all: the whole animation is `fract(t * rate + phase)` in the vertex shader, so the CPU cost after
   build is one uniform and the buffer never moves again.

   IT IS OCCLUDED, WHICH THE FIREFLIES ARE NOT. `depthTest` stays on — steam behind the bathhouse
   must be behind the bathhouse. It writes no depth, so the puffs of one column blend into each
   other instead of cutting each other out.

   AND IT ANSWERS TO THE COLD. Steam is water condensing, so you see it when the air is cold and
   barely at all at midday. Smoke is not the same substance and does not care, which is why the two
   are one system with a `grey` channel rather than two: a chimney plume is narrower, climbs twice as
   far, leans further downwind, and stays visible all day.

   AND THE TWELVE AUTHORED COLUMNS BECOME PLACEMENT. There were two kinds of steam in this town and
   they did not agree: solid modelled columns rising and spinning on the `puff` rule, and these
   sprite plumes. Two languages for one substance, side by side along the canal.
   THE PROPS LOSE THE ARGUMENT AS DRAWINGS AND WIN IT AS SITING. A modelled column cannot be soft at
   its edges or grow as it climbs; the sprites can. But WHERE the steam is was Robbie's decision,
   made in Blender, and the sprite system has no opinion about the canal at all — it only knows
   about the baths, because that is what can be found by name. So the props stop being drawn and
   start being the vent list. Nothing leaves the .blend, the siting is still his, and there is one
   kind of steam in the valley.
   ================================================================================================== */

export interface Vent {
  m: RegExp
  /** puffs in this column */
  n: number
  /** their width at birth */
  w: number
  /** how far the column climbs */
  h: number
  /** how many emission points to spread across the footprint */
  at?: number
  /** where on the mesh the vent sits, as a fraction of its height: 1 is a ridge, 0 a floor */
  top: number
  /** 0 is steam, 1 is woodsmoke */
  grey: number
  /** and a nudge off the centre of the footprint, for a chimney that is not in the middle */
  off?: readonly [number, number]
}

/* TWO NAMING REGIMES, AND THE VENT LIST HAS TO KNOW ABOUT BOTH. GLTFLoader gives a single-primitive
   mesh the NODE's name -- `Onsen_Buildings_SotoYu_001` -- but a mesh with more than one primitive
   becomes a Group whose CHILDREN are the drawables, and those children are named after the glTF
   mesh: `PROP_bathhouse`, `PROP_shop_2`. The three buildings in this list with a chimney are
   exactly the three with a second primitive, because their windows are an `EMIT_window` slot -- so
   matching the node namespace alone found every bath in the town and not one plume of smoke.
   Matching the model name as well is what `buildWindows` already does implicitly, by keying off the
   material rather than the object. Which leaves the second primitive itself: it matches the rule
   too, and its box is the WINDOWS rather than the building, so its ridge is somewhere down the
   wall -- two plumes per chimney, one of them out of a window. `LAMP_EMIT_MAT` already names that
   class of thing for the lanterns, so a vent skips any drawable whose material is an EMIT slot. A
   window is not a roof. */
export const STEAM_VENTS: readonly Vent[] = [
  /* `top: 1` ON THE BATHS AND NOT 0, which is the first thing this gets wrong if you assume. A
     SotoYu mesh is the whole bath INCLUDING its sunken tub, so the bottom of its box is well
     underground and the water is at the TOP of it. Steam born at `top: 0` rises out of the street.
     The pattern is unanchored, so it takes `SotoYuSm` — the one small bath — with it. */
  { m: /Onsen_Buildings_SotoYu|PROP_soto_yu/i, n: 12, w: 78, h: 300, at: 1, top: 1, grey: 0 },
  { m: /Onsen_Buildings_YumomiHall|PROP_yumomi_hall/i, n: 14, w: 104, h: 360, at: 1, top: 1, grey: 0 },
  /* THE BIG POOL IS THREE VENTS AND THEY HAD TO COME DOWN. At n 18 and w 132 the three of them
     laid a solid white sheet over the whole bath terrace — rocks, lanterns and bathers all under
     it. Steam that hides the thing it is rising off is fog. Fewer and narrower: it still reads as
     a pool you cannot see the far side of, and the terrace is still there. */
  { m: /Onsen_Surfaces_OnsenPools/i, n: 13, w: 98, h: 430, at: 3, top: 1, grey: 0 },
  /* the bathhouse is where the fire is, so it is the one chimney that really smokes */
  { m: /Onsen_Buildings_Bathhouse|PROP_bathhouse/i, n: 12, w: 46, h: 700, at: 1, top: 1, grey: 1, off: [0.30, 0.20] },
  { m: /Onsen_Buildings_Shop2|PROP_shop_2/i, n: 8, w: 34, h: 430, at: 1, top: 1, grey: 0.82, off: [0.26, 0.24] },
]

/** what the authored columns become once they stop being drawn */
export const PROP_VENT = { n: 8, w: 44, h: 210, at: 1, top: 0, grey: 0 }
export const PROP_STEAM_RE = /Onsen_Props_Steam/i

export const STEAM_U = {
  uTime: { value: 0 },
  /** peak alpha of a puff at the middle of its life */
  uAmt: { value: 0.52 },
  /** how much of that the air is showing — set by the day cycle */
  uCold: { value: 1 },
  /** units a second, and deliberately slow */
  uRise: { value: 15 },
  /** steam: the mist colour, near white */
  uCol: { value: new Color(0xe6ecef) },
  /** and woodsmoke, which is a grey */
  uSmoke: { value: new Color(0x6b6a66) },
  /* THE ONE VECTOR, READ OFF THE ONE SOURCE. The shader wants a vec3 and the wind is a plan-view
     vec2, so it is widened once here rather than kept as a second constant that could drift. */
  uWind: { value: new Vector3(WIND_DIR.x, 0, WIND_DIR.y) },
  fogColor: { value: new Color(0xdfa273) },
  fogDensity: { value: 0.000011 },
}

/* HOW MUCH OF THE COLD THE AIR IS SHOWING. Steam at midday is a wisp and steam at dawn is a
   cloud, and `lampOn` is already the smooth altitude-driven signal the whole lighting rig comes up
   on — 0 in broad day and 1 after dark. The floor is what keeps the town breathing at noon rather
   than switching off, which is the difference between weather and a light switch. */
export const COLD_FLOOR = 0.34

const VERT = `
  uniform float uTime, uRise;
  uniform vec3 uWind;
  varying vec2 vUv;
  varying float vA, vFog, vGrey;
  void main() {
    vec3 base = vec3( instanceMatrix[ 3 ][ 0 ], instanceMatrix[ 3 ][ 1 ], instanceMatrix[ 3 ][ 2 ] );
    float climb = instanceMatrix[ 0 ][ 0 ];          /* how far this one gets */
    float jx = instanceMatrix[ 0 ][ 1 ];             /* and where on the vent it starts */
    float jz = instanceMatrix[ 0 ][ 2 ];
    float rate = instanceMatrix[ 1 ][ 0 ];           /* its own pace, so no two are in step */
    float wide = instanceMatrix[ 1 ][ 1 ];
    float ph = instanceMatrix[ 2 ][ 0 ];
    vGrey = instanceMatrix[ 2 ][ 2 ];
    /* ONE CLOCK AND ONE CYCLE. fract() means the puff is reborn at the vent the instant it dies at
       the top, and because the alpha is zero at both ends of u there is no seam where that
       happens -- the same trick the puff prop rule uses on its scale. */
    float u = fract( uTime * uRise * rate / max( climb, 1.0 ) + ph );
    vec3 p = base + vec3( jx, 0.0, jz ) * ( 0.4 + 0.6 * u );
    p.y += u * climb;
    /* THE LEAN IS QUADRATIC IN HEIGHT, not linear: a plume goes straight up out of the vent and
       only starts travelling once the air has hold of it, which is what makes a column read as a
       column rather than as a diagonal line of blobs. */
    p += uWind * ( u * u * climb * ( 0.30 + 0.55 * vGrey ) );
    p.x += sin( uTime * 0.31 + ph * 41.0 ) * wide * u;
    p.z += cos( uTime * 0.27 + ph * 27.0 ) * wide * u;
    /* it swells as it goes, which is the other half of reading as a plume */
    float grow = wide * ( 0.42 + 1.9 * u );
    float g = sin( 3.14159 * u );
    vA = g * g;
    vec3 toEye = normalize( cameraPosition - p );
    vec3 side = normalize( cross( vec3( 0.0, 1.0, 0.0 ), toEye ) );
    vec3 up = cross( toEye, side );
    vec3 w = p + side * ( position.x * grow ) + up * ( position.y * grow );
    vec4 mv = modelViewMatrix * vec4( w, 1.0 );
    vFog = - mv.z;
    vUv = uv;
    gl_Position = projectionMatrix * mv;
  }`

const FRAG = `
  uniform vec3 uCol, uSmoke, fogColor;
  uniform float uAmt, uCold, fogDensity;
  varying vec2 vUv;
  varying float vA, vFog, vGrey;
  void main() {
    float r = length( vUv - 0.5 ) * 2.0;
    if ( r > 1.0 ) discard;
    /* soft, and ZERO AT THE RIM rather than merely small -- the constant subtracted is the value
       the gaussian has at r = 1, so there is no disc edge to see. */
    float a = max( 0.0, exp( - r * r * 2.6 ) - 0.0743 ) * 1.0803;
    /* smoke keeps its body all day; steam is a thing the cold air is doing */
    a *= vA * uAmt * mix( uCold, 1.0, vGrey * 0.8 );
    if ( a < 0.004 ) discard;
    vec3 c = mix( uCol, uSmoke, vGrey );
    float f = 1.0 - exp( - fogDensity * fogDensity * vFog * vFog );
    gl_FragColor = vec4( mix( c, fogColor, clamp( f, 0.0, 1.0 ) ), a );
  }`

interface Site {
  x: number
  y: number
  z: number
  r: number
  rule: Vent
}

export interface SteamField {
  puffs: number
  vents: number
  /* WHICH RULE FOUND WHAT, because "22 vents" cannot tell you that the outdoor baths are missing
     and the pools are not. Every self-checking line in this port exists because something was
     silently absent once. */
  found: Record<string, number>
  /** how many of the authored columns were turned into siting */
  fromProps: number
  mesh: InstancedMesh | null
  tick: (seconds: number) => void
  /** 0 is broad day, 1 is full night — the same signal the lanterns come up on */
  setCold: (lampOn: number) => void
  dispose: () => void
}

const _v = new Vector3()
const _lo = new Vector3()
const _hi = new Vector3()
const _box = new Box3()
const _m = new Matrix4()

/** the world-space box of one placement of a mesh */
function worldBox(geo: Mesh['geometry'], mat: Matrix4): void {
  if (!geo.boundingBox) geo.computeBoundingBox()
  _box.copy(geo.boundingBox!)
  _lo.set(Infinity, Infinity, Infinity)
  _hi.set(-Infinity, -Infinity, -Infinity)
  for (let i = 0; i < 8; i++) {
    _v.set(
      i & 1 ? _box.max.x : _box.min.x,
      i & 2 ? _box.max.y : _box.min.y,
      i & 4 ? _box.max.z : _box.min.z,
    ).applyMatrix4(mat)
    _lo.min(_v)
    _hi.max(_v)
  }
}

export function buildSteam(scene: Scene, root: Object3D): SteamField {
  const sites: Site[] = []
  const found: Record<string, number> = {}
  /* AND A ROOF ONLY GETS ONE CHIMNEY. A multi-primitive building arrives as two drawables sharing
     one placement, so the rule matches both and would site two plumes on the same ridge. */
  const placed = new Set<string>()
  let fromProps = 0
  root.updateMatrixWorld(true)

  /* WALKING THE INSTANCES, WHICH THE MOCKUP DOES NOT. Its `steamBuild` skips every InstancedMesh
     outright, on the reasonable ground that a batch's `matrixWorld` is the group's rather than the
     member's. In THIS export the five outdoor baths are five placements of one mesh and so are two
     of the shops, which `collapseToInstances` duly batches — so skipping them is skipping the
     steam off every outdoor bath in the town. Reading `getMatrixAt` premultiplied by the batch's
     own matrix is the same thing every other system here does. */
  root.traverse((o) => {
    const mesh = o as InstancedMesh
    if (!mesh.isMesh) return
    const rule = STEAM_VENTS.find((r) => r.m.test(o.name))
    if (!rule || !mesh.geometry) return
    const mat = mesh.material as { name?: string } | { name?: string }[]
    if (!Array.isArray(mat) && LAMP_EMIT_MAT.test(mat?.name ?? '')) return
    const place = (mat: Matrix4) => {
      worldBox(mesh.geometry, mat)
      const cx = (_lo.x + _hi.x) / 2
      const cz = (_lo.z + _hi.z) / 2
      const sx = _hi.x - _lo.x
      const sz = _hi.z - _lo.z
      const y = _lo.y + (_hi.y - _lo.y) * rule.top
      const at = rule.at ?? 1
      const key = `${Math.round(cx / 8)},${Math.round(y / 8)},${Math.round(cz / 8)}`
      if (placed.has(key)) return
      placed.add(key)
      for (let k = 0; k < at; k++) {
        /* spread the emission points along the LONG axis, which for a bath is its length and for
           a roof does not arise because a roof gets one */
        const f = at < 2 ? 0 : (k / (at - 1) - 0.5) * 0.62
        const ox = rule.off ? rule.off[0] : 0
        const oz = rule.off ? rule.off[1] : 0
        /* the placement index is three digits (`_001`); a model's own suffix is one (`PROP_shop_2`)
           and must survive, or the log says `PROP_shop` and means the wrong building */
        const label = o.name.replace(/^inst:/, '').replace(/[._]\d{3,}$/, '')
        found[label] = (found[label] ?? 0) + 1
        sites.push({
          x: cx + (sx > sz ? f * sx : 0) + ox * sx,
          y,
          z: cz + (sx > sz ? 0 : f * sz) + oz * sz,
          r: Math.min(sx, sz) * 0.26,
          rule,
        })
      }
    }
    if (mesh.isInstancedMesh) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, _m)
        _m.premultiply(mesh.matrixWorld)
        place(_m)
      }
    } else place(mesh.matrixWorld)
  })

  root.traverse((o) => {
    const mesh = o as InstancedMesh
    if (!PROP_STEAM_RE.test(o.name)) return
    o.visible = false
    /* THE BOX, NOT THE MATRIX POSITION. These columns are placed by their matrix today, so the two
       agree — but the petals found the other case in this same export: some props carry their
       position in their vertices and report the world origin when asked for their matrix. A box is
       right for both, and it costs one traverse of eight corners. */
    const put = (mat: Matrix4) => {
      worldBox(mesh.geometry, mat)
      sites.push({
        x: (_lo.x + _hi.x) / 2,
        y: _lo.y + 8,
        z: (_lo.z + _hi.z) / 2,
        r: 16,
        rule: { ...PROP_VENT, m: PROP_STEAM_RE },
      })
      fromProps++
    }
    if (mesh.isInstancedMesh) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, _m)
        _m.premultiply(mesh.matrixWorld)
        put(_m)
      }
    } else put(mesh.matrixWorld)
  })

  if (!sites.length) {
    return {
      puffs: 0, vents: 0, found, fromProps, mesh: null,
      tick: () => {}, setCold: () => {}, dispose: () => {},
    }
  }

  const total = sites.reduce((n, s) => n + s.rule.n, 0)
  const material = new ShaderMaterial({
    uniforms: STEAM_U,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  })
  const mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, total)
  mesh.name = 'steam'
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  scene.add(mesh)

  /* EVERYTHING A PUFF IS, IN THE UNUSED CORNERS OF ITS OWN MATRIX. The translation column is the
     vent; the other nine slots carry the climb, the jitter, the rate, the width, the phase and the
     greyness. Nothing is ever written again. */
  let i = 0
  for (const s of sites) {
    for (let k = 0; k < s.rule.n; k++, i++) {
      const e = _m.elements
      e.fill(0)
      const ang = walkRnd(i, 71) * 6.2831
      const rad = Math.sqrt(walkRnd(i, 72)) * s.r
      e[0] = s.rule.h * (0.72 + walkRnd(i, 73) * 0.56)
      e[1] = Math.cos(ang) * rad
      e[2] = Math.sin(ang) * rad
      e[4] = 0.72 + walkRnd(i, 74) * 0.56
      e[5] = s.rule.w * (0.74 + walkRnd(i, 75) * 0.52)
      /* evenly spread round the cycle, so a column is a column from the first frame rather than
         one blob that becomes a column over the next thirty seconds */
      e[8] = k / s.rule.n + walkRnd(i, 76) * 0.08
      e[10] = s.rule.grey
      e[12] = s.x
      e[13] = s.y
      e[14] = s.z
      e[15] = 1
      mesh.setMatrixAt(i, _m)
    }
  }
  mesh.instanceMatrix.needsUpdate = true

  const fog = scene.fog as FogExp2 | null
  if (fog) { STEAM_U.fogColor.value = fog.color; STEAM_U.fogDensity.value = fog.density }

  return {
    puffs: total,
    vents: sites.length,
    found,
    fromProps,
    mesh,
    tick: (seconds: number) => { STEAM_U.uTime.value += seconds },
    setCold: (lampOn: number) => {
      STEAM_U.uCold.value = COLD_FLOOR + (1 - COLD_FLOOR) * lampOn
    },
    dispose: () => {
      scene.remove(mesh)
      mesh.geometry.dispose()
      material.dispose()
    },
  }
}
