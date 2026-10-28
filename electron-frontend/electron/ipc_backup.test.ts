// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { importSummaryMessage } from '../src/lib/backupMessages'

const { registerIpcHandlers } = require('./ipc_handlers.cjs')

/* What scripts/desktop_bridge.py _cmd_analytics_import_json really answers: the counts are
   asdict(ProgressImportResult), nested under `imported` (audit 10, review finding 1). */
const BRIDGE_IMPORT_REPLY = {
  ok: true,
  conflict_mode: 'merge',
  imported: {
    cards_updated: 12,
    cards_kept_current: 3,
    reviews_added: 340,
    stages_updated: 0,
    problem_cards_updated: 0,
    counters_updated: 0,
    session_goals_added: 0,
    topic_rows_moved: 0,
    daily_games_attempts_added: 0,
    daily_games_days_kept_current: ['2026-10-02'],
    safety_copy: 'before-import.db',
  },
}

// Audit 10: import, "Back up everything", "Restore from a backup", and the export.

function createValidEvent() {
  const mainFrame = { url: 'file:///index.html' }
  return { sender: { id: 1, mainFrame }, senderFrame: mainFrame }
}

function createChildFrameEvent() {
  const mainFrame = { url: 'file:///index.html' }
  return { sender: { id: 1, mainFrame }, senderFrame: { url: 'file:///index.html' } }
}

const appWindow = { id: 1, isDestroyed: () => false }

function register(overrides: Record<string, unknown> = {}) {
  const handlers = new Map()
  const folder = mkdtempSync(join(tmpdir(), 'jplearn-ipc-backup-'))
  // The handlers call these as (parent, options), like Electron's dialog.
  type DialogCall = (parent: unknown, options: any) => Promise<any>
  const dialog = {
    showOpenDialog: vi.fn<DialogCall>(async () => ({ canceled: false, filePaths: [join(folder, 'picked')] })),
    showSaveDialog: vi.fn<DialogCall>(async () => ({ canceled: false, filePath: join(folder, 'saved') })),
    showMessageBox: vi.fn<DialogCall>(async () => ({ response: 1 })),
  }
  const calls: string[] = []
  const options = {
    ipcMain: { handle: (channel: string, handler: unknown) => handlers.set(channel, handler) },
    isDev: false,
    appPageUrl: 'file:///index.html',
    getWindowFromSender: () => appWindow,
    dialog,
    app: { getPath: () => folder },
    answerQueue: {
      runExclusive: vi.fn(async (job: () => Promise<unknown>) => {
        calls.push('exclusive')
        return await job()
      }),
    },
    clearBridgeReadCaches: vi.fn(() => calls.push('clear-caches')),
    runPythonBridge: vi.fn(),
    runPythonBridgeWithArgs: vi.fn(async () => ({ json: { format_version: 2 } })),
    runPythonBridgeIsolated: vi.fn(async () => ({ ok: true })),
    runPythonBridgeWorkerOnly: vi.fn(async (args: string[]) => {
      calls.push(args[0])
      if (args[0] === 'analytics-inspect-json') {
        return { exported_at_utc: '2026-10-02T08:00:00+00:00', cards: 12, reviews: 1 }
      }
      if (args[0] === 'database-inspect') {
        return { schema_version: 21, cards: 1, reviews: 2345, last_review_day: '2026-10-27' }
      }
      if (args[0] === 'database-restore') {
        return {
          summary: {},
          safety_copy: 'copy.db',
          window_state: { 'jplearn-desktop-settings-v1': '{}', 'some-other-key': 'x' },
        }
      }
      return BRIDGE_IMPORT_REPLY
    }),
    ...overrides,
  }
  registerIpcHandlers(options)
  writeFileSync(join(folder, 'picked'), '{}')
  return { handlers, options, dialog, calls, folder }
}

