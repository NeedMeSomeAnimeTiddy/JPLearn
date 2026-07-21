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

  describe('titlebar window drag', () => {
    function createDragHarness(overrides = {}) {
      const cursor = { x: 500, y: 300 }
      const contentsListeners = new Map<string, () => void>()
      const windowMock = {
        ...createWindowMock(),
        getBounds: vi.fn(() => ({ x: 100, y: 80, width: 1280, height: 822 })),
        setPosition: vi.fn(),
        webContents: {
          once: (channel: string, listener: () => void) => contentsListeners.set(channel, listener),
          removeListener: (channel: string) => contentsListeners.delete(channel),
          emit: (channel: string) => contentsListeners.get(channel)?.(),
        },
      }
      const { handlers, options } = createRegisteredHandlers({
        getWindowFromSender: () => windowMock,
        screen: { getCursorScreenPoint: () => ({ ...cursor }) },
        ...overrides,
      })
      return { handlers, options, windowMock, cursor }
    }

    it('moves the window by the cursor delta while preserving the snapshot size', () => {
      vi.useFakeTimers()
      try {
        const { handlers, windowMock, cursor } = createDragHarness()

        expect(handlers.get('window:drag-start')(createValidEvent())).toEqual({
          ok: true,
          dragging: true,
        })

        cursor.x += 40
        cursor.y -= 25
        vi.advanceTimersByTime(16)

        expect(windowMock.setBounds).toHaveBeenLastCalledWith({
          x: 140,
          y: 55,
          width: 1280,
          height: 822,
        })
      } finally {
        vi.useRealTimers()
      }
    })

    it('never re-reads window size during a drag, so fractional DPI cannot inflate it', () => {
      vi.useFakeTimers()
      try {
        const { handlers, windowMock, cursor } = createDragHarness()
        handlers.get('window:drag-start')(createValidEvent())

        // Emulate the OS reporting a slightly larger window each tick, which is
        // what fractional DPI readback does. A correct drag ignores it.
        let inflated = 1280
        windowMock.getBounds.mockImplementation(() => {
          inflated += 1
          return { x: 100, y: 80, width: inflated, height: 822 }
        })

        for (let i = 0; i < 200; i++) {
          cursor.x += 1
          vi.advanceTimersByTime(16)
        }

        for (const call of windowMock.setBounds.mock.calls) {
          expect(call[0].width).toBe(1280)
          expect(call[0].height).toBe(822)
        }
        // setPosition re-reads GetSize() internally and is the original bug.
        expect(windowMock.setPosition).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('stops moving the window once the drag ends', () => {
      vi.useFakeTimers()
      try {
        const { handlers, windowMock, cursor } = createDragHarness()
        handlers.get('window:drag-start')(createValidEvent())
        vi.advanceTimersByTime(16)
        const callsWhileDragging = windowMock.setBounds.mock.calls.length

        expect(handlers.get('window:drag-end')(createValidEvent())).toEqual({ ok: true })

        cursor.x += 300
        vi.advanceTimersByTime(320)
        expect(windowMock.setBounds.mock.calls.length).toBe(callsWhileDragging)
      } finally {
        vi.useRealTimers()
      }
    })

    it('refuses to drag an expanded window', () => {
      vi.useFakeTimers()
      try {
        const { handlers, windowMock, cursor } = createDragHarness({
          isWindowExpanded: vi.fn(() => true),
        })

        expect(handlers.get('window:drag-start')(createValidEvent())).toEqual({
          ok: true,
          dragging: false,
        })

        cursor.x += 120
        vi.advanceTimersByTime(160)
        expect(windowMock.setBounds).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('abandons a drag whose pointerup never arrived', () => {
      vi.useFakeTimers()
      try {
        const { handlers, windowMock, cursor } = createDragHarness()
        handlers.get('window:drag-start')(createValidEvent())

        vi.advanceTimersByTime(60_000 + 32)
        const callsAfterTimeout = windowMock.setBounds.mock.calls.length

        cursor.x += 200
        vi.advanceTimersByTime(320)
        expect(windowMock.setBounds.mock.calls.length).toBe(callsAfterTimeout)
      } finally {
        vi.useRealTimers()
      }
    })

    it('abandons a drag when the renderer navigates away mid-drag', () => {
      vi.useFakeTimers()
      try {
        const { handlers, windowMock, cursor } = createDragHarness()
        handlers.get('window:drag-start')(createValidEvent())
        vi.advanceTimersByTime(16)
        const callsBeforeReload = windowMock.setBounds.mock.calls.length

        windowMock.webContents.emit('did-start-navigation')

        cursor.x += 250
        vi.advanceTimersByTime(320)
        expect(windowMock.setBounds.mock.calls.length).toBe(callsBeforeReload)
      } finally {
        vi.useRealTimers()
      }
    })

    it('rejects drag requests from untrusted senders', () => {
      const { handlers, windowMock } = createDragHarness()

      expect(
        () => handlers.get('window:drag-start')(createValidEvent('https://evil.example')),
      ).toThrow(/untrusted URL/i)
      expect(windowMock.setBounds).not.toHaveBeenCalled()
    })
  })

  it('wraps bridge failures with handler-specific study summary context', async () => {
    const { handlers } = createRegisteredHandlers({
      runPythonBridge: vi.fn().mockRejectedValue(new Error('bridge exploded')),
    })
    const handler = handlers.get('study:get-summary')

    await expect(handler(createValidEvent())).rejects.toThrow(/Failed to fetch study summary: bridge exploded/)
  })
})
