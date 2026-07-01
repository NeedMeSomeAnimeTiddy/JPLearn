/**
 * setup_runtime.cjs — first-run setup wizard backend.
 *
 * Provides system detection, model downloads (with redirect handling and .tmp
 * safety), and VOICEVOX installation via the existing get_voicevox.py script.
 * All downloads target Documents\JPLearn\ so they survive uninstall/reinstall.
 */

const fs = require('node:fs')
const https = require('node:https')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

// ── Model catalogue ──────────────────────────────────────────────────────────

const MODELS = {
  low: {
    filename: 'Qwen3.5-2B-Q4_K_M.gguf',
    repo: 'unsloth/Qwen3.5-2B-GGUF',
    sizeMb: 1400,
    label: 'Low-end (2B)',
    description: 'Fast on any hardware. Good for everyday questions.',
  },
  high: {
    filename: 'Qwen3.5-4B-Q4_K_M.gguf',
    repo: 'unsloth/Qwen3.5-4B-GGUF',
    sizeMb: 2600,
    label: 'High-end (4B)',
    description: 'Stronger Japanese understanding. Recommended for most users.',
  },
  ultra: {
    filename: 'Qwen3.5-9B-Q4_K_M.gguf',
    repo: 'unsloth/Qwen3.5-9B-GGUF',
    sizeMb: 5500,
    label: 'Ultra (9B)',
    description: 'Most capable. Better for complex grammar and nuanced questions.',
  },
}

const RAM_THRESHOLD_GB = 16
const SENTINEL_NAME = '.setup-done'

// ── Path helpers ─────────────────────────────────────────────────────────────

