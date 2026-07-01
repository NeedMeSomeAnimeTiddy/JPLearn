const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const net = require('node:net')

const DEFAULT_INACTIVITY_UNLOAD_MS = 5 * 60 * 1000
const DEFAULT_LLAMACPP_TIMEOUT_MS = 90000
const DEFAULT_MAX_CONTEXT_CHARS = 1800
const DEFAULT_MAX_MESSAGE_CHARS = 600
const DEFAULT_MAX_OUTPUT_CHARS = 700
const DEFAULT_MAX_PROMPT_CHARS = 3200
const DEFAULT_MODEL_DIRECTORY = path.resolve(__dirname, '..', '..', 'models', 'llama')
const DEFAULT_TUTOR_INSTRUCTIONS_PATH = path.join(DEFAULT_MODEL_DIRECTORY, 'instructions.txt')
const DEFAULT_TUTOR_SYSTEM_PROMPT = [
  'You are JPLearn Coach, a warm and friendly Japanese tutor and conversation partner.',
  'Reply directly with your answer only. Do not show reasoning, planning, or system notes.',
  '',
  'How to talk:',
  '- Be human and conversational, like a friendly tutor. Keep replies short: 1 to 3 sentences. Never write long essays.',
  '- Mirror the user\'s language: if they write in Japanese, reply in Japanese; if in English, reply in English. If mixed, follow whichever they used most.',
  '- When replying in Japanese and a word may be hard, add a tiny gloss in parentheses, e.g. 美味しい (oishii, "tasty"). Do not over-explain.',
  '',
  'Helping them learn:',
  '- If asked a Japanese question (grammar, translation, a word, pronunciation), answer directly and accurately with one short example if helpful.',
  '- Correct mistakes kindly and briefly, then keep the conversation going.',
  '- If unsure of the correct Japanese, say so instead of guessing.',
  '- Do not invent the user\'s progress or personal facts.',
].join('\n')

function resolveBundledLlamaServerPath() {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'tools', 'llama.cpp', 'build', 'bin', 'Release', 'llama-server.exe'),
    path.resolve(__dirname, '..', '..', 'tools', 'llama.cpp', 'build', 'bin', 'llama-server.exe'),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || ''
}

function resolveBundledModelPath() {
  // Check Documents\JPLearn\models\ first (installed app), then the bundled/dev path.
  const directories = []
  const docsDir = (process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
  if (docsDir) {
    directories.push(path.join(docsDir, 'models'))
  }
  directories.push(DEFAULT_MODEL_DIRECTORY)

  for (const dir of directories) {
    if (!fs.existsSync(dir)) continue
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const models = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.gguf'))
      .map((entry) => path.join(dir, entry.name))
      .sort()
    if (models.length > 0) return models[0]
  }
  return ''
}

function resolveTutorSystemPrompt() {
  const envPrompt = typeof process.env.JPLEARN_TUTOR_SYSTEM_PROMPT === 'string'
    ? process.env.JPLEARN_TUTOR_SYSTEM_PROMPT.trim()
    : ''
  if (envPrompt) {
    return envPrompt
  }
  if (fs.existsSync(DEFAULT_TUTOR_INSTRUCTIONS_PATH)) {
    try {
      const filePrompt = fs.readFileSync(DEFAULT_TUTOR_INSTRUCTIONS_PATH, 'utf8').trim()
      if (filePrompt) {
        return filePrompt
      }
    } catch {
      // Ignore unreadable local instruction files and use built-in defaults.
    }
  }
  return DEFAULT_TUTOR_SYSTEM_PROMPT
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

function extractCliResponseText(rawOutput) {
  const raw = typeof rawOutput === 'string' ? rawOutput : String(rawOutput || '')
  if (!raw.trim()) {
    return ''
  }

  let lines = raw.replace(/\r/g, '').split('\n')

  // llama-cli single-turn mode appends a standalone "Exiting..." footer line.
  lines = lines.filter((line) => !/^\s*Exiting\.\.\.\s*$/i.test(line))

  // The conversation UI echoes the user message on a line starting with "> ".
  // Everything after the last echo line is the model turn (banner/header dropped).
  let echoIndex = -1
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^\s*>\s/.test(lines[index]) || /^\s*>$/.test(lines[index])) {
      echoIndex = index
      break
    }
  }

  let body = echoIndex >= 0 ? lines.slice(echoIndex + 1).join('\n') : lines.join('\n')

  // This model emits reasoning as plain "[Start thinking] ... [End thinking]" text
  // rather than standard <think> tags, so strip it here. Handle unterminated blocks.
  body = body.replace(/\[\s*start thinking\s*\][\s\S]*?\[\s*end thinking\s*\]/gi, '')
  body = body.replace(/\[\s*start thinking\s*\][\s\S]*$/i, '')

  // Defensive: also strip standard think tags if a future model uses them.
  body = body.replace(/<think>[\s\S]*?<\/think>/gi, '')
  body = body.replace(/<think>[\s\S]*$/i, '')

  return body.trim()
}

