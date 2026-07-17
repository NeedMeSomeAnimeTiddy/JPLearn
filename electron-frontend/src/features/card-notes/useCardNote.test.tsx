import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CardNotePayload } from '../../generated/types'
import { useCardNote } from './useCardNote'

const BUILTIN_KEY = `note:v1:builtin:${'a'.repeat(64)}`
const OFFLINE_KEY = 'note:v1:offline_dictionary:jmdict:ent-1000010'

function notePayload(noteKey: string, text: string): CardNotePayload {
  return {
    note_key: noteKey,
    note_text: text,
    created_at_utc: '2026-07-17T10:00:00Z',
    updated_at_utc: '2026-07-17T10:00:01Z',
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function installNoteApi(overrides: Partial<Window['jplearnDesktop']> = {}) {
  window.jplearnDesktop = {
    getCardNote: vi.fn(async () => ({ note: null })),
    saveCardNote: vi.fn(async ({ noteKey, noteText }) => notePayload(noteKey, noteText)),
    deleteCardNote: vi.fn(async (noteKey) => ({ note_key: noteKey, deleted: true })),
    ...overrides,
  } as Window['jplearnDesktop']
}

describe('useCardNote', () => {
  beforeEach(() => {
    installNoteApi()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('loads lazily only after a note key is supplied', async () => {
    const getCardNote = vi.fn(async () => ({ note: null }))
    installNoteApi({ getCardNote })
    const { result, rerender } = renderHook(
      ({ noteKey }) => useCardNote(noteKey),
      { initialProps: { noteKey: null as string | null } },
    )

    expect(result.current.mode).toBe('idle')
    expect(getCardNote).not.toHaveBeenCalled()

    rerender({ noteKey: BUILTIN_KEY })
    await waitFor(() => expect(result.current.mode).toBe('add'))
    expect(getCardNote).toHaveBeenCalledOnce()
    expect(getCardNote).toHaveBeenCalledWith(BUILTIN_KEY)
    expect(result.current.focusRequest?.target).toBe('textarea')
  })

  it('ignores an older load response after the identity changes', async () => {
    const first = deferred<{ note: CardNotePayload | null }>()
    const second = deferred<{ note: CardNotePayload | null }>()
    const getCardNote = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    installNoteApi({ getCardNote })
    const { result, rerender } = renderHook(
      ({ noteKey }) => useCardNote(noteKey),
      { initialProps: { noteKey: BUILTIN_KEY as string | null } },
    )

    rerender({ noteKey: OFFLINE_KEY })
    await act(async () => {
      second.resolve({ note: notePayload(OFFLINE_KEY, 'new result') })
      await second.promise
    })
    await waitFor(() => expect(result.current.note?.note_text).toBe('new result'))

    await act(async () => {
      first.resolve({ note: notePayload(BUILTIN_KEY, 'stale result') })
      await first.promise
    })
    expect(result.current.note?.note_text).toBe('new result')
  })

  it('keeps saving explicit and accepts the canonical response text', async () => {
    const saveCardNote = vi.fn(async ({ noteKey }: { noteKey: string; noteText: string }) =>
      notePayload(noteKey, 'Café 😀'),
    )
    installNoteApi({ saveCardNote })
    const { result } = renderHook(() => useCardNote(BUILTIN_KEY))
    await waitFor(() => expect(result.current.mode).toBe('add'))

    act(() => result.current.setDraft('  Cafe\u0301 😀  '))
    expect(result.current.isDirty).toBe(true)
    expect(result.current.canSave).toBe(true)
    expect(saveCardNote).not.toHaveBeenCalled()

    await act(async () => result.current.save())
    expect(saveCardNote).toHaveBeenCalledWith({
      noteKey: BUILTIN_KEY,
      noteText: '  Cafe\u0301 😀  ',
    })
    expect(result.current.mode).toBe('view')
    expect(result.current.note?.note_text).toBe('Café 😀')
    expect(result.current.draft).toBe('Café 😀')
    expect(result.current.announcement).toBe('Note saved.')
  })

  it('retains a failed draft and retries the same explicit save', async () => {
    const saveCardNote = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk busy'))
      .mockResolvedValueOnce(notePayload(BUILTIN_KEY, 'remember this'))
    installNoteApi({ saveCardNote })
    const { result } = renderHook(() => useCardNote(BUILTIN_KEY))
    await waitFor(() => expect(result.current.mode).toBe('add'))
    act(() => result.current.setDraft('remember this'))

    await act(async () => result.current.save())
    expect(result.current.mode).toBe('add')
    expect(result.current.draft).toBe('remember this')
    expect(result.current.errorOperation).toBe('save')
    expect(result.current.focusRequest?.target).toBe('textarea')

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.mode).toBe('view'))
    expect(saveCardNote).toHaveBeenCalledTimes(2)
  })

  it('reports dirty drafts and restores persisted state on cancel', async () => {
    const restoreTriggerFocus = vi.fn()
    const onCollapse = vi.fn()
    installNoteApi({
      getCardNote: vi.fn(async () => ({ note: notePayload(BUILTIN_KEY, 'saved') })),
    })
    const { result } = renderHook(() =>
      useCardNote(BUILTIN_KEY, { onCollapse, restoreTriggerFocus }),
    )
    await waitFor(() => expect(result.current.mode).toBe('view'))
    act(() => result.current.beginEdit())
    act(() => result.current.setDraft('changed'))

    let mayLeave = true
    act(() => {
      mayLeave = result.current.requestLeave()
    })
    expect(mayLeave).toBe(false)
    expect(result.current.announcement).toBe('Save or cancel your note before continuing.')
    expect(result.current.focusRequest?.target).toBe('textarea')

    act(() => result.current.cancel())
    expect(result.current.mode).toBe('view')
    expect(result.current.draft).toBe('saved')
    expect(restoreTriggerFocus).toHaveBeenCalledOnce()
    expect(onCollapse).not.toHaveBeenCalled()
  })

  it('retains delete confirmation on failure and retries before collapsing', async () => {
    const onCollapse = vi.fn()
    const restoreTriggerFocus = vi.fn()
    const deleteCardNote = vi
      .fn()
      .mockRejectedValueOnce(new Error('locked'))
      .mockResolvedValueOnce({ note_key: BUILTIN_KEY, deleted: true })
    installNoteApi({
      getCardNote: vi.fn(async () => ({ note: notePayload(BUILTIN_KEY, 'saved') })),
      deleteCardNote,
    })
    const { result } = renderHook(() =>
      useCardNote(BUILTIN_KEY, { onCollapse, restoreTriggerFocus }),
    )
    await waitFor(() => expect(result.current.mode).toBe('view'))
    act(() => result.current.beginDelete())

    await act(async () => result.current.deleteNote())
    expect(result.current.mode).toBe('confirm-delete')
    expect(result.current.errorOperation).toBe('delete')

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.mode).toBe('idle'))
    expect(deleteCardNote).toHaveBeenCalledTimes(2)
    expect(result.current.announcement).toBe('Note removed.')
    expect(onCollapse).toHaveBeenCalledOnce()
    expect(restoreTriggerFocus).toHaveBeenCalledOnce()
  })

  it('turns malformed and missing desktop responses into retryable failures', async () => {
    installNoteApi({ getCardNote: vi.fn(async () => ({ unexpected: true }) as never) })
    const malformed = renderHook(() => useCardNote(BUILTIN_KEY))
    await waitFor(() => expect(malformed.result.current.mode).toBe('load-error'))
    expect(malformed.result.current.errorOperation).toBe('load')
    malformed.unmount()

    window.jplearnDesktop = {} as Window['jplearnDesktop']
    const unavailable = renderHook(() => useCardNote(BUILTIN_KEY))
    await waitFor(() => expect(unavailable.result.current.mode).toBe('load-error'))
    expect(unavailable.result.current.errorMessage).toContain('unavailable')
  })
})
