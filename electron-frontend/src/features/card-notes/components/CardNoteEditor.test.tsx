import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardNotePayload } from '../../../generated/types'
import { CardNoteEditor } from './CardNoteEditor'
import type { CardNoteController } from '../useCardNote'

const NOTE: CardNotePayload = {
  note_key: `note:v1:builtin:${'a'.repeat(64)}`,
  note_text: 'A saved note',
  created_at_utc: '2026-07-17T10:00:00Z',
  updated_at_utc: '2026-07-17T10:00:01Z',
}

function controller(
  overrides: Partial<CardNoteController> = {},
): CardNoteController {
  return {
    mode: 'add',
    note: null,
    draft: '',
    characterCount: 0,
    maxLength: 2_000,
    isDirty: false,
    isOverLimit: false,
    canSave: false,
    pendingAction: null,
    errorOperation: null,
    errorMessage: null,
    announcement: '',
    focusRequest: null,
    setDraft: vi.fn(),
    beginEdit: vi.fn(),
    beginDelete: vi.fn(),
    keepNote: vi.fn(),
    save: vi.fn(async () => undefined),
    deleteNote: vi.fn(async () => undefined),
    retry: vi.fn(),
    cancel: vi.fn(),
    requestLeave: vi.fn(() => true),
    collapse: vi.fn(() => true),
    ...overrides,
  }
}

describe('CardNoteEditor', () => {
  afterEach(cleanup)

  it('renders loading and retryable load failures accessibly', () => {
    const { rerender } = render(
      <CardNoteEditor character="日本" controller={controller({ mode: 'loading' })} />,
    )
    expect(screen.getByRole('status').textContent).toContain('Loading personal note')
    expect(screen.getByRole('region').getAttribute('aria-busy')).toBe('true')

    const retry = vi.fn()
    rerender(
      <CardNoteEditor
        character="日本"
        controller={controller({
          mode: 'load-error',
          errorOperation: 'load',
          errorMessage: 'Personal note could not be loaded. Try again.',
          retry,
        })}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert').textContent).toContain('could not be loaded')
  })

  it('edits with explicit keyboard save and Escape cancel', () => {
    const save = vi.fn(async () => undefined)
    const cancel = vi.fn()
    const setDraft = vi.fn()
    const parentKeyDown = vi.fn()
    render(
      <div onKeyDown={parentKeyDown}>
        <CardNoteEditor
          character="日"
          controller={controller({
            mode: 'edit',
            note: NOTE,
            draft: 'changed 😀',
            characterCount: 9,
            isDirty: true,
            canSave: true,
            focusRequest: { sequence: 1, target: 'textarea' },
            save,
            cancel,
            setDraft,
          })}
        />
      </div>,
    )

    const textarea = screen.getByRole('textbox', { name: 'Edit personal note' })
    expect(document.activeElement).toBe(textarea)
    expect(document.body.contains(screen.getByText('9 / 2000 characters'))).toBe(true)
    fireEvent.change(textarea, { target: { value: 'new draft' } })
    expect(setDraft).toHaveBeenCalledWith('new draft')

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    expect(save).toHaveBeenCalledOnce()
    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(parentKeyDown).not.toHaveBeenCalled()
  })

  it('disables save for invalid drafts and exposes the live announcement', () => {
    render(
      <CardNoteEditor
        character="文"
        controller={controller({
          draft: 'too long',
          characterCount: 2_001,
          isDirty: true,
          isOverLimit: true,
          announcement: 'Save or cancel your note before continuing.',
        })}
      />,
    )

    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true')
    expect(
      screen
        .getByText('2001 / 2000 characters')
        .classList.contains('card-note-count-invalid'),
    ).toBe(true)
    expect(
      screen
        .getByText('Save or cancel your note before continuing.')
        .getAttribute('aria-live'),
    ).toBe('polite')
  })

  it('restores deterministic focus in view mode and collapses on Escape', () => {
    const beginEdit = vi.fn()
    const collapse = vi.fn(() => true)
    render(
      <CardNoteEditor
        character="日"
        controller={controller({
          mode: 'view',
          note: NOTE,
          draft: NOTE.note_text,
          focusRequest: { sequence: 2, target: 'view-action' },
          beginEdit,
          collapse,
        })}
      />,
    )

    const edit = screen.getByRole('button', { name: 'Edit' })
    expect(document.activeElement).toBe(edit)
    expect(document.body.contains(screen.getByText('A saved note'))).toBe(true)
    fireEvent.click(edit)
    expect(beginEdit).toHaveBeenCalledOnce()
    fireEvent.keyDown(screen.getByRole('region'), { key: 'Escape' })
    expect(collapse).toHaveBeenCalledOnce()
  })

  it('requires delete confirmation, supports retry, and focuses the requested action', () => {
    const deleteNote = vi.fn(async () => undefined)
    const keepNote = vi.fn()
    const retry = vi.fn()
    const { rerender } = render(
      <CardNoteEditor
        character="日"
        controller={controller({
          mode: 'confirm-delete',
          note: NOTE,
          errorOperation: 'delete',
          errorMessage: 'Personal note could not be removed. Try again.',
          focusRequest: { sequence: 1, target: 'retry' },
          deleteNote,
          keepNote,
          retry,
        })}
      />,
    )

    const retryButton = screen.getByRole('button', { name: 'Retry' })
    expect(document.activeElement).toBe(retryButton)
    fireEvent.click(retryButton)
    expect(retry).toHaveBeenCalledOnce()

    rerender(
      <CardNoteEditor
        character="日"
        controller={controller({
          mode: 'confirm-delete',
          note: NOTE,
          focusRequest: { sequence: 2, target: 'remove-confirm' },
          deleteNote,
          keepNote,
        })}
      />,
    )
    const remove = screen.getByRole('button', { name: 'Remove' })
    expect(document.activeElement).toBe(remove)
    fireEvent.click(remove)
    fireEvent.click(screen.getByRole('button', { name: 'Keep note' }))
    fireEvent.keyDown(screen.getByRole('region'), { key: 'Escape' })
    expect(deleteNote).toHaveBeenCalledOnce()
    expect(keepNote).toHaveBeenCalledTimes(2)
  })
})
