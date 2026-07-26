// Round construction, extracted verbatim from App.tsx (issue #69). The two values
// these used to close over -- the active script and the card-score map -- are now
// explicit leading parameters, so the builders are pure and independently testable.

import { toHiragana } from 'wanakana'
import type {
  CardScores, PlayableMinigame, RoundState, ScriptDeck, ScriptKey,
} from '../../types'
import {
  buildClozeLine, buildRoundDictionaryNote, buildStoryChapter, curriculumStageFromScore,
  isConjugationDrillMode, isImposterMode, isParticleClozeMode, isSentenceAssemblyMode, isVibeCheckMode,
  normalizeCurriculumStage, pickSurprisePrompt, splitSentenceIntoAssemblyChunks,
} from '../../lib/roundContent'
import { chooseUniqueIndices, shuffleArray } from '../../lib/deckUtils'
import { KANJI_MEANINGS } from '../../lib/kanjiMeanings'
import { CARD_MASTERY_MAX } from '../../constants'
import { blankOutWordInSentence, isGrammarCurriculumMode } from '../../utils'
import { buildBridgeGrammarRound } from './grammarRound'
import { buildConjugationDrillRound } from './conjugationRound'

export function buildRound(
  script: ScriptKey,
  cardScores: CardScores,
  cards: ScriptDeck['cards'],
  minigame: PlayableMinigame,
  cardIndex: number,
  surprisePrompt: boolean,
  promptSeed: number,
): RoundState | null {
  if (cards.length === 0) return null

  const card = cards[cardIndex]
  const surpriseLabel = pickSurprisePrompt(script, minigame, card.tags, promptSeed)
  const currentScore = cardScores[script][card.id] ?? 0
  const isMasteredBuild = currentScore >= CARD_MASTERY_MAX
  const persistedStage = normalizeCurriculumStage(card.curriculum_stage)
  const scoreStage = curriculumStageFromScore(currentScore)
  const curriculumStage = isGrammarCurriculumMode(minigame)
    ? persistedStage
    : scoreStage
  const exampleSentenceAudioText = card.example_sentence?.trim() || null
  const exampleSentenceHint = card.example_sentence
    ? `Example: ${card.example_sentence}`
    : null
  const dictionaryNote = buildRoundDictionaryNote(card, minigame)
  const dictionarySeedQuery = card.character || card.romaji || null

  if (minigame === 'romaji_sprint') {
    const promptLabel = surprisePrompt
      ? surpriseLabel
      : 'What is the reading? Type in romaji.'
    return {
      cardId: card.id,
      mode: minigame,
      audioText: card.character,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: exampleSentenceHint,
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel,
      focusText: card.character,
      answer: card.romaji,
      options: [],
      isMastered: isMasteredBuild,
    }
  }

  if (minigame === 'typed_recall') {
    const promptLabel = surprisePrompt
      ? surpriseLabel
      : 'What does this mean? Type your answer.'
    return {
      cardId: card.id,
      mode: minigame,
      audioText: card.character,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: exampleSentenceHint ?? `Think about what ${card.character} means.`,
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel,
      focusText: card.character,
      answer: card.meaning,
      options: [],
      isMastered: isMasteredBuild,
    }
  }

  if (minigame === 'speech_recall') {
    const promptLabel = surprisePrompt
      ? surpriseLabel
      : 'What does this mean? Say your answer aloud.'
    return {
      cardId: card.id,
      mode: minigame,
      audioText: card.character,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: exampleSentenceHint ?? `Think about what ${card.character} means.`,
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel,
      focusText: card.character,
      answer: card.meaning,
      options: [],
      isMastered: isMasteredBuild,
    }
  }

  if (minigame === 'stroke_order') {
    const promptLabel = surprisePrompt
      ? surpriseLabel
      : 'Type the romaji reading to see kanji options.'
    return {
      cardId: card.id,
      mode: minigame,
      audioText: card.character,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: 'Type the reading, then select the matching kanji from the options.',
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel,
      focusText: card.meaning,
      answer: card.character,
      options: [],
      isMastered: isMasteredBuild,
    }
  }

  if (minigame === 'handwriting') {
    const promptLabel = surprisePrompt
      ? surpriseLabel
      : 'Draw the character using its correct stroke order.'
    return {
      cardId: card.id,
      mode: minigame,
      audioText: card.character,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: 'Draw one stroke at a time. The target will guide stroke order without using recognition.',
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel,
      focusText: script === 'kanji_n5' ? card.meaning : card.romaji,
      answer: card.character,
      options: [],
      isMastered: isMasteredBuild,
    }
  }

  if (isSentenceAssemblyMode(minigame)) {
    const sourceSentence = card.example_sentence?.trim() || ''
    const chunks = splitSentenceIntoAssemblyChunks(sourceSentence)
    if (chunks.length < 2) return null

    const orderedOptions = chunks.map((chunk, index) => ({
      id: `${card.id}-assembly-${index}`,
      label: chunk,
    }))
    const options = shuffleArray(orderedOptions)

    return {
      cardId: card.id,
      mode: minigame,
      audioText: sourceSentence,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: exampleSentenceHint ?? 'Place each chunk where the sentence sounds most natural.',
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel: surprisePrompt
        ? surpriseLabel
        : 'Arrange the chunks to rebuild the original sentence.',
      focusText: sourceSentence,
      answer: orderedOptions.map((option) => option.id).join('|'),
      answerDisplay: chunks.join(''),
      options,
    }
  }

  if (cards.length < 2) return null

  const cardsById = new Map(cards.map((entry) => [entry.id, entry]))

  function pickDistractorsFromPool(poolIds: number[], desiredCount: number): ScriptDeck['cards'] {
    const selected: ScriptDeck['cards'] = []
    const seen = new Set<number>()
    for (const candidateId of poolIds) {
      if (candidateId === card.id || seen.has(candidateId)) continue
      const candidate = cardsById.get(candidateId)
      if (!candidate) continue
      selected.push(candidate)
      seen.add(candidateId)
      if (selected.length >= desiredCount) return selected
    }

    // Prefer same-tag distractors to keep options semantically coherent.
    const cardTagSet = new Set(card.tags.map((tag) => tag.toLowerCase()))
    for (const candidate of cards) {
      if (candidate.id === card.id || seen.has(candidate.id)) continue
      const sharesTag = candidate.tags.some((tag) => cardTagSet.has(tag.toLowerCase()))
      if (!sharesTag) continue
      selected.push(candidate)
      seen.add(candidate.id)
      if (selected.length >= desiredCount) return selected
    }

    // Final fallback when ranked pool and tag pool are insufficient.
    for (const fallbackIndex of chooseUniqueIndices(cards.length, desiredCount * 2, cardIndex)) {
      const fallbackCard = cards[fallbackIndex]
      if (fallbackCard.id === card.id || seen.has(fallbackCard.id)) continue
      selected.push(fallbackCard)
      seen.add(fallbackCard.id)
      if (selected.length >= desiredCount) break
    }

    return selected
  }

  if (minigame === 'meaning_match') {
    const rankedMeaningDistractors = pickDistractorsFromPool(card.meaning_distractor_ids, 3)
    const options = shuffleArray([
      { id: `${card.id}-correct`, label: card.meaning },
      ...rankedMeaningDistractors.map((candidate) => ({
        id: `${candidate.id}-meaning`,
        label: candidate.meaning,
      })),
    ])

    return {
      cardId: card.id,
      mode: minigame,
      audioText: card.character,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: script === 'kanji_n5'
        ? 'Think about how this kanji looks — its structure can help you recall it.'
        : exampleSentenceHint,
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel: surprisePrompt
        ? surpriseLabel
        : 'What does this character mean?',
      focusText: card.character,
      answer: card.meaning,
      options,
    }
  }

  if (isParticleClozeMode(minigame)) {
    const rankedMeaningDistractors = pickDistractorsFromPool(card.meaning_distractor_ids, 3)
    const options = shuffleArray([
      { id: `${card.id}-correct`, label: card.meaning },
      ...rankedMeaningDistractors.map((candidate) => ({
        id: `${candidate.id}-cloze-meaning`,
        label: candidate.meaning,
      })),
    ])
    const clozeSentence = buildClozeLine(script, curriculumStage, promptSeed, card).replace('___', '_____')

    return {
      cardId: card.id,
      mode: minigame,
      audioText: card.character,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: exampleSentenceHint ?? `The word is ${card.character} (${card.romaji}).`,
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel: surprisePrompt
        ? surpriseLabel
        : 'Fill in the blank.',
      focusText: clozeSentence,
      answer: card.meaning,
      options,
    }
  }

  if (isVibeCheckMode(minigame)) {
    const sourceSentence = card.example_sentence?.trim() || card.character
    const options = shuffleArray([
      { id: `${card.id}-vibe-0`, label: 'Casual / Plain' },
      { id: `${card.id}-vibe-1`, label: 'Polite' },
      { id: `${card.id}-vibe-2`, label: 'Formal Request' },
      { id: `${card.id}-vibe-3`, label: 'Unclear / Context Needed' },
    ])

    const answer =
      sourceSentence.includes('ください')
        ? 'Formal Request'
        : sourceSentence.includes('です') || sourceSentence.includes('ます')
          ? 'Polite'
          : 'Casual / Plain'

    return {
      cardId: card.id,
      mode: minigame,
      audioText: sourceSentence,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: exampleSentenceHint ?? 'Read the sentence ending to judge whether it sounds casual, polite, or request-formal.',
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel: surprisePrompt
        ? surpriseLabel
        : 'Which social context best fits this sentence?',
      focusText: sourceSentence,
      answer,
      options,
    }
  }

  if (isImposterMode(minigame)) {
    const rankedMeaningDistractors = pickDistractorsFromPool(card.meaning_distractor_ids, 3)
    const options = shuffleArray([
      { id: `${card.id}-correct`, label: card.meaning },
      ...rankedMeaningDistractors.map((candidate) => ({
        id: `${candidate.id}-story-meaning`,
        label: candidate.meaning,
      })),
    ])
    const chapter = buildStoryChapter(script, curriculumStage, promptSeed, card)
    const readingPassage = card.example_sentence?.trim() ?? ''
    const readingFocusText = readingPassage.length > 0 ? readingPassage : chapter.line.replace('___', '_____')

    return {
      cardId: card.id,
      mode: minigame,
      audioText: card.character,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: curriculumStage,
      chapterLabel: null,
      hintText: readingPassage.length > 0
        ? `The sentence uses ${card.character} — choose its meaning.`
        : exampleSentenceHint ?? `This scene features ${card.character} — read as "${card.romaji}".`,
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel: surprisePrompt
        ? surpriseLabel
        : readingPassage.length > 0
          ? 'Read the passage and choose the best answer.'
          : 'Which word best completes this scene?',
      focusText: readingFocusText,
      answer: card.meaning,
      options,
    }
  }

  if (minigame === 'listening_audio_first') {
    const rankedMeaningDistractors = pickDistractorsFromPool(card.meaning_distractor_ids, 3)
    const options = shuffleArray([
      { id: `${card.id}-correct`, label: card.meaning },
      ...rankedMeaningDistractors.map((candidate) => ({
        id: `${candidate.id}-listening-audio-meaning`,
        label: candidate.meaning,
      })),
    ])
    return {
      cardId: card.id,
      mode: minigame,
      audioText: card.character,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: `The character is ${card.character} (${card.romaji}).`,
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel: surprisePrompt ? surpriseLabel : 'Listen and choose the meaning.',
      focusText: card.character,
      answer: card.meaning,
      options,
    }
  }

  if (minigame === 'dictation') {
    const isKanaScript = script === 'hiragana' || script === 'katakana'
    if (isKanaScript) {
      const maxCompanions = curriculumStage >= 3 ? 2 : 1
      const companionCount = Math.min(maxCompanions, cards.length - 1)
      const companions: ScriptDeck['cards'] = []
      for (let i = 1; i <= companionCount; i++) {
        const companionIndex = (cardIndex + i) % cards.length
        const companion = cards[companionIndex]
        if (companion.id !== card.id) {
          companions.push(companion)
        }
      }
      const allKana = [card, ...companions].map(c => c.character).join('')
      const firstPairRomaji = [card, ...companions.slice(0, 1)].map(c => c.romaji).join('')

      return {
        cardId: card.id,
        mode: minigame,
        audioText: allKana,
        exampleSentenceAudioText: null,
        surprisePrompt,
        curriculumStage,
        chapterNumber: null,
        chapterLabel: null,
        hintText: `Type the romaji for what you hear (e.g., "${firstPairRomaji}" → ${allKana}).`,
        dictionarySeedQuery: card.character || card.romaji || null,
        dictionaryNote,
        promptLabel: surprisePrompt ? surpriseLabel : 'Listen and type the characters you hear.',
        focusText: allKana,
        answer: allKana,
        options: [],
      isMastered: isMasteredBuild,
      }
    }
    const dictationAnswer = toHiragana(card.romaji.replace(/\s+/g, ''))
    return {
      cardId: card.id,
      mode: minigame,
      audioText: card.character,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: `Type the reading you hear in Japanese.`,
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel: surprisePrompt ? surpriseLabel : 'Listen and type the reading in Japanese.',
      focusText: card.character,
      answer: dictationAnswer,
      options: [],
      isMastered: isMasteredBuild,
    }
  }

  if (minigame === 'kanji_compound_builder') {
    const kanjiChars = [...card.character].filter((c) => /\p{Script=Han}/u.test(c))
    const meanings = kanjiChars.map((c) => KANJI_MEANINGS[c] ?? '?')
    const meaningHints = meanings.join(' + ')

    const rankedCompoundDistractors = pickDistractorsFromPool(card.character_distractor_ids, 3)
    const compoundOptions = shuffleArray([
      { id: `${card.id}-correct`, label: card.character },
      ...rankedCompoundDistractors.map((candidate) => ({
        id: `${candidate.id}-compound`,
        label: candidate.character,
      })),
    ])

    return {
      cardId: card.id,
      mode: minigame,
      audioText: card.character,
      exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: `This word means: ${card.meaning}`,
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel: surprisePrompt
        ? surpriseLabel
        : `Build: ${meaningHints}`,
      focusText: meaningHints,
      answer: card.character,
      options: compoundOptions,
    }
  }

  if (minigame === 'context_cloze') {
    const sentence = card.example_sentence?.trim()
    const clozeResult = sentence ? blankOutWordInSentence(sentence, card.character) : null

    const rankedClozeDistractors = pickDistractorsFromPool(card.character_distractor_ids, 3)
    const clozeOptions = shuffleArray([
      { id: `${card.id}-correct`, label: card.character },
      ...rankedClozeDistractors.map((candidate) => ({
        id: `${candidate.id}-cloze`,
        label: candidate.character,
      })),
    ])

    return {
      cardId: card.id,
      mode: minigame,
      audioText: clozeResult ? sentence! : card.character,
      exampleSentenceAudioText: clozeResult ?? exampleSentenceAudioText,
      surprisePrompt,
      curriculumStage,
      chapterNumber: null,
      chapterLabel: null,
      hintText: clozeResult
        ? `The missing word means: ${card.meaning}`
        : exampleSentenceHint ?? `Think about what ${card.character} means.`,
      dictionarySeedQuery,
      dictionaryNote,
      promptLabel: clozeResult
        ? (surprisePrompt ? surpriseLabel : 'Fill the blank in the sentence.')
        : (surprisePrompt ? surpriseLabel : 'Which character matches this meaning?'),
      focusText: clozeResult ?? card.meaning,
      answer: card.character,
      options: clozeOptions,
    }
  }

  const rankedCharacterDistractors = pickDistractorsFromPool(card.character_distractor_ids, 3)
  const options = shuffleArray([
    { id: `${card.id}-correct`, label: card.character },
    ...rankedCharacterDistractors.map((candidate) => ({
      id: `${candidate.id}-character`,
      label: candidate.character,
    })),
  ])

  return {
    cardId: card.id,
    mode: minigame,
    audioText: card.character,
    exampleSentenceAudioText,
    surprisePrompt,
    curriculumStage,
    chapterNumber: null,
    chapterLabel: null,
    hintText: script === 'kanji_n5'
      ? 'Think about how this kanji looks — its structure can help you recall it.'
      : exampleSentenceHint,
    dictionarySeedQuery,
    dictionaryNote,
    promptLabel: surprisePrompt
      ? surpriseLabel
      : 'Which character matches this meaning?',
    focusText: card.meaning,
    answer: card.character,
    options,
  }
}

