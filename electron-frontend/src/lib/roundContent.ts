import type {
  MinigameKey, PlayableMinigame, RoundDictionaryNote, ScriptDeck, ScriptKey,
} from '../types'
import {
  CLOZE_TEMPLATES, SCRIPT_MODE_PROMPT_PACKS, STORY_CHAPTERS, SURPRISE_PROMPTS, TAG_PROMPT_PACKS,
} from './contentTemplates'

export function isParticleClozeMode(mode: MinigameKey): mode is 'particle_cloze' {
  return mode === 'particle_cloze'
}

export const PARTICLE_EXPLANATIONS: Record<string, { romaji: string; explanation: string }> = {
  'は': { romaji: 'wa', explanation: 'Topic marker — sets the topic of the sentence' },
  'が': { romaji: 'ga', explanation: 'Subject marker — marks the subject or adds emphasis' },
  'を': { romaji: 'wo', explanation: 'Direct object marker — marks what the verb acts on' },
  'に': { romaji: 'ni', explanation: 'Location/direction/time — marks existence, destination, or when' },
  'で': { romaji: 'de', explanation: 'Location/means — marks where an action happens or how' },
  'へ': { romaji: 'e', explanation: 'Direction — marks the direction of movement' },
  'と': { romaji: 'to', explanation: 'And/with — connects nouns or marks a companion' },
  'の': { romaji: 'no', explanation: 'Possession/genitive — links nouns together' },
  'も': { romaji: 'mo', explanation: 'Also/even — adds emphasis or inclusion' },
  'から': { romaji: 'kara', explanation: 'From/because — marks origin or reason' },
  'まで': { romaji: 'made', explanation: 'Until/up to — marks endpoint in time or space' },
}

export function isVibeCheckMode(mode: MinigameKey): mode is 'vibe_check' {
  return mode === 'vibe_check'
}

export function isImposterMode(mode: MinigameKey): mode is 'imposter' {
  return mode === 'imposter'
}

export function isSentenceAssemblyMode(mode: MinigameKey): mode is 'sentence_assembly' {
  return mode === 'sentence_assembly'
}

export function isConjugationDrillMode(mode: MinigameKey): mode is 'conjugation_drill' {
  return mode === 'conjugation_drill'
}

export function pickSurprisePrompt(
  script: ScriptKey,
  mode: PlayableMinigame,
  tags: string[],
  seed: number,
): string {
  const scriptPool = SCRIPT_MODE_PROMPT_PACKS[script][mode] ?? []
  const tagPool = tags
    .map((tag) => TAG_PROMPT_PACKS[tag.toLowerCase()])
    .filter((pack): pack is string[] => Boolean(pack))
    .flat()
  const combined = [...tagPool, ...scriptPool, ...SURPRISE_PROMPTS]
  return combined[Math.abs(seed) % combined.length]
}

export function curriculumStageFromScore(score: number): 1 | 2 | 3 {
  if (score >= 3) return 3
  if (score >= 1) return 2
  return 1
}

export function normalizeCurriculumStage(stage: number): 1 | 2 | 3 {
  if (stage >= 3) return 3
  if (stage >= 2) return 2
  return 1
}

export function applyCardTemplate(template: string, card: ScriptDeck['cards'][number]): string {
  return template
    .replaceAll('{character}', card.character)
    .replaceAll('{romaji}', card.romaji)
    .replaceAll('{meaning}', card.meaning)
}

export function splitSentenceIntoAssemblyChunks(sentence: string): string[] {
  const chunks: string[] = []
  let buffer = ''
  const particleBreaks = new Set(['は', 'が', 'を', 'に', 'で', 'と', 'へ', 'も', 'の'])
  const punctuationBreaks = new Set(['、', '。', '！', '？'])

  for (const character of sentence) {
    if (character.trim().length === 0) {
      if (buffer.trim().length > 0) {
        chunks.push(buffer.trim())
        buffer = ''
      }
      continue
    }

    buffer += character
    if (particleBreaks.has(character) || punctuationBreaks.has(character)) {
      chunks.push(buffer)
      buffer = ''
    }
  }

  if (buffer.length > 0) {
    chunks.push(buffer)
  }

  return chunks.filter((chunk) => chunk.trim().length > 0)
}

export function buildClozeLine(script: ScriptKey, stage: 1 | 2 | 3, seed: number, card: ScriptDeck['cards'][number]): string {
  const templates = CLOZE_TEMPLATES[script][stage]
  return applyCardTemplate(templates[Math.abs(seed) % templates.length], card)
}

export function buildStoryChapter(script: ScriptKey, stage: 1 | 2 | 3, seed: number, card: ScriptDeck['cards'][number]): { title: string; line: string } {
  const chapter = STORY_CHAPTERS[script][stage]
  return {
    title: chapter.title,
    line: applyCardTemplate(chapter.lines[Math.abs(seed) % chapter.lines.length], card),
  }
}

