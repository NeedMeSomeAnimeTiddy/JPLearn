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

/** the board's scale, written to `--lk-u` on the frame it returns */
export function useFrameFit() {
  const frameRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const fit = () => {
      const u = Math.min(window.innerWidth / 1280, window.innerHeight / 720, 1)
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
