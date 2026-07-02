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

let JishoAPI = null
try {
  JishoAPI = require('unofficial-jisho-api')
} catch {
  JishoAPI = null
}

const DEFAULT_INACTIVITY_UNLOAD_MS = 5 * 60 * 1000
const DEFAULT_LLAMACPP_TIMEOUT_MS = 90000
const DEFAULT_MAX_CONTEXT_CHARS = 1800
const DEFAULT_MAX_MESSAGE_CHARS = 600
const DEFAULT_MAX_OUTPUT_CHARS = 420
const DEFAULT_MAX_PROMPT_CHARS = 3200
const DEFAULT_DICTIONARY_HTTP_TIMEOUT_MS = 4500
const DEFAULT_OFFLINE_DICTIONARY_FULL_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'data',
  'external_sources',
  'offline_dictionary',
  'jmdict-eng-3.6.2.json',
)
const DEFAULT_OFFLINE_DICTIONARY_COMMON_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'data',
  'external_sources',
  'offline_dictionary',
  'jmdict-eng-common-3.6.2.json',
)
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
const DEFAULT_TUTOR_SYSTEM_PROMPT = [
  'You are JPLearn Coach, a warm, encouraging Japanese tutor and conversational partner.',
  'Reply directly to the user. Do not show reasoning, planning, policy text, or system notes.',
  '',
  'How to talk:',
  '- Sound natural and conversational, like a patient coach speaking one-to-one. Keep replies short and focused: 1 to 3 sentences, never more than one short paragraph.',
  '- Do not use emojis, emoticons, or decorative symbols. Express warmth through words only.',
  '- Use plain punctuation to avoid mojibake. Prefer ASCII quotes and hyphens over typographic punctuation.',
  '- Match the user\'s language. If they write in Japanese, reply in Japanese. If they write in English, reply in English. If they mix both, follow the language they used most.',
  '- If the user is speaking English, stay in English unless they explicitly ask for Japanese translation, pronunciation, or a Japanese example.',
  '- When replying in Japanese, you may add a tiny gloss for a harder word in parentheses, but do not overload the answer with extra explanation.',
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

function normalizePromptAdapterId(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase()
  if (!value) {
    return ''
  }
  return value
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function resolveAdapterManifestPath(configuredPath) {
  const preferred = typeof configuredPath === 'string' ? configuredPath.trim() : ''
  const docsDir = (process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
  const resourcesPath = (typeof process.resourcesPath === 'string' ? process.resourcesPath : '').trim()
  const candidates = [
    preferred,
    docsDir ? path.join(docsDir, 'models', DEFAULT_ADAPTER_MANIFEST_FILENAME) : '',
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
  const docsDir = (process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
  const resourcesPath = (typeof process.resourcesPath === 'string' ? process.resourcesPath : '').trim()
  const candidates = [
    docsDir ? path.join(docsDir, 'tools', 'llama.cpp', 'build', 'bin', 'Release', 'llama-server.exe') : '',
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
  // Check Documents\JPLearn\models\ first (installed app), then the bundled/dev path.
  const directories = []
  const docsDir = (process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
  if (docsDir) {
    directories.push(path.join(docsDir, 'models'))
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
      const activePath = path.join(dir, activeFilename)
      if (fs.existsSync(activePath)) {
        return activePath
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
  const promptLead = messageHint ? `About "${messageHint}": ` : ''
  return {
    text: `${promptLead}let's keep momentum on ${focus}. Start one focused round, then re-check confidence on the items that felt shaky.`,
    provider: 'scripted-fallback',
    model: 'deterministic-scripted',
  }
}

function buildLowSignalRecoveryReply(message) {
  const normalized = String(message || '').trim().toLowerCase()
  if (/how do you say|in japanese|translate|translation|japanese/i.test(normalized)) {
    return 'I glitched on that response. Ask again with the exact phrase and I will translate it to Japanese in one line.'
  }
  return 'I glitched on that response. Please ask again in one short sentence.'
}

function isLowConfidenceAssistantReply(rawText) {
  const text = String(rawText || '').trim()
  if (!text) {
    return false
  }
  return /(i am not sure|i'm not sure|not sure|unsure|i do not know|i don't know|cannot tell|can't tell|need more context|insufficient context|it depends)/i.test(text)
}

function buildClarifyingQuestionForIntent(message) {
  const text = String(message || '')
  if (detectTranslationIntent(text)) {
    return 'I might need a little context for that translation. Can you share the exact phrase and where you want to use it?'
  }
  if (detectGrammarIntent(text)) {
    return 'I can give a precise correction if I see the full sentence. Can you share the exact Japanese sentence you want checked?'
  }
  if (detectStudyPlanIntent(text)) {
    return 'I can tailor this better with one detail: do you want a 10-minute, 20-minute, or 30-minute plan?'
  }
  return 'I might be missing context. Can you share one more detail so I can answer precisely?'
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

  const quoted = text.match(/"([^"]{1,60})"|'([^']{1,60})'/)
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

function parseJishoEntry(rawResult) {
  if (!rawResult || typeof rawResult !== 'object') {
    return null
  }
  const jp = Array.isArray(rawResult.japanese) ? rawResult.japanese[0] : null
  const japaneseWord = jp && typeof jp.word === 'string' ? jp.word.trim() : ''
  const japaneseReading = jp && typeof jp.reading === 'string' ? jp.reading.trim() : ''
  const primary = japaneseWord || japaneseReading
  if (!primary) {
    return null
  }
  const firstSense = Array.isArray(rawResult.senses) ? rawResult.senses[0] : null
  const defs = firstSense && Array.isArray(firstSense.english_definitions)
    ? firstSense.english_definitions.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : []
  return normalizeDictionaryEntry({
    japanese: primary,
    reading: japaneseReading,
    gloss: defs[0] || '',
  })
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

function extractFirstJmdictGloss(rawEntry) {
  if (!rawEntry || typeof rawEntry !== 'object') {
    return ''
  }
  const senses = Array.isArray(rawEntry.sense)
    ? rawEntry.sense
    : (Array.isArray(rawEntry.senses) ? rawEntry.senses : [])
  for (const sense of senses) {
    if (!sense || typeof sense !== 'object') {
      continue
    }
    const glosses = Array.isArray(sense.gloss) ? sense.gloss : []
    for (const gloss of glosses) {
      if (typeof gloss === 'string' && gloss.trim()) {
        return gloss.trim()
      }
      if (gloss && typeof gloss === 'object' && typeof gloss.text === 'string' && gloss.text.trim()) {
        return gloss.text.trim()
      }
    }
  }
  return ''
}

function extractAllJmdictGlosses(rawEntry) {
  if (!rawEntry || typeof rawEntry !== 'object') {
    return []
  }
  const senses = Array.isArray(rawEntry.sense)
    ? rawEntry.sense
    : (Array.isArray(rawEntry.senses) ? rawEntry.senses : [])
  const glosses = []
  for (const sense of senses) {
    if (!sense || typeof sense !== 'object') {
      continue
    }
    const entries = Array.isArray(sense.gloss) ? sense.gloss : []
    for (const entry of entries) {
      if (typeof entry === 'string' && entry.trim()) {
        glosses.push(entry.trim())
      } else if (entry && typeof entry === 'object' && typeof entry.text === 'string' && entry.text.trim()) {
        glosses.push(entry.text.trim())
      }
    }
  }
  return glosses
}

function parseJmdictWordEntry(rawEntry) {
  if (!rawEntry || typeof rawEntry !== 'object') {
    return null
  }

  const kanji = Array.isArray(rawEntry.kanji) ? rawEntry.kanji : []
  const kana = Array.isArray(rawEntry.kana) ? rawEntry.kana : []

  const preferredKanji = kanji.find((item) => item && item.common && typeof item.text === 'string' && item.text.trim())
    || kanji.find((item) => item && typeof item.text === 'string' && item.text.trim())
    || null
  const preferredKana = kana.find((item) => item && item.common && typeof item.text === 'string' && item.text.trim())
    || kana.find((item) => item && typeof item.text === 'string' && item.text.trim())
    || null

  const japanese = preferredKanji && preferredKanji.text
    ? preferredKanji.text.trim()
    : (preferredKana && preferredKana.text ? preferredKana.text.trim() : '')
  const reading = preferredKana && preferredKana.text ? preferredKana.text.trim() : ''
  const gloss = extractFirstJmdictGloss(rawEntry)

  return normalizeDictionaryEntry({ japanese, reading, gloss })
}

function resolveOfflineDictionaryPath(configuredPath) {
  const preferred = typeof configuredPath === 'string' ? configuredPath.trim() : ''
  const docsDir = (process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
  const resourcesPath = (typeof process.resourcesPath === 'string' ? process.resourcesPath : '').trim()
  const candidates = [
    preferred,
    docsDir ? path.join(docsDir, 'data', 'external_sources', 'offline_dictionary', 'jmdict-eng-3.6.2.json') : '',
    docsDir ? path.join(docsDir, 'data', 'external_sources', 'offline_dictionary', 'jmdict-eng-common-3.6.2.json') : '',
    resourcesPath ? path.join(resourcesPath, 'data', 'external_sources', 'offline_dictionary', 'jmdict-eng-3.6.2.json') : '',
    resourcesPath ? path.join(resourcesPath, 'data', 'external_sources', 'offline_dictionary', 'jmdict-eng-common-3.6.2.json') : '',
    DEFAULT_OFFLINE_DICTIONARY_FULL_PATH,
    DEFAULT_OFFLINE_DICTIONARY_COMMON_PATH,
  ]
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || ''
}

function resolveOfflineDictionarySqlitePath(configuredPath) {
  const preferred = typeof configuredPath === 'string' ? configuredPath.trim() : ''
  const docsDir = (process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
  const resourcesPath = (typeof process.resourcesPath === 'string' ? process.resourcesPath : '').trim()
  const candidates = [
    preferred,
    docsDir ? path.join(docsDir, 'data', 'external_sources', 'offline_dictionary', 'jmdict_lookup.sqlite') : '',
    resourcesPath ? path.join(resourcesPath, 'data', 'external_sources', 'offline_dictionary', 'jmdict_lookup.sqlite') : '',
    DEFAULT_OFFLINE_DICTIONARY_SQLITE_PATH,
  ]
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || ''
}

function createOfflineDictionaryLookup(options = {}) {
  const filePath = resolveOfflineDictionaryPath(options.offlineDictionaryPath)
  const sqlitePath = resolveOfflineDictionarySqlitePath(options.offlineDictionarySqlitePath)
  const inlineEntries = Array.isArray(options.offlineEntries) ? options.offlineEntries : null
  let index = null
  let sqliteDb = null
  let sqliteStatement = null

  function buildIndex(entries) {
    const byGloss = new Map()
    for (const rawEntry of entries) {
      const normalized = parseJmdictWordEntry(rawEntry)
      if (!normalized) {
        continue
      }
      const glosses = extractAllJmdictGlosses(rawEntry)
      for (const gloss of glosses) {
        const exactKey = normalizeAsciiToken(gloss)
        if (exactKey && !byGloss.has(exactKey)) {
          byGloss.set(exactKey, normalized)
        }
        const words = exactKey.split(' ').filter(Boolean)
        for (const word of words) {
          if (word.length < 3) {
            continue
          }
          if (!byGloss.has(word)) {
            byGloss.set(word, normalized)
          }
        }
      }
    }
    return byGloss
  }

  function ensureIndex() {
    if (index) {
      return index
    }
    try {
      const rawEntries = inlineEntries
        || (() => {
          if (!filePath) {
            return []
          }
          const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'))
          return Array.isArray(payload.words) ? payload.words : []
        })()
      index = buildIndex(rawEntries)
    } catch {
      index = new Map()
    }
    return index
  }

  function lookupFromSqlite(key) {
    if (inlineEntries || !sqlitePath || !NodeSqliteDatabaseSync) {
      return null
    }
    try {
      if (!sqliteDb) {
        sqliteDb = new NodeSqliteDatabaseSync(sqlitePath, { readOnly: true })
      }
      if (!sqliteStatement) {
        sqliteStatement = sqliteDb.prepare(
          'SELECT japanese, reading, gloss FROM dictionary_lookup WHERE lookup_key = ? LIMIT 1',
        )
      }
      const row = sqliteStatement.get(key)
      if (!row) {
        return null
      }
      const normalized = normalizeDictionaryEntry({
        japanese: typeof row.japanese === 'string' ? row.japanese : '',
        reading: typeof row.reading === 'string' ? row.reading : '',
        gloss: typeof row.gloss === 'string' ? row.gloss : '',
      })
      if (!normalized) {
        return null
      }
      return {
        ...normalized,
        source: 'jmdict-offline-sqlite',
      }
    } catch {
      return null
    }
  }

  return (target) => {
    const key = normalizeAsciiToken(target)
    if (!key) {
      return null
    }

    const sqliteHit = lookupFromSqlite(key)
    if (sqliteHit) {
      return sqliteHit
    }

    const table = ensureIndex()
    const hit = table.get(key)
    if (!hit) {
      return null
    }
    return {
      ...hit,
      source: 'jmdict-offline',
    }
  }
}

function createDictionaryResolver(options = {}) {
  const onlineTimeoutMs = Number.isFinite(options.onlineTimeoutMs)
    ? Math.max(1000, Math.floor(options.onlineTimeoutMs))
    : DEFAULT_DICTIONARY_HTTP_TIMEOUT_MS
  const jishoClient = typeof options.jishoClient === 'object' && options.jishoClient
    ? options.jishoClient
    : (JishoAPI ? new JishoAPI() : null)
  const resolveOfflineEntry = createOfflineDictionaryLookup({
    offlineDictionaryPath: options.offlineDictionaryPath,
    offlineDictionarySqlitePath: options.offlineDictionarySqlitePath,
    offlineEntries: options.offlineEntries,
  })

  return async (target) => {
    const key = normalizeAsciiToken(target)
    if (!key) {
      return null
    }

    try {
      if (jishoClient && typeof jishoClient.searchForPhrase === 'function') {
        const payload = await Promise.race([
          jishoClient.searchForPhrase(key),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('dictionary lookup timed out')), onlineTimeoutMs)
          }),
        ])
        const first = payload && Array.isArray(payload.data) ? payload.data[0] : null
        const parsed = parseJishoEntry(first)
        if (parsed) {
          return {
            ...parsed,
            source: 'jisho-online',
          }
        }
      }
    } catch {
      // Ignore online lookup failures and continue to offline fallback.
    }

    const offline = resolveOfflineEntry(key)
    if (offline) {
      return offline
    }

    return null
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
      const grammarFilePath = resolveTutorGrammarPath()

      const args = [
        '-m', modelPath,
        '-c', '2048',
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
      const contextPriorityNote = resolveContextPriorityNote(promptTuningProfile)
      const composedSystemPrompt = contextText
        ? [
            systemPrompt,
            contextPriorityNote,
            'Current context:',
            contextText,
          ].filter(Boolean).join('\n\n')
        : systemPrompt
      const promptAdapter = runtimeOptions.promptAdapter && typeof runtimeOptions.promptAdapter === 'object'
        ? runtimeOptions.promptAdapter
        : null
      const adaptedSystemPrompt = promptAdapter && typeof promptAdapter.systemNote === 'string' && promptAdapter.systemNote.trim()
        ? [composedSystemPrompt, 'Adapter instructions:', promptAdapter.systemNote.trim()].join('\n\n')
        : composedSystemPrompt
      const boundedSystemPrompt = clipText(adaptedSystemPrompt, runtimeOptions.maxPromptChars || DEFAULT_MAX_PROMPT_CHARS)
      const boundedMessage = clipText(message, DEFAULT_MAX_MESSAGE_CHARS)
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

function createTutorChatRuntime(options = {}) {
  const inactivityUnloadMs = Number.isFinite(options.inactivityUnloadMs)
    ? Math.max(15000, Math.floor(options.inactivityUnloadMs))
    : DEFAULT_INACTIVITY_UNLOAD_MS

  const discoveredLlamaServerPath = resolveBundledLlamaServerPath()
  const discoveredModelPath = resolveBundledModelPath()
  const docsDir = (process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
  const modelStateBases = [
    docsDir ? path.join(docsDir, 'models') : '',
    path.resolve(__dirname, '..', '..', 'models'),
  ]
  const activeModelTier = modelStateBases
    .map((base) => (base && fs.existsSync(base) ? readActiveModelTier(base) : null))
    .find((tier) => typeof tier === 'string' && tier.trim())
    || null
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
    promptTuningProfile: detectPromptTuningProfile({
      activeTier: activeModelTier,
      modelPath: options.llamaModelPath
        || preferExistingPath(process.env.JPLEARN_LLAMA_MODEL_PATH, discoveredModelPath),
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
    onlineTimeoutMs: options.translationDictionaryTimeoutMs,
    jishoClient: options.translationJishoClient,
    offlineDictionaryPath: options.translationOfflineDictionaryPath,
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
  let activePromptAdapterId = 'default'
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
      const translationTarget = extractTranslationTarget(trimmedMessage)
      if (translationTarget) {
        const dictionaryHit = await resolveDictionaryEntry(translationTarget)
        if (dictionaryHit) {
          const dictionaryText = formatDictionaryTranslation(dictionaryHit)
          const dictionarySource = String(dictionaryHit.source || 'dictionary')
          const dictionaryProvider = dictionarySource === 'jisho-online'
            ? 'unofficial-jisho-api'
            : 'offline-jmdict'
          return {
            ok: true,
            text: clipText(dictionaryText, maxOutputChars),
            provider: dictionaryProvider,
            model: dictionarySource,
            coldStart: false,
            elapsedMs: 0,
          }
        }
      }

      const boundedContext = {}
      for (const [key, value] of Object.entries(context || {})) {
        if (typeof value !== 'string') {
          continue
        }
        boundedContext[key] = clipText(value, 280)
      }

      const adapterState = promptAdapterManifest.getAdapters()
      loadedAdapterManifestPath = adapterState.manifestPath
      const selectedPromptAdapter = resolvePromptAdapterSelection(trimmedMessage, boundedContext, adapterState.adapters)
      activePromptAdapterId = selectedPromptAdapter && selectedPromptAdapter.id
        ? selectedPromptAdapter.id
        : 'default'

      const coldStart = await ensureLoaded()
      lastUsedAtUtc = new Date().toISOString()
      scheduleInactivityUnload()

      const startedAt = Date.now()
      activeInferenceController = new AbortController()
      isInferenceActive = true
      try {
        let inference = null
        let cleanedText = ''
        for (let attempt = 0; attempt < 2; attempt += 1) {
          inference = await adapter.infer(trimmedMessage, boundedContext, {
            signal: activeInferenceController.signal,
            maxContextChars,
            maxPromptChars,
            maxOutputTokens,
            promptAdapter: selectedPromptAdapter,
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
            cleanedText = buildLowSignalRecoveryReply(trimmedMessage)
            break
          }
        }
        const elapsedMs = Date.now() - startedAt
        if (activeProvider !== 'stub-fallback') {
          lastError = null
        }
        if (inference && typeof inference.provider === 'string') {
          if (!(activeProvider === 'stub-fallback' && inference.provider === 'stub')) {
            activeProvider = inference.provider
          }
        }
        if (inference && typeof inference.model === 'string') {
          activeModel = inference.model
        }
        return {
          ok: true,
          text: clipText(cleanedText, maxOutputChars),
          provider: String((inference && inference.provider) || 'unknown'),
          model: String((inference && inference.model) || 'unknown'),
          adapter: activePromptAdapterId,
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
          text: clipText(normalizeMojibakePunctuation(fallback.text), maxOutputChars),
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
        activePromptAdapter: activePromptAdapterId,
        adapterManifestPath: loadedAdapterManifestPath || null,
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
      activePromptAdapterId = 'default'
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
