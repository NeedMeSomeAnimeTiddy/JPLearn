import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CardNotePayload } from '../../generated/types'
import { countNoteCharacters, isValidCardNoteKey } from './utils'

export const CARD_NOTE_MAX_LENGTH = 2_000

export type CardNoteMode =
  | 'idle'
  | 'loading'
  | 'load-error'
  | 'add'
  | 'view'
  | 'edit'
  | 'confirm-delete'

export type CardNoteErrorOperation = 'load' | 'save' | 'delete'
export type CardNoteFocusTarget =
  | 'textarea'
  | 'view-action'
  | 'retry'
  | 'remove-confirm'

export interface CardNoteFocusRequest {
  sequence: number
  target: CardNoteFocusTarget
}

export interface UseCardNoteOptions {
  onCollapse?: () => void
  restoreTriggerFocus?: () => void
}

export interface CardNoteController {
  mode: CardNoteMode
  note: CardNotePayload | null
  draft: string
  characterCount: number
  maxLength: number
  isDirty: boolean
  isOverLimit: boolean
  canSave: boolean
  pendingAction: 'save' | 'delete' | null
  errorOperation: CardNoteErrorOperation | null
  errorMessage: string | null
  announcement: string
  focusRequest: CardNoteFocusRequest | null
  setDraft: (value: string) => void
  beginEdit: () => void
  beginDelete: () => void
  keepNote: () => void
  save: () => Promise<void>
  deleteNote: () => Promise<void>
  retry: () => void
  cancel: () => void
  requestLeave: () => boolean
  collapse: () => boolean
}

const ERROR_COPY: Record<CardNoteErrorOperation, string> = {
  load: 'Personal note could not be loaded. Try again.',
  save: 'Personal note could not be saved. Your draft is still here.',
  delete: 'Personal note could not be removed. Try again.',
}
const UNAVAILABLE_COPY = 'Personal notes are unavailable in this app build.'

function normalizeNoteText(value: string): string {
  return value.replace(/\r\n?/gu, '\n').normalize('NFC').trim()
}

function isCardNotePayload(value: unknown, noteKey: string): value is CardNotePayload {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const note = value as Record<string, unknown>
  return (
    note.note_key === noteKey &&
    typeof note.note_text === 'string' &&
    typeof note.created_at_utc === 'string' &&
    typeof note.updated_at_utc === 'string'
  )
}

function getDesktopApi(): Partial<Window['jplearnDesktop']> | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  return window.jplearnDesktop
}

