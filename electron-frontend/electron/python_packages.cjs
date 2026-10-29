/**
 * python_packages.cjs — the Python packages setup downloads for the optional features.
 *
 * The installed app runs its own bundled Python, which lives in Squirrel's app-<version> folder.
 * Setup used to pip-install into it, so every update threw OCR's packages away, and speech's were
 * never installed at all (audit 13, F1/F2; Robbie: "In JPLearn Assets"). They now go in
 *
 *   <JPLearn Assets>/python-packages/<tag>/<feature>-<pins>/
 *
 * where <tag> names the interpreter (cp311) and <pins> is a hash of the pinned package list, so a
 * new pin set gets a new folder and nothing is ever renamed over a folder a running server holds
 * DLLs in. A folder counts only once its imports were probed and `.ready.json` written into it.
 * The runtimes get the ready folders in JPLEARN_PYTHON_PACKAGES and add them with site.addsitedir
 * (scripts/downloaded_packages.py), after the bundle's own packages.
 *
 * Running from source (.venv, or JPLEARN_PYTHON) none of this applies: packages come from that
 * environment exactly as before, and readiness is decided as before.
 */

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { bundledPythonCommand } = require('./python_command.cjs')

const READY_MARKER = '.ready.json'

// Also what setup installs into a source environment, so the two cannot drift apart.
const PADDLEOCR_VERSION = '3.7.0'
const PADDLEPADDLE_VERSION = '3.2.0'

/** What each feature installs, and what must import before it counts as installed. */
const FEATURE_PACKAGES = {
  // Every package pinned, dependencies included where they float, to what the source environment
  // runs: unpinned, the first real install drew newer onnxruntime, tokenizers and numpy than
  // anything here was tested with (audit 13 check).
  ocr: {
    pins: [
      `paddlepaddle==${PADDLEPADDLE_VERSION}`,
      `paddleocr==${PADDLEOCR_VERSION}`,
      'paddlex==3.7.2',
      'onnxruntime==1.27.0',
      'numpy==1.26.4',
      'Pillow==12.2.0',
      'opencv-python-headless==4.11.0.86',
      'opencv-contrib-python==4.10.0.84',
      'fasttext-wheel==0.9.2',
    ],
    imports: ['paddleocr', 'onnxruntime', 'numpy', 'PIL', 'cv2', 'fasttext'],
  },
  speech: {
    pins: ['faster-whisper==1.2.1', 'ctranslate2==4.8.0', 'av==18.0.0', 'onnxruntime==1.27.0', 'tokenizers==0.22.2', 'numpy==1.26.4'],
    imports: ['faster_whisper'],
  },
  // Only on a machine with an NVIDIA GPU whose CUDA runtime is missing.
  'speech-cuda': {
    pins: ['nvidia-cublas-cu12'],
    imports: ['nvidia.cublas'],
  },
  embedder: {
    pins: ['onnxruntime==1.27.0', 'tokenizers==0.22.2', 'numpy==1.26.4'],
    imports: ['onnxruntime', 'tokenizers'],
  },
}

/** The interpreter tag of a bundled python.exe, from the pythonXY.dll beside it (no spawn). */
function pythonTag(pythonCmd) {
  try {
    for (const name of fs.readdirSync(path.dirname(pythonCmd))) {
      const match = /^python3(\d+)\.dll$/i.exec(name)
      if (match) return `cp3${match[1]}`
    }
  } catch {
    // fall through
  }
  return null
}

function pinsHash(feature) {
  return crypto.createHash('sha256').update(FEATURE_PACKAGES[feature].pins.join('\n')).digest('hex').slice(0, 10)
}

function packagesRoot(assetsDir, tag) {
  return path.join(assetsDir, 'python-packages', tag)
}

function currentFeatureDir(assetsDir, tag, feature) {
  return path.join(packagesRoot(assetsDir, tag), `${feature}-${pinsHash(feature)}`)
}