function getJPLearnDir() {
  const explicit = (process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
  if (explicit) return explicit
  let docs
  try {
    docs = require('electron').app.getPath('documents')
  } catch {
    docs = path.join(os.homedir(), 'Documents')
  }
  return path.join(docs, 'JPLearn')
}

function ensureJPLearnDirs() {
  const base = getJPLearnDir()
  for (const sub of ['models', 'voicevox', 'data']) {
    fs.mkdirSync(path.join(base, sub), { recursive: true })
  }
  return base
}

// ── System info ──────────────────────────────────────────────────────────────

function getSystemInfo() {
  const base = ensureJPLearnDirs()
  const totalRamGb = os.totalmem() / (1024 ** 3)
  const recommendedTier = totalRamGb >= RAM_THRESHOLD_GB ? 'high' : 'low'
  const modelsDir = path.join(base, 'models')
  const voicevoxInstalled = fs.existsSync(path.join(base, 'voicevox', 'run.exe'))

  const models = Object.entries(MODELS).map(([tier, m]) => ({
    tier,
    filename: m.filename,
    sizeMb: m.sizeMb,
    label: m.label,
    description: m.description,
    installed: fs.existsSync(path.join(modelsDir, m.filename)),
  }))

  return {
    totalRamGb: Math.round(totalRamGb * 10) / 10,
    recommendedTier,
    models,
    voicevoxInstalled,
  }
}

function isFirstRun() {
  const sentinel = path.join(getJPLearnDir(), 'models', SENTINEL_NAME)
  return !fs.existsSync(sentinel)
}

function writeSentinel() {
  const base = getJPLearnDir()
  fs.mkdirSync(path.join(base, 'models'), { recursive: true })
  fs.writeFileSync(
    path.join(base, 'models', SENTINEL_NAME),
    new Date().toISOString(),
    'utf8',
  )
}

// ── Download helpers ─────────────────────────────────────────────────────────

/**
 * Download url → destPath, following HTTP redirects.
 * Writes to destPath + '.tmp' first; renames to destPath only on 100% success.
 * Node's https.get does not follow redirects automatically.
 */
function downloadWithProgress(url, destPath, onProgress) {
  const tmpPath = `${destPath}.tmp`

  return new Promise((resolve, reject) => {
    // Remove any leftover partial file from a previous attempt
    try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }

    function follow(redirectUrl, hops) {
      if (hops > 8) {
        reject(new Error('Too many redirects'))
        return
      }
      const mod = redirectUrl.startsWith('https') ? https : http
      const req = mod.get(redirectUrl, { headers: { 'User-Agent': 'JPLearn/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          req.destroy()
          follow(res.headers.location, hops + 1)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} downloading ${redirectUrl}`))
          return
        }
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let done = 0
        let lastReportedPct = -1

        const out = fs.createWriteStream(tmpPath)

        res.on('data', (chunk) => {
          done += chunk.length
          if (total > 0 && onProgress) {
            const pct = Math.round((done / total) * 100)
            // Throttle to avoid flooding the IPC channel
            if (pct !== lastReportedPct) {
              lastReportedPct = pct
              onProgress(done, total)
            }
          }
        })

        res.pipe(out)

        out.on('finish', () => {
          try {
            fs.renameSync(tmpPath, destPath)
            resolve()
          } catch (err) {
            try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
            reject(err)
          }
        })

        const cleanup = (err) => {
          try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
          reject(err)
        }
        out.on('error', cleanup)
        res.on('error', cleanup)
      })
      req.on('error', (err) => {
        try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
        reject(err)
      })
    }

    follow(url, 0)
  })
}

// ── Public API ───────────────────────────────────────────────────────────────

function downloadModel(tier, sender) {
  const model = MODELS[tier]
  if (!model) return Promise.reject(new Error(`Unknown model tier: ${tier}`))

  const base = ensureJPLearnDirs()
  const destPath = path.join(base, 'models', model.filename)

  if (fs.existsSync(destPath)) {
    return Promise.resolve({ alreadyInstalled: true })
  }

  const url = `https://huggingface.co/${model.repo}/resolve/main/${model.filename}`
  let lastEtaSec = null

  const startTime = Date.now()
  let lastDone = 0
  let lastTime = startTime

  const onProgress = (done, total) => {
    const now = Date.now()
    const elapsed = (now - lastTime) / 1000
    if (elapsed > 0) {
      const bytesPerSec = (done - lastDone) / elapsed
      lastDone = done
      lastTime = now
      if (bytesPerSec > 0) {
        lastEtaSec = Math.round((total - done) / bytesPerSec)
      }
    }
    const percent = Math.round((done / total) * 100)
    const mb = Math.round(done / (1024 * 1024))
    const totalMb = Math.round(total / (1024 * 1024))
    if (sender && !sender.isDestroyed()) {
      sender.send('setup:download-progress', { id: 'model', percent, mb, totalMb, etaSec: lastEtaSec })
    }
  }

  return downloadWithProgress(url, destPath, onProgress)
}

function downloadVoicevox(sender, scriptRoot) {
  const base = ensureJPLearnDirs()
  const voicevoxDir = path.join(base, 'voicevox')

  if (fs.existsSync(path.join(voicevoxDir, 'run.exe'))) {
    return Promise.resolve({ alreadyInstalled: true })
  }

  const scriptPath = path.join(scriptRoot, 'scripts', 'get_voicevox.py')
  const pythonCmd = (() => {
    const venvWin = path.join(scriptRoot, '.venv', 'Scripts', 'python.exe')
    if (fs.existsSync(venvWin)) return venvWin
    return 'python'
  })()

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, [scriptPath], {
      env: { ...process.env, VOICEVOX_TARGET_DIR: voicevoxDir },
      windowsHide: true,
    })

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      const match = text.match(/(\d+)%/)
      if (match && sender && !sender.isDestroyed()) {
        sender.send('setup:download-progress', {
          id: 'voicevox',
          percent: parseInt(match[1], 10),
          mb: null,
          totalMb: 1000,
          etaSec: null,
        })
      }
    })

    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true })
      else reject(new Error(`get_voicevox.py exited with code ${code}`))
    })

    child.on('error', reject)
  })
}

// ── Factory ───────────────────────────────────────────────────────────────────

function createSetupRuntime() {
  return {
    getSystemInfo,
    isFirstRun,
    writeSentinel,
    ensureJPLearnDirs,
    downloadModel,
    downloadVoicevox,
  }
}

module.exports = { createSetupRuntime }
