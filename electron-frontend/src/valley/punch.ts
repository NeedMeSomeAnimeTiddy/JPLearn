/* ==================================================================================================
   THE ONE THING THE MENU ASKS OF THE CAMERA, ON THE NEAR SIDE OF THE VALLEY'S OWN MODULE.

   `main.tsx` loads the valley with a dynamic import so that a missing asset or a driver fault costs
   the app nothing but a valley. That promise is a promise about a MODULE BOUNDARY: the valley is
   only evaluated if the import runs, so nothing it does at module scope can take the menu with it.

   ONE STATIC IMPORT WAS ENOUGH TO UNDO IT. `refuse.ts` wanted `punchCamera`, a two-line function,
   and imported it from `valley.ts` -- which imports three.js and thirty-odd scene modules. Six menu
   components import `refuse.ts`, so the whole scene landed in the entry chunk, the dynamic import
   produced no chunk at all, and `?valley=off` priced a build that had already paid for the valley.
   See issue #83.

   SO THE ARROW IS TURNED AROUND. This module knows nothing about three.js or about scenes; it holds
   a function or it holds null. The menu imports it and calls through it. The valley, when and if it
   loads, hands its camera in. Nothing on the entry's static graph names `valley.ts`.

   WHICH KEEPS THE BEHAVIOUR THE OLD FUNCTION DOCUMENTED: safe when the valley is off. Before, that
   was `viewpoint?.punch(s)` with a null viewpoint. Now it is a null `hit` -- the same no-op, one
   module earlier, and now true of the import as well as of the call.
   ================================================================================================== */

/** what the valley hands in; null whenever there is no valley, which is a supported state */
type Hit = (strength: number) => void

let hit: Hit | null = null

/**
 * Give the menu a camera to knock, or take it away.
 *
 * Called by the valley as it comes up, and with `null` as it tears down — a knock arriving between
 * a dispose and the next build would otherwise reach a camera that no longer exists.
 */
export function setCameraPunch(next: Hit | null): void {
  hit = next
}

/**
 * Knock the frame, because a press was heard and declined.
 *
 * The interface's half of a refusal is a flash; this is the other half. Safe when the valley is
 * off, which it must be: the app has to work with `?valley=off`, and a menu whose feedback depended
 * on a canvas being there would not.
 */
export function punchCamera(s = 1): void {
  hit?.(s)
}
