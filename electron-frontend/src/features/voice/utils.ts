import type { SpeechSegment } from './types'

export function splitSpeechSegments(text: string): SpeechSegment[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return []
  }

  const splitSentenceByLanguage = (sentence: string): SpeechSegment[] => {
    const japaneseChar = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/
    const englishWord = /[a-zA-Z]+/
    const segments: SpeechSegment[] = []
    const chars = [...sentence]
    let currentSegment = ''
    let currentLang: 'ja' | 'en' | null = null

    for (const char of chars) {
      if (japaneseChar.test(char)) {
        if (currentLang === 'en') {
          segments.push({ text: currentSegment.trim(), language: 'en' })
          currentSegment = ''
        }
        currentLang = 'ja'
        currentSegment += char
      } else if (englishWord.test(char)) {
        if (currentLang === 'ja') {
          segments.push({ text: currentSegment.trim(), language: 'ja' })
          currentSegment = ''
        }
        currentLang = 'en'
        currentSegment += char
      } else {
        currentSegment += char
      }
    }

    if (currentSegment.trim()) {
      const finalLang = currentLang === 'en' ? 'en' : 'ja'
      segments.push({ text: currentSegment.trim(), language: finalLang })
    }

    return segments
  }

  const sentenceMatches = normalized.match(/[^.!?。！？\n]+[.!?。！？\n]*/g) ?? [normalized]
  const segments: SpeechSegment[] = []

  for (const sentence of sentenceMatches) {
    const trimmed = sentence.trim()
    if (!trimmed) continue
    const subSegments = splitSentenceByLanguage(trimmed)
    segments.push(...subSegments)
  }

  return segments
}
