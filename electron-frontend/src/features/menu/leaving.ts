/* ==================================================================================================
   THE BOARD YOU ARE LEAVING HAS TO STILL BE THERE TO LEAVE.

   Entering a section already reads as a move: the camera goes first and the destination assembles at
   82% of it, so the screen you arrive at fades up over a settling frame. Leaving did not. Escape
   called `menuPath.up()` and `flyHome()` in the same tick, React unmounted the board on that render,
   and the flight began over an empty valley -- measured on the running build as `.mn-open` at 1.00
   on one frame and gone on the next, with `body.in-flight` arriving at the same instant. A screen
   that is deleted rather than dismissed is the difference between a camera move and a cut.

   SO THE UNMOUNT IS HELD FOR THE LENGTH OF ONE FADE. The class goes on the body, `menu.css` fades
   `.mn-open.on` out against it, and the level changes when the board has gone. The flight starts
   immediately either way -- you have already decided to leave, and the camera should not wait for
   the paperwork.

   A TOKEN, NOT A BOOLEAN. Two departures inside the fade window is not hypothetical: Escape repeats
   while it is held down. Without the token the first timer would fire after the second had already
   changed the level, taking a screen the user had since arrived at off the board.

   THE CLASS IS SET SYNCHRONOUSLY AND THE CALLER STILL GETS ITS ANSWER SYNCHRONOUSLY, which is what
   keeps this out of the navigation's logic: `leaveMenuLevel` still returns true on the press, so
   nothing downstream has to learn that leaving takes 200 ms.
   ================================================================================================== */

/** how long the departing board has to get off the screen; matches `body.mn-leaving` in `menu.css` */
export const LEAVE_MS = 200

let token = 0

/**
 * Fade the board that is on screen out, then run `then`.
 *
 * `then` is what actually changes the level, so it must be safe to run one frame late.
 */
export function leaveBoard(then: () => void): void {
  const mine = ++token
  document.body.classList.add('mn-leaving')
  window.setTimeout(() => {
    if (mine !== token) return
    document.body.classList.remove('mn-leaving')
    then()
  }, LEAVE_MS)
}

/** drop the class without running anything — for a screen that is being torn down under us */
export function cancelLeaving(): void {
  token += 1
  document.body.classList.remove('mn-leaving')
}
