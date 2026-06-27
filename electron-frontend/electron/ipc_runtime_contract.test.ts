// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const { registerIpcHandlers } = require('./ipc_handlers.cjs')

function createWindowMock() {
  return {
    id: 1,
    isDestroyed: () => false,
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    close: vi.fn(),
    restore: vi.fn(),
    setFullScreen: vi.fn(),
    setBounds: vi.fn(),
    isMinimized: () => false,
    isFullScreen: () => false,
    isMaximized: () => false,
    isSnapped: () => false,
  }
}

function createValidEvent(url = 'file:///index.html') {
  const mainFrame = { url }
  return {
    sender: {
      id: 1,
      mainFrame,
    },
    senderFrame: mainFrame,
  }
}

function createRegisteredHandlers(overrides = {}) {
  const handlers = new Map()
  const windowMock = createWindowMock()
  const defaults = {
    ipcMain: {
      handle: (channel, handler) => {
        handlers.set(channel, handler)
      },
    },
    isDev: false,
    getWindowFromSender: () => windowMock,
    runPythonBridge: vi.fn(),
    runPythonBridgeWithArgs: vi.fn(),
    saveStartupTheme: vi.fn((theme) => theme),
    normalizeStartupTelemetry: vi.fn((payload) => payload),
    startupTelemetryByContentsId: new Map(),
    startupReadyResolvers: new Map(),
    localTutorRuntime: {
      getStatus: vi.fn(() => ({ loaded: false, loadedAtUtc: null, lastUsedAtUtc: null, inactivityUnloadMs: 300000 })),
      preload: vi.fn(async () => ({ ok: true, reason: 'renderer-startup', coldStart: false, loaded: false })),
      sendMessage: vi.fn(async () => ({ ok: true, text: 'stub', provider: 'stub', model: 'stub', coldStart: false, elapsedMs: 0 })),
      unload: vi.fn(async () => ({ ok: true, reason: 'manual' })),
      cancelActiveInference: vi.fn(async () => ({ ok: true, cancelled: false, reason: 'renderer-cancel' })),
    },
    isWindowExpanded: vi.fn(() => false),
    getSafeRestoreBounds: vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
    windowRestoreBoundsById: new Map(),
  }

  const options = {
    ...defaults,
    ...overrides,
  }

  registerIpcHandlers(options)
  return {
    handlers,
    options,
  }
}

describe('ipc runtime contract', () => {
  it('rejects malformed record-game-result payloads before bridge dispatch', async () => {
    const { handlers, options } = createRegisteredHandlers()
    const handler = handlers.get('study:record-game-result')

    await expect(
      handler(createValidEvent(), {
        slug: 'hiragana',
        cardId: '0',
        isCorrect: true,
      }),
    ).rejects.toThrow(/Invalid cardId/i)

    expect(options.runPythonBridgeWithArgs).not.toHaveBeenCalled()
  })

  it('rejects untrusted senders before session-start bridge dispatch', async () => {
    const { handlers, options } = createRegisteredHandlers()
    const handler = handlers.get('study:start-session-goal')

    await expect(
      handler(createValidEvent('https://evil.example'), {
        targetItems: 5,
      }),
    ).rejects.toThrow(/untrusted URL/i)

    expect(options.runPythonBridgeWithArgs).not.toHaveBeenCalled()
  })

  it('wraps bridge failures with handler-specific study summary context', async () => {
    const { handlers } = createRegisteredHandlers({
      runPythonBridge: vi.fn().mockRejectedValue(new Error('bridge exploded')),
    })
    const handler = handlers.get('study:get-summary')

    await expect(handler(createValidEvent())).rejects.toThrow(/Failed to fetch study summary: bridge exploded/)
  })
})