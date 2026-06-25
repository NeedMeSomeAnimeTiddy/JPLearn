const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('jplearnDesktop', {
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  getStudySummary: () => ipcRenderer.invoke('study:get-summary'),
  getDeckCards: (slug) => ipcRenderer.invoke('study:get-deck-cards', slug),
  resetStudyDb: () => ipcRenderer.invoke('study:reset-db'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
})
