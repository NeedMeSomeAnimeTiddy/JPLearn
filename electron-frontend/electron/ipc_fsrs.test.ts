// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

const { registerIpcHandlers } = require('./ipc_handlers.cjs')

function createValidEvent() {
  const mainFrame = { url: 'file:///index.html' }
  return { sender: { id: 1, mainFrame }, senderFrame: mainFrame }
}

function registerOptimizeHandler(overrides = {}) {
  const handlers = new Map()
  const options = {
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    isDev: false,
    getWindowFromSender: () => ({ id: 1, isDestroyed: () => false }),
    runPythonBridge: vi.fn(),
    runPythonBridgeWithArgs: vi.fn(async () => ({ ok: true, is_custom: true })),
    runPythonBridgeIsolated: vi.fn(async () => ({ ok: true })),
    ...overrides,
  }
  registerIpcHandlers(options)
  return { optimize: handlers.get('fsrs:optimize'), options }
}

describe('fsrs:optimize', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reloads the worker weights after a successful optimize', async () => {
    const result = { ok: true, new_weights: [1, 2] }
    const { optimize, options } = registerOptimizeHandler({
      runPythonBridgeIsolated: vi.fn(async () => result),
    })

    await expect(optimize(createValidEvent())).resolves.toBe(result)

    expect(options.runPythonBridgeIsolated).toHaveBeenCalledWith(['fsrs-optimize'])
    expect(options.runPythonBridgeWithArgs).toHaveBeenCalledWith(['fsrs-reload-weights'])
  })

  it('starts the reload only after optimize settles, and answers only after the reload', async () => {
    let finishOptimize: (value: unknown) => void = () => {}
    let finishReload: (value: unknown) => void = () => {}
    const { optimize, options } = registerOptimizeHandler({
      runPythonBridgeIsolated: vi.fn(() => new Promise((resolve) => { finishOptimize = resolve })),
      runPythonBridgeWithArgs: vi.fn(() => new Promise((resolve) => { finishReload = resolve })),
    })
    let answered = false
    const pending = optimize(createValidEvent()).then((value: unknown) => {
      answered = true
      return value
    })

    await Promise.resolve()
    expect(options.runPythonBridgeWithArgs).not.toHaveBeenCalled()

    finishOptimize({ ok: true })
    await vi.waitFor(() => expect(options.runPythonBridgeWithArgs).toHaveBeenCalledTimes(1))
    expect(answered).toBe(false)

    finishReload({ ok: true, is_custom: true })
    await expect(pending).resolves.toEqual({ ok: true })
  })

  it('does not reload when optimize reports it saved nothing', async () => {
    const result = { ok: false, error: 'Insufficient review data (need 5+ cards with 2+ reviews).' }
    const { optimize, options } = registerOptimizeHandler({
      runPythonBridgeIsolated: vi.fn(async () => result),
    })

    await expect(optimize(createValidEvent())).resolves.toBe(result)

    expect(options.runPythonBridgeWithArgs).not.toHaveBeenCalled()
  })

  it('does not reload when the optimize process fails', async () => {
    const { optimize, options } = registerOptimizeHandler({
      runPythonBridgeIsolated: vi.fn(async () => {
        throw new Error('optimize crashed')
      }),
    })

    await expect(optimize(createValidEvent())).rejects.toThrow('optimize crashed')

    expect(options.runPythonBridgeWithArgs).not.toHaveBeenCalled()
  })

  it('logs a failed reload and still returns the optimize result', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = { ok: true, new_weights: [1, 2] }
    const { optimize } = registerOptimizeHandler({
      runPythonBridgeIsolated: vi.fn(async () => result),
      runPythonBridgeWithArgs: vi.fn(async () => {
        throw new Error('worker down')
      }),
    })

    await expect(optimize(createValidEvent())).resolves.toBe(result)

    expect(errorLog).toHaveBeenCalled()
  })
})
