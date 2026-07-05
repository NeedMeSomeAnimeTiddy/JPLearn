import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MinigameGrid } from './MinigameGrid'
import '@testing-library/jest-dom/vitest'

describe('MinigameGrid', () => {
  it('renders children in a grid', () => {
    const { container } = render(
      <MinigameGrid>
        <div data-testid="card-1" />
        <div data-testid="card-2" />
      </MinigameGrid>
    )
    expect(container.querySelector('.minigame-grid')).toBeInTheDocument()
    expect(screen.getByTestId('card-1')).toBeInTheDocument()
    expect(screen.getByTestId('card-2')).toBeInTheDocument()
  })

  it('has correct aria role', () => {
    render(<MinigameGrid><div /></MinigameGrid>)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('uses custom aria label', () => {
    render(<MinigameGrid ariaLabel="Custom grid"><div /></MinigameGrid>)
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-label', 'Custom grid')
  })
})
