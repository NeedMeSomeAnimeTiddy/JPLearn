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
    clearBridgeReadCaches: vi.fn(),
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
      generateCrosswordClues: vi.fn(async () => ({ ok: false, text: '' })),
    },
    localVoiceRuntime: {
      getStatus: vi.fn(() => ({ available: false, modelReady: false, downloading: false, downloadProgress: 0, modelName: 'voicevox:unavailable', lastError: null })),
      speak: vi.fn(async () => ({ ok: true, format: 'wav', sampleRate: 24000, voiceId: 13, audioBase64: '' })),
      preload: vi.fn(async () => ({ ok: true, ready: true })),
      unload: vi.fn(async () => ({ ok: true })),
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

  it('rejects malformed grammar minigame payloads before bridge dispatch', async () => {
    const { handlers, options } = createRegisteredHandlers()
    const handler = handlers.get('study:get-grammar-minigame-data')

    await expect(
      handler(createValidEvent(), {
        gameType: 'particle_cloze',
        seed: '3',
      }),
    ).rejects.toThrow(/Invalid grammar minigame seed/i)

    expect(options.runPythonBridgeWithArgs).not.toHaveBeenCalled()
  })

  it('rejects invalid Daily Games attempts before bridge dispatch', async () => {
    const { handlers, options } = createRegisteredHandlers()
    const handler = handlers.get('daily-games:record-attempt')

    await expect(handler(createValidEvent(), {
      day: '2026-07-15',
      gameType: 'crossword',
      mode: 'daily',
      score: 50,
      completed: true,
      outcomes: [
        { poolPosition: 1, outcome: 'correct' },
        { poolPosition: 1, outcome: 'incorrect' },
      ],
    })).rejects.toThrow(/duplicate poolPosition/i)

    expect(options.runPythonBridgeWithArgs).not.toHaveBeenCalled()
  })

  it('maps valid Daily Games attempts to bridge arguments and clears read caches', async () => {
    const result = { pool: {}, streak: {}, attempts: [], progress: {} }
    const { handlers, options } = createRegisteredHandlers({
      runPythonBridgeWithArgs: vi.fn().mockResolvedValue(result),
    })
    const handler = handlers.get('daily-games:record-attempt')

    await expect(handler(createValidEvent(), {
      day: '2026-07-15',
      gameType: 'typing_blitz',
      mode: 'practice',
      score: 120,
      completed: false,
      durationSeconds: 45,
      outcomes: [
        { poolPosition: 0, outcome: 'correct' },
        { poolPosition: 19, outcome: 'incorrect' },
      ],
    })).resolves.toBe(result)

    expect(options.runPythonBridgeWithArgs).toHaveBeenCalledWith([
      'daily-games-record-attempt',
      '2026-07-15',
      'typing_blitz',
      'practice',
      '120',
      '0',
      '45',
      '[{"pool_position":0,"outcome":"correct"},{"pool_position":19,"outcome":"incorrect"}]',
    ])
    expect(options.clearBridgeReadCaches).toHaveBeenCalledOnce()
  })

  it('uses uncached bridge execution for Daily Games state and practice seed reads', async () => {
    const { handlers, options } = createRegisteredHandlers({
      runPythonBridgeWithArgs: vi.fn().mockResolvedValue({ ok: true }),
      runPythonBridgeWithArgsCached: vi.fn().mockResolvedValue({ cached: true }),
    })

    await handlers.get('daily-games:get-state')(createValidEvent(), '2026-07-15')
    await handlers.get('daily-games:create-practice-seed')(createValidEvent(), {
      day: '2026-07-15',
      gameType: 'match_pairs',
    })

    expect(options.runPythonBridgeWithArgs).toHaveBeenNthCalledWith(1, [
      'daily-games-state',
      '2026-07-15',
    ])
    expect(options.runPythonBridgeWithArgs).toHaveBeenNthCalledWith(2, [
      'daily-games-practice-seed',
      '2026-07-15',
      'match_pairs',
    ])
    expect(options.runPythonBridgeWithArgsCached).not.toHaveBeenCalled()
  })

  it('uses direct bridge calls for card note CRUD without clearing read caches', async () => {
    const noteKey = `note:v1:builtin:${'a'.repeat(64)}`
    const note = {
      note_key: noteKey,
      note_text: 'mnemonic\nline two',
      created_at_utc: '2026-07-17T12:00:00+00:00',
      updated_at_utc: '2026-07-17T12:00:00+00:00',
    }
    const { handlers, options } = createRegisteredHandlers({
      runPythonBridgeWithArgs: vi.fn()
        .mockResolvedValueOnce({ note })
        .mockResolvedValueOnce(note)
        .mockResolvedValueOnce({ note_key: noteKey, deleted: true }),
      runPythonBridgeWithArgsCached: vi.fn().mockResolvedValue({ cached: true }),
    })

    await expect(handlers.get('study:get-card-note')(createValidEvent(), noteKey)).resolves.toEqual({ note })
    await expect(handlers.get('study:save-card-note')(createValidEvent(), {
      noteKey,
      noteText: 'mnemonic\r\nline two',
    })).resolves.toEqual(note)
    await expect(handlers.get('study:delete-card-note')(createValidEvent(), noteKey)).resolves.toEqual({
      note_key: noteKey,
      deleted: true,
    })

    expect(options.runPythonBridgeWithArgs).toHaveBeenNthCalledWith(1, ['card-note-get', noteKey])
    expect(options.runPythonBridgeWithArgs).toHaveBeenNthCalledWith(2, [
      'card-note-save',
      noteKey,
      'mnemonic\nline two',
    ])
    expect(options.runPythonBridgeWithArgs).toHaveBeenNthCalledWith(3, ['card-note-delete', noteKey])
    expect(options.runPythonBridgeWithArgsCached).not.toHaveBeenCalled()
    expect(options.clearBridgeReadCaches).not.toHaveBeenCalled()
  })

  it('rejects invalid card note payloads before bridge dispatch and wraps bridge failures', async () => {
    const noteKey = `note:v1:builtin:${'a'.repeat(64)}`
    const { handlers, options } = createRegisteredHandlers({
      runPythonBridgeWithArgs: vi.fn().mockRejectedValue(new Error('database locked')),
    })

    await expect(
      handlers.get('study:save-card-note')(createValidEvent(), {
        noteKey: 'not-a-note-key',
        noteText: 'mnemonic',
      }),
    ).rejects.toThrow(/Invalid card note key/i)
    expect(options.runPythonBridgeWithArgs).not.toHaveBeenCalled()

    await expect(
      handlers.get('study:get-card-note')(createValidEvent(), noteKey),
    ).rejects.toThrow(/Failed to load card note: database locked/)
  })

  it('maps cached crossword clue fields to the renderer contract and never calls the tutor on cache reads', async () => {
    const { handlers, options } = createRegisteredHandlers({
      runPythonBridgeWithArgs: vi.fn().mockResolvedValue({ clues: [{ pool_position: 2, clue: 'school gate' }] }),
    })
    await expect(handlers.get('daily-games:crossword-clues')(createValidEvent(), '2026-07-15')).resolves.toEqual([
      { poolPosition: 2, clue: 'school gate' },
    ])
    expect(options.localTutorRuntime.generateCrosswordClues).not.toHaveBeenCalled()
  })

  it('forwards the renderer crossword generation contract to the tutor runtime', async () => {
    const generated = { ok: true, text: '[{"poolPosition":0,"clue":"a place for learning"}]' }
    const { handlers, options } = createRegisteredHandlers()
    options.localTutorRuntime.generateCrosswordClues.mockResolvedValue(generated)
    const entries = [{ poolPosition: 0, answer: '学校', fallbackClue: 'school' }]

    await expect(handlers.get('daily-games:generate-crossword-clues')(createValidEvent(), entries)).resolves.toBe(generated)
    expect(options.localTutorRuntime.generateCrosswordClues).toHaveBeenCalledWith(entries)
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
