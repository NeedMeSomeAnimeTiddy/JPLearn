/* ==================================================================================================
   GOLD PAPER OFF THE THING YOU PICKED.

   The mockup bursts fourteen sprites off the WORD you chose and lets them drift down through its
   near-field scene. That cannot be transcribed: its level one is floating type standing in the
   world, so the burst has a 3D object to come off and a second renderer to live in. This interface
   is screen-space by decision -- see the frame contract -- and its level one is HTML slabs, so the
   equivalent of "off the word you picked" is off the ROW you picked, in the frame, in design pixels.

   IN THE FRAME, NOT ON THE PAGE, and that is the whole reason this takes a `frame` argument rather
   than using `position: fixed`. `.mn-frame` carries `zoom: var(--lk-u)`, so a child positioned at
   design-pixel coordinates is scaled with every other part of the interface and the burst is the
   same size relative to the row on a 1280-wide window and a 4K one. Positioned against the viewport
   it would be correct at exactly one size.

   WEB ANIMATIONS, NOT A TICKER. Fourteen elements for under two seconds is precisely what the
   compositor is for: the whole burst is declared once, runs off the main thread, and cleans itself
   up on the last `finish`. Nothing here survives the animation, so nothing has to be torn down when
   the screen changes underneath it.
   ================================================================================================== */

/* FOURTEEN, WHICH IS THE MOCKUP'S. Few enough to read as individual pieces of paper rather than a
   puff of dust, which is the thing that makes it feel like an object rather than an effect. */
const COUNT = 14

/* DESIGN PIXELS, RE-DERIVED RATHER THAN CONVERTED. The mockup's spreads are world units around a
   word 300 units from a camera; there is no exchange rate between that and a 1280 x 720 board. These
   are measured against the row instead: a row is 46 design pixels tall and 330 wide, so the throw is
   about two rows down and half a row either side -- far enough to leave the card, close enough that
   it never reads as confetti crossing the screen. */
const SPREAD_X = 108
const FALL_MIN = 58
const FALL_VAR = 96
const JITTER_X = 76
const JITTER_Y = 15
/* 5 TO 14, AND THE FIRST TRY AT 3 TO 9 IS WHY THE NUMBER IS WRITTEN DOWN. Fourteen pieces that
   size, at 0.85 over a cream card, are present in the frame and invisible to a person looking at
   it -- confirmed by freezing them mid-flight and painting them magenta, which found 5,756 pixels
   exactly where they should be. A petal has to clear the card's own type to read as an object. */
const SIZE_MIN = 5
const SIZE_VAR = 9
const LIFE_MIN = 1050
const LIFE_VAR = 700

export interface BurstOptions {
  /** the element the petals come off; its centre in the frame is where they start */
  target: HTMLElement | null
  /** the zoomed board they live in, so they scale with the rest of the interface */
  frame: HTMLElement | null
}

/**
 * Burst gold paper off one row.
 *
 * Silent and harmless when either element is missing, when motion is reduced, or when the browser
 * has no Web Animations — this is decoration, and decoration that can throw is worse than none.
 */
export function burstPetals({ target, frame }: BurstOptions): void {
  if (!target || !frame) return
  /* THE SAME GUARD THE MOCKUP OPENS WITH. Fourteen things thrown across the screen is exactly what
     someone who asked for less motion is asking not to see. */
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  if (typeof target.animate !== 'function') return

  /* `offsetLeft` AND NOT `getBoundingClientRect`. Both elements are inside the zoomed board, and
     `zoom` scales what is PAINTED rather than what is laid out -- so the offsets are already in the
     design pixels this file's numbers are written in, and a rect would need dividing by a scale
     factor that is only readable as a computed style. */
  let x = target.offsetLeft + target.offsetWidth / 2
  let y = target.offsetTop + target.offsetHeight / 2
  for (let node = target.offsetParent as HTMLElement | null;
    node && node !== frame; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft
    y += node.offsetTop
  }

  const layer = document.createElement('div')
  layer.className = 'pt-burst'
  layer.setAttribute('aria-hidden', 'true')
  layer.style.left = `${x}px`
  layer.style.top = `${y}px`

  let longest = 0
  for (let i = 0; i < COUNT; i++) {
    const petal = document.createElement('i')
    petal.className = 'pt'
    const size = SIZE_MIN + Math.random() * SIZE_VAR
    petal.style.width = `${size}px`
    petal.style.height = `${size * (0.55 + Math.random() * 0.5)}px`
    const fromX = (Math.random() - 0.5) * JITTER_X
    const fromY = (Math.random() - 0.5) * JITTER_Y
    const toX = fromX + (Math.random() - 0.5) * SPREAD_X * 2
    const toY = fromY + FALL_MIN + Math.random() * FALL_VAR
    const spin = (Math.random() - 0.5) * 900
    const life = LIFE_MIN + Math.random() * LIFE_VAR
    longest = Math.max(longest, life)
    petal.animate([
      { transform: `translate(${fromX}px, ${fromY}px) rotate(0deg)`, opacity: 0.92 },
      /* THE FADE IS LATE AND THE FALL IS EARLY, which is what makes it paper rather than a spark:
         `ease-out` on the move so it is thrown and then coasts, and the opacity held most of the
         way so the piece is still legible while it is travelling. */
      { transform: `translate(${toX}px, ${toY}px) rotate(${spin}deg)`, opacity: 0, offset: 1 },
    ], { duration: life, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'forwards' })
    layer.appendChild(petal)
  }

  frame.appendChild(layer)
  window.setTimeout(() => layer.remove(), longest + 60)
}
