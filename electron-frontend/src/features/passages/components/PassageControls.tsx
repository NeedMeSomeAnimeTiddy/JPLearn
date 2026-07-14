import { ArrowLeft, Eye, EyeOff, Type, Play, Loader } from 'lucide-react'
import type { ReaderSettings } from '../types'
import { FONT_SIZE_MAP } from '../constants'

interface PassageControlsProps {
  furiganaVisible: boolean
  fontSize: ReaderSettings['fontSize']
  hasFurigana: boolean
  isReading: boolean
  onToggleFurigana: () => void
  onSetFontSize: (size: ReaderSettings['fontSize']) => void
  onBack: () => void
  onReadPassage: () => void
}

const FONT_SIZES: ReaderSettings['fontSize'][] = ['small', 'medium', 'large']

export function PassageControls({
  furiganaVisible,
  fontSize,
  hasFurigana,
  isReading,
  onToggleFurigana,
  onSetFontSize,
  onBack,
  onReadPassage,
}: PassageControlsProps) {
  const cycleFontSize = () => {
    const idx = FONT_SIZES.indexOf(fontSize)
    const next = FONT_SIZES[(idx + 1) % FONT_SIZES.length]
    onSetFontSize(next)
  }

  return (
    <header className="passage-reader-controls">
      <button
        type="button"
        className="passage-control-button"
        onClick={onBack}
        aria-label="Back to passage list"
      >
        <ArrowLeft size={16} strokeWidth={2.2} />
        <span>Back</span>
      </button>

      <div className="passage-control-spacer" />

      <button
        type="button"
        className="passage-control-button"
        onClick={onReadPassage}
        disabled={isReading}
        aria-label={isReading ? 'Reading passage' : 'Read passage aloud'}
        title={isReading ? 'Reading...' : 'Read this passage aloud'}
      >
        {isReading ? (
          <Loader size={16} strokeWidth={2.2} className="passage-spinner" />
        ) : (
          <Play size={16} strokeWidth={2.2} />
        )}
        <span>{isReading ? 'Reading...' : 'Read'}</span>
      </button>

      <button
        type="button"
        className="passage-control-button"
        onClick={cycleFontSize}
        aria-label={`Font size: ${fontSize}`}
        title={`Font size: ${fontSize} (${FONT_SIZE_MAP[fontSize]})`}
      >
        <Type size={16} strokeWidth={2.2} />
        <span className="passage-font-size-label">{fontSize}</span>
      </button>

      {hasFurigana ? (
        <button
          type="button"
          className="passage-control-button"
          onClick={onToggleFurigana}
          aria-label={furiganaVisible ? 'Hide furigana' : 'Show furigana'}
          title={furiganaVisible ? 'Hide furigana readings' : 'Show furigana readings'}
        >
          {furiganaVisible ? (
            <Eye size={16} strokeWidth={2.2} />
          ) : (
            <EyeOff size={16} strokeWidth={2.2} />
          )}
          <span>Furigana</span>
        </button>
      ) : null}
    </header>
  )
}
