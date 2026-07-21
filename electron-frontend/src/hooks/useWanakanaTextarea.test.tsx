import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useWanakanaTextarea } from './useWanakanaTextarea'

afterEach(() => {
  cleanup()
})

function TestField({ enabled, onValueChange }: { enabled: boolean; onValueChange: (value: string) => void }) {
  const [value, setValue] = useState('')
  const { ref, handlers } = useWanakanaTextarea(enabled, 'toHiragana', (next) => {
    setValue(next)
    onValueChange(next)
  })
  return <textarea ref={ref} value={value} {...handlers} aria-label="field" />
}

/** Fires a real native 'input' event with the given value, matching how the
 * browser (and wanakana's own listener) actually delivers keystrokes —
 * fireEvent.change alone doesn't trigger wanakana's bound 'input' handler. */
function typeInto(field: HTMLElement, value: string) {
  fireEvent.input(field, { target: { value } })
}

describe('useWanakanaTextarea', () => {
  it('converts romaji to kana as-you-type while enabled', () => {
    const onValueChange = vi.fn()
    render(<TestField enabled onValueChange={onValueChange} />)
    const field = screen.getByLabelText('field')

    typeInto(field, 'koohii')
    expect((field as HTMLTextAreaElement).value).toBe('こおひい')
    expect(onValueChange).toHaveBeenLastCalledWith('こおひい')
  })

  it('leaves romaji completely untouched while disabled', () => {
    const onValueChange = vi.fn()
    render(<TestField enabled={false} onValueChange={onValueChange} />)
    const field = screen.getByLabelText('field')

    fireEvent.change(field, { target: { value: 'koohii' } })
    expect((field as HTMLTextAreaElement).value).toBe('koohii')
    expect(onValueChange).toHaveBeenLastCalledWith('koohii')
  })

  it('unbinds immediately when flipped from enabled to disabled', () => {
    const onValueChange = vi.fn()
    const { rerender } = render(<TestField enabled onValueChange={onValueChange} />)
    const field = screen.getByLabelText('field')
    typeInto(field, 'ko')
    expect((field as HTMLTextAreaElement).value).toBe('こ')

    rerender(<TestField enabled={false} onValueChange={onValueChange} />)
    fireEvent.change(field, { target: { value: 'こka' } })
    expect((field as HTMLTextAreaElement).value).toBe('こka')
  })

  it('rebinds when flipped from disabled to enabled', () => {
    const onValueChange = vi.fn()
    const { rerender } = render(<TestField enabled={false} onValueChange={onValueChange} />)
    const field = screen.getByLabelText('field')
    fireEvent.change(field, { target: { value: 'ko' } })
    expect((field as HTMLTextAreaElement).value).toBe('ko')

    rerender(<TestField enabled onValueChange={onValueChange} />)
    typeInto(field, 'kohii')
    expect((field as HTMLTextAreaElement).value).toBe('こひい')
  })

  it('suppresses conversion during a real IME composition and commits on compositionend', () => {
    const onValueChange = vi.fn()
    render(<TestField enabled onValueChange={onValueChange} />)
    const field = screen.getByLabelText('field') as HTMLTextAreaElement

    fireEvent.compositionStart(field)
    // A native IME writes the composing kanji directly into the field and
    // marks the input event isComposing — the one signal React's own
    // controlled-input reconciliation trusts to leave mid-composition DOM
    // value untouched, matching real browser behaviour. Our onInput handler
    // must not fight it either.
    field.value = '水'
    fireEvent(field, new InputEvent('input', { bubbles: true, isComposing: true } as InputEventInit))
    expect(field.value).toBe('水')
    expect(onValueChange).not.toHaveBeenCalled()

    fireEvent.compositionEnd(field, { data: '水' })
    expect(onValueChange).toHaveBeenLastCalledWith('水')
  })

  it('does not call onValueChange from onChange while enabled (onInput/compositionend drive it instead)', () => {
    const onValueChange = vi.fn()
    render(<TestField enabled onValueChange={onValueChange} />)
    const field = screen.getByLabelText('field')

    fireEvent.change(field, { target: { value: 'stale' } })
    expect(onValueChange).not.toHaveBeenCalled()
  })
})
