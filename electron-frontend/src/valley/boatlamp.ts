import { Matrix4, Vector3 } from 'three'
import { LAMP_MOVING } from './lanterns'
import { LAMP_U, MOVE_LAMPS } from './lampgrid'
import type { LifeField, Rider } from './life'

/* ==================================================================================================
   THE BOATS CARRY A LIGHT.

   THE WORLD ALREADY PUTS A CHOCHIN ON EACH BOAT'S DECK -- `dress_world.py` hung them in the .blend
   and this export ships six of them -- and `collectRiders` has already welded them to their hulls
   along with the passengers, because they stand on the deck and their name avoids the rider skip
   list. So they are drawn, they glow, and they sail. What they have never done is LIGHT anything.

   AND WORSE THAN THAT: they were in the LAMP GRID. The grid is a floor plan baked once at load, so
   six flames were sitting in it at the coordinates they were exported at -- lighting an empty patch
   of jetty for the rest of the run while the boats that carry them crossed the lake in the dark.
   Fixing that is half of this file (`LAMP_MOVING` in `lanterns.ts` splits them out); the other half
   is putting the light back where the boat has actually got to.

   ONE PER BOAT, NOT ONE PER RIDER, and that distinction cost the mockup its light budget once. A
   lantern carries two materials -- paper and ironwork -- so GLTFLoader splits it into two
   primitives, and the instancing pass groups on geometry AND material: six lanterns arrive as TWO
   instanced sets of six, both welded to their hulls and both matching by name. Taking them all
   lights twelve lamps on six boats and overruns the eight moving slots.

   THE FLAME IS UP INSIDE THE PAPER, not at the base the model stands on, so the light is lifted off
   the origin. Without it the pool sits under the hull rather than beside it, and a boat lantern that
   lights the water it is floating on rather than the water around it reads as a glowing keel.
   ================================================================================================== */

export const BOAT_LAMP = {
  /* `?boatlamp=off` -- eight distance tests on every lit fragment in the valley, and the only
     lights in it that are not nailed down. Its own switch, like every other pass here, because the
     only honest way to price a thing is to boot the same build without it. */
  on: new URLSearchParams(window.location.search).get('boatlamp') !== 'off',
  /** against a still lantern of the same colour: a lamp at eye level on open water carries */
  gain: { value: 1.25 },
  /** how far above the model's own foot the flame itself sits */
  flame: 20,
}

interface Lit {
  rider: Rider
  /** the pose the lantern was found in, which never changes; the hull's delta is what moves */
  authored: Matrix4
}

export interface BoatLamps {
  /** how many boats ended up carrying a light */
  lamps: number
  /** and how many candidates were dropped as second primitives of the same lantern */
  merged: number
  /**
   * Put every light where its hull has carried it, and breathe it.
   *
   * `t` and `amt` are the flicker's own clock and depth — the same two the still flames take, so a
   * lantern lifted off a jetty and hung on a boat cannot start beating to a different drum.
   */
  tick: (t: number, amt: number, on: number) => void
}

const _m = new Matrix4()
const _p = new Vector3()

export function buildBoatLamps(life: LifeField | null): BoatLamps | null {
  if (!BOAT_LAMP.on || !life) return null

  /* ONE PER HULL. `perBoat` is keyed on the boat itself, so the second primitive of the same
     lantern -- same deck, same name, different material -- is dropped rather than lit. */
  const perBoat = new Map<Rider['boat'], Lit>()
  let merged = 0
  for (const rider of life.aboard) {
    if (!LAMP_MOVING.test(rider.o.name || '')) continue
    if (perBoat.has(rider.boat)) { merged++; continue }
    perBoat.set(rider.boat, { rider, authored: rider.authored.clone() })
  }
  const lamps = [...perBoat.values()]
  if (!lamps.length) return null

  const tick = (t: number, amt: number, on: number) => {
    /* ZEROED RATHER THAN DIMMED. `uMoveN` is the loop bound, so writing 0 here skips the whole loop
       on every lit fragment in the valley -- eight lights of strength zero would still be eight
       distance tests a fragment, all day, for nothing. */
    if (on <= 0.001) { LAMP_U.uMoveN.value = 0; return }
    let live = 0
    for (const l of lamps) {
      if (live >= MOVE_LAMPS) break
      /* WHERE THE HULL HAS CARRIED IT, not where it was moored. `authored` is the pose the lantern
         was found in; the boat's `delta` is what `life.tick` has applied to move it, so the light
         has to go through the same multiply or it stays on the shore while the boat sails out from
         under it. */
      if (l.rider.boat.delta) _m.multiplyMatrices(l.rider.boat.delta, l.authored)
      else _m.copy(l.authored)
      _p.setFromMatrixPosition(_m)
      /* the same two incommensurable sines the still flames take, on this lamp's own phase -- and
         the phase is offset past the grid's own count so no boat lantern can ever land in step
         with a jetty lantern next to it */
      const ph = (517 + live) * 1.7
      const f = 1 + amt * on * (Math.sin(t + ph) * 0.6 + Math.sin(t * 2.37 + ph * 3.1) * 0.4)
      LAMP_U.uMoveL.value[live].set(
        _p.x, _p.y + BOAT_LAMP.flame, _p.z, BOAT_LAMP.gain.value * f,
      )
      live++
    }
    LAMP_U.uMoveN.value = live
  }

  /* before the first frame, so nothing is ever lit from a slot full of zeroes */
  tick(0, 0, 0)

  return { lamps: lamps.length, merged, tick }
}
