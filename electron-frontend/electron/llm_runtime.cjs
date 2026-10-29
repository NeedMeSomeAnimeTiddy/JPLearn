const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const net = require('node:net')

let NodeSqliteDatabaseSync = null
try {
  ;({ DatabaseSync: NodeSqliteDatabaseSync } = require('node:sqlite'))
} catch {
  NodeSqliteDatabaseSync = null
}

const DEFAULT_INACTIVITY_UNLOAD_MS = 5 * 60 * 1000
const DEFAULT_LLAMACPP_TIMEOUT_MS = 90000
// Scenario Practice cannot wait on a slow judgement: past this the turn falls
// back to the authored recovery line, exactly as if no model were installed. A cold
// model never makes it wait: judging returns at once while the model loads (audit 15, F3).
const SCENARIO_EVALUATION_TIMEOUT_MS = 15000
const DEFAULT_MAX_CONTEXT_CHARS = 1800
const DEFAULT_MAX_MESSAGE_CHARS = 600
const DEFAULT_MAX_OUTPUT_CHARS = 420
// The system message: the prompt and adapter note are never cut, and the context gets what is left,
// at least TUTOR_MIN_CONTEXT_CHARS (audit 15, F5). The server holds 4,096 tokens.
const DEFAULT_MAX_PROMPT_CHARS = 4000
const TUTOR_MIN_CONTEXT_CHARS = 1200
// The earlier turns sent with a chat question (audit 15, F1; Robbie: "Remember recent turns"): the
// last three exchanges, oldest dropped first past the budget.
const TUTOR_HISTORY_MAX_TURNS = 6
const TUTOR_HISTORY_MAX_CHARS = 900
const TUTOR_HISTORY_TURN_CHARS = 300
// Each context value is clipped to 280 characters, the memory graph to 480 so its later sections
// (commitments and after) reach the model; past the budget, keys go in this order, never the graph.
const CONTEXT_VALUE_CHARS = 280
const MEMORY_GRAPH_CHARS = 480
const CONTEXT_DROP_ORDER = ['persona', 'emotional_state', 'recent_activity', 'goals', 'strengths', 'weaknesses', 'commitments', 'memory']
// A model that failed to load is not respawned for every request: within this window the next
// request fails at once with the same reason (audit 15, F2).
const MODEL_LOAD_RETRY_MS = 30000
// The translation model setup installs (setup_runtime.cjs TRANSLATION_MODELS.qwen_ja_en); not
// required from there, since setup_runtime requires this file.
const TRANSLATION_MODEL_FILENAME = 'Qwen3.5-0.8B-JP-Q4_K_M.gguf'
const DEFAULT_TRANSLATION_OUTPUT_CHARS = 900
const DEFAULT_OFFLINE_DICTIONARY_SQLITE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'data',
  'external_sources',
  'offline_dictionary',
  'jmdict_lookup.sqlite',
)
const DEFAULT_MODEL_DIRECTORY = path.resolve(__dirname, '..', '..', 'models', 'llama')
const DEFAULT_ADAPTER_MANIFEST_FILENAME = 'adapter-manifest.json'
const DEFAULT_TUTOR_INSTRUCTIONS_PATH = path.join(DEFAULT_MODEL_DIRECTORY, 'instructions.txt')
const DEFAULT_TUTOR_GRAMMAR_PATH = path.join(DEFAULT_MODEL_DIRECTORY, 'conversation.gbnf')
const BUILTIN_TRANSLATION_GLOSSARY = {
  shit: { japanese: 'くそ', reading: '', gloss: 'shit (rude interjection)', source: 'builtin-glossary' },
  fuck: { japanese: 'くそ', reading: '', gloss: 'fuck (very rude interjection)', source: 'builtin-glossary' },
  damn: { japanese: 'ちくしょう', reading: '', gloss: 'damn (rude interjection)', source: 'builtin-glossary' },
  bitch: { japanese: 'クソ女', reading: 'くそおんな', gloss: 'bitch (very rude insult)', source: 'builtin-glossary' },
  asshole: { japanese: 'クソ野郎', reading: 'くそやろう', gloss: 'asshole (very rude insult)', source: 'builtin-glossary' },
}
const DEFAULT_TUTOR_SYSTEM_PROMPT = [
  'You are JPLearn Coach, a warm, encouraging Japanese tutor and conversational partner.',
  'Reply directly to the user. Do not show reasoning, planning, policy text, or system notes.',
  '',
  'How to talk:',
  '- Sound natural and conversational, like a patient coach speaking one-to-one. Keep replies short and focused: 1 to 3 sentences, never more than one short paragraph.',
  '- Do not use emojis, emoticons, or decorative symbols. Express warmth through words only.',
  '- Use plain punctuation to avoid mojibake. Prefer ASCII quotes and hyphens over typographic punctuation.',
  '- Reply in Japanese so the learner practises reading it, even if they write in English. Only when the learner asks what something means or how grammar works, explain in English, keeping any Japanese examples with a kana reading in parentheses.',
  '- Keep Japanese natural and learner-friendly. If needed, include a short kana reading in parentheses.',
  '',
  'How to teach:',
  '- Answer the actual question first, then add only the smallest useful explanation or example.',
  '- For translation requests: give only the Japanese translation, an optional short reading or gloss in parentheses, and stop there. Do not add a grammar lecture unless the user asks for one.',
  '- For translation requests, never invent a term or guess regional variants. If uncertain, say you are unsure and ask for context rather than fabricating.',
  '- For single-word translations, prefer standard dictionary forms in kana/kanji. Do not output unrelated common words as translations.',
  '- If the user made a mistake, correct it kindly and briefly, then continue the conversation.',
  '- If the user asks about grammar, vocabulary, pronunciation, or translation, be precise and practical, still within 1 to 3 sentences.',
  '- If you are uncertain, say so clearly instead of guessing.',
  '- Do not invent progress, history, preferences, or other personal facts about the user.',
  '- When helpful, end with a brief follow-up question to keep the conversation going, but never let it push you past 3 sentences total.',
].join('\n')

const DEFAULT_TRANSLATION_SYSTEM_PROMPT = [
  'You are a Japanese to English translation engine.',
  'Translate the Japanese text below into natural English.',
  'Output only the English translation. Nothing else.',
  'Do not explain. Do not repeat the Japanese. Do not add notes.',
  'Do not output reasoning or thinking text.',
].join('\n')

const BUILTIN_PROMPT_ADAPTERS = {
  default: {
    id: 'default',
    label: 'Default Coach',
    intents: ['default'],
    systemNote: '',
  },
  translation: {
    id: 'translation',
    label: 'Translation First',
    intents: ['translation'],
    systemNote: [
      'Translation mode:',
      '- Prioritize direct translation output.',
      '- Keep output compact and literal where possible.',
      '- If context is missing, ask one brief clarification question instead of guessing.',
    ].join('\n'),
    temperature: 0.3,
    top_p: 0.85,
    top_k: 30,
    repeat_penalty: 1.08,
    maxOutputTokens: 120,
  },
  grammar: {
    id: 'grammar',
    label: 'Grammar Coach',
    intents: ['grammar'],
    systemNote: [
      'Grammar coaching mode:',
      '- Correct errors briefly and explain only the key grammar point.',
      '- Provide one improved example when useful.',
    ].join('\n'),
    temperature: 0.4,
    top_p: 0.9,
    top_k: 30,
    repeat_penalty: 1.1,
    maxOutputTokens: 180,
  },
  study_plan: {
    id: 'study_plan',
    label: 'Study Planner',
    intents: ['study_plan'],
    systemNote: [
      'Study planning mode:',
      '- Return a compact, prioritized plan with 2 to 4 concrete steps.',
      '- Favor weak-area drills and immediate next actions over theory.',
    ].join('\n'),
    temperature: 0.45,
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.1,
    maxOutputTokens: 220,
  },
}

let activeLlamaServerGuard = null
let llamaServerOwnerCounter = 0

