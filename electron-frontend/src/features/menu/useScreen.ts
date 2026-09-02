import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/* ==================================================================================================
   THE TWO THINGS EVERY SCREEN IN THIS MENU HAS TO DO, AND ONE OF THEM WAS NEVER DONE AT ALL.

   `useFrameFit` is the frame contract: 1,280 by 720 of design pixels, scaled to fit and centred, with
   the scale published as `--lk-u` for the `zoom` on `.mn-frame`. Thirteen screens carry their own
   copy of that effect; this is where a fourteenth goes rather than a fourteenth copy.

   `useEntered` is the entrance, and it is the one that was missing. Every screen in this menu CUT
   IN: one frame the valley, the next frame a full board of type at final opacity. The mockup fades
   its `.hud` in on a class it sets a frame after the screen is built (`hud.on`), which is 220 ms of
   the board arriving rather than appearing -- and the reason that reads as arriving rather than as a
   delay is that the camera is still settling underneath it. `openAt` in `valley.ts` puts the screen
   at 82% of the flight for exactly this: the board assembles while the eye is still moving.

   A FRAME LATER, NOT ON MOUNT. The class has to be applied in a paint AFTER the one that inserted
   the element, or the browser has nothing to transition FROM and the element simply appears at its
   final value -- which is the bug this hook exists to not have. Two nested rAFs is the reliable
   spelling; one is enough in most browsers and not in all of them.
   ================================================================================================== */

/* ==================================================================================================
   THE BOARD'S SCALE, AND THE THIRD ARGUMENT THAT WAS NOT IN THE MOCKUP.

   `Math.min(vw / 1280, vh / 720)` is what the mockup computes. The port wrote
   `Math.min(vw / 1280, vh / 720, 1)` -- fifteen times, one copy per screen -- and that cap is why
   the whole interface sat in a small island in the middle of any window bigger than 1280x720. On a
   1600x1028 window the honest scale is 1.25 and the capped one is 1.0, so the board was 1280x720
   with 160px of dead letterbox down each side and 154 top and bottom, and then the stage's own
   160px moat inside that. Three hundred and twenty pixels of nothing between the window's edge and
   the first thing you can read.

   THE MOCKUP SAYS WHY IN ONE LINE, on the rule that pins the four corners: "40px from the edge on a
   laptop is 80 on a 2K screen, or the interface drifts into the corners as the display grows." The
   offsets scale WITH the board on purpose. Capping the scale keeps the offsets and throws away the
   growth, which is the worst of both.

   AND IT IS COMPUTED ONCE NOW. Fifteen copies of a formula is fifteen places to fix it, and this
   one had been fixed in none of them. */
export function boardScale(): number {
  return Math.min(window.innerWidth / 1280, window.innerHeight / 720)
}

/** the board's scale, written to `--lk-u` on the frame it returns */
export function useFrameFit() {
  const frameRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const fit = () => {
      const u = boardScale()
      frameRef.current?.style.setProperty('--lk-u', String(u))
      /* AND ON THE ROOT, for the chrome. The brand and the chips are pinned to the WINDOW rather
         than to the board -- see `.mn-chrome` in `menu.css` -- so they are outside the frame that
         carries this and cannot inherit it from there. */
      document.documentElement.style.setProperty('--lk-u', String(u))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return frameRef
}

/** false for the first painted frame and true after it, which is what a CSS transition needs */
export function useEntered(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setOn(true)) })
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second) }
  }, [])
  return on
}

/** `mn-open` plus the entrance class once the first frame has been painted */
export function screenClass(entered: boolean, extra?: string): string {
  return `mn-open${entered ? ' on' : ''}${extra ? ' ' + extra : ''}`
}
