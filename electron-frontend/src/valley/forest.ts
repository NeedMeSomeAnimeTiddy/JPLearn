import { Color, InstancedMesh, MathUtils, Matrix4, Mesh, Object3D, Vector3 } from 'three'

/* ==================================================================================================
   THE TREELINE, AND THIS IS WHAT "THE MOUNTAINS ARE BLACK" ACTUALLY WAS.

   Three rounds of work went into the rock — the ramp, the floor, the albedo, the outlines — and none
   of it moved the thing anyone could see, because the thing anyone could see was not rock. The
   mockup settled it by rendering the frame's object ids alongside its colour and joining them per
   pixel, which says what each dark region IS rather than how dark it is:

       Festival_Vegetation_Sugi1     4.2% of the frame at luminance  89
       Fuji_Forest_Sugi0             1.9%                            91
       Festival_Vegetation_Keyaki2   1.8%                           101
       Fuji_Forest_Fir0 / Fir1       1.7% each                     98 / 99

   Thirteen per cent of the frame in the high eighties and nineties, against a sky at 158 and a
   meadow at 111. Every mountain shape in the middle distance is wearing conifers as a coat.

   SO THE FOREST GETS A TREELINE, PAINTED RATHER THAN SIMULATED: a per-instance tint that leaves the
   valley exactly as authored and lightens and cools the trees as they climb. That is true of real
   alpine forest — thinner, paler, more sky through it — and it is the standard device for the same
   reason. `instanceColor` MULTIPLIES the vertex colours, so every tree keeps its own painted
   variation and only the value moves.

   DELIBERATELY NOT KEYED ON DISTANCE. Distance-keyed anything is fog, and this world is cel-shaded:
   a tree high on a ridge is paler whether you are standing under it or looking at it from across the
   valley. The key is world height, 1,200 to 3,600 units, which is where this valley's forest stops.

   AND BLUE IS LIFTED HARDEST, so the high forest goes cool as well as pale and separates from the
   warm valley green in front of it.
   ================================================================================================== */

/** what counts as forest, and it matches the `inst:` prefix instancing puts on a batch */
export const TREES_RE = /(_Vegetation_|_Forest_|Nature_Trees_)/i

export const TREELINE = {
  /** the band of world height the tint runs across */
  from: 1200,
  to: 3600,
  /** how far red, green and blue are lifted at the top of it */
  lift: [0.26, 0.29, 0.44] as const,
}

/* ==================================================================================================
   AND WHAT THE MIRROR CAN DO WITHOUT — TWO RULES, AND THE DIFFERENCE BETWEEN THEM IS THE WHOLE
   POINT.

   Both are "this is too small to read in a 832x468 image rippled by two scrolling normal maps", and
   the first attempt at the second one emptied the lake.

     1. GROUND DETAIL, BY ITS OWN RADIUS. Thousands of 15-unit tufts of grass contribute nothing to a
        reflection and were being drawn twice a frame for it. Under 55 units of radius nothing can
        read even in aggregate: grass, groundcover, small clutter.

     2. THE FAR FOREST, BY WHERE ITS MEMBERS STAND. Measured per pass in the mockup the reflection is
        2,184k triangles and `Fuji_Forest` alone is 953k of them — 46%, twenty thousand trees
        standing 20,000 to 40,000 units from the water.

   AND RULE 2 IS PER INSTANCE, WHICH IS WHY IT IS SAFE WHERE THE FIRST TRY WAS NOT. Culling an
   instanced set by its own bounding RADIUS took nine hundred near-shore trees out in a single
   decision and emptied the lake, because a set's radius is one MEMBER'S radius and says nothing
   about where the set stands. The MEAN DISTANCE of its instances from the water does say that: the
   near shore averages a few thousand units, the forest on the mountain twenty-odd thousand, and
   nothing at all sits between them.

   In a reflection a tree is two pixels and a FOREST is the entire image. What reads is the mass,
   never the member — so rule 1 is allowed to judge a member and rule 2 is not.
   ================================================================================================== */

/** under this radius in world units, a thing cannot read in the mirror even in aggregate */
export const REFLECT_MIN_R = 55
/** and past this mean distance from the water, a whole stand of trees cannot either */
export const REFLECT_FAR_MEAN = 14000

/* `?treeline=off` -- the tint is the fix for "the mountains are black", and the only honest way to
   see what it buys is to boot the same build without it. It does not turn the culling off with it:
   those are two answers that happen to be found on one walk, not one system. */
export const TREELINE_ON = new URLSearchParams(window.location.search).get('treeline') !== 'off'

export interface ForestStats {
  /** how many instanced sets were given a treeline */
  tinted: number
  /** how many instanced sets stopped being drawn unconditionally */
  culled: number
  /** what the mirror is not asked to draw, and how many triangles a frame that saves */
  noReflect: Object3D[]
  farCut: number
  smallCut: number
  savedTris: number
  ms: number
}

