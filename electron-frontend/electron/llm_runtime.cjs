const DEFAULT_INACTIVITY_UNLOAD_MS = 5 * 60 * 1000

function createStubAdapter() {
  return {
    async load() {
      return undefined
    },
    async unload() {
      return undefined
    },
    async infer(message, context = {}) {
      const focus = typeof context.focus_area === 'string' && context.focus_area.trim().length > 0
        ? context.focus_area.trim()
        : 'today\'s weakest area'
      return {
        text: `Coach note: I can help with ${focus}. Local llama.cpp model integration is scaffolded and ready for adapter wiring. Your message was: ${message}`,
        provider: 'stub',
        model: 'llama.cpp-pending',
      }
    },
  }
}

function createTutorChatRuntime(options = {}) {
  const inactivityUnloadMs = Number.isFinite(options.inactivityUnloadMs)
    ? Math.max(15000, Math.floor(options.inactivityUnloadMs))
    : DEFAULT_INACTIVITY_UNLOAD_MS

  const adapterFactory = typeof options.adapterFactory === 'function'
    ? options.adapterFactory
    : createStubAdapter

  let adapter = null
  let loaded = false
  let loadedAtUtc = null
  let lastUsedAtUtc = null
  let unloadTimer = null

  function clearUnloadTimer() {
    if (unloadTimer) {
      clearTimeout(unloadTimer)
      unloadTimer = null
    }
  }

  function scheduleInactivityUnload() {
    clearUnloadTimer()
    unloadTimer = setTimeout(() => {
      void runtime.unload('inactivity')
    }, inactivityUnloadMs)
  }

  async function ensureLoaded() {
    if (loaded && adapter) {
      return false
    }

    adapter = adapterFactory()
    if (!adapter || typeof adapter.load !== 'function') {
      throw new Error('Tutor chat adapter is invalid or missing load()')
    }

    await adapter.load()
    loaded = true
    loadedAtUtc = new Date().toISOString()
    return true
  }

  const runtime = {
    async sendMessage(message, context = {}) {
      if (typeof message !== 'string' || message.trim().length === 0) {
        throw new Error('Chat message must not be empty')
      }
      const trimmedMessage = message.trim()
      const coldStart = await ensureLoaded()
      lastUsedAtUtc = new Date().toISOString()
      scheduleInactivityUnload()

      const startedAt = Date.now()
      const inference = await adapter.infer(trimmedMessage, context)
      const elapsedMs = Date.now() - startedAt
      return {
        ok: true,
        text: String(inference.text || ''),
        provider: String(inference.provider || 'unknown'),
        model: String(inference.model || 'unknown'),
        coldStart,
        elapsedMs,
      }
    },

    getStatus() {
      return {
        loaded,
        loadedAtUtc,
        lastUsedAtUtc,
        inactivityUnloadMs,
      }
    },

    async unload(reason = 'manual') {
      clearUnloadTimer()
      if (loaded && adapter && typeof adapter.unload === 'function') {
        await adapter.unload(reason)
      }
      loaded = false
      adapter = null
      loadedAtUtc = null
      return {
        ok: true,
        reason,
      }
    },
  }

  return runtime
}

module.exports = {
  createTutorChatRuntime,
}
