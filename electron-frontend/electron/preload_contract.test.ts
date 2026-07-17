// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const preloadPath = path.join(__dirname, 'preload.cjs')
const preloadSource = fs.readFileSync(preloadPath, 'utf8')

describe('preload contract', () => {
  it('exposes jplearnDesktop API in main world', () => {
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('jplearnDesktop'")
    expect(preloadSource).toContain('versions: {')
  })

  it('maps desktop API methods to expected IPC channels', () => {
    const expectedMappings = [
      "getStudySummary: () => ipcRenderer.invoke('study:get-summary')",
      "getBlockProgress: (slug) => ipcRenderer.invoke('study:get-block-progress', slug)",
      "getDeckCards: (slug) => ipcRenderer.invoke('study:get-deck-cards', slug)",
      "getStudyQueue: (slug) => ipcRenderer.invoke('study:get-study-queue', slug)",
      "getGrammarMinigameData: (payload) => ipcRenderer.invoke('study:get-grammar-minigame-data', payload)",
      "getDailyGamesState: (day) => ipcRenderer.invoke('daily-games:get-state', day)",
      "createDailyGamesPracticeSeed: (payload) => ipcRenderer.invoke('daily-games:create-practice-seed', payload)",
      "recordDailyGamesAttempt: (payload) => ipcRenderer.invoke('daily-games:record-attempt', payload)",
      "getDailyGamesCrosswordClues: (day) => ipcRenderer.invoke('daily-games:crossword-clues', day)",
      "saveDailyGamesCrosswordClues: (day, clues) => ipcRenderer.invoke('daily-games:save-crossword-clues', day, clues)",
      "generateDailyGamesCrosswordClues: (entries) => ipcRenderer.invoke('daily-games:generate-crossword-clues', entries)",
      "searchDictionary: (query) => ipcRenderer.invoke('study:search-dictionary', query)",
      "getKanjiDetail: (character) => ipcRenderer.invoke('study:get-kanji-detail', character)",
      "getOverviewCharacterMastery: () => ipcRenderer.invoke('study:get-overview-character-mastery')",
      "recordGameResult: (payload) => ipcRenderer.invoke('study:record-game-result', payload)",
      "startSessionGoal: (payload) => ipcRenderer.invoke('study:start-session-goal', payload)",
      "getSessionSummary: (sessionId) => ipcRenderer.invoke('study:get-session-summary', sessionId)",
      "applyExpertiseLevel: (level) => ipcRenderer.invoke('study:apply-expertise-level', level)",
      "getAssistantSnapshot: (sessionId) => ipcRenderer.invoke('assistant:get-snapshot', sessionId)",
      "getAssistantEvents: (limit) => ipcRenderer.invoke('assistant:get-events', limit)",
      "consumeAssistantEvents: (eventIds) => ipcRenderer.invoke('assistant:consume-events', eventIds)",
      "trackAssistantEvent: (payload) => ipcRenderer.invoke('assistant:track-event', payload)",
      "appendAssistantChatTurn: (payload) => ipcRenderer.invoke('assistant:append-chat-turn', payload)",
      "getAssistantChatHistory: (limit) => ipcRenderer.invoke('assistant:get-chat-history', limit)",
      "getPreloadedAssistantChatHistory: () => ipcRenderer.invoke('assistant:get-chat-history-preloaded')",
      "clearAssistantChatHistory: () => ipcRenderer.invoke('assistant:clear-chat-history')",
      "getAssistantChatRuntimeStatus: () => ipcRenderer.invoke('assistant-chat:status')",
      "preloadAssistantChatRuntime: () => ipcRenderer.invoke('assistant-chat:preload')",
      "sendAssistantChatMessage: (payload) => ipcRenderer.invoke('assistant-chat:send-message', payload)",
      "extractAssistantChatImageText: (payload) => ipcRenderer.invoke('assistant-chat:extract-image-text', payload)",
      "unloadAssistantChatRuntime: () => ipcRenderer.invoke('assistant-chat:unload')",
      "cancelAssistantChatInference: () => ipcRenderer.invoke('assistant-chat:cancel')",
      "resetStudyDb: () => ipcRenderer.invoke('study:reset-db')",
      "notifyStartupReady: (payload) => ipcRenderer.invoke('ui:startup-ready', payload)",
      "openInspectElement: () => ipcRenderer.invoke('ui:inspect-element')",
      "setStartupTheme: (theme) => ipcRenderer.invoke('ui:set-startup-theme', theme)",
        "reloadLocalFonts: () => ipcRenderer.invoke('ui:reload-local-fonts')",
      "minimizeWindow: () => ipcRenderer.invoke('window:minimize')",
      "toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize')",
      "isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized')",
      "closeWindow: () => ipcRenderer.invoke('window:close')",
      "minimizeToTray: () => ipcRenderer.invoke('window:minimize-to-tray')",
      "quitApp: () => ipcRenderer.invoke('window:quit-app')",
      "completeOnboarding: (payload) => ipcRenderer.invoke('learning-path:complete-onboarding', payload)",
    ]

    for (const mapping of expectedMappings) {
      expect(preloadSource).toContain(mapping)
    }
  })

  it('maintains window state listener subscription contract', () => {
    expect(preloadSource).toContain("ipcRenderer.on('window:state-changed', handler)")
    expect(preloadSource).toContain("ipcRenderer.removeListener('window:state-changed', handler)")
  })

  it('maintains tray action listener subscription contract', () => {
    expect(preloadSource).toContain("ipcRenderer.on('tray:action', handler)")
    expect(preloadSource).toContain("ipcRenderer.removeListener('tray:action', handler)")
  })
})
