const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const frontendRoot = path.resolve(__dirname, '..')

function requiredRelativePaths(dataRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dataRoot, 'manifest.json'), 'utf8'))
  const required = ['manifest.json']
  for (const entry of Object.values(manifest.chunks)) {
    required.push(entry.path)
  }
  const noticesRoot = path.join(dataRoot, 'notices')
  for (const notice of fs.readdirSync(noticesRoot, { recursive: true, withFileTypes: true })) {
    if (notice.isFile()) {
      required.push(path.join('notices', notice.parentPath ? path.relative(noticesRoot, notice.parentPath) : '', notice.name))
    }
  }
  return required.map((entry) => entry.replaceAll('\\', '/'))
}

function verifyProductionHandwritingAssets(distRoot = path.join(frontendRoot, 'dist')) {
  const dataRoot = path.join(distRoot, 'handwriting-data')
  for (const relativePath of requiredRelativePaths(dataRoot)) {
    if (!fs.existsSync(path.join(dataRoot, relativePath))) {
      throw new Error(`Missing production handwriting asset: ${relativePath}`)
    }
  }
  const javascriptAssets = fs.readdirSync(path.join(distRoot, 'assets'))
    .filter((filename) => filename.endsWith('.js'))
  if (javascriptAssets.length > 100) {
    throw new Error(`Expected chunked handwriting data, found ${javascriptAssets.length} production JavaScript assets.`)
  }
}

function verifyPackagedHandwritingAssets(asarPath) {
  const asarCli = path.join(frontendRoot, 'node_modules', '@electron', 'asar', 'bin', 'asar.js')
  const entries = execFileSync(process.execPath, [asarCli, 'list', asarPath], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((entry) => entry.replaceAll('\\', '/').replace(/^\//, ''))
  const packaged = new Set(entries)
  const dataRoot = path.join(frontendRoot, 'public', 'handwriting-data')
  for (const relativePath of requiredRelativePaths(dataRoot)) {
    const expected = `dist/handwriting-data/${relativePath}`
    if (!packaged.has(expected)) {
      throw new Error(`Missing packaged handwriting asset: ${expected}`)
    }
  }
}

if (require.main === module) {
  verifyProductionHandwritingAssets()
  const asarIndex = process.argv.indexOf('--asar')
  if (asarIndex !== -1) {
    verifyPackagedHandwritingAssets(process.argv[asarIndex + 1])
  }
  console.log('Verified production handwriting data and notices.')
}

module.exports = { verifyPackagedHandwritingAssets, verifyProductionHandwritingAssets }