function normalizePromptAdapterId(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase()
  if (!value) {
    return ''
  }
  return value
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function resolveAssetsBaseDir() {
  return (process.env.JPLEARN_ASSETS_DIR || process.env.JPLEARN_USER_DATA_DIR || process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
}

function resolveAdapterManifestPath(configuredPath) {
  const preferred = typeof configuredPath === 'string' ? configuredPath.trim() : ''
  const assetsDir = resolveAssetsBaseDir()
  const resourcesPath = (typeof process.resourcesPath === 'string' ? process.resourcesPath : '').trim()
  const candidates = [
    preferred,
    assetsDir ? path.join(assetsDir, 'models', DEFAULT_ADAPTER_MANIFEST_FILENAME) : '',
    resourcesPath ? path.join(resourcesPath, 'models', DEFAULT_ADAPTER_MANIFEST_FILENAME) : '',
    path.join(DEFAULT_MODEL_DIRECTORY, DEFAULT_ADAPTER_MANIFEST_FILENAME),
  ]
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || ''
}

function normalizePromptAdapterConfig(rawAdapter) {
  if (!rawAdapter || typeof rawAdapter !== 'object') {
    return null
  }
  const id = normalizePromptAdapterId(rawAdapter.id)
  if (!id) {
    return null
  }
  const label = typeof rawAdapter.label === 'string' && rawAdapter.label.trim()
    ? rawAdapter.label.trim()
    : id
  const intents = Array.isArray(rawAdapter.intents)
    ? rawAdapter.intents
      .map((intent) => normalizePromptAdapterId(intent))
      .filter(Boolean)
    : []
  const systemNote = typeof rawAdapter.systemNote === 'string' ? rawAdapter.systemNote.trim() : ''

  const numericField = (name, min, max) => {
    const value = rawAdapter[name]
    if (!Number.isFinite(value)) {
      return undefined
    }
    return Math.max(min, Math.min(max, Number(value)))
  }

  return {
    id,
    label,
    intents,
    systemNote,
    temperature: numericField('temperature', 0, 2),
    top_p: numericField('top_p', 0.05, 1),
    top_k: numericField('top_k', 1, 256),
    repeat_penalty: numericField('repeat_penalty', 1, 2),
    maxOutputTokens: numericField('maxOutputTokens', 24, 1024),
  }
}

function createPromptAdapterManifestReader(options = {}) {
  const configuredPath = options.adapterManifestPath
  let cachedPath = ''
  let cachedMtimeMs = 0
  let cachedAdapters = { ...BUILTIN_PROMPT_ADAPTERS }

  function readFromDisk() {
    const manifestPath = resolveAdapterManifestPath(configuredPath)
    if (!manifestPath) {
      cachedPath = ''
      cachedMtimeMs = 0
      cachedAdapters = { ...BUILTIN_PROMPT_ADAPTERS }
      return {
        manifestPath: '',
        adapters: cachedAdapters,
      }
    }

    let stat
    try {
      stat = fs.statSync(manifestPath)
    } catch {
      return {
        manifestPath: cachedPath,
        adapters: cachedAdapters,
      }
    }

    if (manifestPath === cachedPath && cachedMtimeMs === stat.mtimeMs) {
      return {
        manifestPath: cachedPath,
        adapters: cachedAdapters,
      }
    }

    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch {
      cachedPath = manifestPath
      cachedMtimeMs = stat.mtimeMs
      cachedAdapters = { ...BUILTIN_PROMPT_ADAPTERS }
      return {
        manifestPath: cachedPath,
        adapters: cachedAdapters,
      }
    }

    const merged = { ...BUILTIN_PROMPT_ADAPTERS }
    const rawAdapters = Array.isArray(parsed && parsed.adapters) ? parsed.adapters : []
    for (const rawAdapter of rawAdapters) {
      const normalized = normalizePromptAdapterConfig(rawAdapter)
      if (!normalized) {
        continue
      }
      const inherited = merged[normalized.id] || {}
      merged[normalized.id] = {
        ...inherited,
        ...normalized,
      }
    }

    cachedPath = manifestPath
    cachedMtimeMs = stat.mtimeMs
    cachedAdapters = merged
    return {
      manifestPath: cachedPath,
      adapters: cachedAdapters,
    }
  }

  return {
    getAdapters() {
      return readFromDisk()
    },
  }
}

function resolveBundledLlamaServerPath() {
  const assetsDir = resolveAssetsBaseDir()
  const resourcesPath = (typeof process.resourcesPath === 'string' ? process.resourcesPath : '').trim()
  const candidates = [
    assetsDir ? path.join(assetsDir, 'tools', 'llama.cpp', 'build', 'bin', 'Release', 'llama-server.exe') : '',
    resourcesPath ? path.join(resourcesPath, 'tools', 'llama.cpp', 'build', 'bin', 'Release', 'llama-server.exe') : '',
    path.resolve(__dirname, '..', '..', 'tools', 'llama.cpp', 'build', 'bin', 'Release', 'llama-server.exe'),
    path.resolve(__dirname, '..', '..', 'tools', 'llama.cpp', 'build', 'bin', 'llama-server.exe'),
  ]
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || ''
}

function readActiveModelFilename(dir) {
  try {
    const raw = fs.readFileSync(path.join(dir, 'active-model.json'), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.filename === 'string' && parsed.filename) {
      return parsed.filename
    }
  } catch {
    // No explicit selection recorded; caller falls back to auto-detect.
  }
  return null
}

function readActiveModelTier(dir) {
  try {
    const raw = fs.readFileSync(path.join(dir, 'active-model.json'), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.tier === 'string' && parsed.tier) {
      return parsed.tier
    }
  } catch {
    // No explicit selection recorded; caller falls back to compatibility heuristics.
  }
  return null
}

function resolveBundledModelPath() {
  // Check the installed assets model directory first, then the bundled/dev path.
  const directories = []
  const assetsDir = resolveAssetsBaseDir()
  if (assetsDir) {
    directories.push(path.join(assetsDir, 'models'))
  }
  directories.push(DEFAULT_MODEL_DIRECTORY)

  for (const dir of directories) {
    if (!fs.existsSync(dir)) continue

    // Honor an explicit tier selection (Settings > Tutor models) before
    // falling back to auto-detecting the first .gguf found on disk. Without
    // this, multiple installed tiers would always resolve to whichever
    // filename sorts first alphabetically, ignoring the user's choice.
    const activeFilename = readActiveModelFilename(dir)
    if (activeFilename) {
      const activeCandidates = [
        path.join(dir, activeFilename),
        path.join(dir, 'llama', activeFilename),
      ]
      for (const activePath of activeCandidates) {
        if (fs.existsSync(activePath)) {
          return activePath
        }
      }
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const models = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.gguf'))
      .map((entry) => path.join(dir, entry.name))
      .sort()
    if (models.length > 0) return models[0]
  }
  return ''
}

// The translation model setup selected (translation/active-translation-model.json, written by
// setup_runtime.setActiveTranslationModelTier), as a file under models/llama; '' when none.
function readActiveTranslationModelPath(assetsDir) {
  try {
    const raw = fs.readFileSync(path.join(assetsDir, 'translation', 'active-translation-model.json'), 'utf8')
    const parsed = JSON.parse(raw)
    const filename = parsed && typeof parsed.filename === 'string' ? path.basename(parsed.filename.trim()) : ''
    const candidate = filename ? path.join(assetsDir, 'models', 'llama', filename) : ''
    return candidate && fs.existsSync(candidate) ? candidate : ''
  } catch {
    return ''
  }
}

function resolveDownloadedModelPath() {
  const assetsDir = resolveAssetsBaseDir()
  if (!assetsDir) {
    return ''
  }

  const modelsDir = path.join(assetsDir, 'models')
  if (!fs.existsSync(modelsDir)) {
    return ''
  }

  // Check for an explicitly selected tutor model first.
  const activeFilename = readActiveModelFilename(modelsDir)
  if (activeFilename) {
    const activeCandidates = [
      path.join(modelsDir, activeFilename),
      path.join(modelsDir, 'llama', activeFilename),
    ]
    for (const activePath of activeCandidates) {
      if (fs.existsSync(activePath)) {
        return activePath
      }
    }
  }

  // Then the selected translation model (audit 14, F4: the setting is read, not just written).
  const translationModelPath = readActiveTranslationModelPath(assetsDir)
  if (translationModelPath) {
    return translationModelPath
  }

  // GGUF files placed directly in models/.
  const directEntries = fs.readdirSync(modelsDir, { withFileTypes: true })
  const directModels = directEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.gguf'))
    .map((entry) => path.join(modelsDir, entry.name))
    .sort()
  if (directModels.length > 0) return directModels[0]

  // Also scan models/llama/ — this is where the Qwen translation GGUF lives.
  const llamaDir = path.join(modelsDir, 'llama')
  if (fs.existsSync(llamaDir)) {
    const llamaEntries = fs.readdirSync(llamaDir, { withFileTypes: true })
    const llamaModels = llamaEntries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.gguf'))
      .map((entry) => path.join(llamaDir, entry.name))
      .sort()
    if (llamaModels.length > 0) return llamaModels[0]
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

function resolveTutorGrammarPath() {
  const envValue = typeof process.env.JPLEARN_TUTOR_GRAMMAR_FILE === 'string'
    ? process.env.JPLEARN_TUTOR_GRAMMAR_FILE.trim()
    : ''
  const envDisable = typeof process.env.JPLEARN_TUTOR_DISABLE_GRAMMAR === 'string'
    && ['1', 'true', 'yes', 'on'].includes(process.env.JPLEARN_TUTOR_DISABLE_GRAMMAR.trim().toLowerCase())
  const envUseDefault = typeof process.env.JPLEARN_TUTOR_USE_DEFAULT_GRAMMAR === 'string'
    && ['1', 'true', 'yes', 'on'].includes(process.env.JPLEARN_TUTOR_USE_DEFAULT_GRAMMAR.trim().toLowerCase())

  if (envDisable) {
    return ''
  }

  if (envValue) {
    if (['0', 'false', 'none', 'off', 'disable', 'disabled'].includes(envValue.toLowerCase())) {
      return ''
    }
    const explicitPath = path.isAbsolute(envValue)
      ? envValue
      : path.resolve(process.cwd(), envValue)
    return fs.existsSync(explicitPath) ? explicitPath : ''
  }

  // Keep grammar opt-in by default. Overly strict grammars can force low-signal
  // outputs or inference errors for normal chat prompts.
  if (envUseDefault && fs.existsSync(DEFAULT_TUTOR_GRAMMAR_PATH)) {
    return DEFAULT_TUTOR_GRAMMAR_PATH
  }
  return ''
}

function detectPromptTuningProfile({ activeTier, modelPath }) {
  if (typeof activeTier === 'string' && activeTier.trim().toLowerCase() === 'medium') {
    return 'medium'
  }

  // Compatibility fallback for older installs or direct CLI runs that have no
  // active-model.json tier selection yet.
  const filename = path.basename(typeof modelPath === 'string' ? modelPath : '').toLowerCase()
  if (filename.includes('qwen3.5-2b') || (filename.includes('2b') && filename.includes('q6_k'))) {
    return 'medium'
  }
  return 'default'
}

function resolveContextPriorityNote(profile) {
  if (profile === 'medium') {
    return 'When current context is provided, treat it as the primary source for concrete details and prefer it over generic tutoring.'
  }
  return ''
}

/* What the tutor chat shows after "The tutor couldn't answer: " (audit 15, F2; Robbie's wording).
   Each reason is the whole message, lowercase, so the renderer shows it as it is. */
const TUTOR_REASONS = {
  loadFailed: 'the model failed to load',
  noModel: 'no tutor model is installed',
  tooSlow: 'the model took too long to answer',
  noAnswer: 'the model gave no answer',
  tooLong: 'the question and the conversation are too long',
  failed: 'the model stopped with an error',
  busy: 'another request is still running',
  stopped: 'the request was stopped',
}

class ModelLoadError extends Error {
  constructor(detail) {
    super(TUTOR_REASONS.loadFailed)
    this.name = 'ModelLoadError'
    this.detail = detail
  }
}

class ContextTooLongError extends Error {
  constructor() {
    super(TUTOR_REASONS.tooLong)
    this.name = 'ContextTooLongError'
  }
}

/** A non-200 from llama-server; a prompt past the context window has its own reason. */
function llamaServerStatusError(response) {
  try {
    const parsed = JSON.parse(response.body)
    if (parsed && parsed.error && parsed.error.type === 'exceed_context_size_error') {
      return new ContextTooLongError()
    }
  } catch {
    // not JSON: the status alone
  }
  return new Error(`llama-server returned status ${response.status}`)
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

function contextValueLimit(key) {
  return key === 'memory_graph' ? MEMORY_GRAPH_CHARS : CONTEXT_VALUE_CHARS
}

function sanitizeContextText(context = {}, options = {}) {
  const maxContextChars = Number.isFinite(options.maxContextChars)
    ? Math.max(120, Math.floor(options.maxContextChars))
    : DEFAULT_MAX_CONTEXT_CHARS
  const lines = []
  for (const [key, value] of Object.entries(context)) {
    if (typeof value !== 'string') {
      continue
    }
    const normalized = clipText(value, contextValueLimit(key))
    if (normalized) {
      lines.push({ key, line: `${key}: ${normalized}` })
    }
  }
  const kept = lines.slice(0, 10)
  const size = () => kept.reduce((total, entry) => total + entry.line.length + 1, 0)
  // over budget, the least useful keys go first and the memory graph never (audit 15, F5)
  for (const key of CONTEXT_DROP_ORDER) {
    if (size() <= maxContextChars) {
      break
    }
    const index = kept.findIndex((entry) => entry.key === key)
    if (index >= 0) {
      kept.splice(index, 1)
    }
  }
  while (size() > maxContextChars && kept.length > 1) {
    kept.splice(kept.findIndex((entry) => entry.key !== 'memory_graph'), 1)
  }
  return kept.map((entry) => entry.line).join('\n')
}

/* The system message: the prompt and the adapter's instructions come first and are never cut; the
   context gets what is left of the budget, and never less than TUTOR_MIN_CONTEXT_CHARS (audit 15, F5). */
function composeSystemPrompt(context = {}, runtimeOptions = {}, promptTuningProfile = 'default') {
  const maxSystemChars = runtimeOptions.maxPromptChars || DEFAULT_MAX_PROMPT_CHARS
  const systemPrompt = clipText(
    typeof runtimeOptions.systemPromptOverride === 'string' && runtimeOptions.systemPromptOverride.trim()
      ? runtimeOptions.systemPromptOverride.trim()
      : resolveTutorSystemPrompt(),
    maxSystemChars,
  )
  const promptAdapter = runtimeOptions.promptAdapter && typeof runtimeOptions.promptAdapter === 'object'
    ? runtimeOptions.promptAdapter
    : null
  const fixedParts = [systemPrompt]
  if (promptAdapter && typeof promptAdapter.systemNote === 'string' && promptAdapter.systemNote.trim()) {
    fixedParts.push('Adapter instructions:', promptAdapter.systemNote.trim())
  }
  const fixedText = fixedParts.join('\n\n')
  const contextPriorityNote = resolveContextPriorityNote(promptTuningProfile)
  const requestedContextChars = Number.isFinite(runtimeOptions.maxContextChars)
    ? Math.floor(runtimeOptions.maxContextChars)
    : DEFAULT_MAX_CONTEXT_CHARS
  const contextBudget = Math.min(
    requestedContextChars,
    Math.max(TUTOR_MIN_CONTEXT_CHARS, maxSystemChars - fixedText.length - (contextPriorityNote || '').length - 24),
  )
  const contextText = sanitizeContextText(context, { maxContextChars: contextBudget })
  return contextText
    ? [fixedText, contextPriorityNote, 'Current context:', contextText].filter(Boolean).join('\n\n')
    : fixedText
}

/* Earlier chat turns, oldest first, as chat messages: each clipped, the oldest dropped first until
   they fit (audit 15, F1). Anything that is not a user or assistant turn with text is ignored. */
function boundChatHistory(history) {
  if (!Array.isArray(history)) {
    return []
  }
  const turns = history
    .filter((turn) => turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
    .slice(-TUTOR_HISTORY_MAX_TURNS)
    .map((turn) => ({ role: turn.role, content: clipText(turn.content, TUTOR_HISTORY_TURN_CHARS) }))
    .filter((turn) => turn.content)
  let total = turns.reduce((sum, turn) => sum + turn.content.length, 0)
  while (turns.length > 0 && total > TUTOR_HISTORY_MAX_CHARS) {
    total -= turns.shift().content.length
  }
  return turns
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

/* Only a reply that is nothing but a hedge is replaced by a clarifying question: "It depends on
   politeness: ..." is an answer, and the prompt asks the model to say when it is unsure (audit 15). */
function isLowConfidenceAssistantReply(rawText) {
  const text = String(rawText || '').trim()
  if (!text || text.length >= 60) {
    return false
  }
  return /(i am not sure|i'm not sure|not sure|unsure|i do not know|i don't know|cannot tell|can't tell|need more context|insufficient context|it depends)/i.test(text)
}

function buildClarifyingQuestionForIntent(message) {
  const text = String(message || '')
  if (detectTranslationIntent(text)) {
    return '翻訳の精度を上げるため、正確な語句と使う場面を教えてください。'
  }
  if (detectGrammarIntent(text)) {
    return '正確に直すため、確認したい日本語の全文を送ってください。'
  }
  if (detectStudyPlanIntent(text)) {
    return '学習計画を調整します。10分・20分・30分のどれにしますか。'
  }
  return '文脈が少し足りません。もう1つだけ情報をください。'
}

function normalizeAsciiToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectTranslationIntent(message) {
  const text = String(message || '').trim()
  if (!text) {
    return false
  }
  return /\b(translate|translation|in japanese|japanese for|how do you say|say .* in japanese)\b/i.test(text)
}

function detectGrammarIntent(message) {
  const text = String(message || '').trim()
  if (!text) {
    return false
  }
  return /(grammar|particle|conjugat|tense|polite|casual|is this sentence|correct this|fix this japanese|natural japanese)/i.test(text)
}

function detectStudyPlanIntent(message) {
  const text = String(message || '').trim()
  if (!text) {
    return false
  }
  return /(study plan|what should i study|next step|next steps|practice next|daily plan|review plan|focus area)/i.test(text)
}

function detectPromptAdapterIntent(message) {
  if (detectTranslationIntent(message)) {
    return 'translation'
  }
  if (detectGrammarIntent(message)) {
    return 'grammar'
  }
  if (detectStudyPlanIntent(message)) {
    return 'study_plan'
  }
  return 'default'
}

function resolvePromptAdapterSelection(message, context, adapters) {
  const requestedRaw = context && typeof context.assistant_adapter === 'string'
    ? context.assistant_adapter
    : ''
  const requested = normalizePromptAdapterId(requestedRaw)
  const explicitRequested = requested && requested !== 'auto'
  if (explicitRequested && adapters[requested]) {
    return adapters[requested]
  }

  const intent = detectPromptAdapterIntent(message)
  if (adapters[intent]) {
    return adapters[intent]
  }

  return adapters.default || BUILTIN_PROMPT_ADAPTERS.default
}

function extractEnglishTranslationTarget(message) {
  const text = String(message || '').trim()
  if (!text) {
    return ''
  }

  // A single quote opens only where no letter precedes it and closes only where none follows, so the
  // apostrophe of "What's 'dog'" is not a quotation mark (audit 15, F8).
  const quoted = text.match(/"([^"]{1,60})"|(?<![A-Za-z])'((?:[^']|'(?=[A-Za-z])){1,60})'(?![A-Za-z])/)
  if (quoted) {
    return normalizeAsciiToken(quoted[1] || quoted[2] || '')
  }

  const patterns = [
    /japanese\s+for\s+([a-zA-Z\s-]{1,60})/i,
    /translate\s+([a-zA-Z\s-]{1,60})\s+to\s+japanese/i,
    /how\s+do\s+you\s+say\s+([a-zA-Z\s-]{1,60})\s+in\s+japanese/i,
    /([a-zA-Z\s-]{1,60})\s+in\s+japanese/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      return normalizeAsciiToken(match[1])
    }
  }
  return ''
}

function extractTranslationTarget(message) {
  if (!detectTranslationIntent(message)) {
    return null
  }
  return extractEnglishTranslationTarget(message) || null
}

function normalizeDictionaryEntry(rawEntry) {
  if (!rawEntry || typeof rawEntry !== 'object') {
    return null
  }
  const japanese = typeof rawEntry.japanese === 'string' ? rawEntry.japanese.trim() : ''
  const reading = typeof rawEntry.reading === 'string' ? rawEntry.reading.trim() : ''
  const gloss = typeof rawEntry.gloss === 'string' ? rawEntry.gloss.trim() : ''
  if (!japanese) {
    return null
  }
  return {
    japanese,
    reading,
    gloss,
  }
}

function formatDictionaryTranslation(entry) {
  if (!entry) {
    return ''
  }
  const reading = entry.reading && entry.reading !== entry.japanese
    ? ` (${entry.reading})`
    : ''
  return `${entry.japanese}${reading}`
}

function resolveBuiltinTranslationEntry(target) {
  const key = normalizeAsciiToken(target)
  if (!key) {
    return null
  }
  const hit = BUILTIN_TRANSLATION_GLOSSARY[key]
  if (!hit) {
    return null
  }
  return normalizeDictionaryEntry(hit)
}

function resolveOfflineDictionarySqlitePath(configuredPath) {
  const preferred = typeof configuredPath === 'string' ? configuredPath.trim() : ''
  if (preferred) {
    // a configured index is the only one: absent means none, not the next place along
    return fs.existsSync(preferred) ? preferred : ''
  }
  const assetsDir = resolveAssetsBaseDir()
  const resourcesPath = (typeof process.resourcesPath === 'string' ? process.resourcesPath : '').trim()
  const candidates = [
    assetsDir ? path.join(assetsDir, 'data', 'external_sources', 'offline_dictionary', 'jmdict_lookup.sqlite') : '',
    resourcesPath ? path.join(resourcesPath, 'data', 'external_sources', 'offline_dictionary', 'jmdict_lookup.sqlite') : '',
    DEFAULT_OFFLINE_DICTIONARY_SQLITE_PATH,
  ]
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || ''
}

// How many entries whose glosses contain the asked-for words are read before choosing. Shortest
// gloss first puts an entry whose gloss is exactly the word near the top; the cap only bounds the
// read for a very common word ("water" is in a few hundred glosses).
const OFFLINE_DICTIONARY_CANDIDATE_LIMIT = 2000
// build_offline_dictionary_sqlite.py keeps the first 240 characters of an entry's joined glosses
const OFFLINE_DICTIONARY_GLOSS_LIMIT = 240

/**
 * The entry a translation question asks for, from rows of { japanese, reading, gloss, is_common }:
 * one whose gloss list has the key itself as a gloss, else (for a one-word key of 3+ letters) one
 * with the key as a word of a gloss. Glosses are normalised exactly as the key is, so "ice-cream"
 * is the gloss "ice cream". Common entries first, then the earliest; anything else is no answer.
 */
function selectOfflineDictionaryEntry(rows, key) {
  // a note in brackets is not part of the meaning: "dog (Canis familiaris)" is the gloss "dog"
  const withoutNotes = (gloss) => {
    let text = gloss
    for (let previous = ''; previous !== text;) {
      previous = text
      text = text.replace(/\([^()]*\)/g, ' ') // innermost first: "(Canis (lupus) familiaris)"
    }
    return text
  }
  const glossesOf = (row) => {
    const pieces = String(row.gloss || '').split(';')
    // a list the index cut at its limit ends in part of a gloss ("car" of "caravan"): not a meaning
    if (pieces.length > 1 && String(row.gloss).length >= OFFLINE_DICTIONARY_GLOSS_LIMIT) {
      pieces.pop()
    }
    return pieces.map((gloss) => normalizeAsciiToken(withoutNotes(gloss))).filter(Boolean)
  }
  // The index has no word frequency, so among matches: common words, then the one whose first
  // meaning it is, then the shorter word (犬 before ワン子 for "dog"), then the one with more
  // meanings (the general word: 先生 before 教諭 for "teacher"), then the index's own order.
  const best = (matchIndex) => rows
    .map((row, order) => {
      const glosses = glossesOf(row)
      return { row, order, at: matchIndex(glosses), senses: glosses.length }
    })
    .filter((candidate) => candidate.at >= 0)
    .sort((a, b) => (Number(b.row.is_common) - Number(a.row.is_common))
      || (a.at - b.at)
      || (String(a.row.japanese).length - String(b.row.japanese).length)
      || (b.senses - a.senses)
      || (a.order - b.order))[0]?.row || null
  const exact = best((glosses) => glosses.indexOf(key))
  if (exact || key.includes(' ') || key.length < 3) {
    return exact
  }
  return best((glosses) => glosses.findIndex((gloss) => gloss.split(' ').includes(key)))
}

/**
 * The tutor's offline dictionary: the same index the Dictionary panel reads (dictionary_entries,
 * with its English glosses in dictionary_fts), opened read-only. Until audit 14 this asked for a
 * `dictionary_lookup` table the index stopped carrying in July 2026 (085cb63), then fell back to
 * parsing a 117 MB JSON file in the main process (2.4 s). Now there is no fallback: no index, no
 * answer, and the tutor goes on to its model. The index keeps the first 240 characters of each
 * entry's glosses (build_offline_dictionary_sqlite.py), so a gloss past that is not found.
 *
 * `offlineEntries` (rows as above) stands in for the index in tests.
 */
function createOfflineDictionaryLookup(options = {}) {
  const inlineEntries = Array.isArray(options.offlineEntries) ? options.offlineEntries : null
  let sqliteDb = null
  let sqliteStatement = null

  function close() {
    sqliteStatement = null
    if (sqliteDb) {
      try {
        sqliteDb.close()
      } catch {
        // Already closed.
      }
    }
    sqliteDb = null
  }

  // Not remembered as missing: an index installed after a miss is found on the next question.
  function statement() {
    if (sqliteStatement) {
      return sqliteStatement
    }
    const sqlitePath = resolveOfflineDictionarySqlitePath(options.offlineDictionarySqlitePath)
    if (!sqlitePath || !NodeSqliteDatabaseSync) {
      return null
    }
    try {
      sqliteDb = new NodeSqliteDatabaseSync(sqlitePath, { readOnly: true })
      sqliteStatement = sqliteDb.prepare(
        'SELECT e.japanese AS japanese, e.reading AS reading, e.gloss AS gloss, e.is_common AS is_common '
        + 'FROM dictionary_fts JOIN dictionary_entries e ON e.entry_id = dictionary_fts.rowid '
        + 'WHERE dictionary_fts MATCH ? '
        + 'ORDER BY e.is_common DESC, length(e.gloss), e.entry_id LIMIT ?',
      )
      return sqliteStatement
    } catch {
      close()
      return null
    }
  }

  function lookup(key) {
    let rows = inlineEntries
    let source = 'jmdict-offline'
    if (!rows) {
      const query = statement()
      if (!query) {
        return null
      }
      try {
        // the key is letters and single spaces (normalizeAsciiToken), so it is a safe FTS5 phrase
        rows = query.all(`"${key}"`, OFFLINE_DICTIONARY_CANDIDATE_LIMIT)
      } catch {
        close()
        return null
      }
      source = 'jmdict-offline-sqlite'
    }
    const hit = normalizeDictionaryEntry(selectOfflineDictionaryEntry(rows, key))
    return hit ? { ...hit, source } : null
  }

  lookup.close = close
  return lookup
}

// Offline only (audit 5, F1; Robbie: "Offline only"). What the learner asks the tutor stays on the
// machine, so a translation question is never looked up online; the installed dictionary index
// answers it (audit 14, F3), or nothing does.
function createDictionaryResolver(options = {}) {
  const resolveOfflineEntry = createOfflineDictionaryLookup({
    offlineDictionarySqlitePath: options.offlineDictionarySqlitePath,
    offlineEntries: options.offlineEntries,
  })

  const resolve = async (target) => {
    const key = normalizeAsciiToken(target)
    if (!key) {
      return null
    }

    const offline = resolveOfflineEntry(key)
    if (offline) {
      return offline
    }

    return null
  }
  resolve.close = resolveOfflineEntry.close
  return resolve
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
    // The `timeout` option alone only reports an idle socket and never ends the request
    // (audit 5, F3), so a request past it is destroyed here, as voice_runtime.cjs does.
    if (Number.isFinite(requestOptions.timeout) && requestOptions.timeout > 0) {
      req.setTimeout(requestOptions.timeout, () => {
        const error = new Error(`request to ${requestOptions.path || '/'} timed out after ${requestOptions.timeout} ms`)
        error.code = 'ETIMEDOUT'
        req.destroy(error)
      })
    }
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

function normalizeTranslationOutput(rawText) {
  const stripped = stripThinkTags(rawText)
    .replace(/\[\s*start thinking\s*\]/gi, '')
    .replace(/\[\s*end thinking\s*\]/gi, '')
    .replace(/<\/translation>/gi, '')
    .replace(/<translation>/gi, '')
    .replace(/TRANSLATION_START|TRANSLATION_END/gi, '')
    .trim()
  if (!stripped) {
    return ''
  }

  // Cut off at any ### section header — model sometimes re-emits the template.
  const headerCut = stripped.search(/\n###\s/)
  const clipped = headerCut > 0 ? stripped.slice(0, headerCut).trim() : stripped

  const lines = clipped
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^###/.test(line))
    .filter((line) => !/^(translation|english|japanese)\s*[:-]?$/i.test(line))
    .filter((line) => !/^sure[,.!]?\s*$/i.test(line))
    .filter((line) => !/^(okay|let me|i need to|the user|analysis:|reasoning:)/i.test(line))
    .filter((line) => !/^(kindle|home|close|back)$/i.test(line))
    .filter((line) => !/time\s+left\s+in\s+chapter/i.test(line))
    .filter((line) => !/let'?s keep your momentum|focused round|items feel shaky/i.test(line))

  return lines.join('\n').trim()
}

function preprocessOcrTextForTranslation(rawText) {
  const raw = String(rawText || '')
  if (!raw.trim()) {
    return ''
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) {
    return ''
  }

  const isUiNoiseLine = (line) => {
    const lowered = line.toLowerCase()
    if (/^(kindle|home|close|back)$/.test(lowered)) {
      return true
    }
    if (/time\s+left\s+in\s+chapter/.test(lowered) && /mins?$/.test(lowered)) {
      return true
    }
    if (/^\d{1,3}%$/.test(lowered)) {
      return true
    }
    if (/^\d{1,2}:\d{2}$/.test(lowered)) {
      return true
    }
    return false
  }

  const filtered = lines.filter((line) => !isUiNoiseLine(line))
  const selected = filtered.length > 0 ? filtered : lines
  return selected.join(' ').replace(/\s+/g, ' ').trim()
}

function normalizeMojibakePunctuation(rawText) {
  // Restrict normalization to known CP1252/UTF-8 mojibake punctuation fragments.
  // Do not apply broad re-decoding so Japanese text remains intact.
  return String(rawText || '')
    .replace(/â€”|â€“/g, '-')
    .replace(/â€˜|â€™/g, "'")
    .replace(/â€œ|â€\u009d/g, '"')
    .replace(/â€¦/g, '...')
    .replace(/Â\s/g, ' ')
    .replace(/Â([,.;:!?])/g, '$1')
}

function isLowSignalAssistantReply(rawText) {
  const normalized = String(rawText || '').trim()
  if (!normalized) {
    return true
  }
  const withoutPunctuation = normalized
    .replace(/[^\p{L}\p{N}\u3040-\u30ff\u3400-\u9fff]+/gu, '')
    .trim()
  if (withoutPunctuation.length < 2) {
    return true
  }
  return !/[\p{L}\p{N}\u3040-\u30ff\u3400-\u9fff]/u.test(withoutPunctuation)
}

// One process 'exit' listener for every adapter: a session that reloads the model many times
// (idle unloads, a crash, a timeout) would otherwise add one each and reach Node's
// MaxListenersExceededWarning.
const serverStopsOnExit = new Set()
function registerServerStopOnExit(stop) {
  if (serverStopsOnExit.size === 0) {
    process.once('exit', () => {
      for (const stopServer of serverStopsOnExit) stopServer()
    })
  }
  serverStopsOnExit.add(stop)
}

function createLlamaServerAdapter(config = {}) {
  const executablePath = typeof config.executablePath === 'string' ? config.executablePath.trim() : ''
  const modelPath = typeof config.modelPath === 'string' ? config.modelPath.trim() : ''
  const promptTuningProfile = typeof config.promptTuningProfile === 'string'
    ? config.promptTuningProfile.trim().toLowerCase()
    : 'default'
  const requestTimeoutMs = Number.isFinite(config.timeoutMs)
    ? Math.max(5000, Math.floor(config.timeoutMs))
    : DEFAULT_LLAMACPP_TIMEOUT_MS
  const startupTimeoutMs = Number.isFinite(config.startupTimeoutMs)
    ? Math.max(10000, Math.floor(config.startupTimeoutMs))
    : 120000
  const host = '127.0.0.1'
  const ownerId = ++llamaServerOwnerCounter

  let serverProcess = null
  let port = 0
  let exitHandlerRegistered = false
  let startPromise = null

  // Resolves once the stopped process has exited (capped at 5 s), so a caller about to delete
  // the model file is not racing Windows releasing it (audit 6 review). Callers that only need
  // the server gone may ignore the promise.
  function stopServer() {
    let exited = Promise.resolve()
    if (serverProcess && serverProcess.exitCode === null) {
      const stopping = serverProcess
      exited = new Promise((resolve) => {
        const timer = setTimeout(resolve, 5000)
        stopping.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
      try {
        stopping.kill()
      } catch {
        // Process may already be gone.
      }
    }
    serverProcess = null
    port = 0
    if (activeLlamaServerGuard && activeLlamaServerGuard.ownerId === ownerId) {
      activeLlamaServerGuard = null
    }
    return exited
  }

  // An inference request past its timeout leaves llama-server busy with it, so the server is
  // stopped and the next request starts a fresh one (ARCHITECTURE §2: kill on timeout).
  async function serverRequest(requestOptions, payload, signal) {
    try {
      return await httpRequestJson(requestOptions, payload, signal)
    } catch (error) {
      if (error && error.code === 'ETIMEDOUT') stopServer()
      throw error
    }
  }

  // Watches the process it started: its 'exit' listener clears `serverProcess` in the same tick
  // Node sets the exit code, so checking `serverProcess` would never see a server that died while
  // starting and would poll port 0 until the startup timeout (audit 5 review).
  async function waitForHealth(startedProcess) {
    const deadline = Date.now() + startupTimeoutMs
    while (Date.now() < deadline) {
      if (startedProcess.exitCode !== null || startedProcess.signalCode !== null || serverProcess !== startedProcess) {
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

      if (
        activeLlamaServerGuard
        && activeLlamaServerGuard.ownerId !== ownerId
        && activeLlamaServerGuard.process
        && activeLlamaServerGuard.process.exitCode === null
      ) {
        throw new Error('Refusing to spawn a second local llama-server instance while one is already active')
      }

      if (startPromise) {
        await startPromise
        return
      }

      startPromise = (async () => {
        const configuredPort = Number(process.env.JPLEARN_LLAMA_SERVER_PORT)
        port = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : await findFreePort()
        const grammarFilePath = resolveTutorGrammarPath()

        const args = [
          '-m', modelPath,
          // one request at a time, so one slot holds the whole context (audit 15: the chat now
          // carries earlier turns)
          '-c', '4096',
          '-np', '1',
          '-t', '6',
          '--host', host,
          '--port', String(port),
          '--no-webui',
          '--chat-template', 'chatml',
        ]
        if (grammarFilePath) {
          args.push('--grammar-file', grammarFilePath)
        }
        serverProcess = spawn(executablePath, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] })
        activeLlamaServerGuard = {
          ownerId,
          process: serverProcess,
          executablePath,
          modelPath,
          port,
        }
        serverProcess.on('error', () => stopServer())
        // A server that dies after loading is noticed, so the next message starts a fresh one
        // instead of failing against it until the inactivity unload (audit 5, F3).
        const startedProcess = serverProcess
        startedProcess.on('exit', () => {
          if (serverProcess === startedProcess) stopServer()
        })

        if (!exitHandlerRegistered) {
          exitHandlerRegistered = true
          registerServerStopOnExit(stopServer)
        }

        try {
          await waitForHealth(startedProcess)
        } catch (error) {
          // A server that never became ready is stopped: left running, it would keep the one-server
          // guard and every later load would refuse to start another (audit 5 review).
          if (serverProcess === startedProcess) stopServer()
          throw error
        }
      })()

      try {
        await startPromise
      } finally {
        startPromise = null
      }
    },

    isRunning() {
      return Boolean(serverProcess && serverProcess.exitCode === null)
    },

    async unload() {
      await stopServer()
      return undefined
    },

    async infer(message, context = {}, runtimeOptions = {}) {
      const promptAdapter = runtimeOptions.promptAdapter && typeof runtimeOptions.promptAdapter === 'object'
        ? runtimeOptions.promptAdapter
        : null
      const boundedSystemPrompt = composeSystemPrompt(context, runtimeOptions, promptTuningProfile)
      const chatHistory = boundChatHistory(runtimeOptions.history)
      const boundedMessage = clipText(
        message,
        Number.isFinite(runtimeOptions.maxMessageChars)
          ? Math.max(60, Math.floor(runtimeOptions.maxMessageChars))
          : DEFAULT_MAX_MESSAGE_CHARS,
      )
      const adapterMaxTokens = Number.isFinite(promptAdapter && promptAdapter.maxOutputTokens)
        ? Math.max(24, Math.floor(promptAdapter.maxOutputTokens))
        : null
      const maxOutputTokens = Number.isFinite(adapterMaxTokens)
        ? adapterMaxTokens
        : Number.isFinite(runtimeOptions.maxOutputTokens)
          ? Math.max(24, Math.floor(runtimeOptions.maxOutputTokens))
        : 256
      const temperature = Number.isFinite(promptAdapter && promptAdapter.temperature)
        ? Math.max(0, Math.min(2, Number(promptAdapter.temperature)))
        : 0.6
      const topP = Number.isFinite(promptAdapter && promptAdapter.top_p)
        ? Math.max(0.05, Math.min(1, Number(promptAdapter.top_p)))
        : 0.9
      const topK = Number.isFinite(promptAdapter && promptAdapter.top_k)
        ? Math.max(1, Math.min(256, Math.floor(promptAdapter.top_k)))
        : 20
      const repeatPenalty = Number.isFinite(promptAdapter && promptAdapter.repeat_penalty)
        ? Math.max(1, Math.min(2, Number(promptAdapter.repeat_penalty)))
        : 1.1

      if (!serverProcess || serverProcess.exitCode !== null) {
        throw new Error('llama-server is not running')
      }

      const payload = {
        messages: [
          { role: 'system', content: boundedSystemPrompt },
          ...chatHistory,
          { role: 'user', content: boundedMessage },
        ],
        temperature,
        top_p: topP,
        top_k: topK,
        repeat_penalty: repeatPenalty,
        max_tokens: maxOutputTokens,
        cache_prompt: true,
        stream: false,
      }
      if (runtimeOptions.disableThinking) {
        payload.chat_template_kwargs = {
          enable_thinking: false,
        }
      }
      if (Array.isArray(runtimeOptions.stopSequences) && runtimeOptions.stopSequences.length > 0) {
        payload.stop = runtimeOptions.stopSequences
      }

      const completionPrompt = typeof runtimeOptions.completionPrompt === 'string' && runtimeOptions.completionPrompt.trim()
        ? runtimeOptions.completionPrompt
        : [boundedSystemPrompt, '', boundedMessage].join('\n')

      let text = ''

      if (runtimeOptions.forceCompletion) {
        const completionPayload = {
          prompt: completionPrompt,
          temperature,
          top_p: topP,
          top_k: topK,
          repeat_penalty: repeatPenalty,
          n_predict: maxOutputTokens,
          cache_prompt: true,
          stream: false,
        }
        if (Array.isArray(runtimeOptions.stopSequences) && runtimeOptions.stopSequences.length > 0) {
          completionPayload.stop = runtimeOptions.stopSequences
        }
        const completionResponse = await serverRequest(
          { host, port, path: '/completion', method: 'POST', timeout: requestTimeoutMs },
          completionPayload,
          runtimeOptions.signal,
        )
        if (completionResponse.status !== 200) {
          throw llamaServerStatusError(completionResponse)
        }
        try {
          const completionParsed = JSON.parse(completionResponse.body)
          const completionText = completionParsed && typeof completionParsed.content === 'string'
            ? completionParsed.content
            : completionParsed && typeof completionParsed.response === 'string'
              ? completionParsed.response
              : ''
          text = stripThinkTags(completionText)
        } catch {
          throw new Error('llama-server returned malformed JSON')
        }
      } else {
        const response = await serverRequest(
          { host, port, path: '/v1/chat/completions', method: 'POST', timeout: requestTimeoutMs },
          payload,
          runtimeOptions.signal,
        )

        if (response.status !== 200) {
          throw llamaServerStatusError(response)
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
        text = stripThinkTags(content)
      }

      if (!text && runtimeOptions.allowCompletionFallback) {
        const completionPayload = {
          prompt: completionPrompt,
          temperature,
          top_p: topP,
          top_k: topK,
          repeat_penalty: repeatPenalty,
          n_predict: maxOutputTokens,
          cache_prompt: true,
          stream: false,
        }
        if (Array.isArray(runtimeOptions.stopSequences) && runtimeOptions.stopSequences.length > 0) {
          completionPayload.stop = runtimeOptions.stopSequences
        }

        const completionResponse = await serverRequest(
          { host, port, path: '/completion', method: 'POST', timeout: requestTimeoutMs },
          completionPayload,
          runtimeOptions.signal,
        )
        if (completionResponse.status === 200) {
          try {
            const completionParsed = JSON.parse(completionResponse.body)
            const completionText = completionParsed && typeof completionParsed.content === 'string'
              ? completionParsed.content
              : completionParsed && typeof completionParsed.response === 'string'
                ? completionParsed.response
                : ''
            text = stripThinkTags(completionText)
          } catch {
            // ignore completion JSON parse errors and fall through
          }
        }
      }

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
      const messageHint = clipText(message, 110)
      const focus = typeof context.focus_area === 'string' && context.focus_area.trim().length > 0
        ? context.focus_area.trim()
        : 'today\'s weakest area'
      const lead = messageHint ? `About "${messageHint}": ` : ''
      return {
        text: `${lead}let's keep your momentum going on ${focus}. Try one short, focused round and notice which items feel shaky, then we can work through those together.`,
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

// Ambient environment variables are honoured only when they point at a file that exists; explicit
// options are honoured as-is (a stale variable would otherwise make the runtime fail to load and
// silently drop to the stub).
function preferExistingPath(preferredPath, fallbackPath) {
  const trimmedPreferred = typeof preferredPath === 'string' ? preferredPath.trim() : ''
  if (trimmedPreferred && fs.existsSync(trimmedPreferred)) {
    return trimmedPreferred
  }
  return fallbackPath
}

/**
 * Which provider, llama-server and model the tutor runtime would use, from files and environment
 * only: nothing is spawned or loaded. createTutorChatRuntime uses it, and so does setup's install
 * info, so "translation is ready" means exactly what the runtime will do (audit 14, F4).
 */
function resolveTutorRuntimeFiles(options = {}) {
  const discoveredLlamaServerPath = resolveBundledLlamaServerPath()
  const autoModelPath = resolveDownloadedModelPath() || ''
  const provider = normalizeProviderName(
    options.provider
    || process.env.JPLEARN_TUTOR_PROVIDER
    || (discoveredLlamaServerPath && autoModelPath ? 'llama.cpp' : 'stub'),
  )
  const modelPath = options.llamaModelPath
    || preferExistingPath(process.env.JPLEARN_LLAMA_MODEL_PATH, autoModelPath)
  const assetsDir = resolveAssetsBaseDir()
  return {
    provider,
    serverPath: options.llamaServerPath
      || preferExistingPath(process.env.JPLEARN_LLAMA_SERVER_PATH, discoveredLlamaServerPath),
    modelPath,
    autoModelPath,
    /* The model found is the translation model, not a tutor model: chosen by setup, or the only GGUF
       the scan found. A model named by option or environment counts as a tutor model (audit 15, F7). */
    translationModel: Boolean(
      modelPath
      && modelPath === autoModelPath
      && (
        (assetsDir && modelPath === readActiveTranslationModelPath(assetsDir))
        || path.basename(modelPath).toLowerCase() === TRANSLATION_MODEL_FILENAME.toLowerCase()
      ),
    ),
  }
}

/** OCR translation can run: the runtime would be llama.cpp with a server and a model on disk. */
function isLocalTranslationReady() {
  const files = resolveTutorRuntimeFiles()
  return files.provider === 'llama.cpp'
    && Boolean(files.serverPath && fs.existsSync(files.serverPath))
    && Boolean(files.modelPath && fs.existsSync(files.modelPath))
}

function createTutorChatRuntime(options = {}) {
  const inactivityUnloadMs = Number.isFinite(options.inactivityUnloadMs)
    ? Math.max(15000, Math.floor(options.inactivityUnloadMs))
    : DEFAULT_INACTIVITY_UNLOAD_MS

  const runtimeFiles = resolveTutorRuntimeFiles(options)
  const discoveredModelPath = resolveBundledModelPath()
  const autoModelPath = runtimeFiles.autoModelPath
  const docsDir = resolveAssetsBaseDir()
  const modelStateBases = [
    docsDir ? path.join(docsDir, 'models') : '',
    path.resolve(__dirname, '..', '..', 'models'),
  ]
  const activeModelTier = modelStateBases
    .map((base) => (base && fs.existsSync(base) ? readActiveModelTier(base) : null))
    .find((tier) => typeof tier === 'string' && tier.trim())
    || null
  const configuredProvider = runtimeFiles.provider
  const llamaCppConfig = {
    executablePath: runtimeFiles.serverPath,
    modelPath: runtimeFiles.modelPath,
    promptTuningProfile: detectPromptTuningProfile({
      activeTier: activeModelTier,
      modelPath: options.llamaModelPath
        || preferExistingPath(process.env.JPLEARN_LLAMA_MODEL_PATH, autoModelPath || discoveredModelPath),
    }),
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
  const translationOutputChars = Number.isFinite(options.translationOutputChars)
    ? Math.max(200, Math.floor(options.translationOutputChars))
    : DEFAULT_TRANSLATION_OUTPUT_CHARS
  const maxPromptChars = Number.isFinite(options.maxPromptChars)
    ? Math.max(240, Math.floor(options.maxPromptChars))
    : DEFAULT_MAX_PROMPT_CHARS
  const maxOutputTokens = Number.isFinite(options.maxOutputTokens)
    ? Math.max(24, Math.floor(options.maxOutputTokens))
    : 140
  const promptAdapterManifest = createPromptAdapterManifestReader({
    adapterManifestPath: options.adapterManifestPath || process.env.JPLEARN_TUTOR_ADAPTER_MANIFEST_PATH,
  })

  const resolveDictionaryEntry = createDictionaryResolver({
    offlineDictionarySqlitePath: options.translationOfflineDictionarySqlitePath,
    offlineEntries: options.translationOfflineEntries,
  })

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
  let activeInferenceLease = null
  let loadPromise = null
  let lastLoadFailedAt = 0
  let activePromptAdapterId = 'default'
  // scenario judging and crossword clues need a tutor model, as the chat does (audit 15, F7)
  const usesTranslationModel = configuredProvider === 'llama.cpp' && runtimeFiles.translationModel
  // the built-in stub stands in only for tests; the chat never shows its line as an answer (audit 15)
  const usesBuiltinStub = configuredProvider !== 'llama.cpp'
    && typeof options.adapterFactory !== 'function'
    && !options.adapterRegistry

  function isWarm() {
    return Boolean(loaded && adapter && (typeof adapter.isRunning !== 'function' || adapter.isRunning()))
  }
  let loadedAdapterManifestPath = ''

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

  /* The inactivity unload is armed only once a request has settled and is held off while one
     runs (ARCHITECTURE §2; audit 5 F3/F7). Every path that can load the model takes a lease, so
     crossword clues and scenario judging are covered as well as chat and translation. */
  function acquireInferenceLease() {
    if (isInferenceActive) {
      return null
    }
    clearUnloadTimer()
    const lease = {
      controller: new AbortController(),
    }
    activeInferenceLease = lease
    activeInferenceController = lease.controller
    isInferenceActive = true
    return lease
  }

  function releaseInferenceLease(lease) {
    if (activeInferenceLease !== lease) {
      return
    }
    activeInferenceLease = null
    activeInferenceController = null
    isInferenceActive = false
    if (loaded) {
      scheduleInactivityUnload()
    }
  }

  async function ensureLoaded() {
    if (loaded && adapter) {
      if (typeof adapter.isRunning !== 'function' || adapter.isRunning()) {
        return false
      }
      // the model server stopped (a crash, or a request that timed out): load it again
      loaded = false
      adapter = null
    }

    if (loadPromise) {
      await loadPromise
      return false
    }
    if (lastLoadFailedAt && Date.now() - lastLoadFailedAt < MODEL_LOAD_RETRY_MS) {
      throw new ModelLoadError(lastError)
    }

    loadPromise = (async () => {
      adapter = adapterFactory()
      if (!adapter || typeof adapter.load !== 'function') {
        throw new Error('Tutor chat adapter is invalid or missing load()')
      }

      try {
        await adapter.load()
        lastError = null
        lastLoadFailedAt = 0
      } catch (error) {
        // No stand-in answers in its place: the request fails with the reason (audit 15, F2).
        const detail = error instanceof Error ? error.message : String(error)
        adapter = null
        lastError = detail
        lastLoadFailedAt = Date.now()
        throw new ModelLoadError(detail)
      }
      loaded = true
      loadedAtUtc = new Date().toISOString()
      return true
    })()

    try {
      return await loadPromise
    } finally {
      loadPromise = null
    }
  }

  const runtime = {
    async sendMessage(message, context = {}, sendOptions = {}) {
      if (typeof message !== 'string' || message.trim().length === 0) {
        throw new Error('Chat message must not be empty')
      }
      if (isInferenceActive) {
        throw new Error(TUTOR_REASONS.busy)
      }

      const trimmedMessage = clipText(message, maxMessageChars)
      const translationTarget = extractTranslationTarget(trimmedMessage)
      // a key of one letter is never a word worth answering from the dictionary (audit 15, F8)
      if (translationTarget && translationTarget.replace(/\s+/g, '').length >= 2) {
        const builtinHit = resolveBuiltinTranslationEntry(translationTarget)
        if (builtinHit) {
          return {
            ok: true,
            text: clipText(formatDictionaryTranslation(builtinHit), maxOutputChars),
            provider: 'local-translation-glossary',
            model: 'builtin-glossary',
            coldStart: false,
            elapsedMs: 0,
          }
        }

        const dictionaryHit = await resolveDictionaryEntry(translationTarget)
        if (dictionaryHit) {
          const dictionaryText = formatDictionaryTranslation(dictionaryHit)
          const dictionarySource = String(dictionaryHit.source || 'dictionary')
          return {
            ok: true,
            text: clipText(dictionaryText, maxOutputChars),
            provider: 'offline-jmdict',
            model: dictionarySource,
            coldStart: false,
            elapsedMs: 0,
          }
        }
      }

      if (usesBuiltinStub) {
        throw new Error(TUTOR_REASONS.noModel)
      }

      const boundedContext = {}
      for (const [key, value] of Object.entries(context || {})) {
        if (typeof value !== 'string') {
          continue
        }
        boundedContext[key] = clipText(value, contextValueLimit(key))
      }
      const history = Array.isArray(sendOptions && sendOptions.history) ? sendOptions.history : []

      const adapterState = promptAdapterManifest.getAdapters()
      const selectedPromptAdapter = resolvePromptAdapterSelection(trimmedMessage, boundedContext, adapterState.adapters)
      const selectedPromptAdapterId = selectedPromptAdapter && selectedPromptAdapter.id
        ? selectedPromptAdapter.id
        : 'default'

      const inferenceLease = acquireInferenceLease()
      if (!inferenceLease) {
        throw new Error(TUTOR_REASONS.busy)
      }

      loadedAdapterManifestPath = adapterState.manifestPath
      activePromptAdapterId = selectedPromptAdapterId

      try {
        let coldStart
        try {
          coldStart = await ensureLoaded()
        } catch (error) {
          if (!(error instanceof ModelLoadError)) {
            lastError = error instanceof Error ? error.message : String(error)
          }
          throw new Error(TUTOR_REASONS.loadFailed)
        }
        lastUsedAtUtc = new Date().toISOString()

        const startedAt = Date.now()
        try {
          if (inferenceLease.controller.signal.aborted) {
            throw new InferenceAbortError()
          }
          let inference = null
          let cleanedText = ''
          for (let attempt = 0; attempt < 2; attempt += 1) {
            inference = await adapter.infer(trimmedMessage, boundedContext, {
              signal: inferenceLease.controller.signal,
              maxContextChars,
              maxPromptChars,
              maxOutputTokens,
              promptAdapter: selectedPromptAdapter,
              history,
            })
            cleanedText = normalizeMojibakePunctuation(String(inference.text || ''))
            if (isLowConfidenceAssistantReply(cleanedText)) {
              cleanedText = buildClarifyingQuestionForIntent(trimmedMessage)
              break
            }
            if (!isLowSignalAssistantReply(cleanedText)) {
              break
            }
            if (attempt >= 1) {
              throw new Error(TUTOR_REASONS.noAnswer)
            }
          }
          const elapsedMs = Date.now() - startedAt
          lastError = null
          if (inference && typeof inference.provider === 'string') {
            activeProvider = inference.provider
          }
          if (inference && typeof inference.model === 'string') {
            activeModel = inference.model
          }
          return {
            ok: true,
            text: clipText(cleanedText, maxOutputChars),
            provider: String((inference && inference.provider) || 'unknown'),
            model: String((inference && inference.model) || 'unknown'),
            adapter: selectedPromptAdapterId,
            coldStart,
            elapsedMs,
          }
        } catch (error) {
          /* A failed turn is an error with a reason the learner can read, never a stand-in reply
             (audit 15, F2). The raw detail stays in lastError and the main log. */
          const detail = error instanceof Error ? error.message : String(error)
          if (error instanceof InferenceAbortError || /llama\.cpp exited with code 130/i.test(detail)) {
            lastError = 'inference-cancelled'
            throw new Error(TUTOR_REASONS.stopped)
          }
          lastError = detail
          if (error instanceof ContextTooLongError) {
            throw new Error(TUTOR_REASONS.tooLong)
          }
          if (detail === TUTOR_REASONS.noAnswer) {
            throw new Error(TUTOR_REASONS.noAnswer)
          }
          if (/timed out/i.test(detail)) {
            throw new Error(TUTOR_REASONS.tooSlow)
          }
          throw new Error(TUTOR_REASONS.failed)
        }
      } finally {
        releaseInferenceLease(inferenceLease)
      }
    },

    async translateText(text, params = {}) {
      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Translation text must not be empty')
      }
      if (isInferenceActive) {
        throw new Error(TUTOR_REASONS.busy)
      }

      const sourceLang = typeof params.sourceLang === 'string' ? params.sourceLang.trim().toLowerCase() : 'ja'
      const targetLang = typeof params.targetLang === 'string' ? params.targetLang.trim().toLowerCase() : 'en'
      if (sourceLang !== 'ja' || targetLang !== 'en') {
        throw new Error('Only ja->en OCR translation is currently supported.')
      }

      const preparedText = preprocessOcrTextForTranslation(text)
      const maxInputChars = Number.isFinite(params.maxInputChars) ? Number(params.maxInputChars) : 2400
      const trimmedText = clipText(preparedText, maxInputChars)
      // the screen says "first part of the text" when this is true (audit 14, N2)
      const clipped = String(preparedText || '').trim().length > trimmedText.length
      const inferenceLease = acquireInferenceLease()
      if (!inferenceLease) {
        throw new Error(TUTOR_REASONS.busy)
      }

      try {
        let coldStart
        try {
          coldStart = await ensureLoaded()
        } catch (error) {
          if (!(error instanceof ModelLoadError)) {
            lastError = error instanceof Error ? error.message : String(error)
          }
          throw new Error(TUTOR_REASONS.loadFailed)
        }
        lastUsedAtUtc = new Date().toISOString()

        const startedAt = Date.now()
        try {
          if (inferenceLease.controller.signal.aborted) {
            throw new InferenceAbortError()
          }
          const inference = await adapter.infer(trimmedText, {}, {
            signal: inferenceLease.controller.signal,
            maxPromptChars: Math.min(maxPromptChars, 2400),
            maxMessageChars: 2400,
            forceCompletion: true,
            maxOutputTokens: Number.isFinite(params.maxOutputTokens)
              ? Math.max(24, Math.floor(Number(params.maxOutputTokens)))
              : 240,
            promptAdapter: {
              id: 'ocr_translation',
              label: 'OCR Translation',
              intents: ['translation'],
              systemNote: '',
              temperature: 0.0,
              top_p: 0.82,
              top_k: 24,
              repeat_penalty: 1.08,
              maxOutputTokens: Number.isFinite(params.maxOutputTokens)
                ? Math.max(24, Math.floor(Number(params.maxOutputTokens)))
                : 240,
            },
            disableThinking: true,
            systemPromptOverride: DEFAULT_TRANSLATION_SYSTEM_PROMPT,
            stopSequences: ['</s>', '<|im_end|>', '<|endoftext|>', '[End thinking]', '[Start thinking]', '\nUser:', '\nAssistant:', '\n###', '\nJapanese:'],
            allowCompletionFallback: true,
            completionPrompt: [
              DEFAULT_TRANSLATION_SYSTEM_PROMPT,
              '',
              '### Japanese',
              trimmedText,
              '',
              '### English',
            ].join('\n'),
          })

          const inferenceProvider = String((inference && inference.provider) || '').trim().toLowerCase()
          if (inferenceProvider === 'stub' || inferenceProvider === 'scripted-fallback') {
            throw new Error('Local OCR translation runtime is unavailable (stub adapter active)')
          }

          const cleanedText = normalizeTranslationOutput(inference && inference.text)
          if (!cleanedText) {
            throw new Error('Translation output was empty')
          }
          lastError = null
          if (inference && typeof inference.provider === 'string') {
            activeProvider = inference.provider
          }
          if (inference && typeof inference.model === 'string') {
            activeModel = inference.model
          }
          return {
            ok: true,
            text: clipText(cleanedText, translationOutputChars),
            clipped,
            provider: String((inference && inference.provider) || 'unknown'),
            model: String((inference && inference.model) || 'unknown'),
            coldStart,
            elapsedMs: Date.now() - startedAt,
            backend: 'llama.cpp-tutor',
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          lastError = detail
          throw new Error(detail)
        }
      } finally {
        releaseInferenceLease(inferenceLease)
      }
    },

    async generateCrosswordClues(entries) {
      if (isInferenceActive || configuredProvider !== 'llama.cpp') {
        return { ok: false, text: '' }
      }
      if (usesTranslationModel) {
        return { ok: false, text: '', reason: 'no-tutor-model' }
      }
      if (!Array.isArray(entries) || entries.length === 0) {
        return { ok: false, text: '' }
      }
      /* Clues are asked for once, when the crossword opens, and a cold model is not loaded for them:
         nothing would use it, and the crossword is not the chat (audit 15, F3). */
      if (!isWarm()) {
        return { ok: false, text: '', reason: 'model-warming' }
      }

      const inferenceLease = acquireInferenceLease()
      if (!inferenceLease) {
        return { ok: false, text: '' }
      }

      let timeout = null
      try {
        const coldStart = await ensureLoaded()
        if (inferenceLease.controller.signal.aborted) {
          return { ok: false, text: '' }
        }

        const prompt = [
          'Return only a JSON array. Create concise English crossword clues.',
          'Each object must contain exactly poolPosition and clue.',
          'Do not include, transliterate, or reveal any Japanese answer. Do not add entries.',
          JSON.stringify(entries.map((entry) => ({
            poolPosition: entry.poolPosition,
            answer: entry.answer,
            fallbackClue: entry.fallbackClue,
          }))),
        ].join('\n')
        timeout = setTimeout(() => inferenceLease.controller.abort(), 8_000)
        const inference = await adapter.infer(prompt, {}, {
          signal: inferenceLease.controller.signal,
          maxContextChars: 2_000,
          maxPromptChars: 2_000,
          // the whole entry list, or the clue set never parses (audit 15 design critic, 1)
          maxMessageChars: 1_800,
          maxOutputTokens: 240,
          disableThinking: true,
          systemPromptOverride: 'You generate safe English crossword clues. Return only the requested JSON array and never reveal a Japanese answer.',
          promptAdapter: {
            id: 'crossword_clues',
            systemNote: 'Use concise English clues. Output valid JSON only.',
            temperature: 0,
            top_p: 0.8,
            top_k: 20,
            repeat_penalty: 1.05,
            maxOutputTokens: 240,
          },
        })
        if (inferenceLease.controller.signal.aborted || inference?.provider === 'stub') {
          return { ok: false, text: '' }
        }
        return { ok: true, text: String(inference?.text || ''), coldStart }
      } catch {
        return { ok: false, text: '' }
      } finally {
        if (timeout) {
          clearTimeout(timeout)
        }
        releaseInferenceLease(inferenceLease)
      }
    },

    /**
     * Judges one uncertain Scenario Practice response and returns the model's
     * raw JSON text for the renderer to validate. Deliberately narrow: it never
     * writes dialogue, names nodes, or decides progression — the scenario
     * engine owns all of that. Any problem at all (no tutor model, busy lease,
     * a cold model, abort, timeout, stub adapter) resolves to `{ ok: false }`,
     * which the caller treats exactly like "no model installed". A cold model is
     * loaded in the background for the next uncertain turn, and this one does not
     * wait for it (audit 15, F3).
     */
    async evaluateScenarioResponse(request) {
      if (!request || typeof request !== 'object' || configuredProvider !== 'llama.cpp') {
        return { ok: false, text: '' }
      }
      if (usesTranslationModel) {
        return { ok: false, text: '', reason: 'no-tutor-model' }
      }
      if (!isWarm()) {
        // preload arms the idle unload once the load settles, so a model nobody uses still goes
        if (!isInferenceActive) {
          void runtime.preload('scenario-judge').catch(() => undefined)
        }
        return { ok: false, text: '', reason: 'model-warming' }
      }

      const inferenceLease = acquireInferenceLease()
      if (!inferenceLease) {
        return { ok: false, text: '' }
      }

      let timeout = null
      try {
        const coldStart = await ensureLoaded()
        if (inferenceLease.controller.signal.aborted) {
          return { ok: false, text: '' }
        }

        const intents = Array.isArray(request.expectedIntents) ? request.expectedIntents : []
        const prompt = [
          'You judge one Japanese learner response against a fixed list of expected intents.',
          'Return only a JSON object with exactly these keys: outcome, matchedIntentId, missingInfo, correction, explanation, confidence.',
          'outcome must be one of "correct", "partial", "incorrect", "unclear".',
          'matchedIntentId must be one of the listed intent ids, or null.',
          'missingInfo must be an array holding only the listed required information ids.',
          'confidence must be a number between 0 and 1.',
          'Never write dialogue for the shopkeeper or continue the conversation.',
          '',
          `Scenario: ${String(request.scenarioTitle || '')}`,
          `Learner level: ${String(request.learnerLevel || '')}`,
          `What the other speaker just said: ${String(request.npcLine || '')}`,
          `What the learner is meant to do: ${String(request.objectiveDescription || '')}`,
          `Required information ids: ${JSON.stringify(request.requiredSlotIds || [])}`,
          `Expected intents: ${JSON.stringify(intents)}`,
          `Learner response: ${String(request.learnerResponse || '')}`,
        ].join('\n')

        timeout = setTimeout(() => inferenceLease.controller.abort(), SCENARIO_EVALUATION_TIMEOUT_MS)
        const inference = await adapter.infer(prompt, {}, {
          signal: inferenceLease.controller.signal,
          maxContextChars: 3_000,
          maxPromptChars: 3_000,
          // the learner's response is the last line: never cut (audit 15 design critic, 1)
          maxMessageChars: 2_600,
          maxOutputTokens: 220,
          disableThinking: true,
          systemPromptOverride: 'You grade a single Japanese utterance and reply with one JSON object only. You never produce conversation.',
          promptAdapter: {
            id: 'scenario_evaluation',
            systemNote: 'Return one JSON object only. Never invent intent ids.',
            temperature: 0,
            top_p: 0.8,
            top_k: 20,
            repeat_penalty: 1.05,
            maxOutputTokens: 220,
          },
        })
        if (inferenceLease.controller.signal.aborted || inference?.provider === 'stub') {
          return { ok: false, text: '' }
        }
        lastUsedAtUtc = new Date().toISOString()
        return { ok: true, text: String(inference?.text || ''), coldStart }
      } catch {
        return { ok: false, text: '' }
      } finally {
        if (timeout) {
          clearTimeout(timeout)
        }
        releaseInferenceLease(inferenceLease)
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
        activeModelTier,
        activeModel,
        lastError,
        maxContextChars,
        maxMessageChars,
        maxOutputChars,
        maxOutputTokens,
        activePromptAdapter: activePromptAdapterId,
        adapterManifestPath: loadedAdapterManifestPath || null,
        inferenceActive: isInferenceActive,
      }
    },

    async preload(reason = 'startup-preload') {
      if (reason === 'scenario-start' && usesTranslationModel) {
        return { ok: false, reason: 'no-tutor-model', coldStart: false, loaded }
      }
      // an unload timer armed by an earlier request must not fire into this (re)load
      clearUnloadTimer()
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
      const pendingLoad = loadPromise
      if (pendingLoad) {
        try {
          await pendingLoad
        } catch {
          // Continue resetting runtime state after a failed or cancelled cold load.
        }
      }
      if (loaded && adapter && typeof adapter.unload === 'function') {
        await adapter.unload(reason)
      }
      // the dictionary index reopens on the next question; a runtime being replaced lets it go
      resolveDictionaryEntry.close?.()
      loaded = false
      adapter = null
      loadedAtUtc = null
      activeInferenceLease = null
      isInferenceActive = false
      activeInferenceController = null
      activeProvider = configuredProvider
      activeModel = configuredProvider === 'llama.cpp' ? llamaCppConfig.modelPath || 'unknown' : 'stub'
      activePromptAdapterId = 'default'
      // switching the chat off and on is the learner's retry of a failed load
      lastLoadFailedAt = 0
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
  resolveTutorRuntimeFiles,
  isLocalTranslationReady,
  createAdapterRegistry,
  extractCliResponseText,
  httpRequestJson,
  createLlamaServerAdapter,
  // for tests of what reaches the model (audit 15)
  composeSystemPrompt,
  boundChatHistory,
  extractEnglishTranslationTarget,
  llamaServerStatusError,
}
