const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_INACTIVITY_UNLOAD_MS = 5 * 60 * 1000
const DEFAULT_LLAMACPP_TIMEOUT_MS = 35000
const DEFAULT_MAX_CONTEXT_CHARS = 1800
const DEFAULT_MAX_MESSAGE_CHARS = 600
const DEFAULT_MAX_OUTPUT_CHARS = 700
const DEFAULT_MAX_PROMPT_CHARS = 3200
const DEFAULT_MODEL_DIRECTORY = path.resolve(__dirname, '..', '..', 'models', 'llama')

function resolveBundledLlamaCppPath() {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'tools', 'llama.cpp', 'build', 'bin', 'Release', 'llama-cli.exe'),
    path.resolve(__dirname, '..', '..', 'tools', 'llama.cpp', 'build', 'bin', 'llama-cli.exe'),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || ''
}

function resolveBundledModelPath() {
  if (!fs.existsSync(DEFAULT_MODEL_DIRECTORY)) {
    return ''
  }
  const entries = fs.readdirSync(DEFAULT_MODEL_DIRECTORY, { withFileTypes: true })
  const models = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.gguf'))
    .map((entry) => path.join(DEFAULT_MODEL_DIRECTORY, entry.name))
    .sort()
  return models[0] || ''
}

class InferenceAbortError extends Error {
  constructor(message = 'Inference cancelled') {
    super(message)
    this.name = 'InferenceAbortError'
  }
}

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

function clipText(value, maxChars) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) {
    return ''
  }
  if (!Number.isFinite(maxChars) || maxChars < 8) {
    return normalized
  }
  const limit = Math.floor(maxChars)
  return normalized.length <= limit
    ? normalized
    : `${normalized.slice(0, Math.max(0, limit - 3))}...`
}

function sanitizeContextText(context = {}, options = {}) {
  const maxContextChars = Number.isFinite(options.maxContextChars)
    ? Math.max(120, Math.floor(options.maxContextChars))
    : DEFAULT_MAX_CONTEXT_CHARS
  const pairs = []
  let consumedChars = 0
  for (const [key, value] of Object.entries(context)) {
    if (typeof value !== 'string') {
      continue
    }
    const normalized = clipText(value, 280)
    if (!normalized) {
      continue
    }
    const line = `${key}: ${normalized}`
    if (consumedChars + line.length > maxContextChars) {
      break
    }
    pairs.push(line)
    consumedChars += line.length
  }
  return pairs.slice(0, 8).join('\n')
}

function buildScriptedFallbackResponse(message, context = {}, detail = '') {
  const focus = typeof context.focus_area === 'string' && context.focus_area.trim().length > 0
    ? context.focus_area.trim()
    : 'today\'s weakest area'
  const messageHint = clipText(message, 120)
  const detailSuffix = detail ? ` (runtime fallback: ${clipText(detail, 120)})` : ''
  return {
    text: `Coach fallback: let's keep momentum on ${focus}. Start one focused round, then re-check confidence.${detailSuffix} Your message: ${messageHint}`,
    provider: 'scripted-fallback',
    model: 'deterministic-scripted',
  }
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
        throw new Error(`llama.cpp runtime requires JPLEARN_LLAMA_MODEL_PATH or a .gguf model in ${DEFAULT_MODEL_DIRECTORY}`)
      }
      if (!fs.existsSync(modelPath)) {
        throw new Error(`llama.cpp model not found: ${modelPath}`)
      }
    },

    async unload() {
      return undefined
    },

    async infer(message, context = {}, runtimeOptions = {}) {
      const contextText = sanitizeContextText(context, runtimeOptions)
      const prompt = contextText
        ? `You are a concise Japanese tutor companion.\n${contextText}\n\nUser: ${message}\nTutor:`
        : `You are a concise Japanese tutor companion.\n\nUser: ${message}\nTutor:`
      const boundedPrompt = clipText(prompt, runtimeOptions.maxPromptChars || DEFAULT_MAX_PROMPT_CHARS)
      const maxOutputTokens = Number.isFinite(runtimeOptions.maxOutputTokens)
        ? Math.max(24, Math.floor(runtimeOptions.maxOutputTokens))
        : 180

      const args = [
        '-m',
        modelPath,
        '-p',
        boundedPrompt,
        '--temp',
        '0.6',
        '--top-p',
        '0.9',
        '-n',
        String(maxOutputTokens),
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
        let cancelled = false
        let finished = false

        const timeoutHandle = setTimeout(() => {
          timedOut = true
          child.kill()
        }, timeoutMs)

        const signal = runtimeOptions.signal
        const onAbort = () => {
          cancelled = true
          child.kill()
        }
        if (signal && typeof signal.addEventListener === 'function') {
          if (signal.aborted) {
            onAbort()
          } else {
            signal.addEventListener('abort', onAbort, { once: true })
          }
        }

        const cleanup = () => {
          if (finished) {
            return
          }
          finished = true
          clearTimeout(timeoutHandle)
          if (signal && typeof signal.removeEventListener === 'function') {
            signal.removeEventListener('abort', onAbort)
          }
        }

        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString('utf8')
        })

        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString('utf8')
        })

        child.on('error', (error) => {
          cleanup()
          if (cancelled) {
            reject(new InferenceAbortError())
            return
          }
          reject(error)
        })

        child.on('close', (code) => {
          cleanup()
          if (cancelled) {
            reject(new InferenceAbortError())
            return
          }
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
        text: `Coach note: I can help with ${focus}. Local llama.cpp model integration is scaffolded and ready for adapter wiring. Your message was: ${clipText(message, 200)}`,
        provider: 'stub',
        model: 'llama.cpp-pending',
      }
    },
  }
}

