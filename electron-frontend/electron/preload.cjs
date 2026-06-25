const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('jplearnDesktop', {
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  getStudySummary: () => ipcRenderer.invoke('study:get-summary'),
})