export function buildRoundDictionaryNote(card: ScriptDeck['cards'][number], mode: PlayableMinigame): RoundDictionaryNote | null {
  const summary = card.dictionary_summary
  if (!summary) return null

  const secondaryGlosses = summary.glosses.filter((gloss) => gloss !== summary.primary_gloss).slice(0, 2)
  const glossList = [summary.primary_gloss, ...secondaryGlosses]
  let title = 'Dictionary note'
  let copy = `${summary.character} (${summary.reading}) is commonly glossed as ${summary.primary_gloss}.`

  if (mode === 'romaji_sprint') {
    title = 'Reading clue'
    copy = `${summary.character} is read ${summary.reading} in the dictionary.`
  } else if (mode === 'sentence_assembly') {
    title = 'Assembly clue'
    copy = `Rebuild the sentence in natural order around ${summary.character} (${summary.reading}).`
  } else if (mode === 'typed_recall') {
    title = 'Dictionary recall'
    copy = secondaryGlosses.length > 0
      ? `${summary.character} (${summary.reading}) is commonly translated as ${glossList.join(', ')}.`
      : `${summary.character} (${summary.reading}) is commonly translated as ${summary.primary_gloss}.`
  } else if (mode === 'speech_recall') {
    title = 'Dictionary recall'
    copy = secondaryGlosses.length > 0
      ? `${summary.character} (${summary.reading}) is commonly translated as ${glossList.join(', ')}. Say it aloud clearly.`
      : `${summary.character} (${summary.reading}) is commonly translated as ${summary.primary_gloss}. Say it aloud clearly.`
  } else if (mode === 'stroke_order') {
    title = 'Writing clue'
    copy = `${summary.character} is read ${summary.reading} and is usually glossed as ${summary.primary_gloss}.`
  } else if (mode === 'meaning_match') {
    title = 'Dictionary sense'
    copy = secondaryGlosses.length > 0
      ? `${summary.character} is read ${summary.reading} and can carry senses like ${glossList.join(', ')}.`
      : `${summary.character} is read ${summary.reading} and often points to ${summary.primary_gloss}.`
  } else if (mode === 'character_match') {
    title = 'Meaning clue'
    copy = secondaryGlosses.length > 0
      ? `Look for the character read ${summary.reading} with meanings like ${glossList.join(', ')}.`
      : `Look for the character read ${summary.reading} that matches ${summary.primary_gloss}.`
  } else if (isParticleClozeMode(mode)) {
    title = 'Context clue'
    copy = secondaryGlosses.length > 0
      ? `${summary.character} (${summary.reading}) fits sentence meanings like ${glossList.join(', ')}.`
      : `${summary.character} (${summary.reading}) fits this kind of sentence as ${summary.primary_gloss}.`
  } else if (isImposterMode(mode)) {
    title = 'Reading note'
    copy = secondaryGlosses.length > 0
      ? `In passages, ${summary.character} is read ${summary.reading} and can suggest ${glossList.join(', ')}.`
      : `In passages, ${summary.character} is read ${summary.reading} and usually suggests ${summary.primary_gloss}.`
  } else if (mode === 'listening_audio_first' || mode === 'dictation') {
    title = 'Listening clue'
    copy = secondaryGlosses.length > 0
      ? `The audio term is ${summary.character}, read ${summary.reading}, with senses like ${glossList.join(', ')}.`
      : `The audio term is ${summary.character}, read ${summary.reading}, and usually means ${summary.primary_gloss}.`
  } else if (mode === 'kanji_compound_builder') {
    title = 'Compound clue'
    copy = secondaryGlosses.length > 0
      ? `${summary.character} (${summary.reading}) is built from kanji with senses like ${glossList.join(', ')}.`
      : `${summary.character} (${summary.reading}) is built from kanji that each carry distinct meaning.`
  } else if (mode === 'context_cloze') {
    title = 'Sentence clue'
    copy = secondaryGlosses.length > 0
      ? `Use context to choose the right word. ${summary.character} (${summary.reading}) can mean ${glossList.join(', ')}.`
      : `Use context to choose the right word. ${summary.character} (${summary.reading}) fits this sentence.`
  }

  return {
    title,
    copy,
    character: summary.character,
    reading: summary.reading,
    primaryGloss: summary.primary_gloss,
    secondaryGlosses,
    source: summary.source,
  }
}

export function narrativePriorityCards(cards: ScriptDeck['cards']): ScriptDeck['cards'] {
  const stage3 = cards.filter((card) => normalizeCurriculumStage(card.curriculum_stage) === 3)
  if (stage3.length > 0) return stage3
  const stage2 = cards.filter((card) => normalizeCurriculumStage(card.curriculum_stage) === 2)
  if (stage2.length > 0) return stage2
  return cards
}
