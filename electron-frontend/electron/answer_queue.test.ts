// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createAnswerQueue, createUnsavedAnswersQuitGuard, INVALID_ANSWER_CODE, WAITING_FOR_SAVES_MESSAGE } = require('./answer_queue.cjs')

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function bridgeError(message: string, code = 2) {
  const error = new Error(message) as Error & { bridgeCode?: number }
  error.bridgeCode = code
  return error
}

function setup(send: (args: string[]) => Promise<unknown>) {
  const events: { channel: string; payload: any }[] = []
  const queue = createAnswerQueue({
    send,
    broadcast: (channel: string, payload: unknown) => events.push({ channel, payload }),
    retryDelaysMs: [30_000, 60_000, 120_000],
  })
  const saved = () => events.filter((e) => e.channel === 'study:answer-saved').map((e) => e.payload.answerId)
  const rejected = () => events.filter((e) => e.channel === 'study:answer-rejected').map((e) => e.payload)
  return { queue, events, saved, rejected }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const args = (id: string) => ['record-result', 'hiragana', '1', '1', '', '', '', '', id, 't', 'd']

afterEach(() => {
  vi.useRealTimers()
})

describe('answer queue', () => {
  it('saves answers one at a time, in the order they were given', async () => {
    const sent: string[] = []
    const { queue, saved } = setup(async (a) => { sent.push(a[8]); return { ok: true } })

    for (const id of ['a', 'b', 'c']) queue.enqueue(id, args(id), 'hiragana:1')
    await flush()

    expect(sent).toEqual(['a', 'b', 'c'])
    expect(saved()).toEqual(['a', 'b', 'c'])
    expect(queue.snapshot().count).toBe(0)
  })

  it('counts an answer the moment it is admitted, even while another is being sent', async () => {
    const first = deferred<unknown>()
    const { queue } = setup((a) => (a[8] === 'a' ? first.promise : Promise.resolve({ ok: true })))

    queue.enqueue('a', args('a'), 'k')
    queue.enqueue('b', args('b'), 'k')
    queue.enqueue('c', args('c'), 'k')
    expect(queue.snapshot().count).toBe(3)
    expect(queue.snapshot().pending.map((p: { answerId: string }) => p.answerId)).toEqual(['a', 'b', 'c'])

    first.resolve({ ok: true })
    await flush()
    expect(queue.snapshot().count).toBe(0)
  })

  it('keeps a failed answer at the head, sends nothing behind it, and never drops one', async () => {
    vi.useFakeTimers()
    let failing = true
    const sent: string[] = []
    const { queue, saved } = setup(async (a) => {
      sent.push(a[8])
      if (failing) throw bridgeError('database is locked')
      return { ok: true }
    })

    for (let index = 0; index < 12; index += 1) queue.enqueue(`id-${index}`, args(`id-${index}`), 'k')
    await vi.advanceTimersByTimeAsync(0)
    expect(queue.snapshot().count).toBe(12)
    expect(new Set(sent)).toEqual(new Set(['id-0']))
    expect(queue.snapshot().headError).toBe('database is locked')

    failing = false
    await vi.advanceTimersByTimeAsync(30_000)
    expect(saved()).toEqual(Array.from({ length: 12 }, (_, index) => `id-${index}`))
  })

  it('backs off 30, 60 then 120 seconds between automatic retries', async () => {
    vi.useFakeTimers()
    const send = vi.fn(async () => { throw bridgeError('timeout') })
    const { queue } = setup(send)

    queue.enqueue('a', args('a'), 'k')
    await vi.advanceTimersByTimeAsync(0)
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(send).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(send).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(send).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(send).toHaveBeenCalledTimes(5)
  })

  it('lets a failed head wait out its backoff while the learner keeps answering', async () => {
    vi.useFakeTimers()
    const send = vi.fn(async (_a: string[]) => { throw bridgeError('database is locked') })
    const { queue } = setup(send)

    queue.enqueue('a', args('a'), 'k')
    await vi.advanceTimersByTimeAsync(0)
    queue.enqueue('b', args('b'), 'k')
    queue.enqueue('c', args('c'), 'k')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(send).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][0][8]).toBe('a')
  })

  it('retries at once when asked, and resends the answer unchanged', async () => {
    vi.useFakeTimers()
    const send = vi.fn(async (_a: string[]) => { throw bridgeError('timeout') })
    const { queue } = setup(send)

    queue.enqueue('a', args('a'), 'k')
    await vi.advanceTimersByTimeAsync(0)
    send.mockImplementationOnce(async () => ({ ok: true }))
    await queue.retryNow()

    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0])
    expect(queue.snapshot().count).toBe(0)
  })

  it('drops only an answer the bridge says can never save, and carries on', async () => {
    const { queue, saved, rejected } = setup(async (a) => {
      if (a[8] === 'bad') throw bridgeError('Unknown card id', INVALID_ANSWER_CODE)
      return { ok: true }
    })

    queue.enqueue('bad', args('bad'), 'k')
    queue.enqueue('good', args('good'), 'k')
    await flush()

    expect(rejected()).toEqual([expect.objectContaining({ answerId: 'bad', reason: 'invalid' })])
    expect(saved()).toEqual(['good'])
  })

  it('keeps an answer whose failure carries no code, or any code but 3', async () => {
    vi.useFakeTimers()
    const { queue, rejected } = setup(async () => { throw new Error('ValueError deep inside') })

    queue.enqueue('a', args('a'), 'k')
    await vi.advanceTimersByTimeAsync(0)

    expect(rejected()).toEqual([])
    expect(queue.snapshot().count).toBe(1)
  })

  it('admits a repeat of the same answer once, and refuses the same id for a different answer', async () => {
    const hold = deferred<unknown>()
    const send = vi.fn(() => hold.promise)
    const { queue } = setup(send)

    queue.enqueue('a', args('a'), 'k')
    expect(queue.enqueue('a', args('a'), 'k')).toEqual({ status: 'accepted', answerId: 'a' })
    expect(() => queue.enqueue('a', [...args('a').slice(0, 3), '0', ...args('a').slice(4)], 'k')).toThrow(/different answer/)
    expect(queue.snapshot().count).toBe(1)

    hold.resolve({ ok: true })
    await flush()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('reset waits for the answer in flight, then drops the waiting ones before it runs', async () => {
    const first = deferred<unknown>()
    const order: string[] = []
    const { queue, saved, rejected } = setup(async (a) => {
      order.push(`send ${a[8]}`)
      return a[8] === 'a' ? first.promise : { ok: true }
    })

    queue.enqueue('a', args('a'), 'k')
    queue.enqueue('b', args('b'), 'k')
    const reset = queue.runExclusive(async () => { order.push('reset'); return { ok: true } }, { dropPending: true })
    await flush()
    expect(order).toEqual(['send a'])

    first.resolve({ ok: true })
    await reset

    expect(order).toEqual(['send a', 'reset'])
    expect(saved()).toEqual(['a'])
    expect(rejected()).toEqual([expect.objectContaining({ answerId: 'b', reason: 'reset' })])
    expect(queue.snapshot().count).toBe(0)
  })

  it('refuses an import while an answer cannot be saved, and keeps every answer', async () => {
    vi.useFakeTimers()
    const { queue } = setup(async () => { throw bridgeError('database is locked') })
    queue.enqueue('a', args('a'), 'k')
    queue.enqueue('b', args('b'), 'k')
    await vi.advanceTimersByTimeAsync(0)

    const importer = vi.fn(async () => ({ ok: true }))
    await expect(queue.runExclusive(importer)).rejects.toThrow(WAITING_FOR_SAVES_MESSAGE)

    expect(importer).not.toHaveBeenCalled()
    expect(queue.snapshot().count).toBe(2)
  })

  it('runs an import once the waiting answers have saved, and answers given meanwhile wait for it', async () => {
    const order: string[] = []
    const importDone = deferred<unknown>()
    const { queue } = setup(async (a) => { order.push(`send ${a[8]}`); return { ok: true } })
    queue.enqueue('a', args('a'), 'k')

    const run = queue.runExclusive(async () => { order.push('import'); return importDone.promise })
    await flush()
    queue.enqueue('b', args('b'), 'k')
    expect(queue.snapshot().count).toBe(1)
    await flush()
    expect(order).toEqual(['send a', 'import'])

    importDone.resolve({ ok: true })
    await run
    await flush()
    expect(order).toEqual(['send a', 'import', 'send b'])
  })

  it('runs two exclusive operations one after the other, never together', async () => {
    const order: string[] = []
    const importDone = deferred<unknown>()
    const { queue } = setup(async () => ({ ok: true }))

    const importing = queue.runExclusive(async () => {
      order.push('import start')
      await importDone.promise
      order.push('import end')
    })
    const reset = queue.runExclusive(async () => { order.push('reset') }, { dropPending: true })
    await flush()
    expect(order).toEqual(['import start'])

    importDone.resolve(undefined)
    await Promise.all([importing, reset])
    expect(order).toEqual(['import start', 'import end', 'reset'])
  })

  it('sends nothing while an exclusive operation waits its turn behind another', async () => {
    const sent: string[] = []
    const first = deferred<unknown>()
    const { queue } = setup(async (a) => { sent.push(a[8]); return { ok: true } })

    const running = queue.runExclusive(() => first.promise)
    const waitingReset = queue.runExclusive(async () => ({ ok: true }), { dropPending: true })
    await flush()
    queue.enqueue('a', args('a'), 'k')
    await flush()
    expect(sent).toEqual([])

    first.resolve({ ok: true })
    await Promise.all([running, waitingReset])
    await flush()
    expect(sent).toEqual([])
    expect(queue.snapshot().count).toBe(0)
  })

  it('keeps working after an exclusive operation fails', async () => {
    const { queue, saved } = setup(async () => ({ ok: true }))
    await expect(queue.runExclusive(async () => { throw new Error('reset failed') }, { dropPending: true }))
      .rejects.toThrow('reset failed')

    queue.enqueue('a', args('a'), 'k')
    await flush()
    expect(saved()).toEqual(['a'])
  })
})

