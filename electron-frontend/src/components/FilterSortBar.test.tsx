import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterSortBar } from './FilterSortBar'
import type { MinigameKey } from '../types'

const sampleItems: MinigameKey[] = ['romaji_sprint', 'meaning_match', 'character_match']

describe('FilterSortBar', () => {
  it('renders skill group chips', () => {
    render(
      <FilterSortBar
        items={sampleItems}
        activeSkillGroup={null}
        activeDifficulty="all"
        sortMode="recommended"
        onSkillGroupChange={vi.fn()}
        onDifficultyChange={vi.fn()}
        onSortChange={vi.fn()}
      />
    )
    // Two "All" chips: one for Skills filter, one for Difficulty filter
    expect(screen.getAllByText('All')).toHaveLength(2)
    expect(screen.getByText('Recognition')).toBeInTheDocument()
  })

  it('calls onSkillGroupChange when chip clicked', () => {
    const onChange = vi.fn()
    render(
      <FilterSortBar
        items={sampleItems}
        activeSkillGroup={null}
        activeDifficulty="all"
        sortMode="recommended"
        onSkillGroupChange={onChange}
        onDifficultyChange={vi.fn()}
        onSortChange={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Recognition'))
    expect(onChange).toHaveBeenCalledWith('recognition')
  })

  it('calls onSortChange when dropdown changes', () => {
    const onSort = vi.fn()
    render(
      <FilterSortBar
        items={sampleItems}
        activeSkillGroup={null}
        activeDifficulty="all"
        sortMode="recommended"
        onSkillGroupChange={vi.fn()}
        onDifficultyChange={vi.fn()}
        onSortChange={onSort}
      />
    )
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'difficulty' } })
    expect(onSort).toHaveBeenCalledWith('difficulty')
  })

  it('shows active state on selected skill chip', () => {
    render(
      <FilterSortBar
        items={sampleItems}
        activeSkillGroup="recognition"
        activeDifficulty="all"
        sortMode="recommended"
        onSkillGroupChange={vi.fn()}
        onDifficultyChange={vi.fn()}
        onSortChange={vi.fn()}
      />
    )
    const recognitionChip = screen.getByText('Recognition')
    expect(recognitionChip).toHaveClass('is-active')
  })

  it('calls onDifficultyChange when difficulty chip clicked', () => {
    const onChange = vi.fn()
    render(
      <FilterSortBar
        items={sampleItems}
        activeSkillGroup={null}
        activeDifficulty="all"
        sortMode="recommended"
        onSkillGroupChange={vi.fn()}
        onDifficultyChange={onChange}
        onSortChange={vi.fn()}
      />
    )
    const difficultyChips = screen.getAllByText('All')
    // Click the second "All" (first is Skills, second is Difficulty)
    fireEvent.click(difficultyChips[1])
    // Already active, so it should call with 'all'
    expect(onChange).toHaveBeenCalledWith('all')
  })
})
