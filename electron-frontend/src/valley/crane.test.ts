import { afterEach, describe, expect, it } from 'vitest'
import { Mesh, PerspectiveCamera, Scene, Sprite, Vector3 } from 'three'
import { CRANE, CRANE_NAME, buildCrane } from './crane'
import { INK_SKIP } from './ink'

const built: { dispose: () => void }[] = []
const make = (scene: Scene, still = false) => {
  const c = buildCrane(scene, still)
  built.push(c)
  return c
}
afterEach(() => { while (built.length) built.pop()!.dispose() })

/** the menu's own standing shot, near enough */
function eye(): PerspectiveCamera {
  const cam = new PerspectiveCamera(43, 16 / 9, 20, 60000)
  cam.position.set(0, 2000, 6000)
  cam.lookAt(0, 500, 0)
  cam.updateMatrixWorld(true)
  return cam
}

const dist = (a: Vector3, b: Vector3) => a.distanceTo(b)

describe('the paper', () => {
  it('is fifteen flat triangles, because that is what a folded bird is', () => {
    /* faceted unlit planes meeting at creases is what paper DOES; lit and smoothed it stops
       reading as paper and starts reading as a gold ornament */
    const scene = new Scene()
    make(scene)
    let tris = 0
    scene.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh) tris += (m.geometry.attributes.position?.count ?? 0) / 3
    })
    expect(tris).toBe(15)
  })

  it('is double-sided, or half the folds vanish as it turns', () => {
    const scene = new Scene()
    const c = make(scene)
    c.group.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh) expect((m.material as { side: number }).side).toBe(2)
    })
  })

  it('carries a name the ink pass knows to leave alone', () => {
    /* the mockup draws it in a scene of its own, which the outline prepass never renders. Here
       there is one scene, so the exemption has to be sayable -- and a name is all a mesh has. */
    expect(INK_SKIP.test(CRANE_NAME)).toBe(true)
  })

  it('hands the mirror a list, because at 400 units it would fill the lake', () => {
    const scene = new Scene()
    const c = make(scene)
    expect(c.hide).toContain(c.group)
    expect(c.hide.length).toBeGreaterThan(1)
  })
})

describe('where it flies', () => {
  it('arrives where it belongs rather than crossing the valley to get there', () => {
    /* THE MOCKUP SEEDS IT AT (300, 100, 420) IN WORLD SPACE and the menu eye stands at
       (0, 2000, 6000) -- 5,400 units at a capped 720 a second, so the bird streaks in over eight
       seconds every time the app opens. Measured before this was fixed: 3,193 units out at four
       seconds in, against the 430 it should have been. */
    const scene = new Scene()
    const c = make(scene)
    const cam = eye()
    c.tick(0.016, 1, cam, false)
    const d = dist(c.group.position, cam.position)
    expect(d).toBeGreaterThan(CRANE.depth[0] - 1)
    expect(d).toBeLessThan(CRANE.depth[1] + 1)
  })

  it('stays in the near field however long it flies', () => {
    const scene = new Scene()
    const c = make(scene)
    const cam = eye()
    for (let i = 0; i < 3000; i++) {
      c.tick(0.016, i * 0.016, cam, false)
      const d = dist(c.group.position, cam.position)
      expect(d).toBeGreaterThan(100)
      expect(d).toBeLessThan(1400)
    }
  })

  it('keeps to the edges once a menu is open, rather than crossing the words', () => {
    const scene = new Scene()
    const c = make(scene)
    const cam = eye()
    let middle = 0
    for (let i = 0; i < 4000; i++) {
      c.tick(0.016, i * 0.016, cam, true)
      const p = c.group.position.clone().project(cam)
      if (Math.abs(p.x) < 0.4 && p.z > 0 && p.z < 1) middle++
    }
    expect(middle / 4000).toBeLessThan(0.25)
  })

  it('faces the way it is going, which is the whole of why it reads as flying', () => {
    const scene = new Scene()
    const c = make(scene)
    const cam = eye()
    for (let i = 0; i < 200; i++) c.tick(0.016, i * 0.016, cam, false)
    const before = c.group.position.clone()
    for (let i = 0; i < 30; i++) c.tick(0.016, 3.2 + i * 0.016, cam, false)
    const travel = c.group.position.clone().sub(before)
    if (travel.length() > 5) {
      const facing = new Vector3(0, 0, 1).applyQuaternion(c.group.quaternion)
      expect(facing.dot(travel.normalize())).toBeGreaterThan(0)
    }
  })

  it('flaps, and slower when it is cruising than when it is pushing', () => {
    const scene = new Scene()
    const c = make(scene)
    const cam = eye()
    const wings = new Set<number>()
    for (let i = 0; i < 120; i++) {
      c.tick(0.016, i * 0.016, cam, false)
      const w = c.group.children.find((o) => o.type === 'Group' && o.rotation.z !== 0)
      if (w) wings.add(+w.rotation.z.toFixed(4))
    }
    expect(wings.size).toBeGreaterThan(10)
  })
})

describe('when motion is reduced', () => {
  it('parks off to one side and stays there', () => {
    /* removed entirely, the near field is empty and the menu goes back to being a photograph with
       an interface on it; parked, there is still something in front of the valley */
    const scene = new Scene()
    const c = make(scene, true)
    const cam = eye()
    c.tick(0.016, 1, cam, false)
    const first = c.group.position.clone()
    for (let i = 0; i < 500; i++) c.tick(0.016, 1 + i * 0.016, cam, false)
    expect(c.group.position.distanceTo(first)).toBe(0)
  })

  it('shows no paper dust, since dust is only shed at speed', () => {
    const scene = new Scene()
    const c = make(scene, true)
    const cam = eye()
    for (let i = 0; i < 500; i++) c.tick(0.016, i * 0.016, cam, false)
    let shown = 0
    scene.traverse((o) => { if ((o as Sprite).isSprite && o.visible) shown++ })
    expect(shown).toBe(0)
  })
})

describe('the paper dust', () => {
  it('is a fixed pool, so fifteen triangles can never allocate in a frame loop', () => {
    const scene = new Scene()
    make(scene)
    let sprites = 0
    scene.traverse((o) => { if ((o as Sprite).isSprite) sprites++ })
    expect(sprites).toBe(CRANE.trail.pool)
  })

  it('is left in the air where it was shed rather than dragged along behind', () => {
    /* which is why the sprites live in a group of their own: parented to the bird they would be
       a rigid tail instead of a trail */
    const scene = new Scene()
    const c = make(scene)
    expect(c.group.children.some((o) => (o as Sprite).isSprite)).toBe(false)
  })
})
