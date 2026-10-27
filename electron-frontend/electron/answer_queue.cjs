/* ==================================================================================================
   ANSWERS WAITING TO BE SAVED (audit 1, F1/F3). Every study answer goes through here on its way to the
   bridge's `record-result`, in the order it was given.

   THE STUDY ROUND KEEPS GOING WHEN A SAVE FAILS -- Robbie's call, 2026-10-26. So a failed answer is
   not dropped and not retried out of order: it stays at the head, nothing behind it is sent, and the
   queue retries it on a backoff (30, 60, then every 120 s) or when the learner presses Retry. Answering
   again does not cut the backoff short: the new answer just waits behind the failed one. An answer
   is never evicted. A save is safe to repeat because each answer carries an id the bridge keeps a
   receipt for: a repeat of an answer that already committed returns the stored result.

   IN MEMORY ONLY, also Robbie's call: quitting with answers still waiting asks first (main.cjs), and a
   crash loses them. Bookkeeping is synchronous -- an answer is counted the moment it is admitted, even
   while a send is in flight -- and one drain loop owns every send.

   ONE COMPLETION PATH. The IPC call that admits an answer resolves at once with `accepted`; the result
   arrives later as `study:answer-saved` or `study:answer-rejected`, whichever way it went, so the
   renderer reconciles every answer in one place.

   A HEAD THAT CAN NEVER SUCCEED is dropped so it cannot block the rest: only when the bridge says so
   with exit code 3 (unknown card, an answer id reused for another answer, malformed identity). Any
   other failure -- a timeout, SQLite, a dead worker, an unexpected error -- keeps the answer waiting.
   ================================================================================================== */

const INVALID_ANSWER_CODE = 3
const DEFAULT_RETRY_DELAYS_MS = [30_000, 60_000, 120_000]
const WAITING_FOR_SAVES_MESSAGE = 'Some answers are still waiting to save. Try again in a moment.'

/**
 * @param {object} options
 * @param {(args: string[]) => Promise<unknown>} options.send  bridge worker request, no one-shot fallback
 * @param {(channel: string, payload: unknown) => void} options.broadcast  send to every window
 * @param {(result: unknown) => void} [options.onSaved]  called after each saved answer (cache clearing)
 * @param {number[]} [options.retryDelaysMs]
 * @param {typeof setTimeout} [options.setTimer]
 * @param {typeof clearTimeout} [options.clearTimer]
 */