function buildScriptedFallbackResponse(message, context = {}, detail = '') {
  const focus = typeof context.focus_area === 'string' && context.focus_area.trim().length > 0
    ? context.focus_area.trim()
    : 'today\'s weakest area'
  const messageHint = clipText(message, 120)
  void detail
  void messageHint
  return {
    text: `Coach note: let's keep momentum on ${focus}. Start one focused round, then re-check your confidence on the items that felt shaky.`,
    provider: 'scripted-fallback',
    model: 'deterministic-scripted',
  }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.unref()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const resolvedPort = address && typeof address === 'object' ? address.port : 0
      probe.close(() => resolve(resolvedPort))
    })
  })
}

function httpRequestJson(requestOptions, payload, signal) {
  return new Promise((resolve, reject) => {
    const data = payload ? Buffer.from(JSON.stringify(payload), 'utf8') : null
    const req = http.request(requestOptions, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        raw += chunk
      })
      res.on('end', () => resolve({ status: res.statusCode || 0, body: raw }))
    })
    req.on('error', (error) => reject(error))
    if (signal && typeof signal.addEventListener === 'function') {
      const onAbort = () => req.destroy(new InferenceAbortError())
      if (signal.aborted) {
        onAbort()
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    }
    if (data) {
      req.setHeader('Content-Type', 'application/json')
      req.setHeader('Content-Length', data.length)
      req.write(data)
    }
    req.end()
  })
}

