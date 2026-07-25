/**
 * ocr_runtime.cjs — persistent PaddleOCR runtime for assistant-chat image drops.
 *
 * Before #74, `assistant-chat:extract-image-text` went through
 * `runPythonBridgeIsolated`: a fresh one-shot Python process per call, which
 * paid interpreter startup + the `paddleocr` import + engine initialization
 * every single time. The bridge's own engine cache could never be hit, because
 * the process it lived in never survived past one extraction.
 *
 * This spawns `scripts/ocr_server.py` once, lazily, and keeps it warm: requests
 * are newline-delimited JSON over stdin, responses matched back by an
 * incrementing id — the same shape `speech_runtime.cjs` uses. The engine load
 * is paid on the first extraction of a session and amortized over the rest,
 * and an inactivity timer unloads the (memory-hungry) process afterwards, the
 * way `llm_runtime.cjs` does for llama-server.
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

// A warm extraction is sub-second on the sample images, so two minutes means
// "something is wrong" rather than "this is a big image".
const DEFAULT_REQUEST_TIMEOUT_MS = 120000
// The first request on a freshly spawned process also pays interpreter startup,
// the paddleocr import, and engine init -- and engine init can reach out to BOS
// for PP-OCRv6 weights that are not in the paddlex cache yet, which is a
// download, not a computation. The old one-shot path had no timeout at all, so
// this budget is deliberately generous; it exists to stop a wedged process from
// hanging forever, not to bound honest work.
const DEFAULT_COLD_REQUEST_TIMEOUT_MS = 15 * 60 * 1000
const DEFAULT_INACTIVITY_UNLOAD_MS = 5 * 60 * 1000

function resolvePythonCommand(repoRoot) {
  const explicit = (process.env.JPLEARN_PYTHON || '').trim()
  if (explicit) return explicit

  const resourcesPath = (process.resourcesPath || '').trim()
  if (resourcesPath) {
    const bundled = path.join(resourcesPath, 'python-bundle', 'python', 'python.exe')
    if (fs.existsSync(bundled)) return bundled
  }

  const candidates = process.platform === 'win32'
    ? [path.join(repoRoot, '.venv', 'Scripts', 'python.exe')]
    : [path.join(repoRoot, '.venv', 'bin', 'python3'), path.join(repoRoot, '.venv', 'bin', 'python')]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return 'python'
}

function createOcrRuntime(options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..', '..')
  const scriptPath = options.scriptPath || path.join(repoRoot, 'scripts', 'ocr_server.py')
  const spawnFn = typeof options.spawnFn === 'function' ? options.spawnFn : spawn
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs)
    ? Math.max(5000, Math.floor(options.requestTimeoutMs))
    : DEFAULT_REQUEST_TIMEOUT_MS
  const coldRequestTimeoutMs = Number.isFinite(options.coldRequestTimeoutMs)
    ? Math.max(requestTimeoutMs, Math.floor(options.coldRequestTimeoutMs))
    : Math.max(requestTimeoutMs, DEFAULT_COLD_REQUEST_TIMEOUT_MS)
  const inactivityUnloadMs = Number.isFinite(options.inactivityUnloadMs)
    ? Math.max(15000, Math.floor(options.inactivityUnloadMs))
    : DEFAULT_INACTIVITY_UNLOAD_MS

  let child = null
  let stdoutBuffer = ''
  let stderrTail = ''
  let nextRequestId = 1
  let pending = null
  let queueTail = Promise.resolve()
  let unloadTimer = null
  let lastError = null
  let loadedAtUtc = null
  let lastUsedAtUtc = null
  let extractionCount = 0
  let inFlightCount = 0
  // Whether the current child has answered anything yet, i.e. whether its
  // engine is already built. Resets with the process, not with the runtime.
  let childHasResponded = false

  function clearUnloadTimer() {
    if (unloadTimer) {
      clearTimeout(unloadTimer)
      unloadTimer = null
    }
  }

  // Armed only once every extraction has settled -- including ones still
  // waiting their turn in the queue -- so the timer can never fire mid-request
  // and kill the process out from under it.
  function scheduleInactivityUnload() {
    clearUnloadTimer()
    if (inFlightCount > 0 || !child) {
      return
    }
    unloadTimer = setTimeout(() => {
      unloadTimer = null
      stopChild()
    }, inactivityUnloadMs)
  }

  function rejectPending(error) {
    const entry = pending
    pending = null
    if (!entry) return
    clearTimeout(entry.timer)
    entry.reject(error)
  }

  function stopChild() {
    const current = child
    child = null
    stdoutBuffer = ''
    loadedAtUtc = null
    childHasResponded = false
    if (!current) return
    try {
      current.kill()
    } catch {
      // Process may already be gone.
    }
  }

  function handleStdoutData(chunk) {
    stdoutBuffer += chunk.toString()
    let newlineIndex = stdoutBuffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim()
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
      newlineIndex = stdoutBuffer.indexOf('\n')
      if (!line) continue

      let parsed
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }
      if (!pending || parsed.id !== pending.id) {
        continue
      }
      const entry = pending
      pending = null
      clearTimeout(entry.timer)
      // Any answer -- success or a reported extraction failure -- proves the
      // engine finished loading, so later requests get the shorter budget.
      childHasResponded = true
      if (parsed.ok && parsed.payload && typeof parsed.payload === 'object') {
        entry.resolve(parsed.payload)
      } else {
        entry.reject(new Error(typeof parsed.error === 'string' && parsed.error ? parsed.error : 'OCR extraction failed'))
      }
    }
  }

  function ensureStarted() {
    if (child) return

    if (!fs.existsSync(scriptPath)) {
      throw new Error(`OCR server script not found: ${scriptPath}`)
    }

    const pythonCmd = resolvePythonCommand(repoRoot)
    // Inherit the environment unchanged: scripts/ocr_extraction.py resolves its
    // model-root candidates from JPLEARN_ASSETS_DIR / JPLEARN_USER_DATA_DIR /
    // JPLEARN_DOCUMENTS_DIR, exactly as the old isolated spawn did.
    const proc = spawnFn(pythonCmd, [scriptPath], {
      cwd: repoRoot,
      env: { ...process.env },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    proc.stdout.on('data', handleStdoutData)
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim()
      if (!text) return
      stderrTail = `${stderrTail}${stderrTail ? '\n' : ''}${text}`.slice(-4000)
    })
    proc.on('error', (error) => {
      lastError = error.message
      if (child === proc) {
        child = null
        loadedAtUtc = null
      }
      rejectPending(new Error(`OCR runtime failed to start: ${error.message}`))
    })
    proc.on('close', () => {
      if (child === proc) {
        child = null
        loadedAtUtc = null
        stdoutBuffer = ''
      }
      rejectPending(new Error(
        `OCR runtime exited unexpectedly${stderrTail ? `: ${stderrTail}` : ''}`,
      ))
    })

    child = proc
    loadedAtUtc = new Date().toISOString()
  }

  function sendRequest(imagePath, minConfidence) {
    ensureStarted()
    const proc = child
    const id = nextRequestId++

    const timeoutMs = childHasResponded ? requestTimeoutMs : coldRequestTimeoutMs

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!pending || pending.id !== id) return
        pending = null
        lastError = `OCR extraction timed out after ${timeoutMs}ms`
        // The Python loop is single-threaded and still chewing on this image,
        // so a surviving process would just start the next request's clock
        // against a busy engine. Kill it; the next call spawns a fresh one.
        stopChild()
        reject(new Error(lastError))
      }, timeoutMs)

      pending = { id, resolve, reject, timer }

      try {
        proc.stdin.write(`${JSON.stringify({ id, image_path: imagePath, min_confidence: minConfidence })}\n`)
      } catch (error) {
        pending = null
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  return {
    /**
     * Extract text from an image file. Calls are serialized: the Python server
     * handles one request at a time, so queueing here keeps request timeouts
     * meaningful instead of counting time spent waiting behind another image.
     */
    async extractText(imagePath, minConfidence = 0.3) {
      const trimmedPath = typeof imagePath === 'string' ? imagePath.trim() : ''
      if (!trimmedPath) {
        throw new Error('OCR image path is required')
      }
      const confidence = Number.isFinite(minConfidence) ? Math.max(0, Math.min(1, Number(minConfidence))) : 0.3

      clearUnloadTimer()
      inFlightCount += 1
      // queueTail never rejects (normalized below), so the next request always
      // gets its turn even when this one fails.
      const run = queueTail.then(() => sendRequest(trimmedPath, confidence))
      queueTail = run.then(() => undefined, () => undefined)

      try {
        const payload = await run
        lastError = null
        lastUsedAtUtc = new Date().toISOString()
        extractionCount += 1
        return payload
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        throw error
      } finally {
        inFlightCount -= 1
        scheduleInactivityUnload()
      }
    },

    getStatus() {
      return {
        running: child !== null,
        loadedAtUtc,
        lastUsedAtUtc,
        extractionCount,
        inactivityUnloadMs,
        lastError,
      }
    },

    unload() {
      clearUnloadTimer()
      stopChild()
      return { ok: true }
    },
  }
}

module.exports = { createOcrRuntime }
