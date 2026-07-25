// @vitest-environment node
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createOcrRuntime } = require('./ocr_runtime.cjs')

type Request = { id: number, image_path: string, min_confidence: number }

/**
 * Stands in for the spawned `scripts/ocr_server.py` process: records the
 * newline-JSON requests written to stdin and lets a test push responses back
 * on stdout, so the runtime's process lifecycle can be driven deterministically.
 */
class FakeOcrProcess extends EventEmitter {
  readonly requests: Request[] = []
  killed = false
  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
  readonly stdin = {
    write: (chunk: string) => {
      this.requests.push(JSON.parse(chunk))
      return true
    },
  }

  kill() {
    this.killed = true
  }

  respond(payload: Record<string, unknown>) {
    this.stdout.emit('data', Buffer.from(`${JSON.stringify(payload)}\n`))
  }

  respondOk(id: number, text: string) {
    this.respond({ id, ok: true, payload: { ok: true, text, lineCount: 1, lines: [] } })
  }

  exit() {
    this.emit('close', 0)
  }
}

function createHarness(options: Record<string, unknown> = {}) {
  const spawned: FakeOcrProcess[] = []
  const spawnFn = vi.fn(() => {
    const proc = new FakeOcrProcess()
    spawned.push(proc)
    return proc
  })
  const runtime = createOcrRuntime({
    // The real path is only used for the existence check before spawning.
    scriptPath: __filename,
    spawnFn,
    ...options,
  })
  return { runtime, spawned, spawnFn }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ocr runtime', () => {
  it('does not spawn anything until the first extraction', () => {
    const { runtime, spawnFn } = createHarness()

    expect(spawnFn).not.toHaveBeenCalled()
    expect(runtime.getStatus()).toMatchObject({ running: false, extractionCount: 0 })
  })

  it('reuses one warm process across extractions — the point of the runtime', async () => {
    const { runtime, spawned, spawnFn } = createHarness()

    const first = runtime.extractText('a.png', 0.3)
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(1))
    spawned[0].respondOk(spawned[0].requests[0].id, 'first')
    await expect(first).resolves.toEqual({ ok: true, text: 'first', lineCount: 1, lines: [] })

    const second = runtime.extractText('b.png', 0.5)
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(2))
    spawned[0].respondOk(spawned[0].requests[1].id, 'second')
    await expect(second).resolves.toMatchObject({ text: 'second' })

    expect(spawnFn).toHaveBeenCalledTimes(1)
    expect(spawned).toHaveLength(1)
    expect(spawned[0].requests.map((request) => request.image_path)).toEqual(['a.png', 'b.png'])
    expect(spawned[0].requests.map((request) => request.min_confidence)).toEqual([0.3, 0.5])
    expect(runtime.getStatus()).toMatchObject({ running: true, extractionCount: 2, lastError: null })
  })

  it('serializes concurrent extractions instead of interleaving them on one stdin', async () => {
    const { runtime, spawned } = createHarness()

    const first = runtime.extractText('a.png')
    const second = runtime.extractText('b.png')

    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(1))
    expect(spawned[0].requests[0].image_path).toBe('a.png')

    spawned[0].respondOk(spawned[0].requests[0].id, 'first')
    await expect(first).resolves.toMatchObject({ text: 'first' })

    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(2))
    spawned[0].respondOk(spawned[0].requests[1].id, 'second')
    await expect(second).resolves.toMatchObject({ text: 'second' })
  })

  it('surfaces a server-reported extraction error without killing the process', async () => {
    const { runtime, spawned } = createHarness()

    const failing = runtime.extractText('broken.png')
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(1))
    spawned[0].respond({ id: spawned[0].requests[0].id, ok: false, error: 'Unsupported or corrupted image format' })
    await expect(failing).rejects.toThrow(/Unsupported or corrupted image format/)

    expect(spawned[0].killed).toBe(false)
    expect(runtime.getStatus()).toMatchObject({ running: true })

    const recovered = runtime.extractText('good.png')
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(2))
    spawned[0].respondOk(spawned[0].requests[1].id, 'ok')
    await expect(recovered).resolves.toMatchObject({ text: 'ok' })
    expect(spawned).toHaveLength(1)
  })

  it('respawns after the server process dies mid-extraction', async () => {
    const { runtime, spawned } = createHarness()

    const inFlight = runtime.extractText('a.png')
    const inFlightSettled = expect(inFlight).rejects.toThrow(/exited unexpectedly.*paddleocr/s)
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(1))
    spawned[0].stderr.emit('data', Buffer.from('ModuleNotFoundError: paddleocr'))
    spawned[0].exit()

    await inFlightSettled
    expect(runtime.getStatus()).toMatchObject({ running: false })

    const retried = runtime.extractText('a.png')
    await vi.waitFor(() => expect(spawned).toHaveLength(2))
    spawned[1].respondOk(spawned[1].requests[0].id, 'after respawn')
    await expect(retried).resolves.toMatchObject({ text: 'after respawn' })
  })

  it('kills the busy process on timeout so the next request starts clean', async () => {
    vi.useFakeTimers()
    const { runtime, spawned } = createHarness({ requestTimeoutMs: 5000, coldRequestTimeoutMs: 5000 })

    const stalled = runtime.extractText('slow.png')
    // Attach the rejection handler before advancing the clock, so the timeout
    // rejection is never momentarily unhandled.
    const stalledSettled = expect(stalled).rejects.toThrow(/timed out after 5000ms/)
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(1))

    await vi.advanceTimersByTimeAsync(5000)
    await stalledSettled
    expect(spawned[0].killed).toBe(true)
    expect(runtime.getStatus()).toMatchObject({ running: false })

    const next = runtime.extractText('next.png')
    await vi.waitFor(() => expect(spawned).toHaveLength(2))
    spawned[1].respondOk(spawned[1].requests[0].id, 'fresh')
    await expect(next).resolves.toMatchObject({ text: 'fresh' })
  })

  it('gives the engine-loading first request a longer budget than warm ones', async () => {
    vi.useFakeTimers()
    const { runtime, spawned } = createHarness({ requestTimeoutMs: 5000, coldRequestTimeoutMs: 60000 })

    // Cold: engine init can involve downloading model weights, so 5s must not
    // be enough to kill it.
    const cold = runtime.extractText('first.png')
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(1))
    await vi.advanceTimersByTimeAsync(30000)
    expect(spawned[0].killed).toBe(false)
    spawned[0].respondOk(spawned[0].requests[0].id, 'cold')
    await expect(cold).resolves.toMatchObject({ text: 'cold' })

    // Warm: the engine is built, so the short budget applies.
    const warm = runtime.extractText('second.png')
    const warmSettled = expect(warm).rejects.toThrow(/timed out after 5000ms/)
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(2))
    await vi.advanceTimersByTimeAsync(5000)
    await warmSettled
    expect(spawned[0].killed).toBe(true)
  })

  it('restores the cold budget after the process is replaced', async () => {
    vi.useFakeTimers()
    const { runtime, spawned } = createHarness({ requestTimeoutMs: 5000, coldRequestTimeoutMs: 60000 })

    const first = runtime.extractText('a.png')
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(1))
    spawned[0].respondOk(spawned[0].requests[0].id, 'a')
    await first

    runtime.unload()

    // A fresh process has to rebuild the engine, so it gets the cold budget
    // again rather than inheriting the previous process's warm state.
    const afterRespawn = runtime.extractText('b.png')
    await vi.waitFor(() => expect(spawned).toHaveLength(2))
    await vi.advanceTimersByTimeAsync(30000)
    expect(spawned[1].killed).toBe(false)
    spawned[1].respondOk(spawned[1].requests[0].id, 'b')
    await expect(afterRespawn).resolves.toMatchObject({ text: 'b' })
  })

  it('unloads the idle process after the inactivity window', async () => {
    vi.useFakeTimers()
    const { runtime, spawned } = createHarness({ inactivityUnloadMs: 15000 })

    const done = runtime.extractText('a.png')
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(1))
    spawned[0].respondOk(spawned[0].requests[0].id, 'text')
    await done

    expect(runtime.getStatus()).toMatchObject({ running: true })
    await vi.advanceTimersByTimeAsync(15000)

    expect(spawned[0].killed).toBe(true)
    expect(runtime.getStatus()).toMatchObject({ running: false })
  })

  it('never unloads while an extraction is still in flight', async () => {
    vi.useFakeTimers()
    const { runtime, spawned } = createHarness({ inactivityUnloadMs: 15000, requestTimeoutMs: 600000 })

    const inFlight = runtime.extractText('slow.png')
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(1))

    await vi.advanceTimersByTimeAsync(60000)
    expect(spawned[0].killed).toBe(false)

    spawned[0].respondOk(spawned[0].requests[0].id, 'eventually')
    await expect(inFlight).resolves.toMatchObject({ text: 'eventually' })
  })

  it('never unloads while a queued extraction is still waiting its turn', async () => {
    vi.useFakeTimers()
    const { runtime, spawned } = createHarness({ inactivityUnloadMs: 15000, requestTimeoutMs: 600000 })

    const first = runtime.extractText('a.png')
    const queued = runtime.extractText('b.png')
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(1))

    // Settling the first request must not arm the unload timer while the
    // second is still queued behind it.
    spawned[0].respondOk(spawned[0].requests[0].id, 'first')
    await first
    await vi.advanceTimersByTimeAsync(60000)
    expect(spawned[0].killed).toBe(false)

    spawned[0].respondOk(spawned[0].requests[1].id, 'second')
    await expect(queued).resolves.toMatchObject({ text: 'second' })

    await vi.advanceTimersByTimeAsync(15000)
    expect(spawned[0].killed).toBe(true)
  })

  it('rejects an empty image path before spawning', async () => {
    const { runtime, spawnFn } = createHarness()

    await expect(runtime.extractText('   ')).rejects.toThrow(/image path is required/i)
    expect(spawnFn).not.toHaveBeenCalled()
  })

  it('fails clearly when the server script is missing', async () => {
    const { runtime, spawnFn } = createHarness({ scriptPath: 'C:/missing/ocr_server.py' })

    await expect(runtime.extractText('a.png')).rejects.toThrow(/OCR server script not found/)
    expect(spawnFn).not.toHaveBeenCalled()
  })

  it('stops the process on unload', async () => {
    const { runtime, spawned } = createHarness()

    const done = runtime.extractText('a.png')
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(1))
    spawned[0].respondOk(spawned[0].requests[0].id, 'text')
    await done

    expect(runtime.unload()).toEqual({ ok: true })
    expect(spawned[0].killed).toBe(true)
    expect(runtime.getStatus()).toMatchObject({ running: false })
  })
})
