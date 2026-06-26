const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const outDir = path.join(repoRoot, 'out')
const smokeDir = path.join(repoRoot, '.smoke')
const appDataRoot = path.join(smokeDir, 'appdata')
const smokeLogPath = path.join(smokeDir, 'packaged-smoke-log.txt')
const maxWaitMs = 45000
const pollIntervalMs = 500

function ensureCleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true })
  fs.mkdirSync(dirPath, { recursive: true })
}

function appendLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  fs.appendFileSync(smokeLogPath, line, 'utf8')
  process.stdout.write(line)
}

function findCandidateExecutables(dirPath, acc = []) {
  if (!fs.existsSync(dirPath)) {
    return acc
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      findCandidateExecutables(fullPath, acc)
      continue
    }
    if (!entry.name.toLowerCase().endsWith('.exe')) {
      continue
    }
    const lower = entry.name.toLowerCase()
    if (lower === 'update.exe' || lower.includes('squirrel')) {
      continue
    }
    acc.push(fullPath)
  }
  return acc
}

function scoreExecutable(exePath) {
  const lowerPath = exePath.toLowerCase()
  let score = 0
  if (lowerPath.includes('win32-unpacked')) score += 10
  if (lowerPath.endsWith('electron-frontend.exe')) score += 8
  if (lowerPath.includes('resources')) score -= 4
  score -= exePath.length * 0.001
  return score
}

function findPackagedExecutable() {
  const candidates = findCandidateExecutables(outDir)
  if (candidates.length === 0) {
    throw new Error(`No packaged executable found under ${outDir}`)
  }
  candidates.sort((a, b) => scoreExecutable(b) - scoreExecutable(a))
  return candidates[0]
}

function findTelemetryFile(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return null
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const nested = findTelemetryFile(fullPath)
      if (nested) return nested
      continue
    }
    if (entry.name === 'startup-telemetry.json') {
      return fullPath
    }
  }
  return null
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function terminateProcessTree(pid) {
  if (!pid) return
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
}

async function waitForTelemetry(child) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < maxWaitMs) {
    if (child.exitCode !== null && child.exitCode !== 0) {
      throw new Error(`Packaged app exited early with code ${child.exitCode}`)
    }
    const telemetryPath = findTelemetryFile(appDataRoot)
    if (telemetryPath) {
      return telemetryPath
    }
    await sleep(pollIntervalMs)
  }
  throw new Error(`Timed out after ${maxWaitMs}ms waiting for startup telemetry file`)
}

function validateTelemetry(telemetryPath) {
  const parsed = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'))
  const startupSessionMs = parsed?.main?.startupSessionMs
  const startupReadyMs = parsed?.renderer?.startupReadyMs

  if (typeof startupSessionMs !== 'number') {
    throw new Error('Missing main.startupSessionMs in startup telemetry payload')
  }
  if (typeof startupReadyMs !== 'number') {
    throw new Error('Missing renderer.startupReadyMs in startup telemetry payload')
  }

  return {
    startupSessionMs,
    startupReadyMs,
    firstSummaryMs: parsed?.renderer?.firstSummaryMs ?? null,
    telemetryPath,
  }
}

async function main() {
  ensureCleanDir(smokeDir)
  ensureCleanDir(appDataRoot)

  const executablePath = findPackagedExecutable()
  appendLog(`Using executable: ${executablePath}`)

  const stdoutLines = []
  const stderrLines = []

  const child = spawn(executablePath, [], {
    cwd: repoRoot,
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_DEV: '0',
      APPDATA: appDataRoot,
      JPLEARN_USER_DATA_DIR: appDataRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => {
    const value = chunk.toString()
    stdoutLines.push(value)
    appendLog(`[stdout] ${value.trimEnd()}`)
  })

  child.stderr.on('data', (chunk) => {
    const value = chunk.toString()
    stderrLines.push(value)
    appendLog(`[stderr] ${value.trimEnd()}`)
  })

  try {
    const telemetryPath = await waitForTelemetry(child)
    const metrics = validateTelemetry(telemetryPath)
    appendLog(`Telemetry file: ${metrics.telemetryPath}`)
    appendLog(`startupSessionMs=${metrics.startupSessionMs}, startupReadyMs=${metrics.startupReadyMs}, firstSummaryMs=${metrics.firstSummaryMs}`)
  } finally {
    terminateProcessTree(child.pid)
    fs.writeFileSync(path.join(smokeDir, 'stdout.log'), stdoutLines.join(''), 'utf8')
    fs.writeFileSync(path.join(smokeDir, 'stderr.log'), stderrLines.join(''), 'utf8')
  }
}

main().catch((error) => {
  appendLog(`Smoke test failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