function isReadyDir(dir) {
  return fs.existsSync(path.join(dir, READY_MARKER))
}

/**
 * The ready folder for a feature under the bundled interpreter: the one for today's pins, or else
 * the newest older one, so an update that changes a pin does not turn the feature "not installed".
 */
function readyFeatureDir(assetsDir, feature, pythonCmd = bundledPythonCommand()) {
  if (!pythonCmd) return null
  const tag = pythonTag(pythonCmd)
  if (!tag) return null
  const current = currentFeatureDir(assetsDir, tag, feature)
  if (isReadyDir(current)) return current
  const root = packagesRoot(assetsDir, tag)
  let older = []
  try {
    older = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^[a-z-]+-[0-9a-f]{10}$/.test(entry.name)
        && entry.name.slice(0, -11) === feature)
      .map((entry) => path.join(root, entry.name))
      .filter(isReadyDir)
  } catch {
    return null
  }
  older.sort((a, b) => fs.statSync(path.join(b, READY_MARKER)).mtimeMs - fs.statSync(path.join(a, READY_MARKER)).mtimeMs)
  return older[0] || null
}

/** Whether a feature's packages can be imported. From source this is the environment's business. */
function featurePackagesReady(assetsDir, feature) {
  const bundled = bundledPythonCommand()
  if (!bundled) return true
  return readyFeatureDir(assetsDir, feature, bundled) !== null
}

/**
 * The environment a Python child gets for these features. On the bundle: the ready folders in
 * JPLEARN_PYTHON_PACKAGES, and PYTHONNOUSERSITE so a user-wide Python 3.11 install's packages are
 * never what an import probe or a server finds. From source: the environment unchanged.
 */
function envWithFeaturePackages(baseEnv, assetsDir, features) {
  const bundled = bundledPythonCommand()
  if (!bundled) return baseEnv
  if (!assetsDir) return { ...baseEnv, PYTHONNOUSERSITE: '1' }
  const tag = pythonTag(bundled)
  // The folder for today's pins is named even before it exists: it appears only once ready (it is
  // renamed into place), and the Python side adds it when it is there, so a long-lived process such
  // as the bridge picks up a later install without a restart.
  const dirs = features.flatMap((feature) => [
    readyFeatureDir(assetsDir, feature, bundled),
    tag ? currentFeatureDir(assetsDir, tag, feature) : null,
  ]).filter(Boolean)
  const existing = (baseEnv.JPLEARN_PYTHON_PACKAGES || '').split(path.delimiter).filter(Boolean)
  return {
    ...baseEnv,
    PYTHONNOUSERSITE: '1',
    JPLEARN_PYTHON_PACKAGES: [...new Set([...dirs, ...existing])].join(path.delimiter),
  }
}

function runPython(pythonCmd, args, env) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(pythonCmd, args, { env, windowsHide: true })
    } catch (error) {
      resolve({ code: 1, stdout: '', stderr: String(error) })
      return
    }
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error) => resolve({ code: 1, stdout, stderr: stderr || String(error) }))
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

function importProbeScript(dir, imports) {
  return [
    'import site, sys',
    `site.addsitedir(${JSON.stringify(dir)})`,
    ...imports.map((name) => `import ${name}`),
  ].join('\n')
}

/**
 * Install a feature's packages for the bundled interpreter, unless a ready folder for today's pins
 * exists. pip writes into a fresh partial folder, the imports are probed from there, the marker is
 * written, and only then is it renamed into place, so a cut-short install is never used.
 *
 * @returns {Promise<{ ok: true, dir: string, installed: boolean }>}
 */
const installsInFlight = new Map()

async function installFeaturePackages(options) {
  // Two at once (two speech tiers downloading, say) would remove each other's partial folders,
  // so a second call for the same folder waits on the first.
  const key = `${options.assetsDir}|${options.feature}`
  const pending = installsInFlight.get(key)
  if (pending) return pending
  const install = installFeaturePackagesOnce(options).finally(() => installsInFlight.delete(key))
  installsInFlight.set(key, install)
  return install
}

