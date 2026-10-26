// @vitest-environment node
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createBridgeWorker } = require('./bridge_worker.cjs')

type Request = { id: number, args: string[] }

/** Stands in for a spawned `desktop_bridge.py --server`: records requests, answers on demand. */
class FakeWorker extends EventEmitter {
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

  write(text: string) {
    this.stdout.emit('data', Buffer.from(text))
  }

  answer(id: number, payload: unknown) {
    this.write(`${JSON.stringify({ id, ok: true, code: 0, payload })}\n`)
  }

  close(code = 1) {
    this.emit('close', code)
  }
}

function createHarness(overrides: Record<string, unknown> = {}) {
  const spawned: FakeWorker[] = []
  const spawnFn = vi.fn(() => {
    const worker = new FakeWorker()
    spawned.push(worker)
    return worker
  })
  const telemetry = {
    workerStarts: 0,
    workerRequestCount: 0,
    workerSuccessCount: 0,
    workerFailureCount: 0,
    workerTimeoutCount: 0,
    lastWorkerError: null as string | null,
  }
  const bridge = createBridgeWorker({
    resolveContext: () => ({ bridgeScript: 'desktop_bridge.py', projectRoot: '.', candidates: ['desktop_bridge.py'] }),
    resolvePythonCommand: () => 'python',
    telemetry,
    requestTimeoutMs: 1000,
    maxConsecutiveTimeouts: 3,
    spawnFn,
    ...overrides,
  })
  return { bridge, spawned, telemetry }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('bridge worker', () => {
  it('answers requests by id through one worker', async () => {
    const { bridge, spawned } = createHarness()
    const first = bridge.request(['summary'])
    const second = bridge.request(['xp-progress'])
    expect(spawned).toHaveLength(1)
    const [a, b] = spawned[0].requests
    spawned[0].answer(b.id, { xp: 1 })
    spawned[0].answer(a.id, { decks: [] })
    await expect(first).resolves.toEqual({ decks: [] })
    await expect(second).resolves.toEqual({ xp: 1 })
  })

  it("an old worker's late close neither rejects the new worker's requests nor kills it", async () => {
    const { bridge, spawned } = createHarness()
    const onOld = bridge.request(['summary'])
    const old = spawned[0]

    bridge.stop() // replaced: setup refresh, or too many timeouts
    expect(old.killed).toBe(true)
    const onNew = bridge.request(['xp-progress'])
    const replacement = spawned[1]
    expect(replacement).toBeDefined()

    old.close(1) // ...and only now does the old process report its exit

    await expect(onOld).rejects.toThrow(/exited with code 1/)
    expect(replacement.killed).toBe(false)
    expect(bridge.state.child).toBe(replacement)
    expect(bridge.state.pending.size).toBe(1)

    replacement.answer(replacement.requests[0].id, { xp: 2 })
    await expect(onNew).resolves.toEqual({ xp: 2 })
  })

  it("an old worker's late 'error' leaves the new worker alone too", async () => {
    const { bridge, spawned } = createHarness()
    bridge.start()
    bridge.stop()
    const onNew = bridge.request(['summary'])
    spawned[0].emit('error', new Error('spawn EPERM'))
    expect(spawned[1].killed).toBe(false)
    spawned[1].answer(spawned[1].requests[0].id, 'ok')
    await expect(onNew).resolves.toBe('ok')
  })

  it("keeps each worker's half-written line to itself", async () => {
    const { bridge, spawned } = createHarness()
    bridge.start()
    bridge.stop()
    const onNew = bridge.request(['summary'])
    const replacement = spawned[1]
    spawned[0].write('{"id": 99, "ok": tr') // the old worker's last gasp, after the new one is up
    replacement.answer(replacement.requests[0].id, { decks: [] })
    await expect(onNew).resolves.toEqual({ decks: [] })
  })

  it("an answer arriving from a replaced worker settles that worker's own request", async () => {
    const { bridge, spawned } = createHarness()
    const onOld = bridge.request(['summary'])
    const old = spawned[0]
    bridge.stop()
    old.answer(old.requests[0].id, { late: true })
    await expect(onOld).resolves.toEqual({ late: true })
  })

  it('the current worker closing still rejects its requests and is replaced on the next one', async () => {
    const { bridge, spawned } = createHarness()
    const pending = bridge.request(['summary'])
    spawned[0].stderr.emit('data', Buffer.from('Traceback: boom'))
    spawned[0].close(2)
    await expect(pending).rejects.toThrow(/exited with code 2[\s\S]*Traceback: boom/)
    expect(bridge.state.child).toBeNull()
    void bridge.request(['summary']).catch(() => undefined)
    expect(spawned).toHaveLength(2)
  })

  it('tears down the worker after repeated timeouts, but not for timeouts on a replaced one', async () => {
    vi.useFakeTimers()
    const { bridge, spawned } = createHarness({ maxConsecutiveTimeouts: 2 })
    const onOld = bridge.request(['slow']).catch(() => undefined)
    bridge.stop()
    const onNew = bridge.request(['slow']).catch(() => undefined)
    vi.advanceTimersByTime(1000) // both time out; only the current worker's counts
    await Promise.all([onOld, onNew])
    expect(spawned[1].killed).toBe(false)
    const again = bridge.request(['slow']).catch(() => undefined)
    vi.advanceTimersByTime(1000)
    await again
    expect(spawned[1].killed).toBe(true)
  })
})
