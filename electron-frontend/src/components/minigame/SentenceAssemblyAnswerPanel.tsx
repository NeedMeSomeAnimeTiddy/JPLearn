import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useMemo, useState } from 'react'
import type { RoundOption } from '../../types'

interface SentenceAssemblyAnswerPanelProps {
  options: RoundOption[]
  disabled: boolean
  onSubmit: (answer: string) => void
}

interface SortableChunkChipProps {
  id: string
  label: string
  disabled: boolean
  position: number
  canMoveEarlier: boolean
  canMoveLater: boolean
  onMoveEarlier: () => void
  onMoveLater: () => void
}

function SortableChunkChip({
  id,
  label,
  disabled,
  position,
  canMoveEarlier,
  canMoveLater,
  onMoveEarlier,
  onMoveLater,
}: SortableChunkChipProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} className="sentence-assembly-sortable-row" style={style}>
      <button
        type="button"
        className={`sentence-assembly-chip sentence-assembly-chip-active${isDragging ? ' is-dragging' : ''}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
        title="Drag to reorder"
      >
        <span className="sentence-assembly-chip-index" aria-hidden="true">{position}</span>
        <span className="sentence-assembly-chip-text">{label}</span>
      </button>
      <div className="sentence-assembly-reorder-controls">
        <button
          type="button"
          className="sentence-assembly-step-button"
          onClick={onMoveEarlier}
          disabled={disabled || !canMoveEarlier}
          aria-label={`Move ${label} earlier`}
          title="Move earlier"
        >
          ↑
        </button>
        <button
          type="button"
          className="sentence-assembly-step-button"
          onClick={onMoveLater}
          disabled={disabled || !canMoveLater}
          aria-label={`Move ${label} later`}
          title="Move later"
        >
          ↓
        </button>
      </div>
    </div>
  )
}

export function SentenceAssemblyAnswerPanel({
  options,
  disabled,
  onSubmit,
}: SentenceAssemblyAnswerPanelProps) {
  const [orderedChunkIds, setOrderedChunkIds] = useState<string[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    setOrderedChunkIds(options.map((option) => option.id))
  }, [options])

  const chunkById = useMemo(() => {
    return new Map(options.map((option) => [option.id, option]))
  }, [options])

  const orderedChunks = orderedChunkIds
    .map((chunkId) => chunkById.get(chunkId))
    .filter((chunk): chunk is RoundOption => Boolean(chunk))

  const assembledSentence = orderedChunks.map((chunk) => chunk.label).join('')

  function resetOrder() {
    if (disabled) return
    setOrderedChunkIds(options.map((option) => option.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    if (disabled) return
    const { active, over } = event
    if (!over || active.id === over.id) return

    setOrderedChunkIds((previous) => {
      const oldIndex = previous.indexOf(String(active.id))
      const newIndex = previous.indexOf(String(over.id))
      if (oldIndex < 0 || newIndex < 0) return previous
      return arrayMove(previous, oldIndex, newIndex)
    })
  }

  function moveChunk(fromIndex: number, toIndex: number) {
    if (disabled) return
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= orderedChunkIds.length || toIndex >= orderedChunkIds.length) {
      return
    }
    setOrderedChunkIds((previous) => arrayMove(previous, fromIndex, toIndex))
  }

  return (
    <div className="sentence-assembly-panel">
      <div className="sentence-assembly-column" aria-label="Assembled sentence preview">
        <p className="sentence-assembly-label">Current sentence</p>
        <div className="sentence-assembly-preview" aria-live="polite">
          {assembledSentence || 'Drag chunks to build the sentence.'}
        </div>
        <p className="sentence-assembly-tip">
          Build left-to-right; particles usually attach to the noun phrase before them.
        </p>
      </div>

      <div className="sentence-assembly-column" aria-label="Reorder chunks">
        <p className="sentence-assembly-label">Drag to reorder</p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={orderedChunkIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="sentence-assembly-chip-list sentence-assembly-chip-list-active">
              {orderedChunks.map((chunk, index) => (
                <SortableChunkChip
                  key={chunk.id}
                  id={chunk.id}
                  label={chunk.label}
                  disabled={disabled}
                  position={index + 1}
                  canMoveEarlier={index > 0}
                  canMoveLater={index < orderedChunks.length - 1}
                  onMoveEarlier={() => moveChunk(index, index - 1)}
                  onMoveLater={() => moveChunk(index, index + 1)}
                />
              ))}
              {orderedChunks.length === 0 ? (
                <p className="sentence-assembly-empty">No chunks available.</p>
              ) : null}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="game-input-row sentence-assembly-actions">
        <button
          type="button"
          onClick={resetOrder}
          disabled={disabled || orderedChunkIds.length === 0}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => onSubmit(orderedChunkIds.join('|'))}
          disabled={disabled || orderedChunkIds.length === 0}
        >
          Submit order
        </button>
      </div>
    </div>
  )
}