describe('quitting with answers waiting', () => {
  function guardWith(count: number, response: number) {
    const showMessageBox = vi.fn(async (_options: { message: string }) => ({ response }))
    const quit = vi.fn()
    const cancelQuit = vi.fn()
    const retryNow = vi.fn(async () => undefined)
    const mayQuit = createUnsavedAnswersQuitGuard({
      queue: { snapshot: () => ({ count }), retryNow }, showMessageBox, quit, cancelQuit,
    })
    return { mayQuit, showMessageBox, quit, cancelQuit, retryNow }
  }

  it('lets the app quit when nothing is waiting', () => {
    const { mayQuit, showMessageBox } = guardWith(0, 0)
    expect(mayQuit()).toBe(true)
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('asks first, and "Wait and retry" cancels the quit so closing the window hides it again', async () => {
    const { mayQuit, showMessageBox, quit, cancelQuit, retryNow } = guardWith(2, 0)
    expect(mayQuit()).toBe(false)
    expect(mayQuit()).toBe(false)
    await flush()

    expect(showMessageBox).toHaveBeenCalledOnce()
    expect(showMessageBox.mock.calls[0][0].message).toBe("2 answers aren't saved yet. Quit anyway?")
    expect(cancelQuit).toHaveBeenCalled()
    expect(retryNow).toHaveBeenCalledOnce()
    expect(quit).not.toHaveBeenCalled()
  })

  it('quits on "Quit anyway" and does not ask twice', async () => {
    const { mayQuit, quit } = guardWith(1, 1)
    expect(mayQuit()).toBe(false)
    await flush()
    expect(quit).toHaveBeenCalledOnce()
    expect(mayQuit()).toBe(true)
  })
})
