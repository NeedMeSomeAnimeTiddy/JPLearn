const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const outDir = path.join(repoRoot, 'out')
const smokeDir = path.join(repoRoot, '.smoke')
const appDataRoot = path.join(smokeDir, 'appdata')
const smokeLogPath = path.join(smokeDir, 'packaged-smoke-log.txt')
const journeyReportPath = path.join(appDataRoot, 'study-journey-smoke.json')
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

async function waitForJourneyReport(child) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < maxWaitMs) {
    if (child.exitCode !== null && child.exitCode !== 0) {
      throw new Error(`Packaged app exited early with code ${child.exitCode}`)
    }
    if (fs.existsSync(journeyReportPath)) {
      return journeyReportPath
    }
    await sleep(pollIntervalMs)
  }
  throw new Error(`Timed out after ${maxWaitMs}ms waiting for study journey smoke report`)
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

function validateJourneyReport(reportPath) {
  const parsed = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  if (parsed?.ok !== true) {
    throw new Error(`Study journey smoke reported failure: ${parsed?.error || 'unknown error'}`)
  }

  const completedSteps = Array.isArray(parsed.steps) ? parsed.steps : []
  const requiredSteps = ['summary', 'deck-cards', 'session-start', 'record-result', 'session-summary']
  const completedStepNames = new Set(completedSteps.map((step) => step.name))

  for (const step of requiredSteps) {
    if (!completedStepNames.has(step)) {
      throw new Error(`Study journey smoke report is missing required step: ${step}`)
    }
  }

  return {
    reportPath,
    durationMs: parsed?.durationMs ?? null,
    slug: parsed?.slug ?? null,
    sessionId: parsed?.sessionId ?? null,
    steps: completedSteps.length,
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
      JPLEARN_SMOKE_JOURNEY: process.env.JPLEARN_SMOKE_JOURNEY || '1',
      JPLEARN_SMOKE_DECK: process.env.JPLEARN_SMOKE_DECK || 'hiragana',
      JPLEARN_SMOKE_MINIGAME: process.env.JPLEARN_SMOKE_MINIGAME || 'context_cloze',
      JPLEARN_SMOKE_RESET_DB: process.env.JPLEARN_SMOKE_RESET_DB || '1',
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

    const reportPath = await waitForJourneyReport(child)
    const journey = validateJourneyReport(reportPath)
    appendLog(`Study journey report: ${journey.reportPath}`)
    appendLog(`journeyDurationMs=${journey.durationMs}, slug=${journey.slug}, sessionId=${journey.sessionId}, steps=${journey.steps}`)
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
