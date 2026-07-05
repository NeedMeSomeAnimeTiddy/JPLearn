import { MINIGAME_SKILL_GROUP_META } from '../constants'
import type { MinigameSkillGroupKey } from '../constants'
import type { MinigameKey } from '../types'

export type DifficultyFilterValue = 'all' | 'easy' | 'medium' | 'hard'
export type SortMode = 'recommended' | 'recent' | 'difficulty'

interface FilterSortBarProps {
  items: MinigameKey[]
  activeSkillGroup: MinigameSkillGroupKey | null
  activeDifficulty: DifficultyFilterValue
  sortMode: SortMode
  onSkillGroupChange: (group: MinigameSkillGroupKey | null) => void
  onDifficultyChange: (difficulty: DifficultyFilterValue) => void
  onSortChange: (sort: SortMode) => void
}

const skillGroupKeys: Array<MinigameSkillGroupKey | null> = [
  null,
  ...(Object.keys(MINIGAME_SKILL_GROUP_META) as MinigameSkillGroupKey[]),
]

const difficultyValues: DifficultyFilterValue[] = ['all', 'easy', 'medium', 'hard']

export function FilterSortBar({
  activeSkillGroup,
  activeDifficulty,
  sortMode,
  onSkillGroupChange,
  onDifficultyChange,
  onSortChange,
}: FilterSortBarProps) {
  return (
    <div className="filter-sort-bar">
      <div className="filter-sort-section">
        <span className="filter-sort-section-label">Skills</span>
        {skillGroupKeys.map((key) => {
          const label = key === null ? 'All' : MINIGAME_SKILL_GROUP_META[key].title
          const isActive = key === activeSkillGroup
          return (
            <button
              key={key ?? '_all'}
              type="button"
              className={`filter-chip${isActive ? ' is-active' : ''}`}
              aria-pressed={isActive}
              onClick={() => onSkillGroupChange(key)}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="filter-sort-section">
        <span className="filter-sort-section-label">Difficulty</span>
        {difficultyValues.map((val) => {
          const isActive = val === activeDifficulty
          const label = val === 'all' ? 'All' : val.charAt(0).toUpperCase() + val.slice(1)
          return (
            <button
              key={val}
              type="button"
              className={`filter-chip${isActive ? ' is-active' : ''}`}
              aria-pressed={isActive}
              onClick={() => onDifficultyChange(val)}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="filter-sort-section">
        <span className="filter-sort-section-label">Sort</span>
        <select
          className="filter-select"
          value={sortMode}
          onChange={(e) => onSortChange(e.target.value as SortMode)}
          aria-label="Sort mode"
        >
          <option value="recommended">Recommended</option>
          <option value="recent">Recent</option>
          <option value="difficulty">Difficulty</option>
        </select>
      </div>
    </div>
  )
}
