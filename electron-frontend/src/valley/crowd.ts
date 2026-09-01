import {
  BufferAttribute, BufferGeometry, InstancedMesh, Material, Matrix4, Object3D, Quaternion, Vector3,
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

   TWO THINGS ABOUT THESE FIGURES THAT THE MOCKUP'S ARITHMETIC ASSUMES AND THIS EXPORT DENIES, and
   both are in `aFig`, one vec2 per vertex baked once against the geometry's own bounding box.

   THEIR ORIGINS ARE AT THEIR MIDDLE, NOT AT THEIR FEET. The mockup's note says "measured: minY 0,
   height 51.5" and divides the raw local y by that to get how far up the figure a vertex is.
   Measured here, every person model runs local y −h/2 to +h/2. Through that arithmetic the whole
   lower body clamps to zero and the head reaches 0.5, so half the figure is rigid, the other half
   moves half as far as intended, and there is a crease at the waist where the clamp releases.
   `aFig.x` is the fraction up the figure, so where the origin sits stops being a question.

   AND THE WORLD SHIPS QUANTIZED, so a figure's local box is about two units across and its real
   65.5 units live in the placement matrix. A displacement authored in world units and applied in
   the vertex shader is therefore multiplied by 33 on the way out: the mockup's 1.6-unit weight
   shift becomes a body-length lurch. This was invisible until the walkers were built and turned out
   to be two units tall — the same fact, read from the other end. So the amounts here are FRACTIONS
   OF THE FIGURE'S OWN HEIGHT and `aFig.y` carries that height in local units, which is the same
   answer the vegetation sway reached about plants of wildly different sizes on one material.

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

/* SIX UNITS UP, AND THE MODELS ARE NOT WHAT IS WRONG. Measured here against a triangle-exact
   ground -- every ground triangle in the world, highest near-horizontal wins -- over the 974
   figures standing on it: the feet sit a MEDIAN of 6.1 below it, 808 of them are buried at all,
   and the tail runs to −32 on slopes. Every model has its feet at the bottom of its own box and
   the walkers, placed by this port's own ground query rather than by the authored matrices, sit
   exactly on it — so it is the placement that is low, not the origin.
   It was always true and it was always invisible: a 65-unit figure with an 8.6-unit hem hides six
   units of burial, and it only became findable once there was a ground query to measure against.
   The mockup reached the same number (`CROWD_WEAR.lift = 6`) from its own ground.
   LIFTED HERE RATHER THAN BY MOVING THE MESH ORIGIN, which would float every walker. */
export const CROWD_LIFT = 6
/** and nothing under 40 units is a person — the second guard, not the only one */
export const PERSON_MIN_H = 40

export const CROWD_U = {
  uIdleT: { value: 0 },
  /* radians of yaw, so about nine degrees each way. An angle is scale-free, so this one is the
     mockup's number unchanged. */
  uIdleTurn: { value: 0.16 },
  /* SWAY AT HEAD HEIGHT AS A FRACTION OF THE FIGURE'S OWN HEIGHT. The mockup's 1.6 units on a
     51.5-unit figure is 0.031, and stating it this way is what makes it survive both the
     quantization and the 43-unit children. */
  uIdleLean: { value: 0.031 },
  uIdleBob: { value: 0.018 },
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
  /* .x is how far up its own figure this vertex is, 0 at the feet and 1 at the crown; .y is how
     tall that figure is, in the geometry's own units */
  attribute vec2 aFig;
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
    /* and the weight shift: a fraction of the figure's own height, times how far up the figure
       this vertex is, so the shoes stay on the ground however the body moves over them */
    float hgt = clamp( aFig.x, 0.0, 1.0 ) * aFig.y;
    p.x += sin( t ) * uIdleLean * hgt;
    p.z += sin( t * 0.83 + 1.7 ) * uIdleLean * 0.6 * hgt;
    p.y += ( sin( t * 1.9 ) * 0.5 + 0.5 ) * uIdleBob * hgt;
  }`

/**
 * Per vertex: how far up its own figure it is, and how tall that figure is.
 *
 * Returns false when the geometry already carries it — ten models stand a thousand people, so this
 * is asked once per mesh and answered once per model.
 */
export function crowdBake(geo: BufferGeometry): boolean {
  if (geo.getAttribute('aFig')) return false
  const pos = geo.getAttribute('position')
  if (!pos) return false
  if (!geo.boundingBox) geo.computeBoundingBox()
  const y0 = geo.boundingBox!.min.y
  const h = geo.boundingBox!.max.y - y0
  const a = new Float32Array(pos.count * 2)
  if (h > 1e-6) {
    for (let i = 0; i < pos.count; i++) {
      a[i * 2] = (pos.getY(i) - y0) / h
      a[i * 2 + 1] = h
    }
  }
  geo.setAttribute('aFig', new BufferAttribute(a, 2))
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

/* ONE OF THE TEN FIGURES, AND EVERYTHING NEEDED TO STAND A NEW ONE UP. Nothing else in this port
   has had to place a copy of an authored object by hand, so nothing else has needed this — and the
   walkers cannot be built without it, because a person's geometry on its own is two units tall and
   has its origin at its navel. Measured across all 1,038 placements: every one is a uniform scale
   and a pure yaw, local +Y stays world up to within a rounding error, and the scale is CONSTANT per
   model (34.483 for the kasa, 32.771 for most, 21.558 for the children). So one instance answers
   for the model, and the walkers need no rotation of their own beyond the way they are facing. */
export interface CrowdModel {
  geo: BufferGeometry
  /** the uniform scale every placement of this model carries */
  scale: number
  /** how tall it stands, in world units */
  height: number
  /** where its feet are relative to its origin, in world units — negative, because that is the
      navel; a figure placed with its origin on the ground is buried to the waist */
  foot: number
}

export interface CrowdField {
  /** how many figures are breathing */
  figures: number
  /** how many were lifted out of the ground -- see CROWD_LIFT */
  lifted: number
  /** the meshes they stand in — the walkers borrow their geometries out of these */
  meshes: InstancedMesh[]
  /** the models themselves, one entry per distinct figure */
  models: CrowdModel[]
  /** the un-idled source, so a walker can have a material of its own with no idle in it */
  source: Material | null
  /** the idled material */
  material: Material | null
  tick: (seconds: number) => void
}

/* THE PLACEMENT'S OWN SCALE, AND `matrixWorld` CANNOT ANSWER IT. `collapseToInstances` parents its
   batches to the root at the identity and puts every member's real placement in `instanceMatrix` --
   the same measurement that found 37 windows in a town of roughly 250. Both are needed, because a
   batch could in principle be parented under a transformed node. */
const _m = new Matrix4()
const _p = new Vector3()
const _q = new Quaternion()
const _s = new Vector3()

function placedScale(mesh: InstancedMesh): number {
  mesh.updateWorldMatrix(true, false)
  if (mesh.isInstancedMesh && mesh.count > 0) {
    mesh.getMatrixAt(0, _m)
    _m.premultiply(mesh.matrixWorld)
  } else {
    _m.copy(mesh.matrixWorld)
  }
  _m.decompose(_p, _q, _s)
  return Math.max(_s.x, _s.y, _s.z)
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
  const models: CrowdModel[] = []
  const seen = new Set<string>()
  let figures = 0
  let lifted = 0
  let source: Material | null = null
  let material: Material | null = null

  root.traverse((o) => {
    const mesh = o as InstancedMesh
    if (!mesh.isMesh || !PERSON_RE.test(o.name)) return
    const geo = mesh.geometry
    if (!geo?.getAttribute?.('position')) return
    if (!geo.boundingBox) geo.computeBoundingBox()
    const scale = placedScale(mesh)
    const h = (geo.boundingBox!.max.y - geo.boundingBox!.min.y) * scale
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
    /* ITS OWN STEP, AND IT HAS TO BE. In the mockup this was applied while re-seating a figure onto
       a new model, so the moment the world started carrying those models and the swap was skipped,
       the lift went with it and the whole crowd sank back into the ground. The two facts are
       unrelated: what a figure wears is one question and the placements being six low is another.
       This export has already had the swap done in Blender, so only the lift is left. */
    if (mesh.isInstancedMesh) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, _m)
        _m.elements[13] += CROWD_LIFT
        mesh.setMatrixAt(i, _m)
        lifted++
      }
      mesh.instanceMatrix.needsUpdate = true
    } else {
      mesh.position.y += CROWD_LIFT
      mesh.updateMatrix()
      lifted++
    }
    crowdBake(geo)
    /* GLTFLoader names the OBJECT, not the geometry, so everything out of `world.glb` arrives with
       `geometry.name` empty -- which is what made the mockup's own model-recognition test compare
       undefined against a set of names and silently never match. Nothing here depends on it, but
       the wardrobe's log says which model it read the skin and hair off and "unnamed" is no use. */
    if (!geo.name) geo.name = o.name.replace(/^inst:/, '')
    if (!seen.has(geo.uuid)) {
      seen.add(geo.uuid)
      models.push({ geo, scale, height: h, foot: geo.boundingBox!.min.y * scale })
    }
    meshes.push(mesh)
    figures += mesh.isInstancedMesh ? mesh.count : 1
  })

  return {
    figures,
    lifted,
    meshes,
    models,
    source,
    material,
    tick: (seconds: number) => { CROWD_U.uIdleT.value += seconds },
  }
}
