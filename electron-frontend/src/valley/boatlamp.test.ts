import { describe, expect, it } from 'vitest'
import { Matrix4, Object3D, Vector3 } from 'three'
import { BOAT_LAMP, buildBoatLamps } from './boatlamp'
import { LAMP_U, MOVE_LAMPS } from './lampgrid'
import type { LifeField, Rider } from './life'

function named(name: string): Object3D {
  const o = new Object3D()
  o.name = name
  return o
}

/** a hull, and the lantern standing on its deck the way `collectRiders` hands one over */
function boat(): { delta: Matrix4 | null } {
  return { delta: null }
}

function rider(name: string, hull: { delta: Matrix4 | null }, at = new Vector3()): Rider {
  return { o: named(name), i: 0, boat: hull, authored: new Matrix4().setPosition(at) }
}

function life(...aboard: Rider[]): LifeField {
  return {
    riderMeshes: [], items: 0, boats: 0, riders: aboard.length, aboard,
    wakes: 0, moored: 0, tick: () => {}, dispose: () => {},
  }
}

describe('which lanterns travel', () => {
  it('takes the chochin and leaves the passengers', () => {
    const hull = boat()
    const field = buildBoatLamps(life(
      rider('Nature_Wildlife_Chochin_001', hull),
      rider('Festival_People_Person0_004', hull),
    ))
    expect(field?.lamps).toBe(1)
  })

  it('lights one per hull, not one per primitive', () => {
    /* a lantern carries two materials -- paper and ironwork -- so GLTFLoader splits it into two
       primitives and the instancing pass groups on geometry AND material. Six lanterns arrive as
       TWO instanced sets of six, both welded and both matching by name; taking them all lights
       twelve lamps on six boats and overruns the eight slots. */
    const hulls = [boat(), boat(), boat()]
    const field = buildBoatLamps(life(...hulls.flatMap((h) => [
      rider('Nature_Wildlife_Chochin_001', h),
      rider('Nature_Wildlife_Chochin_001', h),
    ])))
    expect(field?.lamps).toBe(3)
    expect(field?.merged).toBe(3)
  })

  it('is nothing at all when no boat carries one', () => {
    expect(buildBoatLamps(life(rider('Festival_People_Person0_004', boat())))).toBeNull()
    expect(buildBoatLamps(null)).toBeNull()
  })
})

describe('where the light goes', () => {
  it('follows the hull rather than the mooring', () => {
    /* `authored` is the pose the lantern was found in; the boat's `delta` is what the life tick
       has applied. Without the multiply the light stays on the shore while the boat sails out
       from under it. */
    const hull = boat()
    const field = buildBoatLamps(life(
      rider('Nature_Wildlife_Chochin_001', hull, new Vector3(100, 0, 0)),
    ))!
    field.tick(0, 0, 1)
    expect(LAMP_U.uMoveL.value[0].x).toBeCloseTo(100)
    hull.delta = new Matrix4().setPosition(new Vector3(500, 0, 300))
    field.tick(0, 0, 1)
    expect(LAMP_U.uMoveL.value[0].x).toBeCloseTo(600)
    expect(LAMP_U.uMoveL.value[0].z).toBeCloseTo(300)
  })

  it('hangs the flame inside the paper, not at the foot the model stands on', () => {
    /* otherwise the pool sits under the hull rather than beside it, and a boat lantern that
       lights the water it floats on reads as a glowing keel */
    const field = buildBoatLamps(life(
      rider('Nature_Wildlife_Chochin_001', boat(), new Vector3(0, 40, 0)),
    ))!
    field.tick(0, 0, 1)
    expect(LAMP_U.uMoveL.value[0].y).toBeCloseTo(40 + BOAT_LAMP.flame)
  })

  it('stops at the number of slots the shader has', () => {
    const field = buildBoatLamps(life(
      ...Array.from({ length: MOVE_LAMPS + 4 },
        () => rider('Nature_Wildlife_Chochin_001', boat())),
    ))!
    field.tick(0, 0, 1)
    expect(LAMP_U.uMoveN.value).toBe(MOVE_LAMPS)
  })
})

describe('by day', () => {
  it('zeroes the loop bound rather than dimming the lights', () => {
    /* `uMoveN` IS the loop bound, so writing 0 skips it outright on every lit fragment in the
       valley -- eight lights of strength zero would still be eight distance tests a fragment */
    const field = buildBoatLamps(life(rider('Nature_Wildlife_Chochin_001', boat())))!
    field.tick(0, 0, 1)
    expect(LAMP_U.uMoveN.value).toBe(1)
    field.tick(0, 0, 0)
    expect(LAMP_U.uMoveN.value).toBe(0)
  })
})

describe('the flicker', () => {
  it('breathes, and not in step with the still flames', () => {
    /* the same two incommensurable sines the grid's lamps take, on a phase offset past their
       own count -- so no boat lantern can land in step with a jetty lantern beside it */
    const field = buildBoatLamps(life(rider('Nature_Wildlife_Chochin_001', boat())))!
    field.tick(0, 0.16, 1)
    const a = LAMP_U.uMoveL.value[0].w
    field.tick(1.3, 0.16, 1)
    const b = LAMP_U.uMoveL.value[0].w
    expect(a).not.toBeCloseTo(b)
    /* and it is a breath, not a strobe: within a sixth of the gain either way */
    for (const v of [a, b]) {
      expect(v).toBeGreaterThan(BOAT_LAMP.gain.value * 0.8)
      expect(v).toBeLessThan(BOAT_LAMP.gain.value * 1.2)
    }
  })

  it('holds still when the flicker is off', () => {
    const field = buildBoatLamps(life(rider('Nature_Wildlife_Chochin_001', boat())))!
    field.tick(0, 0, 1)
    const a = LAMP_U.uMoveL.value[0].w
    field.tick(9, 0, 1)
    expect(LAMP_U.uMoveL.value[0].w).toBeCloseTo(a)
  })
})
