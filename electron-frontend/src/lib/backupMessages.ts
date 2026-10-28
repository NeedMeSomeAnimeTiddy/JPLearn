import type { ProgressImportResult } from '../generated/types'

export type BackupAction = 'backup' | 'restore' | 'import' | 'export'

const FALLBACK: Record<BackupAction, string> = {
  backup: 'Backup failed.',
  restore: 'Restore failed.',
  import: 'Import failed.',
  export: 'Export failed.',
}

/* Errors reach the renderer wrapped by Electron ("Error invoking remote method '...': Error: ..."),
   so each is recognised by a phrase the main process or bridge puts in it, not by equality. */
const KNOWN_FAILURES: ReadonlyArray<readonly [readonly string[], string]> = [
  [['newer format'], 'This file is from a newer version of JPLearn.'],
  [['not a progress file', 'not a backup'], "This file isn't a JPLearn backup."],
  [['damaged file'], 'This backup file is damaged.'],
  [['still waiting to save'], 'Some answers are still waiting to save. Try again in a moment.'],
  [['busy:'], 'Another backup or optimization is still running. Try again when it finishes.'],
  [['choose another place'], 'Choose another place to save the backup.'],
  [['choose another file'], 'That is the file JPLearn is using now. Choose another backup file.'],
]

/** A plain sentence for a failed backup, restore, import or export. */
export function backupFailureMessage(err: unknown, action: BackupAction): string {
  const text = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  for (const [phrases, sentence] of KNOWN_FAILURES) {
    if (phrases.some((phrase) => text.includes(phrase))) return sentence
  }
  return FALLBACK[action]
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** What a progress import changed, in plain words; zero parts are left out. */
export function importSummaryMessage(result: ProgressImportResult): string {
  const changed = [
    result.cards_updated > 0 ? `${plural(result.cards_updated, 'card', 'cards')} updated` : null,
    result.reviews_added > 0 ? `${plural(result.reviews_added, 'review', 'reviews')} added` : null,
    result.problem_cards_updated > 0
      ? `${plural(result.problem_cards_updated, 'problem card', 'problem cards')} updated` : null,
    result.daily_games_attempts_added > 0
      ? `${plural(result.daily_games_attempts_added, 'Daily Games result', 'Daily Games results')} added` : null,
  ].filter((part): part is string => part !== null)
  // Stage, counter, goal and topic rows have no plain name worth listing, but they still count as an import.
  const otherChanged = result.stages_updated + result.counters_updated
    + result.session_goals_added + result.topic_rows_moved > 0
  const sentences: string[] = []
  if (changed.length > 0) sentences.push(`Imported: ${changed.join(', ')}.`)
  else if (otherChanged) sentences.push('Imported.')
  if (result.cards_kept_current > 0) {
    sentences.push(`${plural(result.cards_kept_current, 'card you had', 'cards you had')} studied further kept your progress.`)
  }
  const daysKept = result.daily_games_days_kept_current.length
  if (daysKept > 0) {
    sentences.push(`Daily Games for ${plural(daysKept, 'day', 'days')} kept the words you already had.`)
  }
  return sentences.length > 0 ? sentences.join(' ') : 'Nothing new to import.'
}
