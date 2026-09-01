import {
  BufferAttribute, BufferGeometry, InstancedMesh, Material, Object3D,
} from 'three'
import { breathe } from './atmosphere'

/* ==================================================================================================
   THE CROWD BREATHES — 1,038 figures across the festival, the shrine, the town and the courts, and
   not one of them ever moves. The valley has drifting cloud, a lit town that goes to bed one window
   at a time and a lake with the mountain in it, and inhabitants carved out of stone. That mismatch
   is most of why it still reads as a diorama.

   IT IS ALL IN THE VERTEX SHADER, and it has to be: a thousand instance matrices rewritten every
   frame is a 66 KB upload a frame for motion nobody can point at. Everything here is derived from
   `instanceMatrix[3]` — the instance's own position — hashed into a phase, so every figure is on
   its own clock with no per-instance attribute to author, store or export.

   THEIR ORIGINS ARE AT THEIR MIDDLE, NOT AT THEIR FEET, WHICH IS THE TRAP. The mockup's note says
   "measured: minY 0, height 51.5" and divides the raw local y by that to get how far up the figure
   a vertex is. Measured HERE, `PROP_person_kasa` runs local y −34.5 to +34.5: 69 units tall about
   its own middle. Through the mockup's arithmetic the whole lower body clamps to zero and the head
   reaches 0.5, so half the figure is rigid, the other half moves half as far as intended, and there
   is a crease at the waist where the clamp releases. Exactly what the vegetation sway found about
   plant origins in this same export, one system later.
   So how far up its own figure a vertex is, is BAKED — one float per vertex against the geometry's
   own bounding box, and where the origin sits stops being a question anyone has to answer.

   AND A PERSON IS NOT WHOEVER LIVES IN THE `_People_` NAMESPACE. That namespace is a folder, not a
   species: this world puts `Garden_People_Koi0`, `Onsen_People_Monkey` and `Torii_People_FoxKey` in
   it. The mockup's answer was a height test — a figure is 65.5 units and the tallest stray was a
   26-unit monkey, so 40 separates them with nothing near the line. In THIS export it does not:
   measured, the shrine's stone foxes are 51.5 units and 48 of them would have passed. That is the
   mockup's own predicted failure — "the next export will invent an animal nobody thought of" —
   arriving one export early. So the name test is `_Person`, which every human node carries and no
   animal does, and the height stays as the second guard rather than the only one.
   ================================================================================================== */

/** every human node in the export carries this; no koi, monkey or fox does */
export const PERSON_RE = /_Person\d/i
/** and nothing under 40 units is a person — the second guard, not the only one */
export const PERSON_MIN_H = 40

export const CROWD_U = {
  uIdleT: { value: 0 },
  /* radians of yaw, so about nine degrees each way */
  uIdleTurn: { value: 0.16 },
  /* UNITS OF SWAY AT HEAD HEIGHT, ON A 65.5-UNIT FIGURE — the mockup's 1.6 scaled by the ratio of
     the two worlds' people (65.5 / 51.5). It is an absolute distance rather than a fraction of the
     figure, so the 43-unit children lean proportionally further than the adults; on a child that
     reads as fidgeting, which is why it is not worth a second vertex attribute to fix. */
  uIdleLean: { value: 2.0 },
  uIdleBob: { value: 1.15 },
}

/* THE MOTION IS ONE STRING because two shaders could have to agree on where a figure is standing —
   the lit material and, the day this port grows an outline pass, its prepass. Two copies of a
   hashed sine drift the moment either is tuned, and the symptom is an outline sliding half a body
   width off the body. There is one consumer today and the string costs nothing.
   `IDLE_ORIGIN` is a macro rather than an argument because `instanceMatrix` is an attribute: it
   exists at the call site and not inside a function, and three declares it in the shader prefix
   above <common>, so the macro is always expandable wherever the crowd is being drawn. */
