import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const styles = readFileSync(resolve(process.cwd(), 'src/features/handwriting/handwriting.css'), 'utf8')

describe('handwriting compact layout', () => {
  it('prevents page scrolling for the 820px minimum desktop height while retaining a comfortable canvas', () => {
    expect(styles).toContain('.minigame-shell:has(.handwriting-answer-panel) .hub-player')
    expect(styles).toContain('overflow-y: hidden')
    expect(styles).toContain('width: min(15rem, calc(100vh - 35rem), 100%)')
    expect(styles).toContain('min-width: 12.5rem')
  })
})
