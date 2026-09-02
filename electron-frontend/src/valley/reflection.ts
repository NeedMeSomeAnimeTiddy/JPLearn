import {
  Box3, Frustum, LinearFilter, Matrix4, Mesh, Object3D, PerspectiveCamera, Plane, Scene, Vector3,
  WebGLRenderTarget, WebGLRenderer,
} from 'three'
import { LAKE_U, LAKE_Y } from './lake'

/* ==================================================================================================
   THE PLANAR REFLECTION — what puts Fuji in the water rather than a painted hint of it.

   The scene is rendered a second time from the camera mirrored about the water plane, clipped to
   everything above it, and the result is sampled in SCREEN SPACE: the water looks the texture up at
   its own projected position, which is what makes the mountain land where the mountain is.

   832 BY 468, WHICH IS THE VIEW'S OWN SHAPE. The mockup started at 768 square, rendering a 16:9
   view into a 1:1 target and letting the texture matrix sort it out — which works and spends a
   third of its texels on nothing. Matching the aspect is 34% fewer texels at the same effective
   resolution, and every one of them lands where the water can sample it. It is deliberately not
   higher: at 512 a reflected tree trunk is under two pixels wide and the ripple smears them into
   scribbles, so the distortion has to stay smaller than the features it is distorting.

   AND THE FRUSTUM IS NOT NARROWED TO THE WATER'S RECTANGLE, which is the mockup's hardest-won line
   here. The idea is sound — the water samples at its own screen position, so every texel outside
   that rectangle is rendered and discarded — but measured, the lake's rectangle in the MIRRORED
   camera runs from NDC x −0.86 to 1.995: the water extends half a screen-width past the edge of the
   view. Clamping the sub-frustum to [−1,1] therefore clipped away part of what the water samples,
   and every pixel beyond the clamp read the texture's clamped edge. That smear was "the stretched
   lake". Covering the true rectangle instead means rendering a frustum half again as wide as the
   screen, which costs more than it saves.

   THE EARLY-OUT IS HERE AND IN THIS WORLD IT NEVER FIRES, which is worth stating rather than
   implying. The mockup skips the pass when no water is on screen, on the reasoning that every
   level-two and level-three board is a destination the camera has flown to. Measured here over
   1,620 frames including a flight out to RECORDS: skipped exactly zero times, first against the
   bounding sphere and then against the box. The lake is seven kilometres across and every
   destination in this valley looks along the floor, so it is simply always in frame. The check
   stays because it is two matrix multiplies and it is the right question — it would earn its keep
   the moment a destination faced away — but nothing here is currently paying less for it.

   WHAT THE PASS ACTUALLY COSTS, measured uncapped (the first attempt came back at 6.10 ms on both
   arms, which is 165 Hz to two decimal places — the display, not the renderer): 4.35 ms with the
   water against 3.20 ms without, so about 1.15 ms, a third of the frame. At 1600 by 900 that is
   230 fps either way.
   ================================================================================================== */

export const REFLECT_W = 832
export const REFLECT_H = 468

/** clipped four units above the water, which removes the entire world below it from the mirror */
export const REFLECT_CLIP_LIFT = 4

/* the NDC-to-UV bias: the shader divides by w and reads straight into the texture */
const BIAS = new Matrix4().set(
  0.5, 0, 0, 0.5,
  0, 0.5, 0, 0.5,
  0, 0, 0.5, 0.5,
  0, 0, 0, 1,
)

export interface Reflection {
  target: WebGLRenderTarget
  /** render the mirror; returns false when there was no water on screen to reflect */
  render: (
    renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, water: Object3D,
    also?: readonly Object3D[],
  ) => boolean
  dispose: () => void
}

export function createReflection(): Reflection {
  const target = new WebGLRenderTarget(REFLECT_W, REFLECT_H, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
  })
  LAKE_U.tReflect.value = target.texture

  const cam = new PerspectiveCamera()
  const clip = [new Plane(new Vector3(0, 1, 0), -LAKE_Y + REFLECT_CLIP_LIFT)]
  const frustum = new Frustum()
  const viewProj = new Matrix4()
  const _box = new Box3()
  const fwd = new Vector3()
  const tgt = new Vector3()
  const alsoWas: boolean[] = []

  const render = (
    renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, water: Object3D,
    also: readonly Object3D[] = [],
  ): boolean => {
    /* IS THERE ANY WATER ON SCREEN AT ALL? Asked of the MAIN camera, because that is the question:
       the mirror is only ever read where the water is drawn.

       AND AGAINST THE BOX, NOT THE SPHERE. `intersectsObject` uses the bounding sphere, and the
       sphere around a 7,020-unit square plane has a radius of 4,965 -- measured, that is inside the
       frustum from every destination in this valley, so the early-out fired exactly zero times in
       1,620 frames. The box is flat, which is what a lake is. */
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(viewProj)
    const mesh = water as Mesh
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    _box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld)
    if (!frustum.intersectsBox(_box)) return false

    cam.fov = camera.fov
    cam.aspect = camera.aspect
    cam.near = camera.near
    cam.far = camera.far
    /* MIRRORED ABOUT THE WATER PLANE: the eye reflects, and so does the point it is looking at --
       reflecting only the position leaves the mirror looking somewhere the camera is not. */
    cam.position.set(camera.position.x, 2 * LAKE_Y - camera.position.y, camera.position.z)
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(2000).add(camera.position)
    tgt.set(fwd.x, 2 * LAKE_Y - fwd.y, fwd.z)
    cam.up.set(0, 1, 0)
    cam.lookAt(tgt)
    cam.updateMatrixWorld()
    cam.updateProjectionMatrix()

    LAKE_U.texMatrix.value.copy(BIAS)
      .multiply(cam.projectionMatrix)
      .multiply(cam.matrixWorldInverse)

    water.visible = false
    /* AND ANYTHING ELSE WEARING THE LAKE'S MATERIAL. The garden pond borrows it -- see `pond.ts` --
       and a material that samples `tReflect` drawn INTO `tReflect` is a feedback loop: three warns,
       and the pond comes back holding a picture of itself from the frame before. */
    alsoWas.length = 0
    also.forEach((o, i) => { alsoWas[i] = o.visible; o.visible = false })
    const prevClip = renderer.clippingPlanes
    const prevTarget = renderer.getRenderTarget()
    renderer.clippingPlanes = clip
    renderer.setRenderTarget(target)
    renderer.clear()
    renderer.render(scene, cam)
    renderer.setRenderTarget(prevTarget)
    renderer.clippingPlanes = prevClip
    water.visible = true
    also.forEach((o, i) => { o.visible = alsoWas[i] })
    return true
  }

  return {
    target,
    render,
    dispose: () => {
      LAKE_U.tReflect.value = null
      target.dispose()
    },
  }
}
