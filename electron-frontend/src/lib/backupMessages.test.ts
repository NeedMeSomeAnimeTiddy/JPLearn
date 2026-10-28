import { describe, expect, it } from 'vitest'
import type { ProgressImportResult } from '../generated/types'
import { backupFailureMessage, importSummaryMessage } from './backupMessages'

const wrapped = (route: string, detail: string) =>
  new Error(`Error invoking remote method '${route}': Error: Failed to restore: ${detail}`)

describe('backupFailureMessage', () => {
  it.each([
    ['newer format: the backup is schema 99', 'This file is from a newer version of JPLearn.'],
    ['not a progress file: the file does not hold a JSON object', "This file isn't a JPLearn backup."],
    ['not a backup: the file is not a JPLearn database', "This file isn't a JPLearn backup."],
    ['damaged file: the backup failed SQLite\'s integrity check', 'This backup file is damaged.'],
    ['Failed to restore: Some answers are still waiting to save. Try again in a moment.', 'Some answers are still waiting to save. Try again in a moment.'],
    ['busy: an optimization is running', 'Another backup or optimization is still running. Try again when it finishes.'],
    ['choose another place: that is where the app keeps its own database', 'Choose another place to save the backup.'],
    ['choose another file: that is the database the app is using now', 'That is the file JPLearn is using now. Choose another backup file.'],
  ])('maps a wrapped "%s" to a plain sentence', (detail, sentence) => {
    expect(backupFailureMessage(wrapped('backup:restore-database', detail), 'restore')).toBe(sentence)
  })

  it.each([
    ['backup', 'Backup failed.'],
    ['restore', 'Restore failed.'],
    ['import', 'Import failed.'],
    ['export', 'Export failed.'],
  ] as const)('falls back to the %s sentence for anything else', (action, sentence) => {
    expect(backupFailureMessage(new Error('ENOSPC: no space left on device'), action)).toBe(sentence)
    expect(backupFailureMessage(undefined, action)).toBe(sentence)
  })

  it('reads a thrown string too', () => {
    expect(backupFailureMessage('busy: try later', 'backup')).toBe(
      'Another backup or optimization is still running. Try again when it finishes.',
    )
  })
})

const nothing: ProgressImportResult = {
  cards_updated: 0,
  cards_kept_current: 0,
  reviews_added: 0,
  stages_updated: 0,
  problem_cards_updated: 0,
  counters_updated: 0,
  session_goals_added: 0,
  topic_rows_moved: 0,
  daily_games_attempts_added: 0,
  daily_games_days_kept_current: [],
  safety_copy: null,
}

describe('importSummaryMessage', () => {
  it('says so when nothing changed', () => {
    expect(importSummaryMessage(nothing)).toBe('Nothing new to import.')
  })

  it('lists the non-zero parts and the cards that kept their progress', () => {
    expect(importSummaryMessage({ ...nothing, cards_updated: 12, reviews_added: 340, cards_kept_current: 3 })).toBe(
      'Imported: 12 cards updated, 340 reviews added. 3 cards you had studied further kept your progress.',
    )
  })

  it('omits zero parts and uses the singular for one', () => {
    expect(importSummaryMessage({ ...nothing, reviews_added: 1 })).toBe('Imported: 1 review added.')
    expect(importSummaryMessage({ ...nothing, cards_kept_current: 1 })).toBe(
      '1 card you had studied further kept your progress.',
    )
  })

  it('names problem cards, Daily Games and kept Daily Games days', () => {
    expect(importSummaryMessage({
      ...nothing,
      problem_cards_updated: 2,
      daily_games_attempts_added: 5,
      daily_games_days_kept_current: ['2026-10-01'],
    })).toBe('Imported: 2 problem cards updated, 5 Daily Games results added. Daily Games for 1 day kept the words you already had.')
  })

  it('still reports an import that changed only unnamed rows', () => {
    expect(importSummaryMessage({ ...nothing, counters_updated: 4 })).toBe('Imported.')
  })
})
