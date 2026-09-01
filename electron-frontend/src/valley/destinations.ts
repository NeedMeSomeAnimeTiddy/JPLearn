/* ==================================================================================================
   THE FIVE PLACES, AND THE ROUTE TO EACH.

   THESE ARE ROBBIE'S FRAMINGS, NOT COMPOSED HERE. Four of the shots are his own Blender cameras
   read back and re-labelled by what they actually frame; DRILLS was composed in the mockup because
   the festival ground never had an authored camera. `fov` is part of each composition rather than a
   global — they were judged as pictures at these values, and the arrival animates to them instead
   of snapping everything to the menu's lens.

   TWO SOURCES, FOLDED INTO ONE HERE. The eye/focus/fov are the mockup's `DEST_SPECS`; the `mid`,
   `bend`, `lean` and `pace` are `mockups/menu-concepts/flights.json`, which is the flight editor's
   saved overlay and the later authority — Robbie flew each route and saved it. RECORDS' overlay
   carries an eye and focus too, so that one is the overlay's throughout. Folding them means one
   table to read rather than a spec and a patch, and the provenance is stated per field.

   STRAIGHT IS NOT THE DEFAULT ANY MORE. Every route here has `bend` on, because every one was
   flown and saved that way. A straight run has exactly one thing wrong with it that a curve does
   not: it goes through whatever is in the way. Each `mid` is the point the flight actually passes
   through at halfway, chosen to thread a real gap — see the clearances in the mockup's own notes.

   DAILY IS NOT HERE. The sixth destination is the shrine, and the section that flew to it
   dissolved: its puzzles are a lane in PRACTICE now. Its camera, its road and its level three all
   still exist in the world; nothing in this menu selects it. If a row ever wants it again, the
   route is in `flights.json` under DAILY.
   ================================================================================================== */

import type { MenuSectionKey } from '../features/menu'

export interface Destination {
  /** where the camera stands on arrival */
  eye: readonly [number, number, number]
  /** what it frames there */
  focus: readonly [number, number, number]
  /** the composition's own lens */
  fov: number
  /** the point the flight passes through at halfway */
  mid: readonly [number, number, number] | null
  /** how hard it leans into its own path at mid-flight; null takes the default */
  lean: number | null
  /** stretches this one route's duration without touching the others */
  pace: number | null
}

export const DESTINATIONS: Record<MenuSectionKey, Destination> = {
  /* THE PATH — 方丈と四方の庭, one hall with four gardens round it. The eye is not a typed number:
     it is the courtyard slab plus 60, because a person here is 66 tall. Hojo on the left, stepping
     stones and the koro through the middle, the vermilion gate and its lantern rows on the right.
     The longest run on the board, and the formula was giving it the full 4.6 s cap, which reads as
     a drift — 0.72 brings it to about 3.3. */
  STUDY: {
    eye: [3050, -195, -6350], focus: [3900, -20, -7300], fov: 48,
    mid: [437, 191, -1075], lean: 0.1, pace: 0.72,
  },
  /* PRACTICE — 祭 and its 櫓, the festival ground, arriving at the gate at ground level. A
     ground-level arrival reads much faster than an aerial one at the same speed, so it is paced
     longer than the distance alone would ask. */
  DRILLS: {
    eye: [880.1, -188.9, 5370.8], focus: [1532.8, -23.2, 4438.6], fov: 37.3,
    mid: [440, 1004, 5682], lean: 0.1, pace: 1.4,
  },
  /* THE WORLD — 湯治場, the hot-spring town, framed along the valley rather than at it. */
  READING: {
    eye: [-6640, 76, -1500], focus: [-6231, -63, -6558], fov: 35.1,
    mid: [-4980, 1558, 3808], lean: 0.4, pace: 1,
  },
  /* THE EXAM — 五重塔, the pagoda, looking up it. */
  JLPT: {
    eye: [-2000, -109.9, 2200], focus: [-2038.4, 248.9, 3344.4], fov: 50,
    mid: [-126, 562, 3192], lean: 0.1, pace: 1.5,
  },
  /* YOU — 見晴台, the lookout above the meadow, built 2026-08-08. Both ends of this one come from
     the saved overlay rather than the spec: it is the only destination that was framed by flying
     to it rather than in Blender. It is also the longest way from the menu, and its `lean` is 0 —
     the arrival is a near-level look out over the valley and any swing off that turn shows. */
  RECORDS: {
    eye: [-1781, 1165, -11192], focus: [-1661, 1111, -9999], fov: 57,
    mid: [9661, 2169, -3686], lean: 0, pace: null,
  },
}
