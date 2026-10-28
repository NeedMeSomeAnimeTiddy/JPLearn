/**
 * python_command.cjs — which Python the dedicated runtimes launch.
 *
 * One copy for the OCR and speech runtimes (audit 5, nit 2): the two had drifted, and only
 * OCR honoured JPLEARN_PYTHON and non-Windows virtual environments.
 */

const fs = require('node:fs')
const path = require('node:path')

function resolvePythonCommand(repoRoot) {
  const explicit = (process.env.JPLEARN_PYTHON || '').trim()
  if (explicit) return explicit

  const resourcesPath = (process.resourcesPath || '').trim()
  if (resourcesPath) {
    const bundled = path.join(resourcesPath, 'python-bundle', 'python', 'python.exe')
    if (fs.existsSync(bundled)) return bundled
  }

  const candidates = process.platform === 'win32'
    ? [path.join(repoRoot, '.venv', 'Scripts', 'python.exe')]
    : [path.join(repoRoot, '.venv', 'bin', 'python3'), path.join(repoRoot, '.venv', 'bin', 'python')]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return 'python'
}

module.exports = { resolvePythonCommand }
