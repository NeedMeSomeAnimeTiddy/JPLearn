import type { JlptLevel, JlptLevelProgress } from '../../../types'

export interface LevelBarProps {
  /** the deck this ladder belongs to, so the row says what its five rungs are rungs OF */
  deck: string
  levels: readonly JlptLevelProgress[]
  at: JlptLevel
  onPick: (level: JlptLevel) => void
}

/* THE ROW IS FURNITURE, NOT A CARD. It stands in the crown beside the heading slab, outside the
   board the screen composes on -- see the frame contract. Two reasons it cannot be on the stage:
   the deck screen's three cards already run x174 to x1105 of a 960-wide stage, and the level is not
   one of the things the screen is offering you. It says which deck you are looking at, which is the
   same job the heading does one line above. */
export function LevelBar({ deck, levels, at, onPick }: LevelBarProps) {
  /* ONE RUNG IS NOT A LADDER. A deck the bridge answered with a single level has nothing to choose
     between, and a row of one chip reads as a control that is broken rather than as a fact. */
  if (levels.length < 2) return null
  return (
    <div className="lvb" role="group" aria-label={`${deck} level`}>
      <span className="lvb-lab">{deck}</span>
      {levels.map((level, index) => {
        const name = level.key.toUpperCase()
        const pct = Math.round(level.mastery * 100)
        return (
          <button
            key={level.key}
            type="button"
            className={`lvb-chip${level.key === at ? ' on' : ''}`}
            aria-pressed={level.key === at}
            aria-label={`${name} — ${pct}% of ${level.total.toLocaleString()} cards`}
            onClick={() => onPick(level.key)}
          >
            <s>{index + 1}</s>
            <b>{name}</b>
            {/* THE FIGURE IS WHY THE ROW IS WORTH ITS SPACE. Five bare level names are a tab bar;
                five with what you have done to each are a map of the ladder. */}
            <i>{pct}%</i>
          </button>
        )
      })}
    </div>
  )
}
