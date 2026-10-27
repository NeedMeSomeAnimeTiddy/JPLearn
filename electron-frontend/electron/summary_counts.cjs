'use strict'

/**
 * Cards still due now, from a bridge `summary` payload, for the tray tooltip and the due-review
 * notification.
 *
 * The summary's `totals.remaining_due` counts each card the app serves once. Adding up `due_today`
 * over its decks counted the 28 topic views' words twice and every card already done today, so
 * the tray could say cards were due after the day's work was finished (audit 3, F2/F4).
 */
function remainingDue(summary) {
  const value = summary?.totals?.remaining_due
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

module.exports = { remainingDue }
