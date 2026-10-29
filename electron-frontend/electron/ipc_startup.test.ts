// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const { registerIpcHandlers } = require('./ipc_handlers.cjs')

// Audit 11: leaving the setup wizard, the tutor warmup, and reads that save progress.

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
    runPythonBridge: vi.fn(async (command: string) => ({ command })),
    runPythonBridgeWithArgs: vi.fn(async () => ({})),
    runPythonBridgeWorkerOnly: vi.fn(async (args: string[]) => {
      order.push(args[0])
      return {}
    }),
    clearBridgeReadCaches: vi.fn((commands?: string[]) => order.push(commands ? `clear:${commands.join(',')}` : 'clear')),
    refreshTutorChatRuntime: vi.fn(async () => { order.push('refresh-tutor') }),
    setupRuntime: {
      writeSentinel: vi.fn(() => { order.push('sentinel') }),
      isFirstRun: () => true,
    },
    ...overrides,
  }
  registerIpcHandlers(options)
  return { handlers, options, order }
}

describe('leaving the setup wizard (F2)', () => {
  it.each(['setup:complete', 'setup:skip'])('%s writes the first-run marker before asking the bridge', async (route) => {
    const { handlers, order } = register()
    await expect(handlers.get(route)(createValidEvent())).resolves.toEqual({ ok: true })
    expect(order.slice(0, 3)).toEqual(['sentinel', 'mark-onboarding-pending', 'clear'])
  })

  it.each(['setup:complete', 'setup:skip'])('%s still lets the learner out when the bridge is down', async (route) => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { handlers, options } = register({
      runPythonBridgeWorkerOnly: vi.fn(async () => { throw new Error('Bridge worker exited') }),
    })
    await expect(handlers.get(route)(createValidEvent())).resolves.toEqual({ ok: true })
    expect(options.setupRuntime.writeSentinel).toHaveBeenCalledTimes(1)
    expect(errorLog).toHaveBeenCalled()
    errorLog.mockRestore()
  })

  it('asks the worker only, with a time limit, never the one-shot fallback', async () => {
    const { handlers, options } = register()
    await handlers.get('setup:skip')(createValidEvent())
    expect(options.runPythonBridgeWithArgs).not.toHaveBeenCalled()
    expect(options.runPythonBridgeWorkerOnly).toHaveBeenCalledWith(['mark-onboarding-pending'], { timeoutMs: 10_000 })
  })

  it('a failed marker write is the learner\'s to see', async () => {
    const { handlers } = register({
      setupRuntime: { writeSentinel: () => { throw new Error('EACCES') }, isFirstRun: () => true },
    })
    await expect(handlers.get('setup:skip')(createValidEvent())).rejects.toThrow('EACCES')
  })
})

describe('the tutor warmup (F3)', () => {
  it('goes through the main process warmup, which also reads back the chat history', async () => {
    const preloadTutorChat = vi.fn(async () => ({ ok: true, loaded: true }))
    const { handlers } = register({ preloadTutorChat })
    await expect(handlers.get('assistant-chat:preload')(createValidEvent())).resolves.toEqual({ ok: true, loaded: true })
    expect(preloadTutorChat).toHaveBeenCalledTimes(1)
  })
})

describe('reads that save progress (design critic M1)', () => {
  it.each([
    ['progression:get-state', 'progression'],
    ['features:get-state', 'feature-unlocks'],
    ['achievements:get-milestones', 'achievement-milestones'],
  ])('%s forgets the cached progress reads after answering', async (route, command) => {
    const { handlers, options, order } = register()
    await expect(handlers.get(route)(createValidEvent())).resolves.toEqual({ command })
    expect(options.runPythonBridge).toHaveBeenCalledWith(command)
    expect(order).toEqual(['clear:xp-progress,recommendations,learning-path-status'])
  })
})

// Audit 14 review, finding 4: a setup route recreates the tutor runtime (cancelling a reply or a
// translation in progress) only when the provider, server or model it would use changed.
describe('recreating the tutor runtime after setup (audit 14)', () => {
  it('leaves the runtime alone when the selection changes nothing it uses', async () => {
    const { handlers, options } = register({
      setupRuntime: { setActiveTranslationModelTier: vi.fn(() => ({ ok: true, tier: 'qwen_ja_en' })) },
    })
    await handlers.get('setup:set-active-translation-model')(createValidEvent(), 'qwen_ja_en')
    expect(options.refreshTutorChatRuntime).not.toHaveBeenCalled()
  })

  it('recreates it when what it would use changed', async () => {
    const previous = process.env.JPLEARN_TUTOR_PROVIDER
    try {
      process.env.JPLEARN_TUTOR_PROVIDER = 'stub'
      const { handlers, options } = register({
        setupRuntime: {
          setActiveTranslationModelTier: vi.fn(() => {
            process.env.JPLEARN_TUTOR_PROVIDER = 'llama.cpp'
            return { ok: true, tier: 'qwen_ja_en' }
          }),
        },
      })
      await handlers.get('setup:set-active-translation-model')(createValidEvent(), 'qwen_ja_en')
      expect(options.refreshTutorChatRuntime).toHaveBeenCalledTimes(1)
    } finally {
      if (previous === undefined) delete process.env.JPLEARN_TUTOR_PROVIDER
      else process.env.JPLEARN_TUTOR_PROVIDER = previous
    }
  })
})
