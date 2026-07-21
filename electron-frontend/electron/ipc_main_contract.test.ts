// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const mainPath = path.join(__dirname, 'main.cjs')
const mainSource = fs.readFileSync(mainPath, 'utf8')
const handlersPath = path.join(__dirname, 'ipc_handlers.cjs')
const handlersSource = fs.readFileSync(handlersPath, 'utf8')

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('ipc main contract', () => {
  it('registers expected IPC channels exactly once', () => {
    const expectedChannels = [
      'study:get-summary',
      'study:get-block-progress',
      'study:get-deck-cards',
      'study:get-overview-character-mastery',
      'study:get-study-queue',
      'study:get-grammar-minigame-data',
      'study:get-card-note',
      'study:save-card-note',
      'study:delete-card-note',
      'scenario:save-session',
      'scenario:list-sessions',
      'scenario:get-session',
      'scenario:delete-session',
      'scenario:clear-sessions',
      'scenario:save-srs-card',
      'scenario:evaluate-response',
      'daily-games:get-state',
      'daily-games:create-practice-seed',
      'daily-games:record-attempt',
      'daily-games:crossword-clues',
      'daily-games:save-crossword-clues',
      'daily-games:generate-crossword-clues',
      'study:search-dictionary',
      'study:get-kanji-detail',
      'study:reset-db',
      'study:record-game-result',
      'study:start-session-goal',
      'study:get-session-summary',
      'study:apply-expertise-level',
      'assistant:get-snapshot',
      'assistant:get-events',
      'assistant:consume-events',
      'assistant:track-event',
      'assistant:append-chat-turn',
      'assistant:get-chat-history',
      'assistant:get-chat-history-preloaded',
      'assistant:clear-chat-history',
      'assistant-chat:status',
      'assistant-chat:preload',
      'assistant-chat:send-message',
      'assistant-chat:extract-image-text',
      'assistant-chat:unload',
      'assistant-chat:cancel',
      'audio:voice-status',
      'audio:speak',
      'audio:preload',
      'window:minimize',
      'window:toggle-maximize',
      'window:is-maximized',
      'window:drag-start',
      'window:drag-end',
      'window:close',
      'window:minimize-to-tray',
      'window:quit-app',
      'ui:set-startup-theme',
      'ui:startup-ready',
      'ui:inspect-element',
      'learning-path:complete-onboarding',
    ]

    for (const channel of expectedChannels) {
      const pattern = new RegExp(`ipcMain\\.handle\\('${escapeRegExp(channel)}'`, 'g')
      const matches = handlersSource.match(pattern) || []
      expect(matches.length, `Expected single registration for channel ${channel}`).toBe(1)
    }
  })

  it('guards each registered IPC handler with trusted sender validation', () => {
    const guardedChannels = [
      'study:get-summary',
      'study:get-block-progress',
      'study:get-deck-cards',
      'study:get-overview-character-mastery',
      'study:get-study-queue',
      'study:get-grammar-minigame-data',
      'study:get-card-note',
      'study:save-card-note',
      'study:delete-card-note',
      'scenario:save-session',
      'scenario:list-sessions',
      'scenario:get-session',
      'scenario:delete-session',
      'scenario:clear-sessions',
      'scenario:save-srs-card',
      'scenario:evaluate-response',
      'daily-games:get-state',
      'daily-games:create-practice-seed',
      'daily-games:record-attempt',
      'daily-games:crossword-clues',
      'daily-games:save-crossword-clues',
      'daily-games:generate-crossword-clues',
      'study:search-dictionary',
      'study:get-kanji-detail',
      'study:reset-db',
      'study:record-game-result',
      'study:start-session-goal',
      'study:get-session-summary',
      'study:apply-expertise-level',
      'assistant:get-snapshot',
      'assistant:get-events',
      'assistant:consume-events',
      'assistant:track-event',
      'assistant:append-chat-turn',
      'assistant:get-chat-history',
      'assistant:get-chat-history-preloaded',
      'assistant:clear-chat-history',
      'assistant-chat:status',
      'assistant-chat:preload',
      'assistant-chat:send-message',
      'assistant-chat:extract-image-text',
      'assistant-chat:unload',
      'assistant-chat:cancel',
      'audio:voice-status',
      'audio:speak',
      'audio:preload',
      'window:minimize',
      'window:toggle-maximize',
      'window:is-maximized',
      'window:drag-start',
      'window:drag-end',
      'window:close',
      'window:minimize-to-tray',
      'window:quit-app',
      'ui:set-startup-theme',
      'ui:startup-ready',
      'ui:inspect-element',
      'learning-path:complete-onboarding',
    ]

    for (const channel of guardedChannels) {
      const marker = `ipcMain.handle('${channel}'`
      const startIndex = handlersSource.indexOf(marker)
      expect(startIndex, `Missing handler marker for ${channel}`).toBeGreaterThanOrEqual(0)

      const localWindow = handlersSource.slice(startIndex, startIndex + 900)
      expect(localWindow, `Expected assertTrustedIpcSender in handler for ${channel}`).toContain('assertTrustedIpcSender(event')
    }
  })

  it('wires main process to shared ipc handler registration', () => {
    expect(mainSource).toContain("const { registerIpcHandlers } = require('./ipc_handlers.cjs')")
    expect(mainSource).toContain('registerIpcHandlers({')
  })
})
