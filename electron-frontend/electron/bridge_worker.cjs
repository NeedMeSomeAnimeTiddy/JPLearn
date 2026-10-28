/* ==================================================================================================
   THE SHARED PYTHON BRIDGE WORKER: one long-lived `desktop_bridge.py --server` child, newline-JSON
   over stdin/stdout, strictly one request at a time on the Python side.

   EVERYTHING A WORKER OWNS IS ITS OWN. The worker is replaced -- after repeated timeouts, from the dev
   tools' Restart Bridge, after it dies -- and the old one's 'close' can arrive after the new one is
   already answering. When the buffer, the stderr and the pending requests were module-wide, that late
   'close' rejected the new worker's requests and then killed the new worker, and a stray partial line
   from the old one's stdout could land in front of the new one's output. So each child keeps its own
   buffer and stderr, every pending request records the child it was written to, and a child's exit
   settles only its own requests and clears the current worker only if it still is the current worker.
   ================================================================================================== */

const { spawn } = require('node:child_process')

/**
 * @param {object} options
 * @param {() => { bridgeScript: string, projectRoot: string, candidates: string[] }} options.resolveContext
 * @param {(projectRoot: string) => string} options.resolvePythonCommand
 * @param {Record<string, any>} options.telemetry  counters shared with the rest of the bridge
 * @param {number} options.requestTimeoutMs
 * @param {number} options.maxConsecutiveTimeouts
 * @param {typeof spawn} [options.spawnFn]
 */