export function useCardNote(
  noteKey: string | null,
  options: UseCardNoteOptions = {},
): CardNoteController {
  const [mode, setMode] = useState<CardNoteMode>('idle')
  const [note, setNote] = useState<CardNotePayload | null>(null)
  const [draft, setDraft] = useState('')
  const [pendingAction, setPendingAction] = useState<'save' | 'delete' | null>(null)
  const [errorOperation, setErrorOperation] =
    useState<CardNoteErrorOperation | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [focusRequest, setFocusRequest] =
    useState<CardNoteFocusRequest | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const requestSequenceRef = useRef(0)
  const focusSequenceRef = useRef(0)
  const mountedRef = useRef(false)
  const noteKeyRef = useRef(noteKey)
  const collapseRef = useRef(options.onCollapse)
  const restoreTriggerFocusRef = useRef(options.restoreTriggerFocus)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestSequenceRef.current += 1
    }
  }, [])

  useEffect(() => {
    noteKeyRef.current = noteKey
  }, [noteKey])

  useEffect(() => {
    collapseRef.current = options.onCollapse
    restoreTriggerFocusRef.current = options.restoreTriggerFocus
  }, [options.onCollapse, options.restoreTriggerFocus])

  const requestFocus = useCallback((target: CardNoteFocusTarget) => {
    focusSequenceRef.current += 1
    setFocusRequest({ sequence: focusSequenceRef.current, target })
  }, [])

  const setFailure = useCallback(
    (operation: CardNoteErrorOperation, message = ERROR_COPY[operation]) => {
      setErrorOperation(operation)
      setErrorMessage(message)
      setAnnouncement(message)
      requestFocus(operation === 'save' ? 'textarea' : 'retry')
    },
    [requestFocus],
  )

  useEffect(() => {
    const sequence = ++requestSequenceRef.current
    setPendingAction(null)
    setErrorOperation(null)
    setErrorMessage(null)
    setAnnouncement('')
    setFocusRequest(null)
    setNote(null)
    setDraft('')

    if (noteKey === null) {
      setMode('idle')
      return undefined
    }

    if (!isValidCardNoteKey(noteKey)) {
      setMode('load-error')
      setFailure('load', 'This card does not have a valid personal-note identity.')
      return undefined
    }

    setMode('loading')
    const getCardNote = getDesktopApi()?.getCardNote
    if (typeof getCardNote !== 'function') {
      setMode('load-error')
      setFailure('load', UNAVAILABLE_COPY)
      return undefined
    }

    void (async () => {
      try {
        const payload = await getCardNote(noteKey)
        if (
          !mountedRef.current ||
          requestSequenceRef.current !== sequence ||
          noteKeyRef.current !== noteKey
        ) {
          return
        }

        if (
          typeof payload !== 'object' ||
          payload === null ||
          !('note' in payload) ||
          (payload.note !== null && !isCardNotePayload(payload.note, noteKey))
        ) {
          setMode('load-error')
          setFailure('load')
          return
        }

        if (payload.note === null) {
          setMode('add')
          setNote(null)
          setDraft('')
          requestFocus('textarea')
          return
        }

        setMode('view')
        setNote(payload.note)
        setDraft(payload.note.note_text)
        requestFocus('view-action')
      } catch {
        if (
          mountedRef.current &&
          requestSequenceRef.current === sequence &&
          noteKeyRef.current === noteKey
        ) {
          setMode('load-error')
          setFailure('load')
        }
      }
    })()

    return () => {
      if (requestSequenceRef.current === sequence) {
        requestSequenceRef.current += 1
      }
    }
  }, [loadAttempt, noteKey, requestFocus, setFailure])

  const normalizedDraft = useMemo(() => normalizeNoteText(draft), [draft])
  const characterCount = useMemo(() => countNoteCharacters(draft), [draft])
  const isEditing = mode === 'add' || mode === 'edit'
  const savedText = note?.note_text ?? ''
  const isDirty = isEditing && draft !== savedText
  const isOverLimit = characterCount > CARD_NOTE_MAX_LENGTH
  const canSave =
    isEditing &&
    pendingAction === null &&
    normalizedDraft.length > 0 &&
    !isOverLimit &&
    normalizedDraft !== savedText

  const beginEdit = useCallback(() => {
    if (note === null || pendingAction !== null) {
      return
    }
    setDraft(note.note_text)
    setErrorOperation(null)
    setErrorMessage(null)
    setAnnouncement('')
    setMode('edit')
    requestFocus('textarea')
  }, [note, pendingAction, requestFocus])

  const beginDelete = useCallback(() => {
    if (note === null || pendingAction !== null) {
      return
    }
    setErrorOperation(null)
    setErrorMessage(null)
    setAnnouncement('')
    setMode('confirm-delete')
    requestFocus('remove-confirm')
  }, [note, pendingAction, requestFocus])

  const keepNote = useCallback(() => {
    if (pendingAction !== null) {
      return
    }
    setErrorOperation(null)
    setErrorMessage(null)
    setAnnouncement('')
    setMode('view')
    requestFocus('view-action')
  }, [pendingAction, requestFocus])

  const save = useCallback(async () => {
    const currentNoteKey = noteKeyRef.current
    const currentDraft = normalizeNoteText(draft)
    if (
      currentNoteKey === null ||
      !isValidCardNoteKey(currentNoteKey) ||
      pendingAction !== null ||
      !isEditing ||
      currentDraft.length === 0 ||
      countNoteCharacters(draft) > CARD_NOTE_MAX_LENGTH ||
      currentDraft === savedText
    ) {
      return
    }

    const saveCardNote = getDesktopApi()?.saveCardNote
    if (typeof saveCardNote !== 'function') {
      setFailure('save', UNAVAILABLE_COPY)
      return
    }

    const sequence = ++requestSequenceRef.current
    setPendingAction('save')
    setErrorOperation(null)
    setErrorMessage(null)
    setAnnouncement('Saving note.')

    try {
      const savedNote = await saveCardNote({
        noteKey: currentNoteKey,
        noteText: draft,
      })
      if (
        !mountedRef.current ||
        requestSequenceRef.current !== sequence ||
        noteKeyRef.current !== currentNoteKey
      ) {
        return
      }
      if (!isCardNotePayload(savedNote, currentNoteKey)) {
        setPendingAction(null)
        setFailure('save')
        return
      }

      setNote(savedNote)
      setDraft(savedNote.note_text)
      setPendingAction(null)
      setMode('view')
      setAnnouncement('Note saved.')
      requestFocus('view-action')
    } catch {
      if (
        mountedRef.current &&
        requestSequenceRef.current === sequence &&
        noteKeyRef.current === currentNoteKey
      ) {
        setPendingAction(null)
        setFailure('save')
      }
    }
  }, [draft, isEditing, pendingAction, requestFocus, savedText, setFailure])

  const deleteNote = useCallback(async () => {
    const currentNoteKey = noteKeyRef.current
    if (
      currentNoteKey === null ||
      !isValidCardNoteKey(currentNoteKey) ||
      pendingAction !== null ||
      mode !== 'confirm-delete'
    ) {
      return
    }

    const deleteCardNote = getDesktopApi()?.deleteCardNote
    if (typeof deleteCardNote !== 'function') {
      setFailure('delete', UNAVAILABLE_COPY)
      return
    }

    const sequence = ++requestSequenceRef.current
    setPendingAction('delete')
    setErrorOperation(null)
    setErrorMessage(null)
    setAnnouncement('Removing note.')

    try {
      const payload = await deleteCardNote(currentNoteKey)
      if (
        !mountedRef.current ||
        requestSequenceRef.current !== sequence ||
        noteKeyRef.current !== currentNoteKey
      ) {
        return
      }
      if (
        typeof payload !== 'object' ||
        payload === null ||
        payload.note_key !== currentNoteKey ||
        typeof payload.deleted !== 'boolean'
      ) {
        setPendingAction(null)
        setFailure('delete')
        return
      }

      setPendingAction(null)
      setNote(null)
      setDraft('')
      setMode('idle')
      setAnnouncement('Note removed.')
      collapseRef.current?.()
      restoreTriggerFocusRef.current?.()
    } catch {
      if (
        mountedRef.current &&
        requestSequenceRef.current === sequence &&
        noteKeyRef.current === currentNoteKey
      ) {
        setPendingAction(null)
        setFailure('delete')
      }
    }
  }, [mode, pendingAction, setFailure])

  const cancel = useCallback(() => {
    if (pendingAction !== null) {
      return
    }
    requestSequenceRef.current += 1
    setErrorOperation(null)
    setErrorMessage(null)
    setAnnouncement('')
    setDraft(savedText)

    if (note === null) {
      setMode('idle')
      collapseRef.current?.()
    } else {
      setMode('view')
    }
    restoreTriggerFocusRef.current?.()
  }, [note, pendingAction, savedText])

  const requestLeave = useCallback(() => {
    if (isDirty) {
      const message = 'Save or cancel your note before continuing.'
      setAnnouncement(message)
      requestFocus('textarea')
      return false
    }
    return true
  }, [isDirty, requestFocus])

  const collapse = useCallback(() => {
    if (!requestLeave()) {
      return false
    }
    requestSequenceRef.current += 1
    setMode('idle')
    collapseRef.current?.()
    restoreTriggerFocusRef.current?.()
    return true
  }, [requestLeave])

  const retry = useCallback(() => {
    if (pendingAction !== null || errorOperation === null) {
      return
    }
    if (errorOperation === 'load') {
      setLoadAttempt((attempt) => attempt + 1)
      return
    }
    if (errorOperation === 'save') {
      void save()
      return
    }
    void deleteNote()
  }, [deleteNote, errorOperation, pendingAction, save])

  return {
    mode,
    note,
    draft,
    characterCount,
    maxLength: CARD_NOTE_MAX_LENGTH,
    isDirty,
    isOverLimit,
    canSave,
    pendingAction,
    errorOperation,
    errorMessage,
    announcement,
    focusRequest,
    setDraft,
    beginEdit,
    beginDelete,
    keepNote,
    save,
    deleteNote,
    retry,
    cancel,
    requestLeave,
    collapse,
  }
}
