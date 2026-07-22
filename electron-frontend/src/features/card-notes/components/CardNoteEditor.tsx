import { useEffect, useRef, type KeyboardEvent } from 'react'
import type { CardNoteController } from '../useCardNote'
import './card-notes.css'

export interface CardNoteEditorProps {
  character: string
  controller: CardNoteController
  sectionId?: string
}

const COPY = {
  heading: 'Personal note',
  loading: 'Loading personal note…',
  addLabel: 'Add a personal note',
  editLabel: 'Edit personal note',
  add: 'Add note',
  edit: 'Edit',
  remove: 'Remove',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  retry: 'Retry',
  confirmRemove: 'Remove this note?',
  confirmExplanation: 'This removes the note from this learning item.',
  removing: 'Removing…',
  keep: 'Keep note',
} as const

export function CardNoteEditor({
  character,
  controller,
  sectionId = 'dictionary-card-note',
}: CardNoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const viewActionRef = useRef<HTMLButtonElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const removeConfirmRef = useRef<HTMLButtonElement>(null)
  const headingId = `${sectionId}-heading`
  const inputId = `${sectionId}-input`
  const countId = `${sectionId}-count`
  const errorId = `${sectionId}-error`

  useEffect(() => {
    const target = controller.focusRequest?.target
    if (target === 'textarea') {
      textareaRef.current?.focus()
    } else if (target === 'view-action') {
      viewActionRef.current?.focus()
    } else if (target === 'retry') {
      retryRef.current?.focus()
    } else if (target === 'remove-confirm') {
      removeConfirmRef.current?.focus()
    }
  }, [controller.focusRequest])

  if (controller.mode === 'idle') {
    return null
  }

  const handleSectionKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') {
      return
    }
    if (controller.mode === 'view') {
      event.preventDefault()
      event.stopPropagation()
      controller.collapse()
    } else if (controller.mode === 'confirm-delete') {
      event.preventDefault()
      event.stopPropagation()
      controller.keepNote()
    }
  }

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      controller.cancel()
      return
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      event.stopPropagation()
      if (controller.canSave) {
        void controller.save()
      }
    }
  }

  const renderError = () =>
    controller.errorMessage === null ? null : (
      <div className="card-note-error" id={errorId} role="alert">
        <span>{controller.errorMessage}</span>
        <button
          className="panel-action-button card-note-button"
          onClick={controller.retry}
          ref={retryRef}
          type="button"
        >
          {COPY.retry}
        </button>
      </div>
    )

  return (
    <section
      aria-busy={controller.mode === 'loading' || controller.pendingAction !== null}
      aria-labelledby={headingId}
      className="card-note-section"
      id={sectionId}
      onKeyDown={handleSectionKeyDown}
    >
      <h4 className="card-note-heading" id={headingId}>
        {COPY.heading} for <span lang="ja">{character}</span>
      </h4>

      {controller.mode === 'loading' && (
        <p className="card-note-status" role="status">
          {COPY.loading}
        </p>
      )}

      {controller.mode === 'load-error' && renderError()}

      {controller.mode === 'view' && controller.note !== null && (
        <div className="card-note-view">
          <p className="card-note-text">{controller.note.note_text}</p>
          <div className="card-note-actions">
            <button
              className="panel-action-button card-note-button"
              onClick={controller.beginEdit}
              ref={viewActionRef}
              type="button"
            >
              {COPY.edit}
            </button>
            <button
              className="panel-action-button card-note-button card-note-button-danger"
              onClick={controller.beginDelete}
              type="button"
            >
              {COPY.remove}
            </button>
          </div>
        </div>
      )}

      {(controller.mode === 'add' || controller.mode === 'edit') && (
        <div className="card-note-editor">
          <label className="card-note-label" htmlFor={inputId}>
            {controller.mode === 'add' ? COPY.addLabel : COPY.editLabel}
          </label>
          <textarea
            aria-describedby={`${countId}${controller.errorMessage ? ` ${errorId}` : ''}`}
            aria-invalid={controller.isOverLimit}
            className="card-note-textarea"
            id={inputId}
            onChange={(event) => controller.setDraft(event.target.value)}
            onKeyDown={handleEditorKeyDown}
            ref={textareaRef}
            rows={5}
            value={controller.draft}
          />
          <p
            className={`card-note-count${controller.isOverLimit ? ' card-note-count-invalid' : ''}`}
            id={countId}
          >
            {controller.characterCount} / {controller.maxLength} characters
          </p>
          {renderError()}
          <div className="card-note-actions">
            <button
              className="panel-action-button card-note-button"
              disabled={!controller.canSave || controller.pendingAction !== null}
              onClick={() => void controller.save()}
              type="button"
            >
              {controller.pendingAction === 'save' ? COPY.saving : COPY.save}
            </button>
            <button
              className="panel-action-button card-note-button"
              disabled={controller.pendingAction !== null}
              onClick={controller.cancel}
              type="button"
            >
              {COPY.cancel}
            </button>
          </div>
        </div>
      )}

      {controller.mode === 'confirm-delete' && (
        <div className="card-note-confirmation">
          <p className="card-note-confirmation-title">{COPY.confirmRemove}</p>
          <p className="card-note-status">{COPY.confirmExplanation}</p>
          {renderError()}
          <div className="card-note-actions">
            <button
              className="panel-action-button card-note-button card-note-button-danger"
              disabled={controller.pendingAction !== null}
              onClick={() => void controller.deleteNote()}
              ref={removeConfirmRef}
              type="button"
            >
              {controller.pendingAction === 'delete' ? COPY.removing : COPY.remove}
            </button>
            <button
              className="panel-action-button card-note-button"
              disabled={controller.pendingAction !== null}
              onClick={controller.keepNote}
              type="button"
            >
              {COPY.keep}
            </button>
          </div>
        </div>
      )}

      <p aria-live="polite" className="card-note-live">
        {controller.announcement}
      </p>
    </section>
  )
}
