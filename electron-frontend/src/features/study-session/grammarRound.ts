// Grammar/bridge-backed round construction, extracted verbatim from App.tsx (issue #69).
// Pure with respect to App state: it reads nothing from the component scope.

import type {
  GrammarMinigameResponse, PlayableMinigame, RoundDictionaryNote, RoundState, ScriptDeck,
} from '../../types'
import {
  PARTICLE_EXPLANATIONS, isImposterMode, isParticleClozeMode, isSentenceAssemblyMode,
  isVibeCheckMode,
} from '../../lib/roundContent'
import { shuffleArray } from '../../lib/deckUtils'

export async function buildBridgeGrammarRound(
  card: ScriptDeck['cards'][number],
  minigame: PlayableMinigame,
  options: {
    curriculumStage: 1 | 2 | 3
    surprisePrompt: boolean
    surpriseLabel: string
    promptSeed: number
    exampleSentenceAudioText: string | null
    dictionarySeedQuery: string | null
    dictionaryNote: RoundDictionaryNote | null
    exampleSentenceHint: string | null
  },
): Promise<RoundState | null> {
  const {
    curriculumStage,
    surprisePrompt,
    surpriseLabel,
    promptSeed,
    exampleSentenceAudioText,
    dictionarySeedQuery,
    dictionaryNote,
    exampleSentenceHint,
  } = options

  const getGrammarData = window.jplearnDesktop?.getGrammarMinigameData
  if (!getGrammarData) return null

  const sourceSentence = card.example_sentence?.trim() || card.character
  if (!sourceSentence) return null

  const gameType = isSentenceAssemblyMode(minigame)
    ? 'sentence_assembly'
    : isParticleClozeMode(minigame)
      ? 'particle_cloze'
      : isVibeCheckMode(minigame)
        ? 'vibe_check'
      : isImposterMode(minigame)
        ? 'imposter'
        : null
  if (!gameType) return null

  let response: GrammarMinigameResponse
  try {
    response = await getGrammarData({
      gameType,
      sentence: sourceSentence,
      seed: promptSeed,
    })
  } catch {
    return null
  }

  const data = response.data as Record<string, unknown>

  if (isSentenceAssemblyMode(minigame)) {
    const promptSentence = typeof data.sentence === 'string' ? data.sentence : sourceSentence
    const shuffledChunks = Array.isArray(data.shuffled_chunks)
      ? data.shuffled_chunks.filter((entry): entry is { id: string; text: string } => {
        if (entry === null || typeof entry !== 'object') return false
        const id = (entry as Record<string, unknown>).id
        const text = (entry as Record<string, unknown>).text
        return typeof id === 'string' && id.trim().length > 0 && typeof text === 'string' && text.trim().length > 0
      })
      : []
    const answerOrder = Array.isArray(data.answer_order)
      ? data.answer_order.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : []
    if (shuffledChunks.length < 2 || answerOrder.length < 2) return null

    const options = shuffledChunks.map((chunk) => ({
      id: chunk.id,
      label: chunk.text,
    }))
    const chunkLookup = Array.isArray(data.chunks)
      ? new Map(
        data.chunks
          .filter((entry): entry is { id: string; text: string } => {
            if (entry === null || typeof entry !== 'object') return false
            const id = (entry as Record<string, unknown>).id
            const text = (entry as Record<string, unknown>).text
            return typeof id === 'string' && typeof text === 'string'
          })
          .map((chunk) => [chunk.id, chunk.text]),
      )
      : new Map(options.map((option) => [option.id, option.label]))
    const answerDisplay = answerOrder.map((chunkId) => chunkLookup.get(chunkId) ?? '').join('').trim()

    return {
      cardId: card.id,
      mode: minigame,
      audioText: sourceSentence,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: exampleSentenceHint ?? 'Arrange chunks to restore a natural sentence flow.',
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel: surprisePrompt ? surpriseLabel : 'Rebuild the sentence in natural order.',
      focusText: promptSentence,
      answer: answerOrder.join('|'),
      answerDisplay: answerDisplay.length > 0 ? answerDisplay : null,
      options,
    }
  }

  if (isParticleClozeMode(minigame)) {
    const prompt = typeof data.prompt === 'string' ? data.prompt : sourceSentence
    const answer = typeof data.correct_particle === 'string' ? data.correct_particle : ''
    const rawOptions = Array.isArray(data.options)
      ? data.options.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : []
    if (!answer || rawOptions.length === 0) return null
    const options = shuffleArray(Array.from(new Set(rawOptions))).map((label, index) => ({
      id: `${card.id}-particle-${index}`,
      label,
    }))

    const particleInfo = PARTICLE_EXPLANATIONS[answer]
    const particleNote: RoundDictionaryNote | null = particleInfo
      ? {
          title: `${answer} (${particleInfo.romaji})`,
          copy: particleInfo.explanation,
          character: answer,
          reading: particleInfo.romaji,
          primaryGloss: particleInfo.explanation,
          secondaryGlosses: [],
          source: 'grammar_particle',
        }
      : dictionaryNote

    return {
      cardId: card.id,
      mode: minigame,
      audioText: sourceSentence,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: exampleSentenceHint ?? 'Use sentence flow to pick the correct particle.',
      dictionarySeedQuery,
      dictionaryNote: particleNote,
      promptLabel: surprisePrompt ? surpriseLabel : 'Fill in the missing particle.',
      focusText: prompt,
      answer,
      options,
    }
  }

  if (isVibeCheckMode(minigame)) {
    const answer = typeof data.correct_label === 'string' ? data.correct_label : ''
    const rawOptions = Array.isArray(data.options)
      ? data.options.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : []
    if (!answer || rawOptions.length === 0) return null

    const dedupedOptions = Array.from(new Set(rawOptions))
    if (!dedupedOptions.includes(answer)) {
      dedupedOptions.unshift(answer)
    }

    const options = shuffleArray(dedupedOptions.slice(0, 4)).map((label, index) => ({
      id: `${card.id}-vibe-${index}`,
      label,
    }))

    return {
      cardId: card.id,
      mode: minigame,
      audioText: sourceSentence,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: exampleSentenceHint ?? 'Look at sentence endings and politeness markers to infer social context.',
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel: surprisePrompt ? surpriseLabel : 'Pick the social register that best fits this sentence.',
      focusText: sourceSentence,
      answer,
      options,
    }
  }

  if (isImposterMode(minigame)) {
    const mutatedSentence = typeof data.mutated_sentence === 'string' ? data.mutated_sentence : sourceSentence
    const answer = typeof data.mutated_token === 'string' ? data.mutated_token : ''
    const rawTokens = Array.isArray(data.mutated_tokens)
      ? data.mutated_tokens.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : []
    if (!answer || rawTokens.length === 0) return null

    const dedupedOptions = Array.from(new Set(rawTokens)).slice(0, 4)
    if (!dedupedOptions.includes(answer)) {
      dedupedOptions.unshift(answer)
    }
    const options = shuffleArray(dedupedOptions.slice(0, 4)).map((label, index) => ({
      id: `${card.id}-imposter-${index}`,
      label,
    }))

    return {
      cardId: card.id,
      mode: minigame,
      audioText: sourceSentence,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: curriculumStage,
      chapterLabel: null,
      hintText: 'Find the grammatically incorrect token in this sentence.',
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel: surprisePrompt ? surpriseLabel : 'Spot the grammatical imposter.',
      focusText: mutatedSentence,
      answer,
      options,
    }
  }

  return null
}
