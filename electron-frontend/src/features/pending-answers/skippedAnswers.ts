/**
 * An answer the main process never admitted -- the IPC call itself failed -- has no queue to report it,
 * so the study session says so here and the bar shows the skipped notice, as it does for an answer the
 * bridge refused.
 */
const listeners = new Set<() => void>()

export function reportSkippedAnswer(): void {
  for (const listener of listeners) listener()
}

export function onSkippedAnswer(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