function createBridgeWorker(options) {
  const spawnFn = typeof options.spawnFn === 'function' ? options.spawnFn : spawn
  const telemetry = options.telemetry

  const state = {
    child: null,
    nextRequestId: 1,
    /** request id -> { resolve, reject, timeoutId, child } */
    pending: new Map(),
    /** the current worker's stderr, for the telemetry snapshot */
    stderr: '',
    consecutiveTimeouts: 0,
  }

  /** settle the requests written to `child`, and only those */
  function rejectPending(error, child) {
    for (const [requestId, request] of Array.from(state.pending.entries())) {
      if (request.child !== child) {
        continue
      }
      state.pending.delete(requestId)
      clearTimeout(request.timeoutId)
      request.reject(error)
    }
  }

  function stop() {
    if (!state.child) {
      return
    }

    const child = state.child
    state.child = null
    try {
      child.kill()
    } catch {
      // Ignore termination errors during shutdown/restart.
    }
  }

  function start() {
    if (state.child && !state.child.killed) {
      return state.child
    }

    const bridgeContext = options.resolveContext()
    const pythonCmd = options.resolvePythonCommand(bridgeContext.projectRoot)
    const bridgeScript = bridgeContext.bridgeScript

    state.consecutiveTimeouts = 0

    const child = spawnFn(pythonCmd, [bridgeScript, '--server'], {
      cwd: bridgeContext.projectRoot,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let buffer = ''
    let stderr = ''
    const isCurrent = () => state.child === child

    state.child = child
    state.stderr = ''
    telemetry.workerStarts += 1

    child.stdout.setEncoding?.('utf8')
    child.stdout.on('data', (chunk) => {
      buffer += String(chunk)
      while (true) {
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex < 0) {
          break
        }

        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (!line) {
          continue
        }

        try {
          const envelope = JSON.parse(line)
          const requestId = envelope.id
          const request = state.pending.get(requestId)
          if (!request || request.child !== child) {
            continue
          }

          state.pending.delete(requestId)
          clearTimeout(request.timeoutId)
          // Any response -- success or command-level failure -- proves the
          // worker is alive and responsive, not wedged.
          if (isCurrent()) {
            state.consecutiveTimeouts = 0
          }

          if (envelope.code !== 0) {
            telemetry.workerFailureCount += 1
            const payload = envelope.payload || {}
            const errorMessage = typeof payload.error === 'string' ? payload.error : `Bridge request failed with code ${envelope.code}`
            telemetry.lastWorkerError = errorMessage
            const failure = new Error(errorMessage)
            // The exit code says what kind of failure it was: 3 is an answer that can never save as
            // sent (answer_queue.cjs drops it), anything else may succeed on a retry.
            failure.bridgeCode = envelope.code
            request.reject(failure)
            continue
          }

          telemetry.workerSuccessCount += 1
          request.resolve(envelope.payload)
        } catch (error) {
          console.warn('Ignoring malformed bridge worker output line', {
            detail: error instanceof Error ? error.message : String(error),
          })
        }
      }
    })

    /* A WRITE TO A WORKER THAT HAS EXITED BEFORE NODE HAS NOTICED fails later, on stdin (EPIPE), and
       an 'error' with no listener is an uncaught exception in the main process. Recorded and no more:
       the exit's own 'close' follows and settles the requests that were written to it. */
    child.stdin.on('error', (error) => {
      telemetry.lastWorkerError = `Bridge worker stdin failed: ${error.message}`
    })

    child.stderr.setEncoding?.('utf8')
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
      if (stderr.length > 20000) {
        stderr = stderr.slice(-20000)
      }
      if (isCurrent()) {
        state.stderr = stderr
      }
    })

    child.on('error', (error) => {
      const wrapped = new Error(`Bridge worker failed to start: ${error.message}`)
      telemetry.lastWorkerError = wrapped.message
      rejectPending(wrapped, child)
      if (isCurrent()) {
        stop()
      }
    })

    child.on('close', (code) => {
      const detail = [
        `Bridge worker exited with code ${code}`,
        `Python command: ${pythonCmd}`,
        `Bridge script: ${bridgeScript}`,
        `Bridge cwd: ${bridgeContext.projectRoot}`,
        `Bridge candidates: ${bridgeContext.candidates.join(' | ')}`,
        `stderr: ${stderr.trim() || '(empty)'}`,
      ].join('\n')
      telemetry.lastWorkerError = detail
      rejectPending(new Error(detail), child)
      if (isCurrent()) {
        stop()
      }
    })

    return child
  }

  function request(args) {
    return new Promise((resolve, reject) => {
      telemetry.workerRequestCount += 1

      let child
      try {
        child = start()
      } catch (error) {
        reject(error)
        return
      }

      const requestId = state.nextRequestId
      state.nextRequestId += 1

      const timeoutId = setTimeout(() => {
        const pending = state.pending.get(requestId)
        if (!pending) {
          return
        }
        telemetry.workerTimeoutCount += 1
        telemetry.workerFailureCount += 1
        telemetry.lastWorkerError = `Bridge worker request timed out after ${options.requestTimeoutMs}ms`
        state.pending.delete(requestId)
        pending.reject(new Error(`Bridge worker request timed out after ${options.requestTimeoutMs}ms`))

        // Only tear down the shared worker -- which rejects every other
        // unrelated in-flight request via the 'close' handler -- once it looks
        // genuinely unresponsive rather than just slow on this one request.
        // A timeout on a worker that has already been replaced counts for nothing.
        if (pending.child !== state.child) {
          return
        }
        state.consecutiveTimeouts += 1
        if (state.consecutiveTimeouts >= options.maxConsecutiveTimeouts) {
          stop()
        }
      }, options.requestTimeoutMs)

      state.pending.set(requestId, {
        resolve,
        reject,
        timeoutId,
        child,
      })

      try {
        child.stdin.write(`${JSON.stringify({ id: requestId, args })}\n`)
      } catch (error) {
        state.pending.delete(requestId)
        clearTimeout(timeoutId)
        reject(error)
      }
    })
  }

  return { state, start, stop, request }
}

// True when the worker answered with a non-zero code: the command ran and failed. By policy that is
// not replayed in a one-shot (audit 7 F2): most failures would repeat after a cold Python start, and
// a replay is how a write could save twice. A transient one (a locked database) now reaches the
// caller instead of being retried. Only a crash or a timeout falls back.
function isWorkerRefusal(error) {
  return Boolean(error) && typeof error.bridgeCode === 'number'
}

module.exports = { createBridgeWorker, isWorkerRefusal }
