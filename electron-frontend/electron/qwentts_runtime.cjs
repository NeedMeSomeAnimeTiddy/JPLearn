/**
 * qwentts_runtime.cjs — local Japanese speech synthesis via a persistent
 * qwentts.cpp `tts-server.exe` subprocess (OpenAI-compatible HTTP API).
 *
 * Replaces the OpenVoice runtime (openvoice_runtime.cjs, removed). Unlike
 * OpenVoice's stdin/stdout JSON protocol, qwentts.cpp's server speaks plain
 * HTTP (POST /v1/audio/speech, GET /health, GET /v1/voices), so this module
 * mirrors llm_runtime.cjs's llama-server adapter shape (spawn + findFreePort
 * + poll /health + JSON-over-HTTP) rather than openvoice_runtime.cjs's
 * request-id/stdin-stdout plumbing.
 *
 * Two GGUF files are required together: a talker
 * (models/qwen-talker-*.gguf) and a shared tokenizer/codec
 * (models/qwen-tokenizer-*.gguf). The talker's mode (base/customvoice/
 * voicedesign) is baked into the GGUF; JPLearn ships "base" mode talkers so
 * voice selection works entirely through the curated preset speaker bank
 * (see patches/qwentts-cpp/0001-speaker-bank.patch and
 * scripts/build_qwentts_cpp.ps1 for how --speaker-bank support was added).
 *
 * Because the talker+codec GGUFs load fully during process startup (before
 * tts-server.exe even binds its HTTP port), there is no per-speaker lazy
 * load step the way OpenVoice had -- preload() here just ensures the server
 * process is up and healthy, the "speaker" argument does not change what
 * gets loaded.
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const net = require('node:net')
const { spawn } = require('node:child_process')

const DEFAULT_MAX_TEXT_CHARS = 400
const DEFAULT_STARTUP_TIMEOUT_MS = 120000
const DEFAULT_REQUEST_TIMEOUT_MS = 60000
const HOST = '127.0.0.1'
const MIXED_STITCH_CROSSFADE_MS = 40
const PROFILE_MAIN = 'main'
const PROFILE_JP = 'jp'
const PROFILE_EN = 'en'
const TALKER_TIER_PATTERN = /^qwen-talker-(0\.6b)-.*\.gguf$/i

let activeQwenttsServerGuard = null
let qwenttsServerOwnerCounter = 0

function containsJapaneseScript(text) {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}々〆ヵヶ]/u.test(text)
}

function containsLatinLetters(text) {
  return /[A-Za-z]/.test(text)
}

function inferLanguageProfile(text) {
  const hasJapanese = containsJapaneseScript(text)
  const hasLatin = containsLatinLetters(text)

  if (hasJapanese && !hasLatin) {
    return PROFILE_JP
  }
  if (hasLatin && !hasJapanese) {
    return PROFILE_EN
  }
  return PROFILE_MAIN
}

function detectCharLanguage(char) {
  if (containsJapaneseScript(char)) {
    return PROFILE_JP
  }
  if (containsLatinLetters(char)) {
    return PROFILE_EN
  }
  return null
}

function normalizeUnknownRuns(runs) {
  if (!runs.length) {
    return runs
  }

  for (let i = 0; i < runs.length; i += 1) {
    if (runs[i].profile !== 'unknown') {
      continue
    }

    let replacement = null
    for (let j = i - 1; j >= 0; j -= 1) {
      if (runs[j].profile !== 'unknown') {
        replacement = runs[j].profile
        break
      }
    }
    if (!replacement) {
      for (let j = i + 1; j < runs.length; j += 1) {
        if (runs[j].profile !== 'unknown') {
          replacement = runs[j].profile
          break
        }
      }
    }
    runs[i].profile = replacement || PROFILE_MAIN
  }

  const merged = []
  for (const run of runs) {
    if (!run.text) {
      continue
    }
    const prev = merged[merged.length - 1]
    if (prev && prev.profile === run.profile) {
      prev.text += run.text
    } else {
      merged.push({ ...run })
    }
  }
  return merged
}

function splitMixedLanguageRuns(text) {
  const runs = []
  for (const char of text) {
    const profile = detectCharLanguage(char)
    if (!runs.length) {
      runs.push({ profile: profile || 'unknown', text: char })
      continue
    }
    const prev = runs[runs.length - 1]
    if (!profile || prev.profile === profile) {
      prev.text += char
    } else {
      runs.push({ profile, text: char })
    }
  }

  return normalizeUnknownRuns(runs)
    .map((run) => ({ profile: run.profile, text: run.text.trim() }))
    .filter((run) => run.text.length > 0 && (run.profile === PROFILE_JP || run.profile === PROFILE_EN))
}

function sanitizeSpeechText(text) {
  return typeof text === 'string' ? text.replace(/〜/g, '').trim() : ''
}

function getJPLearnInstallDir() {
  const explicit = (process.env.JPLEARN_ASSETS_DIR || process.env.JPLEARN_USER_DATA_DIR || '').trim()
  if (explicit) {
    return explicit
  }
  const legacyDocs = (process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
  if (legacyDocs) {
    return legacyDocs
  }
  if (process.platform === 'win32') {
    const localAppData = (process.env.LOCALAPPDATA || '').trim()
    if (localAppData) {
      return path.join(localAppData, 'JPLearn Assets')
    }
  }
  let appData
  try {
    appData = require('electron').app.getPath('appData')
  } catch {
    appData = path.join(os.homedir(), '.local', 'share')
  }
  return path.join(appData, 'JPLearn Assets')
}

function resolveQwenttsBaseDir() {
  return path.join(getJPLearnInstallDir(), 'tts')
}

// Packaged builds bundle the CPU-only tts-server.exe (+ ggml*.dll) as an
// extraResource (see forge.config.cjs); dev/local runs use the build output
// of scripts/build_qwentts_cpp.ps1 directly.
function resolveQwenttsBinaryPath(repoRoot) {
  const resourcesPath = (process.resourcesPath || '').trim()
  if (resourcesPath) {
    const bundled = path.join(resourcesPath, 'qwentts', 'tts-server.exe')
    if (fs.existsSync(bundled)) {
      return bundled
    }
  }
  return path.join(repoRoot, 'tools', 'qwentts.cpp', 'build', 'Release', 'tts-server.exe')
}

function findFirstMatch(dir, pattern) {
  if (!fs.existsSync(dir)) {
    return null
  }
  const entries = fs.readdirSync(dir).filter((name) => pattern.test(name)).sort()
  return entries.length ? path.join(dir, entries[0]) : null
}

// setup_runtime.cjs persists the user's selected tier as the exact talker
// filename to load (tts/active-qwentts-tier.json), the same pattern used for
// the tutor LLM's active-model.json. Reading it here means installing a
// alternative tier files don't silently keep loading
// whichever talker file happens to sort first alphabetically.
function readActiveQwenttsTalkerFilename(baseDir) {
  try {
    const raw = fs.readFileSync(path.join(baseDir, 'active-qwentts-tier.json'), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.talkerFilename === 'string' && parsed.talkerFilename.trim()) {
      return parsed.talkerFilename.trim()
    }
  } catch {
    // No selection persisted yet, or unreadable; caller falls back to auto-detect.
  }
  return null
}

function readActiveQwenttsTier(baseDir) {
  try {
    const raw = fs.readFileSync(path.join(baseDir, 'active-qwentts-tier.json'), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.tier === 'string' && parsed.tier.trim()) {
      return parsed.tier.trim()
    }
  } catch {
    // No persisted tier selection yet.
  }
  return null
}

function findVoiceCompatibleTalker(modelsDir) {
  return findFirstMatch(modelsDir, /^qwen-talker-0\.6b-.*\.gguf$/i)
}

function inferTierFromTalkerFilename(talkerFilename) {
  if (typeof talkerFilename !== 'string') {
    return null
  }
  const match = TALKER_TIER_PATTERN.exec(talkerFilename.trim())
  return match ? match[1].toLowerCase() : null
}

function inferTierFromTalkerPath(talkerPath) {
  if (typeof talkerPath !== 'string' || !talkerPath.trim()) {
    return null
  }
  return inferTierFromTalkerFilename(path.basename(talkerPath.trim()))
}

function expectedSpeakerEmbeddingDimForTier(tier) {
  if (tier === '0.6b') {
    return 1024
  }
  return null
}

function findSpeakerEmbeddingDimMismatch(presetBankDir, expectedDim) {
  if (!Number.isInteger(expectedDim) || expectedDim <= 0 || !fs.existsSync(presetBankDir)) {
    return null
  }
  const expectedSize = expectedDim * 4
  const entries = fs.readdirSync(presetBankDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  for (const entry of entries) {
    const spkPath = path.join(presetBankDir, entry.name, 'spk.bin')
    if (!fs.existsSync(spkPath)) {
      continue
    }
    let stat
    try {
      stat = fs.statSync(spkPath)
    } catch {
      continue
    }
    if (!stat.isFile() || stat.size <= 0 || stat.size % 4 !== 0) {
      continue
    }
    if (stat.size !== expectedSize) {
      return {
        speakerId: entry.name,
        actualDim: Math.floor(stat.size / 4),
        expectedDim,
      }
    }
  }
  return null
}

function resolveQwenttsModelPaths(baseDir, preferVoiceCompatibleTalker = false) {
  const modelsDir = path.join(baseDir, 'models')
  const activeTalkerFilename = readActiveQwenttsTalkerFilename(baseDir)
  const activeTalkerPath = activeTalkerFilename ? path.join(modelsDir, activeTalkerFilename) : null
  const compatibleTalkerPath = findVoiceCompatibleTalker(modelsDir)
  const autoTalkerPath = findFirstMatch(modelsDir, /^qwen-talker-.*\.gguf$/i)

  let talkerPath = null
  if (preferVoiceCompatibleTalker && compatibleTalkerPath) {
    talkerPath = compatibleTalkerPath
  } else if (activeTalkerPath && fs.existsSync(activeTalkerPath)) {
    talkerPath = activeTalkerPath
  } else {
    talkerPath = autoTalkerPath
  }

  return {
    modelsDir,
    talkerPath,
    tokenizerPath: findFirstMatch(modelsDir, /^qwen-tokenizer-.*\.gguf$/i),
  }
}

function resolvePresetBankDir(baseDir, profile = PROFILE_MAIN, tier = null) {
  const normalizedTier = typeof tier === 'string' ? tier.trim() : ''

  if (normalizedTier) {
    if (profile === PROFILE_JP) {
      return path.join(baseDir, `preset_bank_jp_${normalizedTier}`)
    }
    if (profile === PROFILE_EN) {
      return path.join(baseDir, `preset_bank_en_${normalizedTier}`)
    }
    return path.join(baseDir, `preset_bank_${normalizedTier}`)
  }

  if (profile === PROFILE_JP) {
    return path.join(baseDir, 'preset_bank_jp')
  }
  if (profile === PROFILE_EN) {
    return path.join(baseDir, 'preset_bank_en')
  }
  return path.join(baseDir, 'preset_bank')
}

function resolvePresetBankDirForProfile(baseDir, profile, tierHint = null) {
  const hintedTier = typeof tierHint === 'string' ? tierHint.trim().toLowerCase() : ''
  const activeTier = hintedTier || readActiveQwenttsTier(baseDir)
  const preferredTierRoot = resolvePresetBankDir(baseDir, profile, activeTier)
  if (fs.existsSync(preferredTierRoot)) {
    return preferredTierRoot
  }

  const preferred = resolvePresetBankDir(baseDir, profile)
  if (fs.existsSync(preferred)) {
    return preferred
  }

  const fallbackTierMainRoot = resolvePresetBankDir(baseDir, PROFILE_MAIN, activeTier)
  if (fs.existsSync(fallbackTierMainRoot)) {
    return fallbackTierMainRoot
  }

  return resolvePresetBankDir(baseDir, PROFILE_MAIN)
}

// Preset folder name is the OAI "voice" name the patched server exposes via
// --speaker-bank; a folder only counts once its required spk.bin exists
// (see patches/qwentts-cpp/0001-speaker-bank.patch).
function loadPresetSpeakerNames(baseDir) {
  const presetRoot = resolvePresetBankDir(baseDir, PROFILE_MAIN)
  if (!fs.existsSync(presetRoot)) {
    return []
  }
  return fs.readdirSync(presetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(presetRoot, entry.name, 'spk.bin')))
    .map((entry) => entry.name)
    .sort()
}

// Enriched version of loadPresetSpeakerNames for renderer display: reads each
// preset's preset.json (written by scripts/build_qwentts_preset_bank.py) for a
// display name/description, falling back to the folder name if preset.json is
// missing or unreadable.
function loadPresetSpeakers(baseDir) {
  const presetRoot = resolvePresetBankDir(baseDir, PROFILE_MAIN)
  if (!fs.existsSync(presetRoot)) {
    return []
  }
  return fs.readdirSync(presetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(presetRoot, entry.name, 'spk.bin')))
    .map((entry) => {
      let metadata = {}
      try {
        metadata = JSON.parse(fs.readFileSync(path.join(presetRoot, entry.name, 'preset.json'), 'utf8'))
      } catch {
        // No preset.json (or unreadable); fall back to folder name only.
      }
      return {
        voiceId: entry.name,
        displayName: typeof metadata.displayName === 'string' && metadata.displayName.trim()
          ? metadata.displayName.trim()
          : entry.name,
        description: typeof metadata.description === 'string' ? metadata.description : '',
        gender: typeof metadata.gender === 'string' ? metadata.gender : undefined,
        searchTerms: Array.isArray(metadata.searchTerms)
          ? metadata.searchTerms.filter((term) => typeof term === 'string')
          : [],
      }
    })
    .sort((a, b) => a.voiceId.localeCompare(b.voiceId))
}

function isQwenttsInstalled(repoRoot) {
  const binaryPath = resolveQwenttsBinaryPath(repoRoot)
  const baseDir = resolveQwenttsBaseDir()
  const { talkerPath, tokenizerPath } = resolveQwenttsModelPaths(baseDir)
  return Boolean(fs.existsSync(binaryPath) && talkerPath && tokenizerPath)
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.unref()
    probe.on('error', reject)
    probe.listen(0, HOST, () => {
      const address = probe.address()
      const resolvedPort = address && typeof address === 'object' ? address.port : 0
      probe.close(() => resolve(resolvedPort))
    })
  })
}

// Binary-safe HTTP helper: qwentts's /v1/audio/speech (response_format=wav)
// returns raw RIFF bytes, not JSON, so responses are collected as a Buffer
// rather than decoded as utf8 (unlike llm_runtime.cjs's JSON-only helper).
function httpRequestBinary(requestOptions, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = payload ? Buffer.from(JSON.stringify(payload), 'utf8') : null
    const req = http.request(requestOptions, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks) }))
    })
    req.on('error', (error) => reject(error))
    if (timeoutMs) {
      req.setTimeout(timeoutMs, () => req.destroy(new Error('qwentts request timed out')))
    }
    if (data) {
      req.setHeader('Content-Type', 'application/json')
      req.setHeader('Content-Length', data.length)
      req.write(data)
    }
    req.end()
  })
}

function isLikelyWav(body) {
  if (!Buffer.isBuffer(body) || body.length < 12) {
    return false
  }
  return body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WAVE'
}

function decodePcm16MonoWav(buffer) {
  if (!isLikelyWav(buffer)) {
    throw new Error('Expected RIFF/WAVE payload')
  }

  let offset = 12
  let format = null
  let sampleRate = 0
  let channels = 0
  let bitsPerSample = 0
  let dataChunk = null

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkSize
    if (chunkEnd > buffer.length) {
      break
    }

    if (chunkId === 'fmt ' && chunkSize >= 16) {
      format = buffer.readUInt16LE(chunkStart)
      channels = buffer.readUInt16LE(chunkStart + 2)
      sampleRate = buffer.readUInt32LE(chunkStart + 4)
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14)
    }
    if (chunkId === 'data') {
      dataChunk = buffer.subarray(chunkStart, chunkEnd)
    }

    offset = chunkEnd + (chunkSize % 2)
  }

  if (format !== 1 || channels !== 1 || bitsPerSample !== 16 || !dataChunk) {
    throw new Error('Unsupported WAV format (expected PCM16 mono)')
  }

  const sampleCount = Math.floor(dataChunk.length / 2)
  const samples = new Array(sampleCount)
  for (let i = 0; i < sampleCount; i += 1) {
    samples[i] = dataChunk.readInt16LE(i * 2)
  }

  return { sampleRate, samples }
}

function encodePcm16MonoWav(sampleRate, samples) {
  const dataLength = samples.length * 2
  const out = Buffer.alloc(44 + dataLength)

  out.write('RIFF', 0, 4, 'ascii')
  out.writeUInt32LE(36 + dataLength, 4)
  out.write('WAVE', 8, 4, 'ascii')
  out.write('fmt ', 12, 4, 'ascii')
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(1, 22)
  out.writeUInt32LE(sampleRate, 24)
  out.writeUInt32LE(sampleRate * 2, 28)
  out.writeUInt16LE(2, 32)
  out.writeUInt16LE(16, 34)
  out.write('data', 36, 4, 'ascii')
  out.writeUInt32LE(dataLength, 40)

  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-32768, Math.min(32767, Math.round(samples[i])))
    out.writeInt16LE(value, 44 + (i * 2))
  }

  return out
}

function stitchWavBuffers(buffers, crossfadeMs = MIXED_STITCH_CROSSFADE_MS) {
  if (!buffers.length) {
    throw new Error('No WAV buffers to stitch')
  }

  const decoded = buffers.map((buffer) => decodePcm16MonoWav(buffer))
  const sampleRate = decoded[0].sampleRate
  if (decoded.some((item) => item.sampleRate !== sampleRate)) {
    throw new Error('Cannot stitch WAV buffers with different sample rates')
  }

  let merged = decoded[0].samples.slice()
  const crossfadeSamples = Math.max(1, Math.floor((sampleRate * crossfadeMs) / 1000))

  for (let i = 1; i < decoded.length; i += 1) {
    const next = decoded[i].samples
    const n = Math.min(crossfadeSamples, merged.length, next.length)

    if (n > 0) {
      for (let j = 0; j < n; j += 1) {
        const t = j / n
        const mixed = ((1 - t) * merged[merged.length - n + j]) + (t * next[j])
        merged[merged.length - n + j] = mixed
      }
      merged = merged.concat(next.slice(n))
    } else {
      merged = merged.concat(next)
    }
  }

  return encodePcm16MonoWav(sampleRate, merged)
}

function createServerState() {
  return {
    process: null,
    port: 0,
    startPromise: null,
  }
}

function isTransientSpeechNetworkError(error) {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = typeof error.code === 'string' ? error.code : ''
  return code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'EPIPE' || code === 'ETIMEDOUT'
}

function isSpeakerDimMismatchError(error) {
  const detail = error instanceof Error ? error.message : String(error)
  return /ref_spk_dim\s+\d+\s+mismatches\s+talker\s+hidden\s+\d+/i.test(detail)
}

function createSynthesisMeta() {
  return {
    mode: 'single',
    profile: PROFILE_MAIN,
    mixedStitchingEnabled: true,
    mixedSegmentCount: 0,
    streamingAttempted: false,
    streamingFallbackUsed: false,
    elapsedMs: 0,
  }
}

function createQwenttsRuntime(options = {}) {
  const repoRoot = typeof options.repoRoot === 'string' && options.repoRoot.trim()
    ? options.repoRoot.trim()
    : path.resolve(__dirname, '..', '..')
  const maxTextChars = Number.isFinite(options.maxTextChars) ? Math.max(1, Math.floor(options.maxTextChars)) : DEFAULT_MAX_TEXT_CHARS
  const startupTimeoutMs = Number.isFinite(options.startupTimeoutMs)
    ? Math.max(10000, Math.floor(options.startupTimeoutMs))
    : DEFAULT_STARTUP_TIMEOUT_MS
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs)
    ? Math.max(5000, Math.floor(options.requestTimeoutMs))
    : DEFAULT_REQUEST_TIMEOUT_MS

  // Keep a single heavy qwentts backend process alive. Spawning one server
  // per language profile multiplies memory footprint and can exhaust RAM.
  const serverState = createServerState()
  let lastError = null
  let exitHandlerRegistered = false
  const ownerId = ++qwenttsServerOwnerCounter

  function stopServer(state) {
    if (state.process && state.process.exitCode === null) {
      try { state.process.kill() } catch { /* ignore */ }
    }
    state.process = null
    state.port = 0
    state.startPromise = null
    if (activeQwenttsServerGuard && activeQwenttsServerGuard.ownerId === ownerId) {
      activeQwenttsServerGuard = null
    }
  }

  function stopAllServers() {
    stopServer(serverState)
  }

  async function waitForHealth(state) {
    const deadline = Date.now() + startupTimeoutMs
    while (Date.now() < deadline) {
      if (state.process && state.process.exitCode !== null) {
        throw new Error('qwentts server exited before becoming ready')
      }
      try {
        const res = await httpRequestBinary({ host: HOST, port: state.port, path: '/health', method: 'GET' }, null, 4000)
        if (res.status === 200) {
          return
        }
      } catch {
        // Not accepting connections yet; keep polling.
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 400))
    }
    throw new Error('qwentts server did not become healthy in time')
  }

  async function ensureStarted(_profile = PROFILE_MAIN) {
    const state = serverState
    if (state.process && state.process.exitCode === null && state.port) {
      return
    }
    if (state.startPromise) {
      return state.startPromise
    }

    state.startPromise = (async () => {
      const binaryPath = resolveQwenttsBinaryPath(repoRoot)
      if (!fs.existsSync(binaryPath)) {
        throw new Error(`qwentts server binary not found: ${binaryPath}`)
      }
      const baseDir = resolveQwenttsBaseDir()
      const { modelsDir, talkerPath, tokenizerPath } = resolveQwenttsModelPaths(baseDir, false)
      if (!talkerPath || !tokenizerPath) {
        throw new Error(`qwentts model files are missing under ${modelsDir}`)
      }

      if (
        activeQwenttsServerGuard
        && activeQwenttsServerGuard.ownerId !== ownerId
        && activeQwenttsServerGuard.process
        && activeQwenttsServerGuard.process.exitCode === null
      ) {
        throw new Error('Refusing to spawn a second local qwentts server instance while one is already active')
      }
      const talkerTier = inferTierFromTalkerPath(talkerPath) || readActiveQwenttsTier(baseDir)
      // Always anchor to the main bank for the shared server to avoid
      // spinning up per-language heavyweight backends.
      const presetBankDir = resolvePresetBankDirForProfile(baseDir, PROFILE_MAIN, talkerTier)

      const expectedSpkDim = expectedSpeakerEmbeddingDimForTier(talkerTier)
      const mismatch = findSpeakerEmbeddingDimMismatch(presetBankDir, expectedSpkDim)
      if (mismatch) {
        throw new Error(
          `Preset speaker '${mismatch.speakerId}' is ${mismatch.actualDim}D but talker tier ${talkerTier} requires ${mismatch.expectedDim}D. Rebuild/install tier-matched preset_bank_${talkerTier}.`
        )
      }

      state.port = await findFreePort()
      const args = ['--model', talkerPath, '--codec', tokenizerPath, '--host', HOST, '--port', String(state.port)]
      if (fs.existsSync(presetBankDir)) {
        args.push('--speaker-bank', presetBankDir)
      }

      const proc = spawn(binaryPath, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
      activeQwenttsServerGuard = {
        ownerId,
        process: proc,
        talkerPath,
        tokenizerPath,
        port: state.port,
      }
      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8').trim()
        if (text) lastError = text
      })
      proc.on('error', (error) => {
        lastError = error instanceof Error ? error.message : String(error)
        stopServer(state)
      })
      proc.on('exit', () => {
        if (state.process === proc) {
          state.process = null
          state.port = 0
        }
      })
      state.process = proc

      if (!exitHandlerRegistered) {
        exitHandlerRegistered = true
        process.once('exit', stopAllServers)
      }

      await waitForHealth(state)
      lastError = null
    })()

    try {
      await state.startPromise
    } finally {
      state.startPromise = null
    }
  }

  function pickModelName() {
    const { talkerPath } = resolveQwenttsModelPaths(resolveQwenttsBaseDir())
    return talkerPath ? `qwentts:${path.basename(talkerPath)}` : 'qwentts:unavailable'
  }

  function resolveVoiceName(speaker) {
    if (typeof speaker === 'string' && speaker.trim()) {
      return speaker.trim()
    }
    if (Number.isInteger(speaker)) {
      const presets = loadPresetSpeakerNames(resolveQwenttsBaseDir())
      if (!presets.length) {
        return undefined
      }
      const index = Math.min(Math.max(speaker, 0), presets.length - 1)
      return presets[index]
    }
    return undefined
  }

  async function requestSpeechWav(text, speaker, speed, _profile, tryStreaming) {
    const state = serverState

    async function postSpeech(payload, allowRecoverRetry = true) {
      await ensureStarted(_profile)
      try {
        return await httpRequestBinary(
          { host: HOST, port: state.port, path: '/v1/audio/speech', method: 'POST' },
          payload,
          requestTimeoutMs,
        )
      } catch (error) {
        if (!allowRecoverRetry || !isTransientSpeechNetworkError(error)) {
          throw error
        }

        // Recover from transient socket failures by restarting only the
        // affected profile server and retrying once.
        stopServer(state)
        await ensureStarted(_profile)
        return await httpRequestBinary(
          { host: HOST, port: state.port, path: '/v1/audio/speech', method: 'POST' },
          payload,
          requestTimeoutMs,
        )
      }
    }

    const voice = resolveVoiceName(speaker)
    const payload = { input: text, response_format: 'wav' }
    if (voice) {
      payload.voice = voice
    }
    if (Number.isFinite(speed)) {
      payload.speed = Math.min(2, Math.max(0.5, speed))
    }
    if (tryStreaming) {
      payload.stream = true
    }

    let response = await postSpeech(payload, true)

    let streamingFallbackUsed = false
    if (tryStreaming && response.status === 200 && !isLikelyWav(response.body)) {
      const retryPayload = { ...payload, stream: false }
      response = await postSpeech(retryPayload, true)
      streamingFallbackUsed = true
    }

    if (response.status !== 200) {
      let message = `qwentts server returned status ${response.status}`
      try {
        const parsed = JSON.parse(response.body.toString('utf8'))
        if (parsed && parsed.error && parsed.error.message) {
          message = parsed.error.message
        }
      } catch {
        // Keep the generic status message.
      }
      throw new Error(message)
    }
    if (!response.body.length) {
      throw new Error('qwentts server returned empty audio')
    }
    if (!isLikelyWav(response.body)) {
      throw new Error('qwentts server returned non-WAV audio payload')
    }

    return {
      voice,
      wav: response.body,
      streamingFallbackUsed,
    }
  }

  async function synthesize(text, speaker, speed, speakOptions = {}) {
    if (!isQwenttsInstalled(repoRoot)) {
      throw new Error('qwentts runtime is not fully installed')
    }
    const normalized = sanitizeSpeechText(text)
    if (!normalized) {
      throw new Error('Speak text must not be empty')
    }
    const boundedText = normalized.length <= maxTextChars ? normalized : normalized.slice(0, maxTextChars)

    const startedAt = Date.now()
    const meta = createSynthesisMeta()
    const mixedStitchingEnabled = speakOptions.mixedLanguageStitchingEnabled !== false
    meta.mixedStitchingEnabled = mixedStitchingEnabled

    let voice
    let wav

    const runSynthesisOnce = async () => {
      const hasJapanese = containsJapaneseScript(boundedText)
      const hasLatin = containsLatinLetters(boundedText)

      voice = resolveVoiceName(speaker)
      wav = undefined

      if (hasJapanese && hasLatin && mixedStitchingEnabled) {
        const runs = splitMixedLanguageRuns(boundedText)
        if (runs.length >= 2) {
          meta.mode = 'mixed_stitched'
          meta.profile = PROFILE_MAIN
          meta.mixedSegmentCount = runs.length
          const parts = []
          for (const run of runs) {
            const segment = await requestSpeechWav(run.text, speaker, speed, run.profile, false)
            voice = voice || segment.voice
            parts.push(segment.wav)
          }
          wav = stitchWavBuffers(parts, MIXED_STITCH_CROSSFADE_MS)
        }
      }

      if (!wav) {
        const profile = inferLanguageProfile(boundedText)
        const shouldTryStreaming = profile !== PROFILE_MAIN
        meta.mode = 'single'
        meta.profile = profile
        meta.streamingAttempted = shouldTryStreaming
        const segment = await requestSpeechWav(boundedText, speaker, speed, profile, shouldTryStreaming)
        voice = voice || segment.voice
        wav = segment.wav
        meta.streamingFallbackUsed = Boolean(segment.streamingFallbackUsed)
      }
    }

    try {
      await runSynthesisOnce()
    } catch (error) {
      if (!isSpeakerDimMismatchError(error)) {
        throw error
      }
      throw new Error(
        'Selected QwenTTS talker is incompatible with preset speakers. Expected 0.6b preset embeddings (1024D). Reinstall bundled 0.6b voice assets.'
      )
    }

    meta.elapsedMs = Date.now() - startedAt

    return {
      format: 'wav',
      sampleRate: 24000,
      voiceId: voice || 'default',
      audioBase64: wav.toString('base64'),
      synthesis: meta,
    }
  }

  return {
    getStatus() {
      const installed = isQwenttsInstalled(repoRoot)
      return {
        available: installed && lastError == null,
        modelReady: installed
          && (serverState.process != null && serverState.process.exitCode === null),
        downloading: false,
        downloadProgress: 0,
        modelName: pickModelName(),
        lastError,
      }
    },

    async speak(text, speakOptions = {}) {
      try {
        const result = await synthesize(text, speakOptions.speaker, speakOptions.speed, speakOptions)
        lastError = null
        return { ok: true, ...result }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        throw error
      }
    },

    async preload() {
      try {
        await ensureStarted(PROFILE_MAIN)
        return { ok: true, ready: true }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        return { ok: false, ready: false }
      }
    },

    async unload() {
      stopAllServers()
      return { ok: true }
    },

    listVoices() {
      return loadPresetSpeakers(resolveQwenttsBaseDir())
    },
  }
}

module.exports = {
  createQwenttsRuntime,
  isQwenttsInstalled,
  loadPresetSpeakerNames,
  loadPresetSpeakers,
}