function stripThinkTags(rawText) {
  return String(rawText || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim()
}

function createLlamaServerAdapter(config = {}) {
  const executablePath = typeof config.executablePath === 'string' ? config.executablePath.trim() : ''
  const modelPath = typeof config.modelPath === 'string' ? config.modelPath.trim() : ''
  const requestTimeoutMs = Number.isFinite(config.timeoutMs)
    ? Math.max(5000, Math.floor(config.timeoutMs))
    : DEFAULT_LLAMACPP_TIMEOUT_MS
  const startupTimeoutMs = Number.isFinite(config.startupTimeoutMs)
    ? Math.max(10000, Math.floor(config.startupTimeoutMs))
    : 120000
  const host = '127.0.0.1'

  let serverProcess = null
  let port = 0
  let exitHandlerRegistered = false

  function stopServer() {
    if (serverProcess && serverProcess.exitCode === null) {
      try {
        serverProcess.kill()
      } catch {
        // Process may already be gone.
      }
    }
    serverProcess = null
    port = 0
  }

  async function waitForHealth() {
    const deadline = Date.now() + startupTimeoutMs
    while (Date.now() < deadline) {
      if (serverProcess && serverProcess.exitCode !== null) {
        throw new Error('llama-server exited before becoming ready')
      }
      try {
        const res = await httpRequestJson({ host, port, path: '/health', method: 'GET', timeout: 4000 })
        if (res.status === 200) {
          return
        }
      } catch {
        // Server not accepting connections yet; keep polling.
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 600))
    }
    throw new Error('llama-server did not become healthy in time')
  }

  return {
    async load() {
      if (!executablePath) {
        throw new Error('llama.cpp server requires JPLEARN_LLAMA_SERVER_PATH or a built llama-server.exe')
      }
      if (!fs.existsSync(executablePath)) {
        throw new Error(`llama-server executable not found: ${executablePath}`)
      }
      if (!modelPath) {
        throw new Error(`llama.cpp runtime requires JPLEARN_LLAMA_MODEL_PATH or a .gguf model in ${DEFAULT_MODEL_DIRECTORY}`)
      }
      if (!fs.existsSync(modelPath)) {
        throw new Error(`llama.cpp model not found: ${modelPath}`)
      }

      if (serverProcess && serverProcess.exitCode === null && port) {
        // Server already running and ready for reuse.
        return
      }

      const configuredPort = Number(process.env.JPLEARN_LLAMA_SERVER_PORT)
      port = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : await findFreePort()

      const args = [
        '-m', modelPath,
        '-c', '2048',
        '-t', '6',
        '--host', host,
        '--port', String(port),
        '--no-webui',
        '--chat-template', 'chatml',
      ]
      serverProcess = spawn(executablePath, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] })
      serverProcess.on('error', () => stopServer())

      if (!exitHandlerRegistered) {
        exitHandlerRegistered = true
        process.once('exit', stopServer)
      }

      await waitForHealth()
    },

    async unload() {
      stopServer()
      return undefined
    },

    async infer(message, context = {}, runtimeOptions = {}) {
      const contextText = sanitizeContextText(context, runtimeOptions)
      const systemPrompt = resolveTutorSystemPrompt()
      const composedSystemPrompt = contextText
        ? `${systemPrompt}\n\nCurrent context:\n${contextText}`
        : systemPrompt
      const boundedSystemPrompt = clipText(composedSystemPrompt, runtimeOptions.maxPromptChars || DEFAULT_MAX_PROMPT_CHARS)
      const boundedMessage = clipText(message, DEFAULT_MAX_MESSAGE_CHARS)
      const maxOutputTokens = Number.isFinite(runtimeOptions.maxOutputTokens)
        ? Math.max(24, Math.floor(runtimeOptions.maxOutputTokens))
        : 256

      if (!serverProcess || serverProcess.exitCode !== null) {
        throw new Error('llama-server is not running')
      }

      const payload = {
        messages: [
          { role: 'system', content: boundedSystemPrompt },
          { role: 'user', content: boundedMessage },
        ],
        temperature: 0.6,
        top_p: 0.9,
        top_k: 20,
        repeat_penalty: 1.1,
        max_tokens: maxOutputTokens,
        cache_prompt: true,
        stream: false,
      }

      const response = await httpRequestJson(
        { host, port, path: '/v1/chat/completions', method: 'POST', timeout: requestTimeoutMs },
        payload,
        runtimeOptions.signal,
      )

      if (response.status !== 200) {
        throw new Error(`llama-server returned status ${response.status}`)
      }

      let parsed
      try {
        parsed = JSON.parse(response.body)
      } catch {
        throw new Error('llama-server returned malformed JSON')
      }

      const content = parsed && Array.isArray(parsed.choices) && parsed.choices[0] && parsed.choices[0].message
        ? parsed.choices[0].message.content
        : ''
      const text = stripThinkTags(content)
      if (!text) {
        throw new Error('llama-server returned empty response')
      }

      return {
        text,
        provider: 'llama.cpp',
        model: path.basename(modelPath),
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
      void message
      const focus = typeof context.focus_area === 'string' && context.focus_area.trim().length > 0
        ? context.focus_area.trim()
        : 'today\'s weakest area'
      return {
        text: `Let's keep your momentum going on ${focus}. Try one short, focused round and notice which items feel shaky, then we can work through those together.`,
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

  const discoveredLlamaServerPath = resolveBundledLlamaServerPath()
  const discoveredModelPath = resolveBundledModelPath()
  const configuredProvider = normalizeProviderName(
    options.provider
    || process.env.JPLEARN_TUTOR_PROVIDER
    || (discoveredLlamaServerPath && discoveredModelPath ? 'llama.cpp' : 'stub'),
  )
  // Explicit options are honored as-is. For ambient environment variables we
  // fall back to the discovered on-disk model/server when the configured path
  // is missing (e.g. a stale variable points at a model that no longer exists);
  // otherwise the runtime would fail to load and silently drop to the stub.
  const preferExistingPath = (preferredPath, fallbackPath) => {
    const trimmedPreferred = typeof preferredPath === 'string' ? preferredPath.trim() : ''
    if (trimmedPreferred && fs.existsSync(trimmedPreferred)) {
      return trimmedPreferred
    }
    return fallbackPath
  }
  const llamaCppConfig = {
    executablePath: options.llamaServerPath
      || preferExistingPath(process.env.JPLEARN_LLAMA_SERVER_PATH, discoveredLlamaServerPath),
    modelPath: options.llamaModelPath
      || preferExistingPath(process.env.JPLEARN_LLAMA_MODEL_PATH, discoveredModelPath),
    timeoutMs: options.llamaTimeoutMs,
    startupTimeoutMs: options.llamaServerStartupTimeoutMs,
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
    adapterRegistry.register('llama.cpp', () => createLlamaServerAdapter(llamaCppConfig))
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
        if (error instanceof InferenceAbortError || /llama\.cpp exited with code 130/i.test(detail)) {
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

    async preload(reason = 'startup-preload') {
      const coldStart = await ensureLoaded()
      lastUsedAtUtc = new Date().toISOString()
      scheduleInactivityUnload()
      return {
        ok: true,
        reason,
        coldStart,
        loaded,
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
  extractCliResponseText,
}
