import { Brand, Stats } from './Chrome'
import { useFrameFit } from '../useScreen'
import type { MenuCrown } from '../types'
import '../../../styles/stage.css'
import '../menu.css'

export interface MenuChromeProps {
  crown: MenuCrown
}

/* ==================================================================================================
   THE CORNERS THAT DO NOT BELONG TO ANY SCREEN.

   Rendered once, over whichever screen is showing, on the same 1,280 by 720 board every screen
   stands on -- so the brand sits at the same forty pixels in on level three as it does on the front
   door, because it is literally the same offsets on the same frame.

   A LAYER OF ITS OWN RATHER THAN A PROP ON THIRTEEN COMPONENTS. Threading the crown through every
   screen would put the streak in thirteen places that have nothing else to do with it, and the day
   somebody adds a fourteenth screen the chrome would be missing again -- which is exactly how it
   came to be missing from nine of them. Here it cannot be forgotten because nobody has to remember.

   POINTER-EVENTS ARE THE ONE THING TO GET RIGHT. This layer covers the whole window and sits over
   the screen, so `.mn-open` is already `pointer-events: none` with its children switched back on;
   the chips are children and are clickable, and everything between them is not.
   ================================================================================================== */
export function MenuChrome({ crown }: MenuChromeProps) {
  const frameRef = useFrameFit()
  return (
    <div className="mn-open mn-chrome on">
      {/* OUTSIDE THE FRAME, WHICH IS THE WHOLE POINT -- see `.mn-chrome` in `menu.css`. The frame is
          here only to publish the board's scale; the two corners are pinned to the window. */}
      <div className="mn-frame mn-measure" ref={frameRef} aria-hidden="true" />
      <Brand />
      <Stats crown={crown} />
    </div>
  )
}
