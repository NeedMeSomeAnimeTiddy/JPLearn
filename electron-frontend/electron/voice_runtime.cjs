const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const DEFAULT_MAX_TEXT_CHARS = 400
const DEFAULT_REQUEST_TIMEOUT_MS = 30000
const DEFAULT_SAMPLE_RATE = 24000

const VOICEVOX_HOST = (process.env.JPLEARN_VOICEVOX_HOST || '127.0.0.1').trim()
const VOICEVOX_PORT = Number(process.env.JPLEARN_VOICEVOX_PORT || 50021)
const VOICEVOX_AUTOSTART_ENABLED = String(process.env.JPLEARN_VOICEVOX_AUTOSTART || '1').trim() !== '0'

const VOICE_CATALOG = [
  { voiceId: 'zundamon_normal', displayName: 'Zundamon', description: 'ずんだもん (ノーマル)', gender: 'neutral', searchTerms: ['zundamon', 'ずんだもん', 'normal'], speaker: 3 },
  { voiceId: 'shikoku_metan_normal', displayName: 'Shikoku Metan', description: '四国めたん (ノーマル)', gender: 'female', searchTerms: ['shikoku', 'metan', '四国めたん', 'normal'], speaker: 2 },
  { voiceId: 'kasukabe_tsumugi_normal', displayName: 'Kasukabe Tsumugi', description: '春日部つむぎ (ノーマル)', gender: 'female', searchTerms: ['kasukabe', 'tsumugi', '春日部つむぎ', 'normal'], speaker: 8 },
  { voiceId: 'namine_ritsu_normal', displayName: 'Namine Ritsu', description: '波音リツ (ノーマル)', gender: 'neutral', searchTerms: ['namine', 'ritsu', '波音リツ', 'normal'], speaker: 9 },
  { voiceId: 'genno_takehiro_normal', displayName: 'Genno Takehiro', description: '玄野武宏 (ノーマル)', gender: 'male', searchTerms: ['genno', 'takehiro', '玄野武宏', 'normal'], speaker: 11 },
  { voiceId: 'shirakami_kotaro_normal', displayName: 'Shirakami Kotaro', description: '白上虎太郎 (ふつう)', gender: 'male', searchTerms: ['shirakami', 'kotaro', '白上虎太郎', 'normal'], speaker: 12 },
  { voiceId: 'meimei_himari_normal', displayName: 'Meimei Himari', description: '冥鳴ひまり (ノーマル)', gender: 'female', searchTerms: ['meimei', 'himari', '冥鳴ひまり', 'normal'], speaker: 14 },
  { voiceId: 'kyushu_sora_normal', displayName: 'Kyushu Sora', description: '九州そら (ノーマル)', gender: 'female', searchTerms: ['kyushu', 'sora', '九州そら', 'normal'], speaker: 16 },
]

const VOICE_BY_ID = new Map(VOICE_CATALOG.map((voice) => [voice.voiceId, voice]))

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getVoicevoxExecutableCandidates() {
  const candidates = []
  const explicit = (process.env.JPLEARN_VOICEVOX_EXECUTABLE || '').trim()
  if (explicit) {
    candidates.push(explicit)
  }

  const localAppData = (process.env.LOCALAPPDATA || '').trim()
  const programFiles = (process.env.ProgramFiles || '').trim()
  const programFilesX86 = (process.env['ProgramFiles(x86)'] || '').trim()

  if (localAppData) {
    candidates.push(path.join(localAppData, 'Programs', 'VOICEVOX', 'VOICEVOX.exe'))
    candidates.push(path.join(localAppData, 'Programs', 'VOICEVOX Engine', 'run.exe'))
  }
  if (programFiles) {
    candidates.push(path.join(programFiles, 'VOICEVOX', 'VOICEVOX.exe'))
    candidates.push(path.join(programFiles, 'VOICEVOX Engine', 'run.exe'))
  }
  if (programFilesX86) {
    candidates.push(path.join(programFilesX86, 'VOICEVOX', 'VOICEVOX.exe'))
    candidates.push(path.join(programFilesX86, 'VOICEVOX Engine', 'run.exe'))
  }

  return [...new Set(candidates)]
}

function resolveVoicevoxExecutable() {
  return getVoicevoxExecutableCandidates().find((candidate) => fs.existsSync(candidate)) || null
}

