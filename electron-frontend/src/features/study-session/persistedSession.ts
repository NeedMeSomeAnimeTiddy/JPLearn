import { SESSION_LENGTH_PRESETS, DEFAULT_SESSION_LENGTH_PRESET } from '../../constants'
import type { DeckSlugInput, JlptLevel, PersistedSession, ScriptKey } from '../../types'

/**
 * The interrupted session as saved since audit 2 F7.
 *
 * `activeScript` names a *section*, and for kanji and vocabulary every level shares one section
 * key (`kanji_n5`, `vocab_n5`). Resuming from it alone always reopened N5, so the deck the session
 * actually studied is saved beside it.
 */
export interface PersistedStudySession extends PersistedSession {
  deckSlug: DeckSlugInput
}

const LEVELLED_DECK = /^(kanji|vocab)_(n[1-5])$/

/** The JLPT level a levelled deck slug names, or null for a deck with no levels. */
export function deckSlugLevel(slug: DeckSlugInput): JlptLevel | null {
  const match = LEVELLED_DECK.exec(slug)
  return match ? match[2] as JlptLevel : null
}

/** Whether `slug` is a deck the section `script` can study. */
function deckBelongsToScript(script: ScriptKey, slug: unknown): slug is DeckSlugInput {
  if (typeof slug !== 'string') return false
  if (script === 'kanji_n5') return slug.startsWith('kanji_') && LEVELLED_DECK.test(slug)
  if (script === 'vocab_n5') return slug.startsWith('vocab_') && LEVELLED_DECK.test(slug)
  return slug === script
}

/**
 * The saved session, if it can be resumed.
 *
 * A save from before F7 has no `deckSlug` and is not offered: for kanji and vocabulary its level
 * is unknowable, and guessing reopened the wrong level's cards. Each answer was sent to be saved
 * as it was given, so what is lost is the run itself: its rounds, score and lives.
 */
export function parseResumableSession(raw: string): PersistedStudySession | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedStudySession> | null
    if (!parsed || !parsed.activeScript || !parsed.activeGame || !parsed.restore) {
      return null
    }
    if (!deckBelongsToScript(parsed.activeScript, parsed.deckSlug)) return null
    return parsed as PersistedStudySession
  } catch {
    return null
  }
}

/** The saved session length, or the default when it is not one the app offers. */
export function resumableTargetItems(saved: unknown): number {
  return SESSION_LENGTH_PRESETS.find((preset) => preset.items === saved)?.items
    ?? DEFAULT_SESSION_LENGTH_PRESET.items
}
