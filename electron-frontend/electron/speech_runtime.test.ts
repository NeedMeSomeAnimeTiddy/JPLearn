// @vitest-environment node
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createSpeechRuntime } = require('./speech_runtime.cjs')

type Request = { id: number, audio_path: string, language: string }

/**
 * Stands in for the spawned `scripts/speech_recognition_server.py` process: records the
 * newline-JSON requests written to stdin and lets a test push responses back on stdout.
 */
class FakeSpeechProcess extends EventEmitter {
  readonly requests: Request[] = []
  killed = false
  exitCode: number | null = null
  signalCode: string | null = null
  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
  readonly stdin = Object.assign(new EventEmitter(), {
    write: (chunk: string) => {
      this.requests.push(JSON.parse(chunk))
      return true
    },
  })

  kill() {
    this.killed = true
  }

  respondText(id: number, text: string) {
    this.stdout.emit('data', Buffer.from(`${JSON.stringify({ id, text, avg_logprob: -0.2, duration_ms: 40 })}\n`))
  }

  exit() {
    this.exitCode = 0
    this.emit('close', 0)
  }
}

function createHarness(options: Record<string, unknown> = {}) {
  const spawned: FakeSpeechProcess[] = []
  const spawnFn = vi.fn(() => {
    const proc = new FakeSpeechProcess()
    spawned.push(proc)
    return proc
  })
  const runtime = createSpeechRuntime({
    spawnFn,
    resolveModelDir: () => 'C:/models/whisper/fast',
    ...options,
  })
  return { runtime, spawned, spawnFn }
}

afterEach(() => {
  vi.useRealTimers()
})

/* Audit 5, F5: the speech runtime now follows ARCHITECTURE §2's rules, as the OCR runtime does. */
describe('speech runtime', () => {
  it('says what to do when no model is installed', async () => {
    const { runtime, spawnFn } = createHarness({ resolveModelDir: () => null })
    await expect(runtime.transcribe('a.wav')).rejects.toThrow(/No speech recognition model installed/)
    expect(spawnFn).not.toHaveBeenCalled()
  })

  it('sends one clip at a time, so a waiting clip is not timed against another', async () => {
    const { runtime, spawned } = createHarness()
    const first = runtime.transcribe('one.wav')
    const second = runtime.transcribe('two.wav')
    await vi.waitFor(() => expect(spawned[0]?.requests).toHaveLength(1))
    expect(spawned[0].requests[0].audio_path).toBe('one.wav')

    spawned[0].respondText(spawned[0].requests[0].id, 'いち')
    await expect(first).resolves.toMatchObject({ text: 'いち' })
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(2))
    spawned[0].respondText(spawned[0].requests[1].id, 'に')
    await expect(second).resolves.toMatchObject({ text: 'に' })
    expect(spawned).toHaveLength(1)
  })

  it('kills the busy process on timeout so the next clip starts clean', async () => {
    vi.useFakeTimers()
    const { runtime, spawned } = createHarness({ requestTimeoutMs: 5000, coldRequestTimeoutMs: 5000 })

    const stalled = runtime.transcribe('slow.wav')
    const stalledSettled = expect(stalled).rejects.toThrow(/timed out after 5000ms/)
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(1))
    await vi.advanceTimersByTimeAsync(5000)
    await stalledSettled
    expect(spawned[0].killed).toBe(true)
    expect(runtime.getStatus()).toMatchObject({ running: false })

    const next = runtime.transcribe('next.wav')
    await vi.waitFor(() => expect(spawned).toHaveLength(2))
    spawned[1].respondText(spawned[1].requests[0].id, 'つぎ')
    await expect(next).resolves.toMatchObject({ text: 'つぎ' })
  })

  it('gives the model-loading first clip a longer budget than warm ones', async () => {
    vi.useFakeTimers()
    const { runtime, spawned } = createHarness({ requestTimeoutMs: 5000, coldRequestTimeoutMs: 60000 })

    const cold = runtime.transcribe('cold.wav')
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(1))
    await vi.advanceTimersByTimeAsync(30000)
    expect(spawned[0].killed).toBe(false)
    spawned[0].respondText(spawned[0].requests[0].id, 'おそい')
    await expect(cold).resolves.toMatchObject({ text: 'おそい' })

    const warm = runtime.transcribe('warm.wav')
    const warmSettled = expect(warm).rejects.toThrow(/timed out after 5000ms/)
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(2))
    await vi.advanceTimersByTimeAsync(5000)
    await warmSettled
  })

  it('does not fail the next clip when the killed process closes late', async () => {
    vi.useFakeTimers()
    const { runtime, spawned } = createHarness({ requestTimeoutMs: 5000, coldRequestTimeoutMs: 5000 })

    const stalled = runtime.transcribe('slow.wav')
    const stalledSettled = expect(stalled).rejects.toThrow(/timed out/)
    const queued = runtime.transcribe('queued.wav')
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(1))
    await vi.advanceTimersByTimeAsync(5000)
    await stalledSettled
    await vi.waitFor(() => expect(spawned[1]?.requests).toHaveLength(1))

    spawned[0].exit()
    expect(runtime.getStatus()).toMatchObject({ running: true })
    spawned[1].respondText(spawned[1].requests[0].id, 'まにあった')
    await expect(queued).resolves.toMatchObject({ text: 'まにあった' })
  })

  it('unloads the model once nothing is in flight for the inactivity window', async () => {
    vi.useFakeTimers()
    const { runtime, spawned } = createHarness({ inactivityUnloadMs: 15000 })

    const done = runtime.transcribe('a.wav')
    await vi.waitFor(() => expect(spawned[0].requests).toHaveLength(1))
    await vi.advanceTimersByTimeAsync(20000) // mid-request: not unloaded
    expect(spawned[0].killed).toBe(false)
    spawned[0].respondText(spawned[0].requests[0].id, 'はい')
    await done

    await vi.advanceTimersByTimeAsync(15000)
    expect(spawned[0].killed).toBe(true)
    expect(runtime.getStatus()).toMatchObject({ running: false })
  })

  it('restart stops the process so the next clip loads the model now chosen (F8)', async () => {
    const { runtime, spawned } = createHarness()
    const first = runtime.transcribe('a.wav')
    await vi.waitFor(() => expect(spawned[0]?.requests).toHaveLength(1))
    spawned[0].respondText(spawned[0].requests[0].id, 'a')
    await first

    runtime.restart()
    expect(spawned[0].killed).toBe(true)
    const next = runtime.transcribe('b.wav')
    await vi.waitFor(() => expect(spawned).toHaveLength(2))
    spawned[1].respondText(spawned[1].requests[0].id, 'b')
    await expect(next).resolves.toMatchObject({ text: 'b' })
  })

  it('restart waits for the old process to close, so an uninstall does not delete files it holds', async () => {
    const { runtime, spawned } = createHarness()
    const first = runtime.transcribe('a.wav')
    await vi.waitFor(() => expect(spawned[0]?.requests).toHaveLength(1))
    spawned[0].respondText(spawned[0].requests[0].id, 'a')
    await first

    let closed = false
    const restarted = runtime.restart().then(() => { closed = true })
    await Promise.resolve()
    expect(closed).toBe(false)
    spawned[0].exit()
    await restarted
    expect(closed).toBe(true)
  })
})
