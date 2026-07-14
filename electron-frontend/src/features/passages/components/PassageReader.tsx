import { useRef, useCallback, useMemo, useState, useEffect } from 'react'
import { motion } from 'motion/react'
import type { Passage, ReaderSettings } from '../types'
import { FONT_SIZE_MAP } from '../constants'
import { PassageControls } from './PassageControls'
import { WordPopupMenu } from './WordPopupMenu'

interface PassageReaderProps {
  passage: Passage
  readerSettings: ReaderSettings
  onBack: () => void
  onWordTap: (word: string) => void
  onPlayAudio: (text: string) => void
  voiceBusy: boolean
  onToggleFurigana: () => void
  onSetFontSize: (size: ReaderSettings['fontSize']) => void
  onScrollPosition: (position: number) => void
}

function stripFurigana(text: string): string {
  return text.replace(/（[^）]*）/g, '')
}

interface TextSegment {
  text: string
  isFurigana: boolean
}

function parseSegments(rawText: string, furiganaVisible: boolean): TextSegment[] {
  if (!furiganaVisible) {
    return [{ text: stripFurigana(rawText), isFurigana: false }]
  }

  const segments: TextSegment[] = []
  let remaining = rawText
  while (remaining.length > 0) {
    const parenStart = remaining.indexOf('（')
    if (parenStart === -1) {
      segments.push({ text: remaining, isFurigana: false })
      break
    }
    if (parenStart > 0) {
      segments.push({ text: remaining.slice(0, parenStart), isFurigana: false })
    }
    const parenEnd = remaining.indexOf('）', parenStart)
    if (parenEnd === -1) {
      segments.push({ text: remaining.slice(parenStart), isFurigana: false })
      break
    }
    segments.push({ text: remaining.slice(parenStart, parenEnd + 1), isFurigana: true })
    remaining = remaining.slice(parenEnd + 1)
  }
  return segments
}

const MIN_WORD_LENGTH = 2
const JP_PUNCT_RE = /^[。、！？「」『』（）・…\p{P}]+$/u
const CLEAN_RE = /^[。、！？「」『』\p{P}]+|[。、！？「」『』\p{P}]+$/gu
const TOKEN_RE = /(\s+|[。、]+|[^\s。、]+)/g
const PARTICLE_RE = /([たちさんちゃんくん]|から|まで|より|など|だけ|ばかり|ほど|くらい|[はがのにをへともでかよねなわ]|[\u30CF\u30AC\u30CE\u30F2\u30CB\u30C8\u30C7\u30D8\u30E2\u30AB])$/u

function isClickable(word: string): boolean {
  return word.length >= MIN_WORD_LENGTH && !JP_PUNCT_RE.test(word)
}

function cleanQuery(word: string): string {
  const stripped = word.replace(CLEAN_RE, '').trim()
  return stripped.replace(PARTICLE_RE, '')
}

type TextToken =
  | { kind: 'word'; raw: string; clean: string }
  | { kind: 'space'; text: string }

function tokenize(text: string): TextToken[] {
  const tokens: TextToken[] = []
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const chunk = m[0]
    if (/^\s+$/.test(chunk)) {
      tokens.push({ kind: 'space', text: chunk })
    } else if (JP_PUNCT_RE.test(chunk)) {
      tokens.push({ kind: 'word', raw: chunk, clean: chunk })
    } else {
      tokens.push({ kind: 'word', raw: chunk, clean: stripFurigana(chunk) })
    }
  }
  return tokens
}

interface PopupState {
  word: string
  x: number
  y: number
}

export function PassageReader({
  passage,
  readerSettings,
  onBack,
  onWordTap,
  onPlayAudio,
  voiceBusy,
  onToggleFurigana,
  onSetFontSize,
  onScrollPosition,
}: PassageReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [isReading, setIsReading] = useState(false)
  const readingRef = useRef(false)
  readingRef.current = isReading

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const position = clientHeight > 0 ? scrollTop / (scrollHeight - clientHeight) : 0
    onScrollPosition(Math.min(position, 1))
  }, [onScrollPosition])

  const visibleText = useMemo(
    () => (readerSettings.furiganaVisible ? passage.text_jp : stripFurigana(passage.text_jp)),
    [passage.text_jp, readerSettings.furiganaVisible],
  )

  const tokens = useMemo(() => tokenize(visibleText), [visibleText])

  const handleWordClick = useCallback((word: string, event: React.MouseEvent) => {
    const rect = (event.target as HTMLElement).getBoundingClientRect()
    setPopup({
      word,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 4,
    })
  }, [])

  const handleClosePopup = useCallback(() => {
    setPopup(null)
  }, [])

  const handleDictionary = useCallback(() => {
    if (popup) {
      onWordTap(cleanQuery(popup.word))
    }
  }, [popup, onWordTap])

  const handlePlayAudio = useCallback(() => {
    if (popup) {
      onPlayAudio(cleanQuery(popup.word))
    }
  }, [popup, onPlayAudio])

  const handleReadPassage = useCallback(async () => {
    setIsReading(true)
    onPlayAudio(passage.raw_text)
  }, [passage.raw_text, onPlayAudio])

  useEffect(() => {
    if (!voiceBusy && readingRef.current) {
      setIsReading(false)
    }
  }, [voiceBusy])

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="main-view"
      aria-label={`Reading: ${passage.title}`}
    >
      <PassageControls
        furiganaVisible={readerSettings.furiganaVisible}
        fontSize={readerSettings.fontSize}
        hasFurigana={passage.text_jp.includes('（')}
        isReading={isReading}
        onToggleFurigana={onToggleFurigana}
        onSetFontSize={onSetFontSize}
        onBack={onBack}
        onReadPassage={handleReadPassage}
      />

      <div className="passage-reader-header">
        <h2 className="passage-reader-title">{passage.title}</h2>
        <p className="passage-reader-subtitle">
          {passage.author}
          <span className="passages-card-dot">·</span>
          {passage.word_count} words
        </p>
      </div>

      <div
        className="passage-reader-content"
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ fontSize: FONT_SIZE_MAP[readerSettings.fontSize] }}
      >
        {tokens.map((token, i) =>
          token.kind === 'space' ? (
            <span key={i}>{token.text}</span>
          ) : isClickable(token.clean) ? (
            <span
              key={i}
              className="passage-word clickable"
              role="button"
              tabIndex={0}
              onClick={(e) => handleWordClick(token.clean, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleWordClick(token.clean, e as unknown as React.MouseEvent)
                }
              }}
            >
              {parseSegments(token.raw, readerSettings.furiganaVisible).map((seg, j) => (
                <span
                  key={j}
                  className={seg.isFurigana ? 'passage-word-furigana' : 'passage-word-text'}
                >
                  {seg.text}
                </span>
              ))}
            </span>
          ) : (
            <span key={i} className="passage-word">
              {parseSegments(token.raw, readerSettings.furiganaVisible).map((seg, j) => (
                <span
                  key={j}
                  className={seg.isFurigana ? 'passage-word-furigana' : 'passage-word-text'}
                >
                  {seg.text}
                </span>
              ))}
            </span>
          ),
        )}
      </div>

      <WordPopupMenu
        open={popup !== null}
        x={popup?.x ?? 0}
        y={popup?.y ?? 0}
        word={popup?.word ?? ''}
        onDictionary={handleDictionary}
        onPlayAudio={handlePlayAudio}
        onClose={handleClosePopup}
      />
    </motion.section>
  )
}