const _m = new Matrix4()
const _v = new Vector3()
const _q = new Vector3()
const _c = new Color()

const trisOf = (o: Mesh): number => {
  const g = o.geometry
  if (!g) return 0
  const per = (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3
  return per * ((o as unknown as InstancedMesh).isInstancedMesh ? (o as unknown as InstancedMesh).count : 1)
}

/**
 * Paint the treeline, let the frustum do its job, and work out what the mirror can skip.
 *
 * ONE WALK FOR THREE ANSWERS, and that is not tidiness — two of them need every instance's matrix,
 * which is the expensive part, and the third needs the bounding spheres the first two compute. Split
 * apart they would decode a hundred and forty thousand matrices twice.
 *
 * MUST RUN BEFORE THE FIRST RENDER, like everything else that reads geometry here: the upload
 * callbacks null every position array, and a bounding sphere computed after that is computed from
 * nothing.
 */
export function buildForest(root: Object3D, water: { x: number; z: number }): ForestStats {
  const t0 = performance.now()
  const noReflect: Object3D[] = []
  const st: ForestStats = {
    tinted: 0, culled: 0, noReflect, farCut: 0, smallCut: 0, savedTris: 0, ms: 0,
  }

  root.traverse((o) => {
    const mesh = o as Mesh
    const inst = o as unknown as InstancedMesh
    if (!mesh.isMesh && !inst.isInstancedMesh) return

    /* ==================================================================================================
       CULLED, WHICH IT WAS NOT. `collapseToInstances` sets `frustumCulled = false` on every batch it
       makes, which forces all 143 sets to be drawn every frame no matter where the camera looks —
       across a 70,000-unit map that the menu sees a slice of.

       The usual reason to disable culling on an InstancedMesh is that three computes its bounding
       sphere from the GEOMETRY, which is one instance's, so the sphere is in the wrong place and
       everything vanishes. The fix is to compute the real one, which three will do across all the
       matrices — and it is valid here for the one reason that matters: these matrices are written
       once at load and never touched again.

       INFLATED BY 3%, because two systems in this build displace vertices in the vertex shader and a
       bounding sphere knows nothing about either. A plant swaying 30 units at the edge of the frustum
       would otherwise pop out of the world a frame before it leaves the screen.
       ================================================================================================== */
    if (inst.isInstancedMesh) {
      inst.computeBoundingSphere()
      if (inst.boundingSphere) inst.boundingSphere.radius *= 1.03
      inst.frustumCulled = true
      st.culled++
    }

    if (inst.isInstancedMesh && TREES_RE.test(o.name)) {
      let farSum = 0
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, _m)
        const e = _m.elements
        farSum += Math.hypot(e[12] - water.x, e[14] - water.z)
        /* THE SWITCH TURNS OFF THE PAINT AND NOT THE WALK, which is the whole reason it is inside
           the loop rather than around it: the far-stand cull below is measured from the same
           matrices, and gating the branch turned it off too the first time. Two answers found on
           one walk are not one system. */
        if (!TREELINE_ON) continue
        const t = MathUtils.smoothstep(e[13], TREELINE.from, TREELINE.to)
        _c.setRGB(
          1 + t * TREELINE.lift[0], 1 + t * TREELINE.lift[1], 1 + t * TREELINE.lift[2],
        )
        inst.setColorAt(i, _c)
      }
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      if (TREELINE_ON) st.tinted++

      if (inst.count > 0 && farSum / inst.count > REFLECT_FAR_MEAN) {
        noReflect.push(o)
        st.farCut++
        st.savedTris += trisOf(mesh)
        return
      }
    }

    /* and the small stuff, by its own radius. An instanced set's geometry radius is one instance's,
       so the instances' own scale has to be put back on it. */
    const geo = mesh.geometry
    if (!geo) return
    if (!geo.boundingSphere) geo.computeBoundingSphere()
    const bs = geo.boundingSphere
    if (!bs) return
    let sc = 1
    if (inst.isInstancedMesh) {
      for (let i = 0; i < Math.min(inst.count, 32); i++) {
        inst.getMatrixAt(i, _m)
        _q.setFromMatrixScale(_m)
        sc = Math.max(sc, _q.x, _q.y, _q.z)
      }
    } else {
      _v.setFromMatrixScale(mesh.matrixWorld)
      sc = Math.max(_v.x, _v.y, _v.z)
    }
    if (bs.radius * sc < REFLECT_MIN_R) {
      noReflect.push(o)
      st.smallCut++
      st.savedTris += trisOf(mesh)
    }
  })

  st.savedTris = Math.round(st.savedTris)
  st.ms = Math.round(performance.now() - t0)
  return st
}
