/**
 * python_command.cjs — which Python the dedicated runtimes launch.
 *
 * One copy for the OCR and speech runtimes (audit 5, nit 2) and for setup (audit 13, nit 1): the
 * copies had drifted, and only some honoured JPLEARN_PYTHON and non-Windows virtual environments.
 */

const fs = require('node:fs')
const path = require('node:path')

/** The installed app's own Python, when this run uses it (not when JPLEARN_PYTHON overrides it). */
function bundledPythonCommand() {
  if ((process.env.JPLEARN_PYTHON || '').trim()) return null
  const resourcesPath = (process.resourcesPath || '').trim()
  if (!resourcesPath) return null
  const bundled = path.join(resourcesPath, 'python-bundle', 'python', 'python.exe')
  return fs.existsSync(bundled) ? bundled : null
}

function resolvePythonCommand(repoRoot) {
  const explicit = (process.env.JPLEARN_PYTHON || '').trim()
  if (explicit) return explicit

  const bundled = bundledPythonCommand()
  if (bundled) return bundled

  const candidates = process.platform === 'win32'
    ? [path.join(repoRoot, '.venv', 'Scripts', 'python.exe')]
    : [path.join(repoRoot, '.venv', 'bin', 'python3'), path.join(repoRoot, '.venv', 'bin', 'python')]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return 'python'
}

module.exports = { resolvePythonCommand, bundledPythonCommand }
