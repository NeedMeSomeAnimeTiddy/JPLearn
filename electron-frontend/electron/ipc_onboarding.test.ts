// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const { registerIpcHandlers } = require('./ipc_handlers.cjs')

// Audit 12: the onboarding checklist seeds only what is ticked (F1), its errors reach the wizard
// unprefixed (F5), and the daily study time is checked (nit 2).

function createValidEvent() {
  const mainFrame = { url: 'file:///index.html' }
  return { sender: { id: 1, mainFrame }, senderFrame: mainFrame }
}

function register(overrides: Record<string, unknown> = {}) {
  const handlers = new Map()
  const order: string[] = []
  const options = {
    ipcMain: { handle: (channel: string, handler: unknown) => handlers.set(channel, handler) },
    isDev: false,
    appPageUrl: 'file:///index.html',
    getWindowFromSender: () => ({ id: 1, isDestroyed: () => false }),
    runPythonBridge: vi.fn(async () => ({})),
    runPythonBridgeWithArgs: vi.fn(async () => ({ ok: true })),
    runPythonBridgeWorkerOnly: vi.fn(async (args: string[]) => {
      order.push(args.join(' '))
      return { ok: true }
    }),
    answerQueue: {
      runExclusive: vi.fn(async (job: () => Promise<unknown>) => {
        order.push('exclusive')
        return job()
      }),
    },
    clearBridgeReadCaches: vi.fn(() => order.push('clear')),
    ...overrides,
  }
  registerIpcHandlers(options)
  return { handlers, options, order }
}

describe('study:apply-known-items (F1)', () => {
  it('seeds the ticked items on the worker, in turn with answers, then clears the cached reads', async () => {
    const { handlers, order } = register()
    await handlers.get('study:apply-known-items')(createValidEvent(), ['vocab_n5', 'kanji_n3'])
    expect(order).toEqual(['exclusive', 'apply-known-items vocab_n5 kanji_n3', 'clear'])
  })

  it('refuses an old level name before reaching the bridge', async () => {
    const { handlers, options } = register()
    await expect(handlers.get('study:apply-known-items')(createValidEvent(), ['jlpt_n5_foundation'])).rejects.toThrow(/invalid known item/i)
    expect(options.runPythonBridgeWorkerOnly).not.toHaveBeenCalled()
  })

  it('passes the bridge\'s reason through without a prefix (F5)', async () => {
    const { handlers } = register({ runPythonBridgeWorkerOnly: vi.fn(async () => { throw new Error('Bridge worker exited') }) })
    await expect(handlers.get('study:apply-known-items')(createValidEvent(), ['hiragana'])).rejects.toThrow(/^Bridge worker exited$/)
  })
})

describe('learning-path:complete-onboarding', () => {
  it('sends whole minutes and drops anything else (nit 2)', async () => {
    const { handlers, options } = register()
    await handlers.get('learning-path:complete-onboarding')(createValidEvent(), { goal: 'travel', dailyMinutes: 20, targetLevel: 'n5' })
    await handlers.get('learning-path:complete-onboarding')(createValidEvent(), { goal: 'travel', dailyMinutes: 1.5, targetLevel: 'n5' })
    expect(options.runPythonBridgeWithArgs).toHaveBeenNthCalledWith(1, ['complete-onboarding', 'travel', '20', 'n5'])
    expect(options.runPythonBridgeWithArgs).toHaveBeenNthCalledWith(2, ['complete-onboarding', 'travel', '', 'n5'])
  })

  it('passes the bridge\'s reason through without a prefix (F5)', async () => {
    const { handlers } = register({ runPythonBridgeWithArgs: vi.fn(async () => { throw new Error('database is locked') }) })
    await expect(handlers.get('learning-path:complete-onboarding')(createValidEvent(), {})).rejects.toThrow(/^database is locked$/)
  })
})
