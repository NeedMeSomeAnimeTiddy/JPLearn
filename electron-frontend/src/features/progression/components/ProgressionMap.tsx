import { useEffect, useRef, useState } from 'react'

import { UNTRACKED_NODE_LABEL } from '../constants'
import type { ProgressionNodeView } from '../types'
import { describeNode } from '../utils'

interface ProgressionMapProps {
  nodes: ProgressionNodeView[]
  current: ProgressionNodeView | null
  onOpenNode: (nodeId: string) => void
}

/**
 * The curriculum as a tape counter and track index.
 *
 * Sixteen equally-weighted chips said everything at once and nothing clearly:
 * the stage you are actually on carried no more weight than JLPT N1, the wrap
 * destroyed the one thing the graph encodes — order — and ten rows each repeated
 * "progress not tracked yet". This shows position first and the rest as context,
 * in the deck vernacular the rest of the app already speaks.
 *
 * Collapsed by default. Home is a busy screen and the whole course is reference
 * material; what a learner needs on arrival is where they are and one way in.
 */
export function ProgressionMap({ nodes, current, onOpenNode }: ProgressionMapProps) {
  const [expanded, setExpanded] = useState(false)
  const rootRef = useRef<HTMLElement | null>(null)

  // Dismissed by clicking away or pressing Escape, like the app's other
  // dropdowns. It overlays rather than expands in place so opening it never
  // pushes the rest of Home around.
  useEffect(() => {
    if (!expanded) return

    function handlePointerDown(event: MouseEvent): void {
      if (rootRef.current?.contains(event.target as Node)) return
      setExpanded(false)
    }
    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setExpanded(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [expanded])

  if (nodes.length === 0) return null

  const finished = nodes.filter((node) => node.status === 'mastered').length
  const meterPct = current && current.total_count > 0
    ? Math.round((current.mastered_count / current.total_count) * 100)
    : 0

  return (
    <section className="course" aria-labelledby="course-title" ref={rootRef}>
      <div className="course-head">
        <h2 id="course-title" className="course-title">Your course</h2>
        <span className="course-count">{finished} of {nodes.length} finished</span>
      </div>

      {current && (
        <button
          type="button"
          className="course-now"
          onClick={() => onOpenNode(current.node_id)}
        >
          <span className="course-now-cue" aria-hidden="true">▶</span>
          <span className="course-now-name">{current.name}</span>
          {current.progressLabel && (
            <span className="course-now-count">{current.progressLabel}</span>
          )}
          {current.total_count > 0 && (
            <span className="course-now-meter" aria-hidden="true">
              <span className="course-now-meter-fill" style={{ width: `${meterPct}%` }} />
            </span>
          )}
        </button>
      )}

      <div className="course-index">
        {/* The signature: one mark per stage, in order. A cassette deck's track
            index is exactly this, and here it carries real information — how far
            in you are, and how much course is left. */}
        <ol className="course-marks">
          {nodes.map((node) => (
            <li key={node.node_id} className="course-mark-slot">
              <button
                type="button"
                className={[
                  'course-mark',
                  node.status === 'mastered' ? 'is-done' : '',
                  node.isOpen && node.status !== 'mastered' ? 'is-open' : '',
                  !node.isOpen ? 'is-gated' : '',
                  current?.node_id === node.node_id ? 'is-current' : '',
                ].filter(Boolean).join(' ')}
                aria-label={describeNode(node)}
                aria-current={current?.node_id === node.node_id ? 'step' : undefined}
                title={describeNode(node)}
                onClick={() => onOpenNode(node.node_id)}
              />
            </li>
          ))}
        </ol>

        <button
          type="button"
          className="course-toggle"
          aria-expanded={expanded}
          aria-controls="course-menu"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? 'Hide all' : 'Show all'}
        </button>
      </div>

      {expanded && (
        <div className="course-menu" id="course-menu">
          <ol className="course-list">
            {nodes.map((node) => (
              <li key={node.node_id}>
                <button
                  type="button"
                  className={[
                    'course-row',
                    node.status === 'mastered' ? 'is-done' : '',
                    !node.isOpen ? 'is-gated' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => {
                    setExpanded(false)
                    onOpenNode(node.node_id)
                  }}
                >
                  <span className="course-row-name">{node.name}</span>
                  <span className="course-row-count">{node.progressLabel}</span>
                </button>
              </li>
            ))}
          </ol>
          {/* Said once, at the end — not on every row it applies to. */}
          {nodes.some((node) => !node.is_tracked) && (
            <p className="course-note">{UNTRACKED_NODE_LABEL} for some stages.</p>
          )}
        </div>
      )}
    </section>
  )
}
