import type { MenuSectionKey } from '../features/menu'

/* ==================================================================================================
   WHAT THE MENU IS ALLOWED TO KNOW ABOUT THE CAMERA, and it is deliberately almost nothing.

   THIS FILE IMPORTS NO THREE, WHICH IS THE ENTIRE REASON IT EXISTS. `valley.ts` is loaded by a
   dynamic import after first paint so that 597 KB of three sits in its own chunk and costs a boot
   nothing until the world is wanted. `App.tsx` importing the flight calls straight from `valley.ts`
   would pull that chunk back into the eager graph and undo it -- which already happened once in
   phase 0, when `three` landed in the shared vendor chunk and the deferred mount was deferring
   nothing. So the menu talks to this, and the valley registers itself here once it is up.

   AND THE NO-VALLEY PATH IS THE DEFAULT, not a fallback bolted on. `?valley=off` is a supported
   boot -- it is how the valley's cost was priced in the first place -- and the menu has to navigate
   without it. Unregistered, `flyToSection` calls straight back, which is exactly what entering a
   section did for the three phases before the flights existed.
   ================================================================================================== */

export interface FlightImpl {
  flyToSection: (section: MenuSectionKey, onOpen: () => void) => void
  flyHome: () => void
  isFlying: () => boolean
}

let impl: FlightImpl | null = null

/** called by `valley.ts` once the world is standing and the loop is running */
export function registerFlights(next: FlightImpl | null): void {
  impl = next
}

export function flyToSection(section: MenuSectionKey, onOpen: () => void): void {
  if (!impl) { onOpen(); return }
  impl.flyToSection(section, onOpen)
}

export function flyHome(): void {
  impl?.flyHome()
}

/** true while the camera is moving; the menu refuses a second departure mid-flight */
export function valleyIsFlying(): boolean {
  return impl?.isFlying() ?? false
}
