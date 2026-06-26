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
      "getOverviewCharacterMastery: () => ipcRenderer.invoke('study:get-overview-character-mastery')",
      "recordGameResult: (payload) => ipcRenderer.invoke('study:record-game-result', payload)",
      "startSessionGoal: (payload) => ipcRenderer.invoke('study:start-session-goal', payload)",
      "getSessionSummary: (sessionId) => ipcRenderer.invoke('study:get-session-summary', sessionId)",
      "resetStudyDb: () => ipcRenderer.invoke('study:reset-db')",
      "notifyStartupReady: (payload) => ipcRenderer.invoke('ui:startup-ready', payload)",
      "setStartupTheme: (theme) => ipcRenderer.invoke('ui:set-startup-theme', theme)",
      "minimizeWindow: () => ipcRenderer.invoke('window:minimize')",
      "toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize')",
      "isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized')",
      "closeWindow: () => ipcRenderer.invoke('window:close')",
    ]

    for (const mapping of expectedMappings) {
      expect(preloadSource).toContain(mapping)
    }
  })

  it('maintains window state listener subscription contract', () => {
    expect(preloadSource).toContain("ipcRenderer.on('window:state-changed', handler)")
    expect(preloadSource).toContain("ipcRenderer.removeListener('window:state-changed', handler)")
  })
})
