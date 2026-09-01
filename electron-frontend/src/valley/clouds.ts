import {
  Color, IcosahedronGeometry, InstancedMesh, MathUtils, Matrix4, MeshLambertMaterial,
  Quaternion, Scene, Vector3,
} from 'three'

/* ==================================================================================================
   CLOUDS — the top third of the frame, which has been a flat gradient since phase 0.

   The sky is a painted dome with a grade on it, and that is enough while the camera is looking at a
   mountain. It is not enough on a wide shot: above the ridgeline there is nothing but a smooth ramp,
   and a smooth ramp is the one thing in this picture that does not move when the camera does.

   THEY ARE GEOMETRY, NOT SPRITES, and the mockup records why it changed its mind. A billboarded
   quad carrying a soft blob looks like exactly that — a sticker, flat under any camera move, in a
   world where every other object is faceted and outlined. The style here is low-poly and flat-shaded,
   so a cloud that belongs in it is a SHAPE. That is also how clouds are drawn in the tradition this
   whole picture borrows from: ukiyo-e and Ghibli clouds are silhouettes with a defined edge and a
   lit top, never soft focus.

   So each cloud is a cluster of icosahedra, instanced into one draw call, flat-shaded, and lit by
   the same directional key as the landscape — which means the sun side is warm, the underside is
   mauve, and turning the camera actually moves the form. Thirty-four clouds of eight to fourteen
   blobs is about 13,000 triangles against a valley that already draws five million.

   AND THE SHADOW SIDE OF A CLOUD IS NOT DARK. It is lit by the whole rest of the sky, which is why
   a cumulus at dawn has a bright top and a merely COOLER underside rather than a black one. Lambert
   alone takes it to near-black at grazing angles; the emissive is the floor that stops it.
   ================================================================================================== */

/** how many clusters ring the valley */
export const CLOUD_COUNT = 34

/* THE RING IS SIZED BY THE FAR PLANE AND THE FLIGHTS, not by taste, and both ends are a real
   constraint. The camera's `far` is 40,000 and the destinations spread about 11,500 units from the
   origin, so:
     - too near, and a flight ends up INSIDE a cloud: at RECORDS (z −11,192) a ring of 12,000 would
       leave one 800 units off the lens, which is a white wall rather than weather;
     - too far, and the opposite end of the ring crosses the far plane and clouds pop out of
       existence mid-flight.
   19,000 to 27,000 keeps every cloud between ~7,500 and ~38,500 of every camera in the set. */
export const CLOUD_NEAR = 19000
export const CLOUD_FAR = 27000

/* ABOVE FUJI'S SHOULDER, WHICH IS AT 7,220. Clouds below the summit read as mist caught on the
   mountain, and there is already a mist system for that. */
export const CLOUD_Y_LOW = 5400
export const CLOUD_Y_HIGH = 10800

/* THE ALBEDO IS NOT WHITE, AND THAT IS ARITHMETIC RATHER THAN TASTE. The key light is 6.4, so a
   white cloud reflects ~5.8 into a tone curve that is already rolling off at 2 -- both the lit top
   and the shadow side land past the shoulder and come back as the same near-white. Measured on the
   first pass: 26 points of luminance across a whole cluster, against 18.7 for the empty sky beside
   it. A cloud with no more range than the gradient behind it is a silhouette, not a form.

   A quarter-albedo puts the lit side at the top of the curve instead of past it, which is where the
   range comes from. And the emissive is the floor the underside falls to -- the mockup found
   0x4a4560 too dark and got grey-blue boulders hanging in the air, so this sits above that, and the
   warm fog at 19,000 units lifts it further toward the sunset it is hanging in. */
export const CLOUD_COLOUR = 0x8f8b93
export const CLOUD_EMISSIVE = 0x6f6a82

/* A RING, NOT A DOME CAP. Anything directly overhead is out of frame at these focal lengths and
   would only cost fill; the band that matters runs from a little above the ridgeline to a little
   above the sun. */
export interface CloudField {
  /** every cluster, so the caller can drift them */
  clusters: InstancedMesh[]
  /* THE UNDERSIDE IS A DAY CHANNEL. Held at a fixed lavender it made every cloud in the midnight
     sky glow pink, which is the one thing a cloud at midnight does not do. */
  material: MeshLambertMaterial
  /** move the whole ring by `dt` seconds — see `driftClouds` */
  drift: (dt: number) => void
  dispose: () => void
}

