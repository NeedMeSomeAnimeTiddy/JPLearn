/**
 * The block tracklist's containment and scrollbar.
 *
 * Both are load-bearing rather than decorative. The rail is a fixed grid column
 * in a non-resizable 1280x820 window, so the list has to shrink inside it —
 * without `min-height: 0` a flex child refuses to go below its content height
 * and the studio grows past the window. Without the scrollbar rules the list
 * falls back to the OS default, which on Windows is a white bar sitting on top
 * of the deck chrome.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const styles = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

function rule(selector: string): string {
  const start = styles.indexOf(selector + ' {')
  expect(start, `${selector} is not defined`).toBeGreaterThan(-1)
  return styles.slice(start, styles.indexOf('}', start))
}

describe('block tracklist', () => {
  it('fills the rail and scrolls instead of growing it', () => {
    const rows = rule('.hub-tracklist-rows')
    expect(rows).toContain('flex: 1')
    expect(rows).toContain('min-height: 0')
    expect(rows).toContain('overflow-y: auto')
  })

  it('gives the rail its own studio column, and only in the hub', () => {
    // `.hub-studio` is shared with HomeView and MinigameView, which have no
    // rail — widening the base rule leaves them a hole where it would sit.
    expect(rule('.hub-studio')).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(rule('.hub-studio--rail')).toContain('grid-template-columns: 268px')
    expect(rule('.hub-rail')).toContain('min-height: 0')
  })

  it('styles the scrollbar rather than inheriting the OS one', () => {
    const rows = rule('.hub-tracklist-rows')
    expect(rows).toContain('scrollbar-width: thin')
    expect(rows).toContain('scrollbar-color')

    // Older Electron builds ignore scrollbar-color, so the ::-webkit rules
    // have to carry the same treatment.
    expect(styles).toContain('.hub-tracklist-rows::-webkit-scrollbar')
    expect(styles).toContain('.hub-tracklist-rows::-webkit-scrollbar-track')
    expect(styles).toContain('.hub-tracklist-rows::-webkit-scrollbar-thumb')
  })

  it('keeps the thumb square, like the rest of the hub', () => {
    expect(rule('.hub-tracklist-rows::-webkit-scrollbar-thumb')).toContain('border-radius: 0')
  })
})