function createAdapterRegistry() {
  const entries = new Map()
  return {
    register(provider, factory) {
      const normalizedProvider = normalizeProviderName(provider)
      if (!normalizedProvider || typeof factory !== 'function') {
        throw new Error('Invalid adapter registration')
      }
      entries.set(normalizedProvider, factory)
    },
    get(provider) {
      return entries.get(normalizeProviderName(provider))
    },
    has(provider) {
      return entries.has(normalizeProviderName(provider))
    },
  }
}

function createTutorChatRuntime(options = {}) {
  const inactivityUnloadMs = Number.isFinite(options.inactivityUnloadMs)
    ? Math.max(15000, Math.floor(options.inactivityUnloadMs))
    : DEFAULT_INACTIVITY_UNLOAD_MS

  const discoveredLlamaCppPath = resolveBundledLlamaCppPath()
  const discoveredModelPath = resolveBundledModelPath()
  const configuredProvider = normalizeProviderName(
    options.provider
    || process.env.JPLEARN_TUTOR_PROVIDER
    || (discoveredLlamaCppPath && discoveredModelPath ? 'llama.cpp' : 'stub'),
  )
  const llamaCppConfig = {
    executablePath: options.llamaCppPath || process.env.JPLEARN_LLAMA_CPP_PATH || discoveredLlamaCppPath,
    modelPath: options.llamaModelPath || process.env.JPLEARN_LLAMA_MODEL_PATH || discoveredModelPath,
    timeoutMs: options.llamaTimeoutMs,
  }

  const maxContextChars = Number.isFinite(options.maxContextChars)
    ? Math.max(120, Math.floor(options.maxContextChars))
    : DEFAULT_MAX_CONTEXT_CHARS
  const maxMessageChars = Number.isFinite(options.maxMessageChars)
    ? Math.max(60, Math.floor(options.maxMessageChars))
    : DEFAULT_MAX_MESSAGE_CHARS
  const maxOutputChars = Number.isFinite(options.maxOutputChars)
    ? Math.max(120, Math.floor(options.maxOutputChars))
    : DEFAULT_MAX_OUTPUT_CHARS
  const maxPromptChars = Number.isFinite(options.maxPromptChars)
    ? Math.max(240, Math.floor(options.maxPromptChars))
    : DEFAULT_MAX_PROMPT_CHARS
  const maxOutputTokens = Number.isFinite(options.maxOutputTokens)
    ? Math.max(24, Math.floor(options.maxOutputTokens))
    : 180

  const adapterRegistry = options.adapterRegistry || createAdapterRegistry()
  if (!adapterRegistry.has('llama.cpp')) {
    adapterRegistry.register('llama.cpp', () => createLlamaCppCliAdapter(llamaCppConfig))
  }
  if (!adapterRegistry.has('stub')) {
    adapterRegistry.register('stub', () => createStubAdapter())
  }

  const adapterFactory = typeof options.adapterFactory === 'function'
    ? options.adapterFactory
    : (() => {
      const registeredFactory = adapterRegistry.get(configuredProvider)
      if (typeof registeredFactory === 'function') {
        return registeredFactory()
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
  let activeInferenceController = null
  let isInferenceActive = false

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
      if (isInferenceActive) {
        throw new Error('Chat inference already active; cancel or wait for completion')
      }

      const trimmedMessage = clipText(message, maxMessageChars)
      const boundedContext = {}
      for (const [key, value] of Object.entries(context || {})) {
        if (typeof value !== 'string') {
          continue
        }
        boundedContext[key] = clipText(value, 280)
      }

      const coldStart = await ensureLoaded()
      lastUsedAtUtc = new Date().toISOString()
      scheduleInactivityUnload()

      const startedAt = Date.now()
      activeInferenceController = new AbortController()
      isInferenceActive = true
      try {
        const inference = await adapter.infer(trimmedMessage, boundedContext, {
          signal: activeInferenceController.signal,
          maxContextChars,
          maxPromptChars,
          maxOutputTokens,
        })
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
          text: clipText(String(inference.text || ''), maxOutputChars),
          provider: String(inference.provider || 'unknown'),
          model: String(inference.model || 'unknown'),
          coldStart,
          elapsedMs,
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        if (error instanceof InferenceAbortError) {
          lastError = 'inference-cancelled'
          throw new Error('Chat inference cancelled')
        }
        lastError = detail
        const fallback = buildScriptedFallbackResponse(trimmedMessage, boundedContext, detail)
        return {
          ok: true,
          text: clipText(fallback.text, maxOutputChars),
          provider: fallback.provider,
          model: fallback.model,
          coldStart,
          elapsedMs: Date.now() - startedAt,
        }
      } finally {
        isInferenceActive = false
        activeInferenceController = null
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
        maxContextChars,
        maxMessageChars,
        maxOutputChars,
        maxOutputTokens,
        inferenceActive: isInferenceActive,
      }
    },

    async cancelActiveInference(reason = 'manual-cancel') {
      if (!isInferenceActive || !activeInferenceController) {
        return {
          ok: true,
          cancelled: false,
          reason,
        }
      }
      activeInferenceController.abort()
      lastError = 'inference-cancelled'
      return {
        ok: true,
        cancelled: true,
        reason,
      }
    },

    async unload(reason = 'manual') {
      if (isInferenceActive && activeInferenceController) {
        activeInferenceController.abort()
      }
      clearUnloadTimer()
      if (loaded && adapter && typeof adapter.unload === 'function') {
        await adapter.unload(reason)
      }
      loaded = false
      adapter = null
      loadedAtUtc = null
      isInferenceActive = false
      activeInferenceController = null
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
  createAdapterRegistry,
}
