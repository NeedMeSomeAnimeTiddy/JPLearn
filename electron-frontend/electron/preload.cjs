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
  getOverviewCharacterMastery: () => ipcRenderer.invoke('study:get-overview-character-mastery'),
  recordGameResult: (payload) => ipcRenderer.invoke('study:record-game-result', payload),
  resetStudyDb: () => ipcRenderer.invoke('study:reset-db'),
  notifyStartupReady: (payload) => ipcRenderer.invoke('ui:startup-ready', payload),
  setStartupTheme: (theme) => ipcRenderer.invoke('ui:set-startup-theme', theme),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
})
