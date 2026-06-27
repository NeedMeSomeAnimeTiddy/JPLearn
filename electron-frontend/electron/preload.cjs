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
  getAssistantSnapshot: (sessionId) => ipcRenderer.invoke('assistant:get-snapshot', sessionId),
  getAssistantEvents: (limit) => ipcRenderer.invoke('assistant:get-events', limit),
  consumeAssistantEvents: (eventIds) => ipcRenderer.invoke('assistant:consume-events', eventIds),
  trackAssistantEvent: (payload) => ipcRenderer.invoke('assistant:track-event', payload),
  appendAssistantChatTurn: (payload) => ipcRenderer.invoke('assistant:append-chat-turn', payload),
  getAssistantChatHistory: (limit) => ipcRenderer.invoke('assistant:get-chat-history', limit),
  clearAssistantChatHistory: () => ipcRenderer.invoke('assistant:clear-chat-history'),
  getAssistantChatRuntimeStatus: () => ipcRenderer.invoke('assistant-chat:status'),
  preloadAssistantChatRuntime: () => ipcRenderer.invoke('assistant-chat:preload'),
  sendAssistantChatMessage: (payload) => ipcRenderer.invoke('assistant-chat:send-message', payload),
  unloadAssistantChatRuntime: () => ipcRenderer.invoke('assistant-chat:unload'),
  cancelAssistantChatInference: () => ipcRenderer.invoke('assistant-chat:cancel'),
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
