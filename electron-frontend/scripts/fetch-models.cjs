/* ==================================================================================================
   THE VALLEY'S FILES LIVE ON A GITHUB RELEASE, NOT IN GIT.

   `world.glb` and its night lightmap are build artifacts of a Blender file that is itself not in
   git, and at ~37 MB a revision they would dominate the history (see public/models/.gitignore). So
   they are attached to the release named below, and this script puts them where the app and the
   mockup look for them, checking each against its SHA-256. A file already present with the right
   hash is left alone, so running it twice -- or before every release build -- costs no download.

     npm run fetch:models               the two files the app needs
     npm run fetch:models -- --all      also the Blender source and the mockup's full-size world
     npm run fetch:models -- --force    replace local files that differ (each kept in .valley-cache/)

   A LOCAL FILE THAT DIFFERS IS NEVER REPLACED ON ITS OWN. It may be newer than the release -- a fresh
   export, or the .blend saved with an evening's work in it -- so the script stops and says so, and
   only --force moves it aside before fetching. Kept copies and half-finished downloads go to
   .valley-cache/ at the repo root (ignored), never next to the file: anything left in public/ would
   be copied into the build and shipped in the installer.

   A new export means a new release: upload the files under a new tag, then update TAG and the
   hashes below in the same commit as anything that depends on the new world.
   ================================================================================================== */

const crypto = require('node:crypto')
const fs = require('node:fs')
const https = require('node:https')
const path = require('node:path')

const REPO = 'NeedMeSomeAnimeTiddy/JPLearn'
/** a connection that sends nothing for this long is abandoned rather than waited on forever */
const IDLE_TIMEOUT_MS = 60000
const TAG = 'valley-models-1'
const frontendRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(frontendRoot, '..')
const cacheDir = path.join(repoRoot, '.valley-cache')

/** asset name on the release -> where it goes, and what it must hash to */
const FILES = [
  {
    asset: 'world.glb',
    dest: path.join(frontendRoot, 'public', 'models', 'world.glb'),
    sha256: '25e6c22ef074e48b76a3abc07092747b5b79128a5d9964352a8e650374df065c',
  },
  {
    asset: 'night_lightmap.png',
    dest: path.join(frontendRoot, 'public', 'models', 'night_lightmap.png'),
    sha256: '596c7a633cd20c6ce47687fabea7b225cc139e1a03b5db6b8e70c8c59e25a195',
  },
  {
    asset: 'environment.blend',
    dest: path.join(repoRoot, 'mockups', 'menu-concepts', 'models', 'environment.blend'),
    sha256: '39e91e3c092823f92df42865e615252df8277def62e4fde79bf95baccf837bbd',
    optional: true,
  },
  {
    asset: 'mockup-world.glb',
    dest: path.join(repoRoot, 'mockups', 'menu-concepts', 'models', 'world.glb'),
    sha256: 'ae7fede900ead99e14ab3f0d22fcd6cd21f6ad632aca18857a686fd08061a403',
    optional: true,
  },
  {
    asset: 'night_lightmap.png',
    dest: path.join(repoRoot, 'mockups', 'menu-concepts', 'models', 'night_lightmap.png'),
    sha256: '596c7a633cd20c6ce47687fabea7b225cc139e1a03b5db6b8e70c8c59e25a195',
    optional: true,
  },
]

function sha256Of(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

/** GET with redirects followed (release downloads redirect to GitHub's object storage) */
function download(url, toFile, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'jplearn-fetch-models' } }, (response) => {
      const status = response.statusCode || 0
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume()
        if (redirectsLeft <= 0) {
          reject(new Error(`Too many redirects fetching ${url}`))
          return
        }
        resolve(download(new URL(response.headers.location, url).toString(), toFile, redirectsLeft - 1))
        return
      }
      if (status !== 200) {
        response.resume()
        reject(new Error(`HTTP ${status} fetching ${url}`))
        return
      }
      const out = fs.createWriteStream(toFile)
      const fail = (error) => {
        out.destroy()
        reject(error)
      }
      response.pipe(out)
      out.on('close', () => (out.errored ? reject(out.errored) : resolve()))
      out.on('error', fail)
      response.on('error', fail)
    })
    request.setTimeout(IDLE_TIMEOUT_MS, () => {
      request.destroy(new Error(`No data for ${IDLE_TIMEOUT_MS / 1000} s fetching ${url}`))
    })
    request.on('error', reject)
  })
}

async function fetchOne(file, { force }) {
  const shown = path.relative(repoRoot, file.dest)
  if (fs.existsSync(file.dest)) {
    if ((await sha256Of(file.dest)) === file.sha256) {
      console.log(`  ok        ${shown}`)
      return
    }
    if (!force) {
      throw new Error(
        `${shown} differs from release ${TAG}. It may be newer work: keep it, or rerun with --force ` +
          `to move it aside into .valley-cache/ and fetch the release copy.`,
      )
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const aside = path.join(cacheDir, 'kept', stamp, path.relative(repoRoot, file.dest))
    fs.mkdirSync(path.dirname(aside), { recursive: true })
    fs.renameSync(file.dest, aside)
    console.log(`  kept      ${shown}  ->  ${path.relative(repoRoot, aside)}`)
  }
  fs.mkdirSync(path.dirname(file.dest), { recursive: true })
  /* the same asset may already sit at another destination this run; copy it rather than download twice */
  const twin = FILES.find((other) => other !== file && other.sha256 === file.sha256 && fs.existsSync(other.dest))
  if (twin && (await sha256Of(twin.dest)) === file.sha256) {
    fs.copyFileSync(twin.dest, file.dest)
    console.log(`  copied    ${shown}  <-  ${path.relative(repoRoot, twin.dest)}`)
    return
  }
  fs.mkdirSync(cacheDir, { recursive: true })
  const partial = path.join(cacheDir, `${file.asset}.download`)
  const url = `https://github.com/${REPO}/releases/download/${TAG}/${file.asset}`
  console.log(`  fetching  ${path.relative(repoRoot, file.dest)}  <-  ${url}`)
  try {
    await download(url, partial)
    const actual = await sha256Of(partial)
    if (actual !== file.sha256) {
      throw new Error(`${file.asset}: SHA-256 ${actual} does not match the expected ${file.sha256}`)
    }
    fs.renameSync(partial, file.dest)
  } finally {
    fs.rmSync(partial, { force: true })
  }
}

async function main() {
  const all = process.argv.includes('--all')
  const force = process.argv.includes('--force')
  console.log(`Valley models from release ${TAG}${all ? ' (all files)' : ''}:`)
  for (const file of FILES) {
    if (file.optional && !all) {
      continue
    }
    await fetchOne(file, { force })
  }
}

main().catch((error) => {
  console.error(`fetch-models failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
