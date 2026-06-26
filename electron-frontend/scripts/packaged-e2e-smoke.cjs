const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const outDir = path.join(repoRoot, 'out')
const smokeDir = path.join(repoRoot, '.smoke-e2e')
const appDataRoot = path.join(smokeDir, 'appdata')
const smokeLogPath = path.join(smokeDir, 'packaged-e2e-smoke-log.txt')
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

function resolvePythonBridgeContext() {
  const candidateScripts = [
    path.join(repoRoot, '..', 'scripts', 'desktop_bridge.py'),
    path.join(process.cwd(), '..', 'scripts', 'desktop_bridge.py'),
    path.join(process.cwd(), 'scripts', 'desktop_bridge.py'),
  ]

  for (const candidate of candidateScripts) {
    if (!fs.existsSync(candidate)) {
      continue
    }
    return {
      bridgeScript: candidate,
      projectRoot: path.resolve(candidate, '..', '..'),
      candidates: candidateScripts,
    }
  }

  return {
    bridgeScript: candidateScripts[0],
    projectRoot: path.join(repoRoot, '..'),
    candidates: candidateScripts,
  }
}

function resolvePythonCommand(projectRoot) {
  const explicit = (process.env.JPLEARN_PYTHON || '').trim()
  if (explicit) {
    return explicit
  }

  const candidates = process.platform === 'win32'
    ? [path.join(projectRoot, '.venv', 'Scripts', 'python.exe')]
    : [path.join(projectRoot, '.venv', 'bin', 'python3'), path.join(projectRoot, '.venv', 'bin', 'python')]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return 'python'
}

function runPythonBridgeWithArgs(args) {
  const bridgeContext = resolvePythonBridgeContext()
  const pythonCmd = resolvePythonCommand(bridgeContext.projectRoot)
  const bridgeScript = bridgeContext.bridgeScript

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, [bridgeScript, ...args], {
      cwd: bridgeContext.projectRoot,
      windowsHide: true,
      env: {
        ...process.env,
        APPDATA: appDataRoot,
        JPLEARN_USER_DATA_DIR: appDataRoot,
      },
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            [
              `Bridge exited with code ${code}`,
              `Python command: ${pythonCmd}`,
              `Bridge script: ${bridgeScript}`,
              `Bridge cwd: ${bridgeContext.projectRoot}`,
              `Bridge args: ${args.join(' ')}`,
              `stderr: ${stderr.trim() || '(empty)'}`,
              `stdout: ${stdout.trim() || '(empty)'}`,
            ].join('\n'),
          ),
        )
        return
      }

      try {
        resolve(JSON.parse(stdout))
      } catch (error) {
        reject(new Error(`Invalid bridge JSON: ${String(error)}`))
      }
    })
  })
}

function assertDeckCardsPayload(deckCards) {
  if (!deckCards || !Array.isArray(deckCards.cards) || deckCards.cards.length === 0) {
    throw new Error('Bridge deck-cards payload missing playable cards')
  }
}

function assertSessionStartPayload(response) {
  if (!response?.ok || !response?.goal?.session_id) {
    throw new Error('Bridge session-start payload missing session_id')
  }
}

function assertRecordResultPayload(response) {
  if (!response?.ok || typeof response?.card_id !== 'number') {
    throw new Error('Bridge record-result payload missing card update fields')
  }
}

function assertSessionSummaryPayload(response) {
  const summary = response?.summary
  if (!response?.ok || !summary) {
    throw new Error('Bridge session-summary payload missing summary object')
  }
  if (summary.reviewed < 1 || summary.completed_items < 1 || !summary.goal_met) {
    throw new Error('Session summary did not reflect one completed correct review')
  }
}

async function runBridgeJourney() {
  const summary = await runPythonBridgeWithArgs(['summary'])
  if (!summary || !Array.isArray(summary.decks) || summary.decks.length === 0) {
    throw new Error('Bridge summary payload missing deck list')
  }

  const deckCards = await runPythonBridgeWithArgs(['deck-cards', 'hiragana'])
  assertDeckCardsPayload(deckCards)

  const firstCard = deckCards.cards[0]
  const sessionStart = await runPythonBridgeWithArgs(['session-start', '1'])
  assertSessionStartPayload(sessionStart)
  const sessionId = sessionStart.goal.session_id

  const recordResult = await runPythonBridgeWithArgs([
    'record-result',
    'hiragana',
    String(firstCard.id),
    '1',
    'romaji_sprint',
    String(firstCard.curriculum_stage ?? 1),
    sessionId,
  ])
  assertRecordResultPayload(recordResult)

  const sessionSummary = await runPythonBridgeWithArgs(['session-summary', sessionId])
  assertSessionSummaryPayload(sessionSummary)

  return {
    sessionId,
    cardId: firstCard.id,
    reviewed: sessionSummary.summary.reviewed,
    accuracy: sessionSummary.summary.accuracy,
    goalMet: sessionSummary.summary.goal_met,
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

    const journey = await runBridgeJourney()
    appendLog(`Journey verified: cardId=${journey.cardId}, sessionId=${journey.sessionId}, reviewed=${journey.reviewed}, accuracy=${journey.accuracy}, goalMet=${journey.goalMet}`)
  } finally {
    terminateProcessTree(child.pid)
    fs.writeFileSync(path.join(smokeDir, 'stdout.log'), stdoutLines.join(''), 'utf8')
    fs.writeFileSync(path.join(smokeDir, 'stderr.log'), stderrLines.join(''), 'utf8')
  }
}

main().catch((error) => {
  appendLog(`Packaged E2E smoke failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