describe('backup:restore-database', () => {
  it('asks first, parented to the window, with Cancel as the default', async () => {
    const { handlers, dialog } = register()

    await handlers.get('backup:restore-database')(createValidEvent())

    const [parent, box] = dialog.showMessageBox.mock.calls[0] ?? []
    expect(parent).toBe(appWindow)
    expect(box.buttons).toEqual(['Cancel', 'Restore'])
    expect(box.defaultId).toBe(0)
    expect(box.cancelId).toBe(0)
    expect(box.message).toBe('Replace all your current progress with this backup?')
    expect(box.detail).toBe(
      'Last review in the backup: 27 October 2026. 1 card, 2,345 reviews.\n'
      + 'Your current data is saved as a safety copy first.',
    )
  })

  it('restores inside the answer queue and then clears the read caches', async () => {
    const { handlers, calls } = register()

    const result = await handlers.get('backup:restore-database')(createValidEvent())

    // Only the allowlisted keys go back to the window.
    expect(result).toMatchObject({ ok: true, safety_copy: 'copy.db', window_state: { 'jplearn-desktop-settings-v1': '{}' } })
    expect(Object.keys(result.window_state)).toEqual(['jplearn-desktop-settings-v1'])
    expect(calls).toEqual(['database-inspect', 'exclusive', 'database-restore', 'clear-caches'])
  })

  it('writes nothing when the learner cancels the confirm box', async () => {
    const { handlers, dialog, calls } = register()
    dialog.showMessageBox.mockResolvedValueOnce({ response: 0 })

    await expect(handlers.get('backup:restore-database')(createValidEvent())).resolves.toEqual({ ok: false, cancelled: true })

    expect(calls).toEqual(['database-inspect'])
  })

  it('is refused while the scheduling optimizer is running, and the optimizer while a restore is', async () => {
    let finishOptimize: (value: unknown) => void = () => {}
    const { handlers, calls } = register({
      runPythonBridgeIsolated: vi.fn(() => new Promise((resolve) => { finishOptimize = resolve })),
    })
    const optimizing = handlers.get('fsrs:optimize')(createValidEvent())

    await expect(handlers.get('backup:restore-database')(createValidEvent())).rejects.toThrow(/busy: optimize/)
    expect(calls).not.toContain('database-restore')

    finishOptimize({ ok: false })
    await optimizing
    await expect(handlers.get('backup:restore-database')(createValidEvent())).resolves.toMatchObject({ ok: true })
  })

  it('refuses a sender that is not the main frame', async () => {
    const { handlers, dialog } = register()
    await expect(handlers.get('backup:restore-database')(createChildFrameEvent())).rejects.toThrow(/non-main-frame/i)
    expect(dialog.showOpenDialog).not.toHaveBeenCalled()
  })
})

describe('backup:save-database', () => {
  it('sends the allowlisted window settings to the bridge', async () => {
    const { handlers, options } = register()
    const state = { 'jplearn-desktop-script-stats-v1': '{"hiragana":1}' }

    const result = await handlers.get('backup:save-database')(createValidEvent(), state)

    expect(result).toMatchObject({ ok: true })
    const args = options.runPythonBridgeWorkerOnly.mock.calls[0][0]
    expect(args[0]).toBe('database-backup')
    expect(JSON.parse(args[2])).toEqual(state)
  })

  it.each([
    ['an unknown key', { 'jplearn-card-scores-v2': '{}' }],
    ['a non-text value', { 'jplearn-desktop-settings-v1': 5 }],
    ['an array', ['x']],
  ])('refuses %s before any dialog opens', async (_label, payload) => {
    const { handlers, dialog } = register()
    await expect(handlers.get('backup:save-database')(createValidEvent(), payload)).rejects.toThrow(/backup window state/)
    expect(dialog.showSaveDialog).not.toHaveBeenCalled()
  })
})

describe('analytics:import-from-json', () => {
  it('shows a summary and imports only after the learner agrees', async () => {
    const { handlers, dialog, calls } = register()

    const result = await handlers.get('analytics:import-from-json')(createValidEvent())

    expect(dialog.showMessageBox.mock.calls[0]?.[1].detail).toBe(
      'Exported 2 October 2026. 12 cards, 1 review.\n'
      + 'Cards you have studied further keep your current progress.\n'
      + 'A safety copy of your data is saved first.',
    )
    expect(calls).toEqual(['analytics-inspect-json', 'exclusive', 'analytics-import-json', 'clear-caches'])
    expect(result).toEqual({ ok: true, ...BRIDGE_IMPORT_REPLY.imported })
    // The real reply, through the route, reads as a summary rather than throwing in the window.
    expect(importSummaryMessage(result)).toBe(
      'Imported: 12 cards updated, 340 reviews added. 3 cards you had studied further kept your progress. '
      + 'Daily Games for 1 day kept the words you already had.',
    )
  })

  it('gives the database jobs their own time limit', async () => {
    const { handlers, options } = register()
    await handlers.get('analytics:import-from-json')(createValidEvent())
    await handlers.get('backup:restore-database')(createValidEvent())
    for (const [args, requestOptions] of options.runPythonBridgeWorkerOnly.mock.calls) {
      expect([args[0], requestOptions]).toEqual([args[0], { timeoutMs: 600_000 }])
    }
  })

  it('refuses an oversized file before Python reads it', async () => {
    const { handlers, calls, folder } = register()
    const fs = require('fs')
    const realStat = fs.statSync
    const stat = vi.spyOn(fs, 'statSync').mockImplementation((path: unknown) => (
      path === join(folder, 'picked') ? { size: 300 * 1024 * 1024 } : realStat(path as string)
    ))
    try {
      await expect(handlers.get('analytics:import-from-json')(createValidEvent())).rejects.toThrow(/not a progress file/)
    } finally {
      stat.mockRestore()
    }
    expect(calls).toEqual([])
  })
})

describe('analytics:export-and-save-json', () => {
  it('exports after any waiting answers and writes the whole file', async () => {
    const { handlers, options, dialog, folder } = register()

    const result = await handlers.get('analytics:export-and-save-json')(createValidEvent())

    expect(options.answerQueue.runExclusive).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, path: join(folder, 'saved') })
    expect(JSON.parse(readFileSync(join(folder, 'saved'), 'utf-8'))).toEqual({ format_version: 2 })
    expect(dialog.showSaveDialog.mock.calls[0]?.[1].defaultPath).toMatch(/jplearn-progress-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