async function installFeaturePackagesOnce({ assetsDir, feature, baseEnv = process.env, run = runPython, pythonCmd = bundledPythonCommand() }) {
  if (!pythonCmd) throw new Error('installFeaturePackages is only for the installed app')
  const spec = FEATURE_PACKAGES[feature]
  if (!spec) throw new Error(`Unknown package feature: ${feature}`)
  const tag = pythonTag(pythonCmd)
  if (!tag) throw new Error(`Cannot tell which Python ${pythonCmd} is`)

  const target = currentFeatureDir(assetsDir, tag, feature)
  if (isReadyDir(target)) return { ok: true, dir: target, installed: false }

  const root = packagesRoot(assetsDir, tag)
  fs.mkdirSync(root, { recursive: true })
  for (const entry of fs.readdirSync(root)) {
    // Our own leftovers: partial folders from an install that was cut short.
    if (entry.startsWith(`${path.basename(target)}.partial-`)) {
      fs.rmSync(path.join(root, entry), { recursive: true, force: true })
    }
  }
  const partial = `${target}.partial-${process.pid}-${Date.now()}`
  const env = { ...baseEnv, PYTHONNOUSERSITE: '1' }

  const install = await run(pythonCmd, [
    '-m', 'pip', 'install',
    '--disable-pip-version-check', '--no-warn-script-location', '--only-binary=:all:',
    '--target', partial,
    ...spec.pins,
  ], env)
  const probe = install.code === 0
    ? await run(pythonCmd, ['-c', importProbeScript(partial, spec.imports)], env)
    : null
  if (install.code !== 0 || !probe || probe.code !== 0) {
    fs.rmSync(partial, { recursive: true, force: true })
    const detail = install.code !== 0 ? install.stderr || install.stdout : probe.stderr || probe.stdout
    const last = (detail || '').trim().split(/\r?\n/).slice(-1)[0] || 'unknown error'
    // OpenCV and PyAV link Windows' own media DLLs, which Windows N editions and Windows Server
    // leave out and nothing can ship in their place (audit 13 check on a bare Server).
    const hint = /DLL load failed while importing (cv2|_core)\b/.test(last)
      ? ' (this Windows is missing its media components; on an N edition, install the Media Feature Pack from Settings > Apps > Optional features; on Windows Server, add the Media Foundation feature)'
      : ''
    throw new Error(`Could not install the ${feature} packages: ${last}${hint}`)
  }

  fs.writeFileSync(path.join(partial, READY_MARKER), JSON.stringify({ pins: spec.pins, tag }, null, 2))
  // A target without a marker is a folder an earlier install left half-made; ours to replace.
  // One with a marker is in use, so ours is the one dropped.
  if (isReadyDir(target)) {
    fs.rmSync(partial, { recursive: true, force: true })
    return { ok: true, dir: target, installed: false }
  }
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
  fs.renameSync(partial, target)
  return { ok: true, dir: target, installed: true }
}

/** Every folder of a feature, for uninstalling it. */
function featurePackageDirs(assetsDir, feature) {
  const base = path.join(assetsDir, 'python-packages')
  const dirs = []
  let tags = []
  try {
    tags = fs.readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return dirs
  }
  for (const tag of tags) {
    for (const entry of fs.readdirSync(path.join(base, tag), { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.replace(/\.partial-.*$/, '').slice(0, -11) === feature) {
        dirs.push(path.join(base, tag, entry.name))
      }
    }
  }
  return dirs
}

module.exports = {
  FEATURE_PACKAGES,
  PADDLEOCR_VERSION,
  PADDLEPADDLE_VERSION,
  READY_MARKER,
  pythonTag,
  pinsHash,
  readyFeatureDir,
  featurePackagesReady,
  envWithFeaturePackages,
  installFeaturePackages,
  featurePackageDirs,
  importProbeScript,
}
