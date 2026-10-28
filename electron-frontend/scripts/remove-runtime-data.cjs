const fs = require("node:fs")
const path = require("node:path")

// Runtime-only folders, and every learner database. The checkout's data/ holds the developer's own
// jplearn.db (and any safety copies Python made beside it), and a packaged app with no live database
// used to adopt the bundled one as the learner's history (audit 10, F1). A fresh install starts empty.
function removeRuntimeOnlyData(resourcesDir) {
  const dataDir = path.join(resourcesDir, "data")
  const toRemove = [
    path.join(dataDir, "whisper"),
    path.join(dataDir, "translation"),
    path.join(dataDir, "external_sources", "offline_dictionary"),
    path.join(dataDir, "backups"),
  ]
  if (fs.existsSync(dataDir)) {
    for (const name of fs.readdirSync(dataDir)) {
      if (/\.db($|[.-])/i.test(name)) toRemove.push(path.join(dataDir, name))
    }
  }
  const removed = []
  for (const target of toRemove) {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true })
      removed.push(target)
    }
  }
  return removed
}

module.exports = { removeRuntimeOnlyData }
