import { useEffect, useRef } from 'react'

/* ==================================================================================================
   THE PARKED POINTER, AND WHY HOVER HAS TO BE ASKED WHETHER IT MEANT IT.

   Every menu in this feature selects on `mouseenter`, which is right for a mouse and catastrophic on
   a layout that MOVES UNDER ONE. Both of the screens that use this have that shape:

     - the road walks by translating the rail, so a different tablet slides beneath a pointer that
       has not moved a pixel;
     - level one is an accordion, so opening a row pushes every row below it down past the pointer.

   In both cases the element that arrives under the cursor fires `mouseenter`, selects itself, and
   drags the selection back off the thing the keyboard just chose. Measured live on the road:
   ArrowRight from step 02 gave 01, then 02, then 01 again, because the pointer was parked where it
   had clicked a menu row one screen earlier.

   SO A HOVER ONLY COUNTS ONCE THE POINTER HAS ACTUALLY MOVED. `pointermove` arms it; a keypress
   disarms it. Mouse and keyboard then both work and neither undoes the other -- which is the
   behaviour every list with two input methods is supposed to have and the reason this is a hook
   rather than the same eight lines twice.
   ================================================================================================== */
export interface HoverPick {
  /** call from `onMouseEnter` / `onFocus`: acts only when the pointer has moved since the last key */
  pick: (index: number) => void
  /** call from a key handler before moving the cursor, so the parked pointer stops counting */
  keyed: () => void
}

export function useHoverPick(setCursor: (index: number) => void): HoverPick {
  const live = useRef(false)
  const set = useRef(setCursor)
  set.current = setCursor

  useEffect(() => {
    const arm = () => { live.current = true }
    window.addEventListener('pointermove', arm)
    return () => window.removeEventListener('pointermove', arm)
  }, [])

  const ref = useRef<HoverPick>({
    pick: (index: number) => { if (live.current) set.current(index) },
    keyed: () => { live.current = false },
  })
  return ref.current
}