const IDLE_GLSL = `
  uniform float uIdleT, uIdleTurn, uIdleLean, uIdleBob;
  attribute float aUp;
  #define IDLE_ORIGIN vec3( instanceMatrix[ 3 ][ 0 ], instanceMatrix[ 3 ][ 1 ], instanceMatrix[ 3 ][ 2 ] )
  void idleFigure( inout vec3 p, inout vec3 n, vec3 ip ) {
    float ph = fract( sin( dot( ip.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    float sp = 0.55 + ph * 0.9;
    float t = uIdleT * sp + ph * 6.2831;
    /* THE TURN IS ABOUT THE FIGURE'S OWN AXIS, which is where its feet are. The NORMAL takes the
       same rotation as the position — a figure whose geometry turns while its normals do not is lit
       as though it were still facing the way it was modelled, and at nine degrees under a hard toon
       ramp that is a band edge that refuses to move. */
    float a = sin( t * 0.7 ) * uIdleTurn;
    float ca = cos( a ), sa = sin( a );
    mat2 R = mat2( ca, - sa, sa, ca );
    p.xz = R * p.xz;
    n.xz = R * n.xz;
    /* and the weight shift, scaled by how far up the figure this is, so the shoes stay on the
       ground however the body moves over them */
    float hgt = clamp( aUp, 0.0, 1.0 );
    p.x += sin( t ) * uIdleLean * hgt;
    p.z += sin( t * 0.83 + 1.7 ) * uIdleLean * 0.6 * hgt;
    p.y += ( sin( t * 1.9 ) * 0.5 + 0.5 ) * uIdleBob * hgt;
  }`

/**
 * How far up its own figure each vertex is, 0 at the feet and 1 at the crown.
 *
 * Returns false when the geometry already carries it — ten models stand a thousand people, so this
 * is asked once per mesh and answered once per model.
 */
export function crowdBake(geo: BufferGeometry): boolean {
  if (geo.getAttribute('aUp')) return false
  const pos = geo.getAttribute('position')
  if (!pos) return false
  if (!geo.boundingBox) geo.computeBoundingBox()
  const y0 = geo.boundingBox!.min.y
  const h = geo.boundingBox!.max.y - y0
  const a = new Float32Array(pos.count)
  if (h > 1e-6) for (let i = 0; i < pos.count; i++) a[i] = (pos.getY(i) - y0) / h
  geo.setAttribute('aUp', new BufferAttribute(a, 1))
  return true
}

/**
 * Chain the idle onto a material.
 *
 * CHAINED, NOT ASSIGNED — the same rule the windows follow. By the time this runs `breathe` has put
 * the mist, the cover and the rim on `onBeforeCompile`, and replacing that hook would take the
 * valley's air off a thousand people. Same for the program cache key: three's default IS
 * `onBeforeCompile.toString()`, so two materials whose hooks read alike share one compiled
 * program — which is how the crowd's idle would end up displacing the entire world.
 */
export function crowdIdle(mat: Material): Material {
  const flagged = mat as Material & { userData: { crowd?: boolean } }
  if (flagged.userData.crowd) return mat
  flagged.userData.crowd = true

  const prev = mat.onBeforeCompile
  const prevKey = mat.customProgramCacheKey

  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer)
    Object.assign(shader.uniforms, CROWD_U)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${IDLE_GLSL}`)
      /* THE NORMAL IS TURNED IN A DIFFERENT CHUNK FROM THE POSITION, and it has to be. three builds
         vNormal out of objectNormal in <beginnormal_vertex> and the several chunks after it, all of
         which have run and finished before <begin_vertex> ever names `transformed` — so a rotation
         applied only alongside the position arrives too late to reach the shading by a good dozen
         lines of generated source. */
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        #ifdef USE_INSTANCING
        {
          vec3 idleP = position;
          idleFigure( idleP, objectNormal, IDLE_ORIGIN );
        }
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        {
          vec3 idleN = vec3( 0.0, 1.0, 0.0 );
          idleFigure( transformed, idleN, IDLE_ORIGIN );
        }
        #endif`)

    /* BOTH CALL SITES, NAMED INDIVIDUALLY rather than counted — the third occurrence of the name is
       the function's own declaration. A missing <beginnormal_vertex> would cost the figures their
       turning shading and say nothing at all. */
    const v = shader.vertexShader
    const hit = ['idleFigure( idleP', 'idleFigure( transformed'].filter((c) => v.includes(c))
    if (hit.length !== 2) {
      console.error(`[valley] the crowd idle did not take on ${mat.name}: ${hit.length}/2`)
    }
  }
  mat.customProgramCacheKey = () => `${prevKey ? prevKey.call(mat) : ''}|crowd`
  mat.needsUpdate = true
  return mat
}

