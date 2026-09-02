import { useCallback, useEffect } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft } from 'lucide-react'
import { usePassages } from '../features/passages'
import { PassageReader } from '../features/passages/components/PassageReader'
import type { Passage, ReaderSettings } from '../features/passages/types'

/* ==================================================================================================
   THIS VIEW USED TO BE A LIST, AND THE MENU IS ALREADY THAT LIST.

   It showed thirty graded Aozora texts with a title, a reading, an author, a word count and a
   progress mark, and picking one opened the reader. THE WORLD's LIBRARY screen shows the same thirty
   in the same order with the same figures -- so `Library`'s onOpen navigated here and you looked at
   the shelf a second time before you could read anything.

   `Library` has always passed the id of the row you pressed; App.tsx simply threw it away. It is
   used now, and this view is the reader and nothing else.
   ================================================================================================== */
interface PassageHubViewProps {
  /** the text the library opened — this view has no shelf of its own to pick from */
  passageId: string
  onBack: () => void
  onOpenDictionary: (query?: string) => void
  onPlayAudio: (text: string) => void
  voiceBusy: boolean
}

export function PassageHubView({ passageId, onBack, onOpenDictionary, onPlayAudio, voiceBusy }: PassageHubViewProps) {
  const {
    passages, loading, error, readerSettings,
    selectPassage, clearSelection, setFuriganaVisible, setFontSize, markProgress, retry,
  } = usePassages()

  /* THE SHELF STILL HAS TO LOAD before the id means anything: `usePassages` fetches the whole set
     and the menu only handed over which one. Derived rather than held in state, so a reload of the
     shelf cannot leave a stale copy of the text on screen. */
  const readingPassage: Passage | null = passages.find((p) => p.id === passageId) ?? null

  useEffect(() => {
    if (readingPassage) selectPassage(readingPassage)
  }, [readingPassage, selectPassage])

  const handleBackFromReader = useCallback(() => {
    clearSelection()
    onBack()
  }, [clearSelection, onBack])

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

  /* AND THE THREE THINGS THAT ARE NOT A TEXT. The shelf is the menu's screen now, so what is left
     here is: waiting for the fetch, the fetch having failed, and an id the shelf does not contain
     -- which can only happen if the library and this view disagree, and is worth saying out loud
     rather than rendering an empty reader. */
  if (loading) {
    return (
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="main-view"
        aria-label="Passages"
      >
        <p className="passages-status" aria-live="polite">Opening…</p>
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
        <button type="button" className="passages-back-button" onClick={onBack} aria-label="Back to the library">
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <h2 className="passages-title">Passages</h2>
      </header>
      <p className="passages-status" role="alert">
        {error ?? 'That text is no longer on the shelf.'}
      </p>
      {error ? (
        <button type="button" className="passages-back-button" onClick={retry}>Try again</button>
      ) : null}
    </motion.section>
  )
}
