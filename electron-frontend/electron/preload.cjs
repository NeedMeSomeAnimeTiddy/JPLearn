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
  recordGameResult: (payload) => ipcRenderer.invoke('study:record-game-result', payload),
  startSessionGoal: (payload) => ipcRenderer.invoke('study:start-session-goal', payload),
  getSessionSummary: (sessionId) => ipcRenderer.invoke('study:get-session-summary', sessionId),
  applyExpertiseLevel: (level) => ipcRenderer.invoke('study:apply-expertise-level', level),
  resetStudyDb: () => ipcRenderer.invoke('study:reset-db'),
  notifyStartupReady: (payload) => ipcRenderer.invoke('ui:startup-ready', payload),
  setStartupTheme: (theme) => ipcRenderer.invoke('ui:set-startup-theme', theme),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onWindowStateChanged: (listener) => {
    const handler = (_event, state) => listener(state)
    ipcRenderer.on('window:state-changed', handler)
    return () => ipcRenderer.removeListener('window:state-changed', handler)
  },
  closeWindow: () => ipcRenderer.invoke('window:close'),
})
