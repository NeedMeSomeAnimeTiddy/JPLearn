const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('jplearnDesktop', {
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  getStudySummary: () => ipcRenderer.invoke('study:get-summary'),
  getBlockProgress: (slug) => ipcRenderer.invoke('study:get-block-progress', slug),
  getDeckCards: (slug) => ipcRenderer.invoke('study:get-deck-cards', slug),
  getStudyQueue: (slug) => ipcRenderer.invoke('study:get-study-queue', slug),
  getOverviewCharacterMastery: () => ipcRenderer.invoke('study:get-overview-character-mastery'),
  getPronunciationAudio: (payload) => ipcRenderer.invoke('study:get-pronunciation-audio', payload),
  recordGameResult: (payload) => ipcRenderer.invoke('study:record-game-result', payload),
  startSessionGoal: (payload) => ipcRenderer.invoke('study:start-session-goal', payload),
  getSessionSummary: (sessionId) => ipcRenderer.invoke('study:get-session-summary', sessionId),
  resetStudyDb: () => ipcRenderer.invoke('study:reset-db'),
  notifyStartupReady: (payload) => ipcRenderer.invoke('ui:startup-ready', payload),
  setStartupTheme: (theme) => ipcRenderer.invoke('ui:set-startup-theme', theme),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
})