function createAnswerQueue(options) {
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const setTimer = options.setTimer ?? setTimeout
  const clearTimer = options.clearTimer ?? clearTimeout

  /** @type {{ answerId: string, args: string[], cardKey: string, attempts: number, lastError: string | null }[]} */
  const entries = []
  let seq = 0
  let drainPromise = null
  let retryTimer = null
  // Exclusive operations (reset, import, expertise seeding) run one after another on a chain; while any
  // is queued or running the queue sends nothing -- except the drain an import does before it starts.
  let exclusiveWaiting = 0
  let exclusiveTail = Promise.resolve()
  let drainingForExclusive = false

  function paused() {
    return exclusiveWaiting > 0 && !drainingForExclusive
  }

  function snapshot() {
    const head = entries[0]
    return {
      count: entries.length,
      headError: head?.lastError ?? null,
      headAttempts: head?.attempts ?? 0,
      seq,
      pending: entries.map((entry) => ({ answerId: entry.answerId, cardKey: entry.cardKey })),
    }
  }

  function emitStatus() {
    seq += 1
    options.broadcast('study:pending-answers', snapshot())
  }

  function cancelRetry() {
    if (retryTimer !== null) {
      clearTimer(retryTimer)
      retryTimer = null
    }
  }

  function scheduleRetry(attempts) {
    cancelRetry()
    const delay = retryDelaysMs[Math.min(attempts - 1, retryDelaysMs.length - 1)]
    retryTimer = setTimer(() => {
      retryTimer = null
      kick()
    }, delay)
    retryTimer?.unref?.()
  }

  async function drainLoop() {
    while (entries.length > 0 && !paused()) {
      const head = entries[0]
      head.attempts += 1
      try {
        const result = await options.send(head.args)
        if (entries[0] !== head) {
          continue // dropped by a reset while it was in flight
        }
        entries.shift()
        seq += 1
        options.onSaved?.(result)
        options.broadcast('study:answer-saved', { answerId: head.answerId, cardKey: head.cardKey, result, seq })
        emitStatus()
      } catch (error) {
        if (entries[0] !== head) {
          continue
        }
        const message = error instanceof Error ? error.message : String(error)
        if (error && error.bridgeCode === INVALID_ANSWER_CODE) {
          entries.shift()
          seq += 1
          options.broadcast('study:answer-rejected', {
            answerId: head.answerId, cardKey: head.cardKey, reason: 'invalid', error: message, seq,
          })
          emitStatus()
          continue
        }
        head.lastError = message
        emitStatus()
        scheduleRetry(head.attempts)
        return
      }
    }
  }

  /**
   * Start draining unless a drain or an exclusive operation is already under way. A failed head waits
   * out its backoff unless `force` (the Retry button, or an import that must drain first).
   */
  function kick(force = false) {
    if (drainPromise !== null) {
      return drainPromise
    }
    if (paused() || entries.length === 0) {
      return Promise.resolve()
    }
    if (retryTimer !== null) {
      if (!force) {
        return Promise.resolve()
      }
      cancelRetry()
    }
    drainPromise = drainLoop().finally(() => {
      drainPromise = null
    })
    return drainPromise
  }

  /**
   * Admit one answer. Synchronous: it is counted before anything is sent.
   * @param {string} answerId
   * @param {string[]} args  the full `record-result` argv
   * @param {string} cardKey  `${slug}:${cardId}`, so the renderer knows which cards still have answers in flight
   */
  function enqueue(answerId, args, cardKey) {
    const existing = entries.find((entry) => entry.answerId === answerId)
    if (existing) {
      if (existing.args.length !== args.length || existing.args.some((value, index) => value !== args[index])) {
        throw new Error(`Answer id ${answerId} is already waiting with a different answer`)
      }
      return { status: 'accepted', answerId }
    }
    entries.push({ answerId, args: [...args], cardKey, attempts: 0, lastError: null })
    emitStatus()
    void kick()
    return { status: 'accepted', answerId }
  }

  /** the Retry button: try the head now */
  function retryNow() {
    return kick(true)
  }

  /**
   * Run `operation` with no answer in flight and none sent until it finishes, after any exclusive
   * operation already queued. Answers admitted meanwhile are counted and wait their turn.
   *
   * `dropPending: true` is for a progress reset: the learner asked to delete progress, so answers still
   * waiting are dropped (each reported as rejected with reason 'reset'). Otherwise the queue is drained
   * first, and the operation is refused while an answer still cannot be saved -- an import must not
   * land between an answer and the ones after it.
   */
  async function runExclusive(operation, { dropPending = false } = {}) {
    exclusiveWaiting += 1
    const previous = exclusiveTail
    let release
    exclusiveTail = new Promise((resolve) => { release = resolve })
    try {
      await previous
      if (drainPromise) {
        await drainPromise.catch(() => undefined)
      }
      if (dropPending) {
        cancelRetry()
        const dropped = entries.splice(0, entries.length)
        for (const entry of dropped) {
          seq += 1
          options.broadcast('study:answer-rejected', {
            answerId: entry.answerId, cardKey: entry.cardKey, reason: 'reset', error: null, seq,
          })
        }
        if (dropped.length > 0) {
          console.warn(`Progress reset dropped ${dropped.length} answer(s) still waiting to save`)
          emitStatus()
        }
      } else if (entries.length > 0) {
        drainingForExclusive = true
        try {
          await kick(true)
        } finally {
          drainingForExclusive = false
        }
        if (entries.length > 0) {
          throw new Error(WAITING_FOR_SAVES_MESSAGE)
        }
      }
      return await operation()
    } finally {
      exclusiveWaiting -= 1
      release()
      // A failed head keeps its backoff; kick() leaves it alone while the retry timer runs.
      if (exclusiveWaiting === 0) {
        void kick()
      }
    }
  }

  return { enqueue, retryNow, runExclusive, snapshot, kick }
}

/**
 * The before-quit guard: answers waiting to save live only in memory, so quitting with any asks first.
 * Returns true when the quit may go ahead. "Wait and retry" cancels the quit entirely -- including the
 * tray's `isQuitting` flag, or closing the window afterwards would destroy it instead of hiding it.
 *
 * @param {object} options
 * @param {{ snapshot: () => { count: number }, retryNow: () => Promise<unknown> }} options.queue
 * @param {(options: object) => Promise<{ response: number }>} options.showMessageBox
 * @param {() => void} options.quit  app.quit()
 * @param {() => void} options.cancelQuit  clears the app's isQuitting flag
 */
function createUnsavedAnswersQuitGuard({ queue, showMessageBox, quit, cancelQuit }) {
  let confirmed = false
  let dialogOpen = false
  return function mayQuit() {
    const waiting = queue.snapshot().count
    if (waiting === 0 || confirmed) {
      return true
    }
    cancelQuit()
    if (dialogOpen) {
      return false
    }
    dialogOpen = true
    const message = waiting === 1
      ? "1 answer isn't saved yet. Quit anyway?"
      : `${waiting} answers aren't saved yet. Quit anyway?`
    void showMessageBox({
      type: 'warning',
      buttons: ['Wait and retry', 'Quit anyway'],
      defaultId: 0,
      cancelId: 0,
      message,
    }).then(({ response }) => {
      dialogOpen = false
      if (response === 1) {
        confirmed = true
        quit()
      } else {
        void queue.retryNow()
      }
    }).catch(() => {
      dialogOpen = false
    })
    return false
  }
}

module.exports = { createAnswerQueue, createUnsavedAnswersQuitGuard, INVALID_ANSWER_CODE, WAITING_FOR_SAVES_MESSAGE }