export interface CrowdField {
  /** how many figures are breathing */
  figures: number
  /** the meshes they stand in — the walkers borrow their geometries out of these */
  meshes: InstancedMesh[]
  /** the models themselves, one entry per distinct figure */
  geometries: BufferGeometry[]
  /** the un-idled source, so a walker can have a material of its own with no idle in it */
  source: Material | null
  /** the idled material */
  material: Material | null
  tick: (seconds: number) => void
}

/* the placement's own scale -- `collapseToInstances` leaves the batch at the identity and puts the
   real size in `instanceMatrix`, so `matrixWorld` cannot answer this. It is the same measurement
   that found 37 windows in a town of roughly 250. */
function placedScale(mesh: InstancedMesh): number {
  if (mesh.isInstancedMesh && mesh.count > 0) {
    const m = mesh.instanceMatrix.array
    return Math.hypot(m[0], m[1], m[2])
  }
  mesh.updateWorldMatrix(true, false)
  const e = mesh.matrixWorld.elements
  return Math.hypot(e[0], e[1], e[2])
}

/**
 * Find the crowd and set it breathing.
 *
 * MUST RUN AFTER `breathe` and BEFORE the first render — after, because it chains onto that hook;
 * before, because `freeCpuCopiesAfterUpload` nulls every position array once the GPU has them and
 * the bake reads them.
 *
 * THE MATERIAL IS A CLONE AND THE CLONE IS RE-BREATHED. Every person in this export draws with
 * `JP_VertexColor` — and so does every building, every boat and every lantern body. Patching it
 * would set the inns swaying. `Material.clone()` copies `userData` but NOT `onBeforeCompile`, so
 * the clone arrives carrying the `atmos` flag and none of the patch it stands for; clearing the
 * flag before re-breathing is the difference between a crowd in the valley's air and a crowd with a
 * person-shaped hole in it.
 */
export function buildCrowd(root: Object3D): CrowdField {
  const meshes: InstancedMesh[] = []
  const geometries: BufferGeometry[] = []
  const seen = new Set<string>()
  let figures = 0
  let source: Material | null = null
  let material: Material | null = null

  root.traverse((o) => {
    const mesh = o as InstancedMesh
    if (!mesh.isMesh || !PERSON_RE.test(o.name)) return
    const geo = mesh.geometry
    if (!geo?.getAttribute?.('position')) return
    if (!geo.boundingBox) geo.computeBoundingBox()
    const h = (geo.boundingBox!.max.y - geo.boundingBox!.min.y) * placedScale(mesh)
    if (h < PERSON_MIN_H) return

    const src = mesh.material as Material | Material[]
    if (Array.isArray(src)) return
    if (!material) {
      source = src
      material = src.clone()
      material.name = `${src.name || 'crowd'}-idle`
      /* the flag came across in `userData`; the patch it stands for did not */
      delete (material as Material & { userData: { atmos?: boolean } }).userData.atmos
      breathe(material)
      crowdIdle(material)
    }
    mesh.material = material
    crowdBake(geo)
    if (!seen.has(geo.uuid)) { seen.add(geo.uuid); geometries.push(geo) }
    meshes.push(mesh)
    figures += mesh.isInstancedMesh ? mesh.count : 1
  })

  return {
    figures,
    meshes,
    geometries,
    source,
    material,
    tick: (seconds: number) => { CROWD_U.uIdleT.value += seconds },
  }
}
