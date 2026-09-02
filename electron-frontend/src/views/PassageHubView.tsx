import { useState, useCallback } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, BookText, CheckCircle2, Circle } from 'lucide-react'
import { usePassages } from '../features/passages'
import { PassageReader } from '../features/passages/components/PassageReader'
import { DIFFICULTY_LABELS } from '../features/passages/constants'
import type { Passage, ReaderSettings } from '../features/passages/types'

interface PassageHubViewProps {
  onBack: () => void
  onOpenDictionary: (query?: string) => void
  onPlayAudio: (text: string) => void
  voiceBusy: boolean
}

export function PassageHubView({ onBack, onOpenDictionary, onPlayAudio, voiceBusy }: PassageHubViewProps) {
  const {
    passages, loading, error, readerSettings, progress,
    selectPassage, clearSelection, setFuriganaVisible, setFontSize, markProgress, retry,
  } = usePassages()

  const [readingPassage, setReadingPassage] = useState<Passage | null>(null)

  const handleSelectPassage = useCallback((passage: Passage) => {
    selectPassage(passage)
    setReadingPassage(passage)
  }, [selectPassage])

  const handleBackFromReader = useCallback(() => {
    clearSelection()
    setReadingPassage(null)
  }, [clearSelection])

  const handleWordTap = useCallback((word: string) => {
    onOpenDictionary(word)
  }, [onOpenDictionary])

  const handleToggleFurigana = useCallback(() => {
    setFuriganaVisible(!readerSettings.furiganaVisible)
  }, [readerSettings.furiganaVisible, setFuriganaVisible])

  const handleSetFontSize = useCallback((size: ReaderSettings['fontSize']) => {
    setFontSize(size)
  }, [setFontSize])

  const handleScrollPosition = useCallback((position: number) => {
    if (readingPassage && position > 0.9) {
      markProgress(readingPassage.id, 'completed')
    }
  }, [readingPassage, markProgress])

  if (readingPassage) {
    return (
      <PassageReader
        passage={readingPassage}
        readerSettings={readerSettings}
        onBack={handleBackFromReader}
        onWordTap={handleWordTap}
        onPlayAudio={onPlayAudio}
        voiceBusy={voiceBusy}
        onToggleFurigana={handleToggleFurigana}
        onSetFontSize={handleSetFontSize}
        onScrollPosition={handleScrollPosition}
      />
    )
  }

  if (loading) {
    return (
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="main-view"
        aria-label="Passages"
      >
        <header className="passages-header">
          <button type="button" className="passages-back-button" onClick={onBack} aria-label="Back to home">
            <ArrowLeft size={18} strokeWidth={2.2} />
          </button>
          <h2 className="passages-title">Passages</h2>
        </header>
        <div className="passages-skeleton-list" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="passages-skeleton-card" />
          ))}
        </div>
      </motion.section>
    )
  }

  if (error) {
    return (
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="main-view"
        aria-label="Passages"
      >
        <header className="passages-header">
          <button type="button" className="passages-back-button" onClick={onBack} aria-label="Back to home">
            <ArrowLeft size={18} strokeWidth={2.2} />
          </button>
          <h2 className="passages-title">Passages</h2>
        </header>
        <div className="passages-empty" role="status">
          <BookText size={48} strokeWidth={1.5} aria-hidden="true" />
          <p>{error}</p>
          <button type="button" className="passages-retry-button" onClick={retry}>
            Retry
          </button>
        </div>
      </motion.section>
    )
  }

  if (passages.length === 0) {
    return (
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="main-view"
        aria-label="Passages"
      >
        <header className="passages-header">
          <button type="button" className="passages-back-button" onClick={onBack} aria-label="Back to home">
            <ArrowLeft size={18} strokeWidth={2.2} />
          </button>
          <h2 className="passages-title">Passages</h2>
        </header>
        <div className="passages-empty" role="status">
          <BookText size={48} strokeWidth={1.5} aria-hidden="true" />
          <p>No passages available yet. Run the build script to generate reading material.</p>
        </div>
      </motion.section>
    )
  }

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="main-view"
      aria-label="Passages"
    >
      <header className="passages-header">
        <button type="button" className="passages-back-button" onClick={onBack} aria-label="Back to home">
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <h2 className="passages-title">Passages</h2>
        <span className="passages-subtitle">{passages.length} {passages.length === 1 ? 'story' : 'stories'}</span>
      </header>

      {/* `role="list"` goes with `listitem` children; without them it is a plain container and
          the buttons keep their own role */}
      <div className="passages-list">
        {passages.map((passage) => {
          const entry = progress.get(passage.id)
          const status = entry?.status ?? 'not-started'

          return (
            <button
              key={passage.id}
              type="button"
              /* NO `role="listitem"`. An explicit role REPLACES the implicit one, so every card in
                 this list announced itself as a list item and nothing told a screen-reader user it
                 could be pressed -- on a screen whose only purpose is pressing them. */
              className="passages-card"
              onClick={() => handleSelectPassage(passage)}
            >
              <div className="passages-card-left">
                <div className="passages-card-header">
                  <h3 className="passages-card-title">{passage.title}</h3>
                  <span className="passages-card-reading">{passage.title_reading}</span>
                </div>
                <div className="passages-card-meta">
                  <span>{passage.author}</span>
                  <span className="passages-card-dot">·</span>
                  <span>{passage.word_count} words</span>
                  <span className="passages-card-dot">·</span>
                  <span className="passages-difficulty" data-level={passage.difficulty_label}>
                    {DIFFICULTY_LABELS[passage.difficulty_label]}
                  </span>
                </div>
              </div>
              <div className="passages-card-right">
                {status === 'completed' ? (
                  <CheckCircle2 size={20} strokeWidth={2} className="passages-progress-icon completed" />
                ) : status === 'in-progress' ? (
                  <Circle size={20} strokeWidth={2} className="passages-progress-icon in-progress" />
                ) : (
                  <Circle size={20} strokeWidth={2} className="passages-progress-icon not-started" />
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="passages-footer">
        <p className="passages-footer-text">
          Texts from <a href="https://www.aozora.gr.jp/" target="_blank" rel="noopener noreferrer">Aozora Bunko</a> — public domain Japanese literature.
        </p>
      </div>
    </motion.section>
  )
}