function launchVoicevoxProcess() {
  const executablePath = resolveVoicevoxExecutable()
  if (!executablePath) {
    return false
  }

  try {
    const child = spawn(executablePath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    return true
  } catch {
    return false
  }
}

function sanitizeSpeechText(text) {
  return typeof text === 'string' ? text.trim().slice(0, DEFAULT_MAX_TEXT_CHARS) : ''
}

function clampSpeed(value) {
  if (!Number.isFinite(value)) {
    return 1
  }
  return Math.max(0.5, Math.min(2, Number(value)))
}

function normalizeSpeaker(rawSpeaker) {
  if (typeof rawSpeaker === 'string') {
    const normalized = rawSpeaker.trim()
    if (VOICE_BY_ID.has(normalized)) {
      return VOICE_BY_ID.get(normalized)
    }
  }
  if (Number.isInteger(rawSpeaker)) {
    const numeric = Number(rawSpeaker)
    const fromNumeric = VOICE_CATALOG.find((voice) => voice.speaker === numeric)
    if (fromNumeric) {
      return fromNumeric
    }
  }
  return VOICE_CATALOG[0]
}

function requestJson(method, endpointPath, body, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const payload = body != null ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const request = http.request(
      {
        host: VOICEVOX_HOST,
        port: VOICEVOX_PORT,
        method,
        path: endpointPath,
        headers: payload
          ? {
            'Content-Type': 'application/json',
            'Content-Length': String(payload.length),
          }
          : undefined,
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const status = response.statusCode || 0
          const raw = Buffer.concat(chunks).toString('utf8')
          if (status < 200 || status >= 300) {
            reject(new Error(`VOICEVOX ${method} ${endpointPath} failed (${status})`))
            return
          }
          try {
            resolve(raw ? JSON.parse(raw) : {})
          } catch (error) {
            reject(new Error(`VOICEVOX returned invalid JSON for ${endpointPath}: ${error instanceof Error ? error.message : String(error)}`))
          }
        })
      },
    )

    request.setTimeout(timeoutMs, () => request.destroy(new Error(`VOICEVOX request timeout for ${endpointPath}`)))
    request.on('error', reject)
    if (payload) {
      request.write(payload)
    }
    request.end()
  })
}

function requestAudioBuffer(method, endpointPath, body, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const payload = body != null ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const request = http.request(
      {
        host: VOICEVOX_HOST,
        port: VOICEVOX_PORT,
        method,
        path: endpointPath,
        headers: payload
          ? {
            'Content-Type': 'application/json',
            'Content-Length': String(payload.length),
          }
          : undefined,
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const status = response.statusCode || 0
          const buffer = Buffer.concat(chunks)
          if (status < 200 || status >= 300) {
            reject(new Error(`VOICEVOX ${method} ${endpointPath} failed (${status})`))
            return
          }
          resolve(buffer)
        })
      },
    )

    request.setTimeout(timeoutMs, () => request.destroy(new Error(`VOICEVOX request timeout for ${endpointPath}`)))
    request.on('error', reject)
    if (payload) {
      request.write(payload)
    }
    request.end()
  })
}

async function checkVoicevoxAvailable() {
  try {
    await requestJson('GET', '/version', null, 4000)
    return true
  } catch {
    return false
  }
}

async function ensureVoicevoxAvailable() {
  if (await checkVoicevoxAvailable()) {
    return true
  }

  if (!VOICEVOX_AUTOSTART_ENABLED) {
    return false
  }

  const started = launchVoicevoxProcess()
  if (!started) {
    return false
  }

  const deadline = Date.now() + 12000
  while (Date.now() < deadline) {
    await sleep(400)
    if (await checkVoicevoxAvailable()) {
      return true
    }
  }
  return false
}

function createVoiceRuntime() {
  let lastError = null
  let available = false

  return {
    getStatus() {
      return {
        available,
        modelReady: available,
        downloading: false,
        downloadProgress: 0,
        modelName: 'voicevox:local-engine',
        lastError,
      }
    },

    async preload() {
      available = await ensureVoicevoxAvailable()
      if (!available) {
        lastError = `VOICEVOX engine is unavailable at ${VOICEVOX_HOST}:${VOICEVOX_PORT}`
        return { ok: false, ready: false }
      }
      lastError = null
      return { ok: true, ready: true }
    },

    async unload() {
      return { ok: true }
    },

    listVoices() {
      return VOICE_CATALOG.map(({ voiceId, displayName, description, gender, searchTerms }) => ({
        voiceId,
        displayName,
        description,
        gender,
        searchTerms,
      }))
    },

    async speak(text, speakOptions = {}) {
      const safeText = sanitizeSpeechText(text)
      if (!safeText) {
        throw new Error('Speech text is empty')
      }

      const selectedVoice = normalizeSpeaker(speakOptions.speaker)
      const speed = clampSpeed(speakOptions.speed)
      const speakerId = selectedVoice.speaker

      try {
        if (!(await ensureVoicevoxAvailable())) {
          throw new Error(`VOICEVOX engine is unavailable at ${VOICEVOX_HOST}:${VOICEVOX_PORT}`)
        }
        const audioQueryPath = `/audio_query?speaker=${speakerId}&text=${encodeURIComponent(safeText)}`
        const query = await requestJson('POST', audioQueryPath, null)
        query.speedScale = speed

        const synthesisPath = `/synthesis?speaker=${speakerId}&enable_interrogative_upspeak=true`
        const audioBuffer = await requestAudioBuffer('POST', synthesisPath, query)

        available = true
        lastError = null
        return {
          ok: true,
          format: 'wav',
          sampleRate: DEFAULT_SAMPLE_RATE,
          voiceId: selectedVoice.voiceId,
          audioBase64: audioBuffer.toString('base64'),
          synthesis: {
            mode: 'single',
            profile: 'jp',
            mixedSegmentCount: 1,
            streamingAttempted: false,
            streamingFallbackUsed: false,
            elapsedMs: 0,
          },
        }
      } catch (error) {
        available = false
        lastError = error instanceof Error ? error.message : String(error)
        throw error
      }
    },
  }
}

function isVoiceRuntimeInstalled() {
  // Installation is managed as an optional setup component; runtime availability
  // depends on VOICEVOX engine reachability at startup/use time.
  return true
}

module.exports = {
  createVoiceRuntime,
  isVoiceRuntimeInstalled,
}
