import { punchCamera } from '../../valley/valley'

/* ==================================================================================================
   WHAT A REFUSED PRESS LOOKS LIKE, AND UNTIL NOW IT LOOKED LIKE NOTHING AT ALL.

   Every gate in this menu is silent. Press Enter on a locked section, on a milestone you have not
   reached, on a drill mode that needs a feature you have not opened, and the screen does not move:
   no flash, no sound, no message. The only reading available to somebody who does that is "the key
   did not work" -- which is exactly what a broken interface feels like, and it is the reason the
   first thing anyone does is press it again.

   THE MOCKUP HAS TWENTY-ODD CALL SITES OF ONE PAIR: a flash and a knock. Together they take 230 ms
   and say "heard, and no" without a word of copy -- which matters, because the reason is already on
   screen. Every locked row in this interface carries the thing it is waiting for; the feedback's job
   is only to send you to read it.

     - THE FLASH is the whole window going briefly pale. It is the loud half, and it is short: 160 ms
       out from a low peak, so it registers as a blink rather than as a strobe.
     - THE KNOCK is the CAMERA, not the interface -- see `viewpoint.ts`. That is the better half of
       the mockup's idea: shaking the panel would be an animation on a panel, and shaking the world
       behind it is the whole frame refusing. It costs nothing, because the eye already has three
       things writing an offset into it.

   AND IT IS NOT REACT. A refusal happens inside a keydown handler on a screen that is not going to
   re-render, and threading a piece of state through thirteen components so that each could animate
   its own overlay would be a worse version of a `<div>` and a WAAPI call. Same argument, same shape
   and the same file layout as `petalBurst.ts`.
   ================================================================================================== */

/** how pale the window goes, and for how long */
export const FLASH = { peak: 0.2, ms: 160 }
/** how hard the frame is knocked; 1 is the mockup's own figure */
export const KNOCK = 0.24

const ID = 'mn-flash'

/* ONE ELEMENT, MADE ON FIRST USE AND KEPT. A refusal can happen twice in a second and appending a
   fresh node each time would leave a stack of them behind whenever an animation was interrupted. */
function sheet(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const found = document.getElementById(ID)
  if (found) return found
  const el = document.createElement('div')
  el.id = ID
  el.className = 'mn-flash'
  el.setAttribute('aria-hidden', 'true')
  document.body.appendChild(el)
  return el
}

/** the window goes briefly pale; `strength` is the peak opacity */
export function doFlash(strength = FLASH.peak): void {
  const el = sheet()
  if (!el?.animate) return
  try {
    /* CANCELLED FIRST, so a second refusal restarts rather than compounding: two overlapping fades
       from 0.2 reach 0.36 together, which is a strobe rather than a blink. */
    for (const a of el.getAnimations()) a.cancel()
    el.animate(
      [{ opacity: strength }, { opacity: 0 }],
      { duration: FLASH.ms, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'both' },
    )
  } catch {
    /* a browser without WAAPI still gets the knock, and the knock is the half that says no */
  }
}

/**
 * Say no.
 *
 * Both halves, because either alone is ambiguous: a flash with no knock reads as a rendering
 * glitch, and a knock with no flash is easy to miss on a small window.
 */
export function refuse(strength = FLASH.peak, knock = KNOCK): void {
  doFlash(strength)
  punchCamera(knock)
}

/**
 * Say yes, quietly.
 *
 * The mockup uses the flash alone at half strength for things that DID happen and have no other
 * moment of their own -- a step completing, a level opening. No knock: the frame is not refusing.
 */
export function confirmFlash(strength = 0.14): void {
  doFlash(strength)
}
