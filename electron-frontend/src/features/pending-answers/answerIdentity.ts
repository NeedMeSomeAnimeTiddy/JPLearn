/** The id and moment one answer was given, captured once and sent unchanged on every retry. */
export interface AnswerIdentity {
  answerId: string
  /** ISO instant, UTC, with milliseconds: `2026-10-27T09:15:02.123Z` */
  answeredAtUtc: string
  /** the learner's own calendar day when they answered: `2026-10-27` */
  answeredLocalDate: string
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * The local day matters on its own: a save retried after midnight, or after the clock's timezone
 * changed, is still counted on the day the learner answered (audit 1, F1).
 */
export function newAnswerIdentity(now: Date = new Date(), randomUUID: () => string = () => crypto.randomUUID()): AnswerIdentity {
  return {
    answerId: randomUUID(),
    answeredAtUtc: now.toISOString(),
    answeredLocalDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  }
}

/** `${slug}:${cardId}` -- how the main process names the card an answer belongs to. */
export function answerCardKey(slug: string, cardId: number): string {
  return `${slug}:${cardId}`
}