export async function buildRoundWithBridge(
script: ScriptKey,
cardScores: CardScores,
cards: ScriptDeck['cards'],
  minigame: PlayableMinigame,
  cardIndex: number,
  surprisePrompt: boolean,
  promptSeed: number,
): Promise<RoundState | null> {
  if (cards.length === 0) return null

  const card = cards[cardIndex]
  const surpriseLabel = pickSurprisePrompt(script, minigame, card.tags, promptSeed)
  const currentScore = cardScores[script][card.id] ?? 0
  const persistedStage = normalizeCurriculumStage(card.curriculum_stage)
  const scoreStage = curriculumStageFromScore(currentScore)
  const curriculumStage = isGrammarCurriculumMode(minigame)
    ? persistedStage
    : scoreStage
  const exampleSentenceAudioText = card.example_sentence?.trim() || null
  const exampleSentenceHint = card.example_sentence
    ? `Example: ${card.example_sentence}`
    : null
  const dictionaryNote = buildRoundDictionaryNote(card, minigame)
  const dictionarySeedQuery = card.character || card.romaji || null

  if (isConjugationDrillMode(minigame)) {
    const drillRound = await buildConjugationDrillRound(card, {
      curriculumStage,
      surprisePrompt,
      surpriseLabel,
      promptSeed,
      dictionarySeedQuery,
      dictionaryNote,
    })
    if (drillRound) return { ...drillRound, isMastered: currentScore >= CARD_MASTERY_MAX }
    return buildRound(script, cardScores, cards, minigame, cardIndex, surprisePrompt, promptSeed)
  }

  const bridgeRound = await buildBridgeGrammarRound(card, minigame, {
    curriculumStage,
    surprisePrompt,
    surpriseLabel,
    promptSeed,
    exampleSentenceAudioText,
    dictionarySeedQuery,
    dictionaryNote,
    exampleSentenceHint,
  })
  const isMasteredFromBridge = currentScore >= CARD_MASTERY_MAX
  if (bridgeRound) return { ...bridgeRound, isMastered: isMasteredFromBridge }

  return buildRound(script, cardScores, cards, minigame, cardIndex, surprisePrompt, promptSeed)
}
