import { Round, RoundAsk, RoundWork } from '../../round'
import type { SlabSpec } from '../../round'
import type { ScreenHeadSpec } from '../../menu'
import { PUZZLE_COPY } from '../constants'

/* ==================================================================================================
   THE SHEET WITH NO BOARD ON IT YET -- loading the day, dealing the board, the day that did not
   load, a pool with nothing in it. The same sheet as the puzzle, because a screen that changes
   shape between its own states is two screens sharing a route: an empty plate, the caption saying
   what is happening, and the slab offering the one thing there is to do about it.
   ================================================================================================== */

interface PuzzlePlateProps {
  head: ScreenHeadSpec | null
  cap: string
  title: string
  body?: string | null
  /** 'busy' announces politely; 'alert' is a failure the learner has to act on */
  tone: 'busy' | 'alert' | 'plain'
  slab: SlabSpec
  onBack: () => void
  backAria: string
}

export function PuzzlePlate({ head, cap, title, body, tone, slab, onBack, backAria }: PuzzlePlateProps) {
  return (
    <Round
      head={head}
      cap={cap}
      run={[]}
      foot={{ at: 0, target: 0, trail: [], note: cap }}
      onBack={onBack}
      backLabel={PUZZLE_COPY.backLabel}
      backJp={PUZZLE_COPY.backJp}
      backAria={backAria}
      hints={[PUZZLE_COPY.escHint]}
      ask={(
        <RoundAsk kick={PUZZLE_COPY.plateKick} kickJp={PUZZLE_COPY.plateKickJp} size={20}>
          {null}
        </RoundAsk>
      )}
      work={(
        <RoundWork kick={PUZZLE_COPY.plateKick} kickJp={PUZZLE_COPY.plateKickJp} slab={slab}>
          <div
            className="rd-plain"
            role={tone === 'alert' ? 'alert' : tone === 'busy' ? 'status' : undefined}
            aria-label={tone === 'busy' ? title : undefined}
          >
            <h2>{title}</h2>
            {body ? <p className={tone === 'alert' ? 'rd-err' : undefined}>{body}</p> : null}
          </div>
        </RoundWork>
      )}
    />
  )
}
