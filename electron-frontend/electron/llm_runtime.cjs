const { spawn } = require('node:child_process')
const fs = require('node:fs')

const DEFAULT_INACTIVITY_UNLOAD_MS = 5 * 60 * 1000
const DEFAULT_LLAMACPP_TIMEOUT_MS = 35000

function normalizeProviderName(rawValue) {
  const value = typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : ''
  if (value === 'llama.cpp' || value === 'llama_cpp' || value === 'llama-cpp') {
    return 'llama.cpp'
  }
  if (value === 'stub' || value === '') {
    return 'stub'
  }
  return value
}

function sanitizeContextText(context = {}) {
  const pairs = []
  for (const [key, value] of Object.entries(context)) {
    if (typeof value !== 'string') {
      continue
    }
    const normalized = value.trim()
    if (!normalized) {
      continue
    }
    pairs.push(`${key}: ${normalized}`)
  }
  return pairs.slice(0, 8).join('\n')
}

function createLlamaCppCliAdapter(config = {}) {
  const executablePath = typeof config.executablePath === 'string' ? config.executablePath.trim() : ''
  const modelPath = typeof config.modelPath === 'string' ? config.modelPath.trim() : ''
  const timeoutMs = Number.isFinite(config.timeoutMs)
    ? Math.max(5000, Math.floor(config.timeoutMs))
    : DEFAULT_LLAMACPP_TIMEOUT_MS

  return {
    async load() {
      if (!executablePath) {
        throw new Error('llama.cpp runtime requires JPLEARN_LLAMA_CPP_PATH')
      }
      if (!fs.existsSync(executablePath)) {
        throw new Error(`llama.cpp executable not found: ${executablePath}`)
      }
      if (!modelPath) {
        throw new Error('llama.cpp runtime requires JPLEARN_LLAMA_MODEL_PATH')
      }
      if (!fs.existsSync(modelPath)) {
        throw new Error(`llama.cpp model not found: ${modelPath}`)
      }
    },

    async unload() {
      return undefined
    },

    async infer(message, context = {}) {
      const contextText = sanitizeContextText(context)
      const prompt = contextText
        ? `You are a concise Japanese tutor companion.\n${contextText}\n\nUser: ${message}\nTutor:`
        : `You are a concise Japanese tutor companion.\n\nUser: ${message}\nTutor:`

      const args = [
        '-m',
        modelPath,
        '-p',
        prompt,
        '--temp',
        '0.6',
        '--top-p',
        '0.9',
        '-n',
        '180',
        '--no-display-prompt',
      ]

      const output = await new Promise((resolve, reject) => {
        const child = spawn(executablePath, args, {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        let stdout = ''
        let stderr = ''
        let timedOut = false

        const timeoutHandle = setTimeout(() => {
          timedOut = true
          child.kill()
        }, timeoutMs)

        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString('utf8')
        })

        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString('utf8')
        })

        child.on('error', (error) => {
          clearTimeout(timeoutHandle)
          reject(error)
        })

        child.on('close', (code) => {
          clearTimeout(timeoutHandle)
          if (timedOut) {
            reject(new Error(`llama.cpp inference timed out after ${timeoutMs}ms`))
            return
          }
          if (code !== 0) {
            reject(new Error(`llama.cpp exited with code ${code}: ${stderr.trim() || '(empty stderr)'}`))
            return
          }
          resolve(stdout)
        })
      })

      const text = String(output).trim()
      if (!text) {
        throw new Error('llama.cpp returned empty response')
      }

      return {
        text,
        provider: 'llama.cpp',
        model: modelPath,
      }
    },
  }
}

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

  const configuredProvider = normalizeProviderName(
    options.provider || process.env.JPLEARN_TUTOR_PROVIDER || 'stub',
  )
  const llamaCppConfig = {
    executablePath: options.llamaCppPath || process.env.JPLEARN_LLAMA_CPP_PATH || '',
    modelPath: options.llamaModelPath || process.env.JPLEARN_LLAMA_MODEL_PATH || '',
    timeoutMs: options.llamaTimeoutMs,
  }

  const adapterFactory = typeof options.adapterFactory === 'function'
    ? options.adapterFactory
    : (() => {
      if (configuredProvider === 'llama.cpp') {
        return createLlamaCppCliAdapter(llamaCppConfig)
      }
      return createStubAdapter()
    })

  let adapter = null
  let activeProvider = configuredProvider
  let activeModel = configuredProvider === 'llama.cpp' ? llamaCppConfig.modelPath || 'unknown' : 'stub'
  let loaded = false
  let loadedAtUtc = null
  let lastUsedAtUtc = null
  let lastError = null
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

    try {
      await adapter.load()
      lastError = null
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      if (configuredProvider === 'llama.cpp') {
        adapter = createStubAdapter()
        await adapter.load()
        activeProvider = 'stub-fallback'
        activeModel = 'llama.cpp-unavailable'
        lastError = detail
      } else {
        throw error
      }
    }
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
      if (activeProvider !== 'stub-fallback') {
        lastError = null
      }
      if (typeof inference.provider === 'string') {
        if (!(activeProvider === 'stub-fallback' && inference.provider === 'stub')) {
          activeProvider = inference.provider
        }
      }
      if (typeof inference.model === 'string') {
        activeModel = inference.model
      }
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
        configuredProvider,
        activeProvider,
        activeModel,
        lastError,
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
      activeProvider = configuredProvider
      activeModel = configuredProvider === 'llama.cpp' ? llamaCppConfig.modelPath || 'unknown' : 'stub'
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