/* THE SAME DETERMINISTIC HASH THE WORLD IS BUILT WITH. `domain/` may not be random and neither may
   this: a sky that reshuffles itself between launches is a sky nobody composed, and two runs of the
   same build have to be comparable when a screenshot is the evidence. */
export function hash01(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453123
  return x - Math.floor(x)
}

export function buildClouds(scene: Scene, centre: Vector3): CloudField {
  const blob = new IcosahedronGeometry(1, 1)
  const material = new MeshLambertMaterial({
    color: new Color(CLOUD_COLOUR),
    emissive: new Color(CLOUD_EMISSIVE),
    flatShading: true,
    fog: true,
  })

  const clusters: InstancedMesh[] = []
  const m = new Matrix4()
  const q = new Quaternion()
  const scale = new Vector3()
  const pos = new Vector3()
  const up = new Vector3(0, 1, 0)

  for (let i = 0; i < CLOUD_COUNT; i++) {
    const az = (i / CLOUD_COUNT) * Math.PI * 2 + hash01(i, 91) * 0.3
    const dist = CLOUD_NEAR + hash01(i, 3) * (CLOUD_FAR - CLOUD_NEAR)
    const y = CLOUD_Y_LOW + hash01(i, 17) * (CLOUD_Y_HIGH - CLOUD_Y_LOW)
    const blobs = 8 + Math.floor(hash01(i, 29) * 7)
    const mesh = new InstancedMesh(blob, material, blobs)

    /* THE CLUSTER IS WIDE, SHALLOW, AND BOTTOM-HEAVY, which is the whole read of a cumulus: a flat
       base with billows growing out of it. Piling equal spheres gives a berry. */
    const w = 1500 + hash01(i, 41) * 2100
    for (let k = 0; k < blobs; k++) {
      const t = k / blobs
      const r = 1 - Math.abs(hash01(i * 17 + k, 5) * 2 - 1)
      pos.set(
        (hash01(i * 13 + k, 7) - 0.5) * 2 * w,
        r * w * 0.3 * (0.4 + t),
        (hash01(i * 19 + k, 11) - 0.5) * 2 * w * 0.45,
      )
      const rad = w * (0.3 + hash01(i * 23 + k, 13) * 0.34) * (1 - t * 0.35)
      scale.set(rad * 1.25, rad * (0.62 + hash01(i * 29 + k, 17) * 0.3), rad)
      q.setFromAxisAngle(up, hash01(i * 31 + k, 19) * 6.28)
      m.compose(pos, q, scale)
      mesh.setMatrixAt(k, m)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.position.set(centre.x + Math.cos(az) * dist, y, centre.z + Math.sin(az) * dist)

    /* NOT A CASTER AND NOT A RECEIVER. A cloud in the shadow map would drop a hard-edged 4096-map
       silhouette on the valley, which is the wrong shadow entirely — the soft drifting cover is a
       separate system that multiplies direct light in the shader. And it is left in the default
       layer deliberately, so the shafts' mask pass counts it as an occluder: a cloud crossing the
       sun should cut the rays, which is free as long as nothing marks it as atmosphere. */
    mesh.castShadow = false
    mesh.receiveShadow = false
    /* the ring is authored around the camera and every member is always meant to be in frame or
       just outside it; culling 34 bounding spheres a frame buys nothing and has popped before */
    mesh.frustumCulled = false
    mesh.name = `sky-cloud-${i}`
    mesh.userData.az = az
    mesh.userData.dist = dist
    /* radians a second. The spread matters more than the value: a ring drifting in lockstep reads
       as the CAMERA turning rather than as weather moving. */
    mesh.userData.drift = 0.0009 + hash01(i, 67) * 0.0016

    scene.add(mesh)
    clusters.push(mesh)
  }

  const drift = (dt: number) => {
    for (const mesh of clusters) {
      const az = (mesh.userData.az as number) + (mesh.userData.drift as number) * dt
      mesh.userData.az = az
      const dist = mesh.userData.dist as number
      mesh.position.x = centre.x + Math.cos(az) * dist
      mesh.position.z = centre.z + Math.sin(az) * dist
    }
  }

  const dispose = () => {
    for (const mesh of clusters) {
      scene.remove(mesh)
      mesh.dispose()
    }
    clusters.length = 0
    blob.dispose()
    material.dispose()
  }

  return { clusters, material, drift, dispose }
}

/** how far round the ring a cluster has travelled after `seconds`, in degrees — for tests */
export function driftDegrees(rate: number, seconds: number): number {
  return MathUtils.radToDeg(rate * seconds)
}
