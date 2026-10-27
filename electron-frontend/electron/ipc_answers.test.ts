// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const { registerIpcHandlers } = require('./ipc_handlers.cjs')
const { createAnswerQueue } = require('./answer_queue.cjs')

const ANSWER = {
  answerId: '0b6f1c1e-3f7a-4c1e-9d55-1a2b3c4d5e6f',
  answeredAtUtc: new Date().toISOString(),
  answeredLocalDate: (() => {
    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  })(),
}

function createValidEvent() {
  const mainFrame = { url: 'file:///index.html' }
  return { sender: { id: 1, mainFrame }, senderFrame: mainFrame }
}

function register(send: (args: string[]) => Promise<unknown>) {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  const broadcast = vi.fn()
  const answerQueue = createAnswerQueue({ send, broadcast })
  const options = {
    ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(channel, handler) },
    isDev: false,
    getWindowFromSender: () => ({ id: 1, isDestroyed: () => false }),
    runPythonBridge: vi.fn(async () => ({ ok: true })),
    runPythonBridgeWithArgs: vi.fn(async () => ({ ok: true })),
    runPythonBridgeWorkerOnly: vi.fn(async () => ({ ok: true })),
    answerQueue,
  }
  registerIpcHandlers(options)
  return { handlers, options, answerQueue, broadcast }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('answer IPC', () => {
  it('admits an answer at once and sends the full record-result argv to the worker', async () => {
    const send = vi.fn(async () => ({ ok: true }))
    const { handlers, broadcast } = register(send)

    const reply = await handlers.get('study:record-game-result')!(createValidEvent(), {
      slug: 'hiragana', cardId: 12, isCorrect: false, minigame: 'romaji_sprint', confidenceScore: 3, ...ANSWER,
    })
    await flush()

    expect(reply).toEqual({ status: 'accepted', answerId: ANSWER.answerId })
    expect(send).toHaveBeenCalledWith([
      'record-result', 'hiragana', '12', '0', 'romaji_sprint', '', '', '3',
      ANSWER.answerId, ANSWER.answeredAtUtc, ANSWER.answeredLocalDate,
    ])
    expect(broadcast).toHaveBeenCalledWith('study:answer-saved', expect.objectContaining({
      answerId: ANSWER.answerId, cardKey: 'hiragana:12',
    }))
  })

  it('refuses an answer without an identity before it reaches the queue', async () => {
    const send = vi.fn(async () => ({ ok: true }))
    const { handlers, answerQueue } = register(send)

    await expect(handlers.get('study:record-game-result')!(createValidEvent(), {
      slug: 'hiragana', cardId: 12, isCorrect: true, minigame: '',
    })).rejects.toThrow(/answerId/)
    expect(answerQueue.snapshot().count).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('resets through the worker alone, after dropping the answers still waiting', async () => {
    const { handlers, options, answerQueue } = register(async () => { throw new Error('locked') })
    answerQueue.enqueue('x', ['record-result'], 'k')
    await flush()

    await handlers.get('study:reset-db')!(createValidEvent())

    expect(options.runPythonBridgeWorkerOnly).toHaveBeenCalledWith(['reset-db'])
    expect(options.runPythonBridge).not.toHaveBeenCalled()
    expect(answerQueue.snapshot().count).toBe(0)
  })

  it('reports the queue and retries it on request', async () => {
    const send = vi.fn(async () => { throw new Error('locked') })
    const { handlers, answerQueue } = register(send)
    answerQueue.enqueue('x', ['record-result'], 'k')
    await flush()

    const snapshot = await handlers.get('study:get-pending-answers')!(createValidEvent()) as { count: number }
    expect(snapshot.count).toBe(1)
    await handlers.get('study:retry-pending-answers')!(createValidEvent())
    await flush()
    expect(send).toHaveBeenCalledTimes(2)
  })
})
